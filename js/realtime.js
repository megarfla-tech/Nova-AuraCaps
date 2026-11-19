/**
 * REALTIME — cliente mínimo do Supabase Realtime (protocolo Phoenix, JSON v1)
 * para receber postgres_changes sem biblioteca externa.
 * Só recebe eventos de tabelas que estão na publicação `supabase_realtime`.
 */
import { CONFIG } from './config.js';
import { getSession } from './supabase.js';

const HEARTBEAT_MS = 25000;
const MAX_BACKOFF_MS = 30000;

/**
 * @param {{ tables: string[], onChange: (evt:{table:string,type:string}) => void, onStatus?: (s:string) => void }} opts
 * @returns {{ close: () => void }}
 */
export function subscribeTables({ tables, onChange, onStatus = () => {} }) {
  const wsUrl = `${CONFIG.SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(CONFIG.SUPABASE_PUBLISHABLE_KEY)}&vsn=1.0.0`;
  const topic = 'realtime:auracaps-catalog';
  let ws = null;
  let ref = 0;
  let heartbeat = null;
  let retry = 0;
  let closed = false;
  let reconnectTimer = null;

  const send = (msg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
  const nextRef = () => String(++ref);

  function join() {
    const jref = nextRef();
    const payload = {
      config: {
        broadcast: { self: false, ack: false },
        presence: { key: '' },
        postgres_changes: tables.map((table) => ({ event: '*', schema: 'public', table })),
      },
    };
    const token = getSession()?.access_token;
    if (token) payload.access_token = token;
    send({ topic, event: 'phx_join', payload, ref: jref, join_ref: jref });
  }

  function connect() {
    if (closed) return;
    onStatus('connecting');
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      scheduleReconnect();
      return;
    }
    ws.onopen = () => {
      retry = 0;
      join();
      heartbeat = setInterval(() => send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: nextRef() }), HEARTBEAT_MS);
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.topic !== topic) return;
      if (msg.event === 'phx_reply' && msg.payload?.status === 'ok') onStatus('joined');
      if (msg.event === 'phx_reply' && msg.payload?.status === 'error') onStatus('error');
      if (msg.event === 'system' && msg.payload?.status === 'ok') onStatus('subscribed');
      if (msg.event === 'system' && msg.payload?.status === 'error') onStatus('error');
      if (msg.event === 'phx_error' || msg.event === 'phx_close') onStatus('error');
      if (msg.event === 'postgres_changes') {
        const d = msg.payload?.data || {};
        onChange({ table: d.table, type: d.type });
      }
    };
    ws.onclose = () => {
      clearInterval(heartbeat);
      if (!closed) { onStatus('disconnected'); scheduleReconnect(); }
    };
    ws.onerror = () => { try { ws.close(); } catch { /* noop */ } };
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    const delay = Math.min(1000 * 2 ** retry, MAX_BACKOFF_MS);
    retry += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  connect();
  return {
    close() {
      closed = true;
      clearTimeout(reconnectTimer);
      clearInterval(heartbeat);
      ws?.close();
    },
  };
}
