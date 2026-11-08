/**
 * PRODUTOS — regras de preço/disponibilidade, carga do catálogo e componentes.
 * Regras de não invenção:
 *  - sem `price` → nenhum preço é exibido e o produto não vai ao carrinho
 *  - desconto só existe se houver `sale_price` < `price` ou uma oferta vigente na view
 *  - estoque só é afirmado quando `stock` é informado
 */
import { CONFIG } from './config.js';
import { fetchCatalog } from './api.js';
import { getState, setState } from './state.js';
import { esc, money, icon } from './ui.js';

/* ---------- Carga do catálogo (com cache em memória) ---------- */
let inflight = null;
let signature = '';

/**
 * Revalidação silenciosa: busca o catálogo sem estado de loading e só
 * publica no estado se o conteúdo mudou. Retorna true quando houve mudança.
 */
export async function refreshCatalog() {
  if (inflight) await inflight.catch(() => null);
  const items = await fetchCatalog();
  const next = JSON.stringify(items);
  if (next === signature && getState().catalog.status === 'success') {
    getState().catalog.loadedAt = Date.now(); // mantém o cache fresco sem notificar
    return false;
  }
  signature = next;
  setState('catalog', { status: 'success', items, error: null, loadedAt: Date.now() });
  return true;
}

export function loadCatalog({ force = false } = {}) {
  const { catalog } = getState();
  const fresh = catalog.status === 'success' && Date.now() - catalog.loadedAt < CONFIG.CATALOG_CACHE_MS;
  if (!force && fresh) return Promise.resolve(catalog.items);
  if (inflight) return inflight;
  setState('catalog', (c) => ({ ...c, status: 'loading', error: null }));
  inflight = fetchCatalog()
    .then((items) => {
      signature = JSON.stringify(items);
      setState('catalog', { status: 'success', items, error: null, loadedAt: Date.now() });
      return items;
    })
    .catch((error) => {
      setState('catalog', (c) => ({ ...c, status: 'error', error }));
      throw error;
    })
    .finally(() => { inflight = null; });
  return inflight;
}

/* ---------- Preço ---------- */
function offerPrice(base, offer) {
  if (!offer || offer.value == null || offer.value <= 0) return null;
  const t = String(offer.type || '').toLowerCase();
  if (['percentage', 'percent', 'percentual'].includes(t)) {
    if (offer.value >= 100) return null;
    return Math.round(base * (1 - offer.value / 100) * 100) / 100;
  }
  if (['fixed', 'amount', 'valor', 'fixo'].includes(t)) {
    const v = base - offer.value;
    return v > 0 ? Math.round(v * 100) / 100 : null;
  }
  return null; // tipo desconhecido: não aplicar
}

export function getPricing(p) {
  if (p.price == null || !(p.price > 0)) return { hasPrice: false };
  let final = p.price;
  let offer = null;
  if (p.salePrice != null && p.salePrice > 0 && p.salePrice < p.price) final = p.salePrice;
  for (const o of p.offers) {
    const v = offerPrice(p.price, o);
    if (v != null && v < final) { final = v; offer = o; }
  }
  const discounted = final < p.price;
  return {
    hasPrice: true,
    base: p.price,
    final,
    discounted,
    percent: discounted ? Math.round((1 - final / p.price) * 100) : 0,
    offer,
  };
}

export function getAvailability(p) {
  const pricing = getPricing(p);
  if (!pricing.hasPrice) return { purchasable: false, reason: 'no-price', maxQty: 0 };
  if (p.stock == null) return { purchasable: false, reason: 'no-stock-info', maxQty: 0 };
  if (p.stock <= 0) return { purchasable: false, reason: 'out-of-stock', maxQty: 0 };
  return { purchasable: true, reason: null, maxQty: Math.floor(p.stock) };
}

export const hasActiveDiscount = (p) => getPricing(p).discounted;

