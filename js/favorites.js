/**
 * FAVORITOS — em memória para visitantes; sincronizado com public.favorites
 * quando há cliente autenticado (RLS: somente os próprios).
 */
import { getState, setState, subscribe, findProductById } from './state.js';
import { fetchFavorites, addFavorite, removeFavorite } from './api.js';
import { toast, $$ } from './ui.js';

export function initFavorites() {
  subscribe('auth', async (auth) => {
    if (auth.status !== 'authenticated' || !auth.customer) return;
    try {
      const remote = await fetchFavorites(auth.customer.id);
      const local = [...getState().favorites].filter((id) => !remote.includes(id));
      await Promise.all(local.map((id) => addFavorite(auth.customer.id, id).catch(() => null)));
      setState('favorites', new Set([...remote, ...local]));
    } catch { /* mantém favoritos locais */ }
  });
  subscribe('favorites', syncButtons);
}

function syncButtons(favs) {
  $$('[data-action="toggle-fav"]').forEach((btn) => {
    const on = favs.has(btn.dataset.id);
    btn.setAttribute('aria-pressed', String(on));
    const name = findProductById(btn.dataset.id)?.name || '';
    const label = btn.querySelector('[data-fav-label]');
    if (label) label.textContent = on ? 'Nos favoritos' : 'Favoritar';
    else btn.setAttribute('aria-label', `${on ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}${name ? `: ${name}` : ''}`);
  });
  document.querySelectorAll('[data-fav-count]').forEach((el) => {
    el.textContent = favs.size;
    el.hidden = favs.size === 0;
  });
}

export async function toggleFavorite(productId) {
  const favs = new Set(getState().favorites);
  const adding = !favs.has(productId);
  adding ? favs.add(productId) : favs.delete(productId);
  setState('favorites', favs);

  const { customer } = getState().auth;
  if (!customer) return;
  try {
    adding ? await addFavorite(customer.id, productId) : await removeFavorite(customer.id, productId);
  } catch {
    const revert = new Set(getState().favorites);
    adding ? revert.delete(productId) : revert.add(productId);
    setState('favorites', revert);
    toast('Não foi possível atualizar seus favoritos.', { type: 'error' });
  }
}
