/**
 * CATEGORIAS — carga e componentes. Categorias vêm de api_categories.
 */
import { fetchCategories } from './api.js';
import { getState, setState } from './state.js';
import { esc, plural } from './ui.js';
import { countBy } from './products.js';

let inflight = null;
let signature = '';

export async function refreshCategories() {
  if (inflight) await inflight.catch(() => null);
  const items = await fetchCategories();
  const next = JSON.stringify(items);
  if (next === signature && getState().categories.status === 'success') return false;
  signature = next;
  setState('categories', { status: 'success', items, error: null });
  return true;
}

export function loadCategories() {
  const { categories } = getState();
  if (categories.status === 'success') return Promise.resolve(categories.items);
  if (inflight) return inflight;
  setState('categories', (c) => ({ ...c, status: 'loading', error: null }));
  inflight = fetchCategories()
    .then((items) => { signature = JSON.stringify(items); setState('categories', { status: 'success', items, error: null }); return items; })
    .catch((error) => { setState('categories', (c) => ({ ...c, status: 'error', error })); throw error; })
    .finally(() => { inflight = null; });
  return inflight;
}

export const categoryUrl = (c) => `#/categoria/${encodeURIComponent(c.slug)}`;

export function categoryCounts(products) {
  return countBy(products, (p) => p.categories.map((c) => c.slug));
}

export function categoryTile(c, count, { eager = false } = {}) {
  return `
    <li>
      <a class="cat-tile" href="${categoryUrl(c)}">
        <div class="cat-tile__media">
          ${c.imageUrl
            ? `<img src="${esc(c.imageUrl)}" alt="" width="300" height="300" ${eager ? '' : 'loading="lazy"'} decoding="async">`
            : ''}
        </div>
        <p class="cat-tile__name">${esc(c.name)}</p>
        ${count != null ? `<p class="cat-tile__count">${plural(count, 'produto', 'produtos')}</p>` : ''}
      </a>
    </li>`;
}

export function categoryRailSkeleton(n = 6) {
  return Array.from({ length: n }, () => `<li aria-hidden="true"><div class="skeleton cat-tile__media"></div><div class="skeleton skeleton--line skeleton--w70"></div></li>`).join('');
}

/** Lista simples de categorias no footer. */
export function renderCategoryLinks() {
  const { items, status } = getState().categories;
  const footer = document.getElementById('footer-categories');
  if (status !== 'success') return;
  const links = items.map((c) => `<li><a href="${categoryUrl(c)}">${esc(c.name)}</a></li>`).join('');
  if (footer) footer.innerHTML = links;
}
