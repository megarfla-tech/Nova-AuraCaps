/**
 * SINCRONIZAÇÃO DO CATÁLOGO
 *  1. Realtime: tabelas da publicação supabase_realtime → atualização imediata
 *  2. Revalidação: ao voltar para a aba, ao reconectar e a cada intervalo
 *     (cobre tabelas fora do Realtime: categories, offers, product_images, product_categories)
 * Só re-renderiza quando o conteúdo realmente mudou (assinatura dos dados).
 */
import { CONFIG } from './config.js';
import { refreshCatalog } from './products.js';
import { refreshCategories } from './categories.js';
import { subscribeTables } from './realtime.js';
import { setState } from './state.js';
import { debounce } from './ui.js';

let lastRun = 0;

async function revalidate(reason) {
  if (document.visibilityState === 'hidden') return;
  lastRun = Date.now();
  setState('sync', (s) => ({ ...s, lastCheck: lastRun, lastReason: reason }));
  try {
    const [catalogChanged, categoriesChanged] = await Promise.all([refreshCatalog(), refreshCategories()]);
    if (catalogChanged || categoriesChanged) {
      setState('sync', (s) => ({ ...s, lastChange: Date.now(), changes: (s.changes || 0) + 1 }));
    }
  } catch { /* mantém os dados atuais; tenta de novo no próximo ciclo */ }
}

const revalidateSoon = debounce(revalidate, CONFIG.SYNC.REALTIME_DEBOUNCE_MS);

export function initSync() {
  subscribeTables({
    tables: CONFIG.SYNC.REALTIME_TABLES,
    onChange: ({ table }) => {
      if (table === 'orders') window.dispatchEvent(new CustomEvent('auracaps:orders-changed'));
      revalidateSoon(`realtime:${table}`);
    },
    onStatus: (status) => {
      setState('sync', (s) => ({ ...s, realtime: status }));
      if (status === 'subscribed') revalidateSoon('realtime:reconnected');
    },
  });

  setInterval(() => revalidate('interval'), CONFIG.SYNC.POLL_MS);

  const onReturn = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRun > CONFIG.SYNC.FOCUS_MIN_GAP_MS) revalidate('focus');
  };
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  window.addEventListener('online', () => revalidate('online'));
}
