/**
 * BOOTSTRAP — inicializa módulos, rotas e delegação de eventos.
 */
import { route, startRouter, parseHash } from './router.js';
import { subscribe, getState } from './state.js';
import { loadCatalog } from './products.js';
import { loadCategories, renderCategoryLinks } from './categories.js';
import { initCart, addToCart, handleCartAction } from './cart.js';
import { initFavorites, toggleFavorite } from './favorites.js';
import { initAuth } from './auth.js';
import { initSearch } from './search.js';
import { initSync } from './sync.js';
import { $, $$, openDrawerById, closeDrawers } from './ui.js';
import * as V from './views.js';

/* ---------- Rotas ---------- */
let current = () => {};
const on = (pattern, fn) => route(pattern, (ctx) => { current = () => fn(ctx); return fn(ctx); });

on('/', () => V.renderHome());
on('/produtos', ({ path, query }) => V.renderListing({ path, query, mode: 'all' }));
on('/categorias', () => V.renderCategories());
on('/categoria/:slug', ({ path, query, params }) => V.renderListing({ path, query, mode: 'category', slug: params.slug }));
on('/ofertas', ({ path, query }) => V.renderListing({ path, query, mode: 'offers' }));
on('/novidades', ({ path, query }) => V.renderListing({ path, query, mode: 'new' }));
on('/mais-vendidos', () => V.renderBestsellers());
on('/produto/:slug', (ctx) => V.renderProduct(ctx));
on('/busca', (ctx) => V.renderSearch(ctx));
on('/carrinho', () => V.renderCartPage());
on('/favoritos', () => V.renderFavorites());
on('/conta', () => V.renderAccount());
on('/sobre', () => V.renderAbout());
on('/contato', () => V.renderContact());

/* ---------- Navegação ativa + foco ---------- */
const NAV_MATCH = {
  '/': (p) => p === '/',
  '/produtos': (p) => p === '/produtos' || p.startsWith('/produto/'),
  '/categorias': (p) => p === '/categorias' || p.startsWith('/categoria/'),
};

function updateNav() {
  const { path } = parseHash();
  $$('[data-nav]').forEach((a) => {
    const target = a.dataset.nav;
    const match = NAV_MATCH[target] ? NAV_MATCH[target](path) : path === target;
    if (match) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

let firstLoad = true;
window.addEventListener('hashchange', () => {
  closeDrawers(false);
  updateNav();
  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  if (!firstLoad) $('#app').focus({ preventScroll: true });
});

/* ---------- Delegação de eventos ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, id } = el.dataset;
  switch (action) {
    case 'add-to-cart': addToCart(id, 1); break;
    case 'toggle-fav': toggleFavorite(id); break;
    case 'cart-inc': case 'cart-dec': case 'cart-remove':
      handleCartAction(action, id);
      if (parseHash().path === '/carrinho') V.renderCartPage();
      break;
    case 'open-menu': openDrawerById('mobile-menu', el); break;
    case 'open-cart':
      e.preventDefault();
      openDrawerById('cart-drawer', el);
      break;
    case 'close-drawer': closeDrawers(); break;
    case 'toggle-filters': {
      const panel = document.getElementById('filters-panel');
      const open = panel.classList.toggle('is-open');
      el.setAttribute('aria-expanded', String(open));
      break;
    }
    case 'retry':
      Promise.allSettled([loadCatalog({ force: true }), loadCategories()]).then(() => current());
      break;
    case 'logout': V.logout(); break;
    default: break;
  }
});

document.getElementById('drawer-backdrop').addEventListener('click', () => closeDrawers());

/* Header: sombra ao rolar */
const header = $('.site-header');
const onScroll = () => header.classList.toggle('is-scrolled', window.scrollY > 4);
window.addEventListener('scroll', onScroll, { passive: true });

/* ---------- Init ---------- */
initAuth();
initCart();
initFavorites();
$$('form.search').forEach(initSearch);
document.getElementById('year').textContent = new Date().getFullYear();

subscribe('categories', renderCategoryLinks);
subscribe('auth', (auth, s) => {
  $$('[data-account-label]').forEach((el) => el.setAttribute('aria-label', auth.status === 'authenticated' ? 'Minha conta' : 'Entrar na conta'));
  if (parseHash().path === '/conta') V.renderAccount();
  if (parseHash().path === '/favoritos' && auth.status === 'authenticated') V.renderFavorites();
});
subscribe('favorites', () => {
  if (parseHash().path === '/favoritos') V.renderFavorites();
});

/* Re-renderiza a rota atual quando o catálogo mudar no Supabase */
const NO_RERENDER = ['/conta'];
let seenChanges = 0;
subscribe('sync', (sync) => {
  if (sync.changes === seenChanges) return;
  seenChanges = sync.changes;
  const { path } = parseHash();
  if (NO_RERENDER.includes(path)) return;
  const active = document.activeElement;
  if (active && $('#app').contains(active) && active.matches('input, select, textarea')) return;
  const y = window.scrollY;
  Promise.resolve(current()).then(() => window.scrollTo(0, y));
});

loadCategories().catch(() => {});
loadCatalog().catch(() => {});

updateNav();
startRouter(() => V.renderNotFound());
initSync();

/* Remove o estado de erro do campo assim que o usuário corrige */
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.matches?.('[aria-invalid="true"]') && el.checkValidity()) el.setAttribute('aria-invalid', 'false');
});
document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.matches?.('select[aria-invalid="true"]') && el.checkValidity()) el.setAttribute('aria-invalid', 'false');
});
firstLoad = false;