/* ---------- Componentes ---------- */
export function productImage(p, { size = 'card', eager = false } = {}) {
  const img = p.images[0];
  if (img) {
    const dim = size === 'thumb' ? 64 : 400;
    return `<img src="${esc(img.url)}" alt="${esc(img.alt || p.name)}" width="${dim}" height="${dim}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  }
  return `
    <div class="no-image" role="img" aria-label="${esc(p.name)} — imagem não cadastrada">
      ${icon('capsule', 'no-image__mark')}
      ${p.type ? `<span class="no-image__type">${esc(p.type)}</span>` : ''}
      ${p.dose ? `<span class="no-image__dose">${esc(p.dose)}</span>` : ''}
    </div>`;
}

export function priceBlock(p, { size = 'card' } = {}) {
  const pr = getPricing(p);
  if (!pr.hasPrice) return `<div class="price"><span class="price__none">Preço não disponível</span></div>`;
  return `
    <div class="price">
      ${pr.discounted ? `<span class="price__old"><span class="sr-only">De </span>${money(pr.base)}</span>` : ''}
      <span class="price__now ${pr.discounted ? 'price__now--sale' : ''}">${pr.discounted ? '<span class="sr-only">Por </span>' : ''}${money(pr.final)}</span>
      ${size === 'pdp' && pr.offer?.title ? `<span class="t-small t-muted">${esc(pr.offer.title)}</span>` : ''}
    </div>`;
}

export function productUrl(p) { return `#/produto/${encodeURIComponent(p.slug)}`; }

export function productCard(p, { favorite = false } = {}) {
  const pr = getPricing(p);
  const av = getAvailability(p);
  const out = av.reason === 'out-of-stock';
  const meta = [p.type, p.dose].filter(Boolean).join(' · ');

  let cta;
  if (av.purchasable) {
    cta = `<button type="button" class="btn btn--primary btn--block" data-action="add-to-cart" data-id="${esc(p.id)}">Comprar</button>`;
  } else if (out) {
    cta = `<button type="button" class="btn btn--block" disabled>Indisponível</button>`;
  } else {
    cta = `<a class="btn btn--outline btn--block" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">Ver detalhes</a>`;
  }

  return `
    <article class="card${out ? ' is-unavailable' : ''}" data-product="${esc(p.id)}">
      <div class="card__badges">
        ${pr.discounted ? `<span class="badge badge--offer">-${pr.percent}%</span>` : ''}
        ${out ? '<span class="badge badge--muted">Indisponível</span>' : ''}
      </div>
      <button type="button" class="icon-btn card__fav" data-action="toggle-fav" data-id="${esc(p.id)}"
        aria-pressed="${favorite}" aria-label="${favorite ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${esc(p.name)}">
        ${icon('heart')}
      </button>
      <div class="card__media">${productImage(p)}</div>
      <p class="card__brand t-label">${esc(p.brand || '')}</p>
      <h3 class="card__name"><a href="${productUrl(p)}">${esc(p.name)}</a></h3>
      ${meta ? `<p class="card__meta">${esc(meta)}</p>` : ''}
      <div class="card__price">${priceBlock(p)}</div>
      <div class="card__cta">${cta}</div>
    </article>`;
}

export function cardSkeleton(n = 4) {
  return Array.from({ length: n }, () => `
    <div class="card" aria-hidden="true">
      <div class="skeleton skeleton--media"></div>
      <div class="skeleton skeleton--line skeleton--w40"></div>
      <div class="skeleton skeleton--line"></div>
      <div class="skeleton skeleton--line skeleton--w70"></div>
      <div class="skeleton skeleton--line-lg"></div>
      <div class="skeleton skeleton--btn"></div>
    </div>`).join('');
}

export function productGrid(products, { cols = 4, favorites = new Set(), rail = false } = {}) {
  return `<div class="product-grid product-grid--${cols}${rail ? ' product-grid--rail' : ''}">${products.map((p) => productCard(p, { favorite: favorites.has(p.id) })).join('')}</div>`;
}

/* ---------- Filtro e ordenação (catálogo em memória) ---------- */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base' });

export function filterProducts(items, { category, type, brand, offers } = {}) {
  return items.filter((p) =>
    (!category || p.categories.some((c) => c.slug === category)) &&
    (!type || p.type === type) &&
    (!brand || p.brand === brand) &&
    (!offers || hasActiveDiscount(p)));
}

export const SORTS = {
  'nome': { label: 'Nome (A–Z)', fn: (a, b) => collator.compare(a.name, b.name) },
  'recentes': { label: 'Mais recentes', fn: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)) || collator.compare(a.name, b.name) },
  'menor-preco': {
    label: 'Menor preço',
    fn: (a, b) => {
      const pa = getPricing(a); const pb = getPricing(b);
      if (pa.hasPrice !== pb.hasPrice) return pa.hasPrice ? -1 : 1;
      return (pa.final ?? 0) - (pb.final ?? 0) || collator.compare(a.name, b.name);
    },
  },
};

export function sortProducts(items, key = 'nome') {
  return [...items].sort((SORTS[key] || SORTS.nome).fn);
}

export function countBy(items, getter) {
  const map = new Map();
  items.forEach((p) => {
    const keys = [].concat(getter(p)).filter(Boolean);
    keys.forEach((k) => map.set(k, (map.get(k) || 0) + 1));
  });
  return map;
}

/* ---------- Busca local (sem acento) sobre o catálogo já carregado ---------- */
export const normalize = (v) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export function searchCatalog(items, term, limit = Infinity) {
  const words = normalize(term).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored = [];
  for (const p of items) {
    const name = normalize(p.name);
    const hay = `${name} ${normalize(p.brand)} ${normalize(p.sku)} ${normalize(p.type)} ${normalize(p.description)} ${p.categories.map((c) => normalize(c.name)).join(' ')}`;
    if (!words.every((w) => hay.includes(w))) continue;
    const score = (name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2);
    scored.push([score, p]);
  }
  scored.sort((a, b) => a[0] - b[0] || collator.compare(a[1].name, b[1].name));
  return scored.slice(0, limit).map(([, p]) => p);
}
