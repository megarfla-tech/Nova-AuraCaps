/**
 * Cliente mínimo para o Supabase (PostgREST + Auth) via fetch.
 * Único ponto do app que conhece URLs e headers do Supabase.
 */
import { CONFIG } from './config.js';

const REST = `${CONFIG.SUPABASE_URL}/rest/v1`;
const AUTH = `${CONFIG.SUPABASE_URL}/auth/v1`;

/** Sessão mantida em memória. */
let session = null;
const SESSION_KEY = 'auracaps.auth.session.v1';
function persistSession(value) { try { if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value)); else localStorage.removeItem(SESSION_KEY); } catch {} }
function readPersistedSession() { try { const raw = localStorage.getItem(SESSION_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; } }
const listeners = new Set();

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, details = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function baseHeaders(extra = {}) {
  const headers = { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, ...extra };
  if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  return headers;
}

async function parse(res) {
  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!res.ok) {
    const msg = (body && (body.message || body.msg || body.error_description || body.error)) || `Erro ${res.status}`;
    throw new ApiError(msg, { status: res.status, code: body?.code ?? body?.error_code ?? null, details: body });
  }
  return body;
}

async function ensureFreshSession() {
  if (!session?.expires_at) return;
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - now > 30) return;
  try {
    await refreshSession();
  } catch {
    setSession(null);
  }
}

/**
 * Requisição PostgREST.
 * @param {string} path  ex.: 'api_product_catalog'
 * @param {{ query?: Record<string,string>, method?: string, body?: any, signal?: AbortSignal, prefer?: string }} opts
 */
export async function rest(path, { query = {}, method = 'GET', body, signal, prefer } = {}) {
  await ensureFreshSession();
  const qs = new URLSearchParams(query).toString();
  const url = `${REST}/${path}${qs ? `?${qs}` : ''}`;
  const headers = baseHeaders({ Accept: 'application/json' });
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  let res;
  try {
    res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Não foi possível conectar ao servidor.', { status: 0 });
  }
  return parse(res);
}

/* ---------------- Auth ---------------- */

function setSession(next) {
  if (next && next.expires_in && !next.expires_at) {
    next.expires_at = Math.floor(Date.now() / 1000) + next.expires_in;
  }
  session = next;
  persistSession(next);
  listeners.forEach((fn) => fn(session));
}

export function getSession() { return session; }
export async function restoreSession() {
  if (!session) { const saved = readPersistedSession(); if (saved?.refresh_token) session = saved; }
  if (session?.expires_at && session.expires_at - Math.floor(Date.now() / 1000) <= 30) {
    try { await refreshSession(); } catch { setSession(null); }
  }
  if (session?.access_token && !session.user) {
    try {
      const res = await fetch(`${AUTH}/user`, { headers: { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) session.user = await res.json();
      persistSession(session);
    } catch {}
  }
  listeners.forEach((fn) => fn(session));
  return session;
}
export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

async function authRequest(path, body, { withToken = false } = {}) {
  const headers = { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' };
  if (withToken && session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;
  let res;
  try {
    res = await fetch(`${AUTH}/${path}`, { method: 'POST', headers, body: JSON.stringify(body ?? {}) });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', { status: 0 });
  }
  return parse(res);
}

export async function signInWithPassword(email, password) {
  const data = await authRequest('token?grant_type=password', { email, password });
  setSession(data);
  return data;
}

/** Cadastro. O trigger on_auth_user_created cria o registro em public.customers. */
export async function signUp(email, password, metadata = {}) {
  const data = await authRequest('signup', { email, password, data: metadata });
  if (data?.access_token) setSession(data);
  return data;
}

export async function refreshSession() {
  if (!session?.refresh_token) return null;
  const data = await authRequest('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
  setSession(data);
  return data;
}

export async function signOut() {
  try { await authRequest('logout', {}, { withToken: true }); } catch { /* sessão já inválida */ }
  setSession(null);
}

/** Atualiza user_metadata do usuário logado (PUT /auth/v1/user). */
export async function updateUserMetadata(data) {
  await ensureFreshSession();
  let res;
  try {
    res = await fetch(`${AUTH}/user`, {
      method: 'PUT',
      headers: { apikey: CONFIG.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ data }),
    });
  } catch {
    throw new ApiError('Não foi possível conectar ao servidor.', { status: 0 });
  }
  const user = await parse(res);
  if (session && user) session.user = user;
  return user;
}
