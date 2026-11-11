/**
 * VIEWS — composição das páginas. Lê o estado, delega dados à camada de API
 * e componentes aos módulos de domínio.
 */
import { CONFIG } from './config.js';
import { fetchAddresses, createAddress, updateCustomerPhone, createCustomerOrder, fetchHomeBanners, fetchCurrentAdmin, fetchBannerRecords, saveBannerRecord, deleteBannerRecord } from './api.js';
import { uploadPublicFile } from './supabase.js';
import { addressFieldsHTML, bindAddressFields, bindPhoneMask, readAddress, formatAddress, isValidPhone, isValidCep, maskPhone } from './address.js';
import { getState, findProductBySlug, findCategoryBySlug } from './state.js';
import { fetchApprovedReviews, fetchOrders, cancelCustomerOrder, deleteCustomerOrder, hideHistoricalCustomerOrder } from './api.js';
import { runSearch } from './search.js';
import {
  loadCatalog, productGrid, cardSkeleton, priceBlock, productImage, getPricing, getAvailability,
  filterProducts, sortProducts, SORTS, countBy, hasActiveDiscount, productUrl,
} from './products.js';
import { loadCategories, categoryTile, categoryRailSkeleton, categoryCounts, categoryUrl } from './categories.js';
import { resolveCart, cartTotals, cartLine, summaryBlock, addToCart, clearCart } from './cart.js';
import { signIn, signUp, signOut, authErrorMessage } from './auth.js';
import { buildHash } from './router.js';
import { toast, esc, money, icon, plural, stateBlock, formatDate, $, $$ } from './ui.js';

const app = () => document.getElementById('app');
const favs = () => getState().favorites;
let bannerAdminRows = [];

function bannerImageUrl(value) { const v = String(value || '').trim(); return /^https?:\/\//i.test(v) ? v : ''; }
function bannerLinkUrl(value) { const v = String(value || '').trim(); return /^(https?:\/\/|\/(?!\/)|#)/i.test(v) ? v : ''; }
function homeBannerHTML(banner, slotLabel, slotId) {
  const desktop = bannerImageUrl(banner?.imageUrl);
  if (!desktop) return '';
  const mobile = bannerImageUrl(banner.mobileImageUrl);
  const image = `<picture>${mobile ? `<source media="(max-width: 600px)" srcset="${esc(mobile)}">` : ''}<img src="${esc(desktop)}" alt="${esc(banner.title || 'Banner AuraCaps')}" loading="lazy" decoding="async"></picture>`;
  const content = banner.subtitle ? `<span class="home-banner__copy"><strong>${esc(banner.title)}</strong><small>${esc(banner.subtitle)}</small></span>` : '';
  const link = bannerLinkUrl(banner.linkUrl);
  return `<section class="home-banner-section" id="${esc(slotId)}" aria-label="${esc(slotLabel)}"><div class="container">${link ? `<a class="home-banner" href="${esc(link)}"${/^https?:\/\//i.test(link) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${image}${content}</a>` : `<div class="home-banner">${image}${content}</div>`}</div></section>`;
}

function setView(html, title) {
  app().innerHTML = html;
  document.title = title ? `${title} | AuraCaps` : 'AuraCaps — Produtos naturais';
}

function errorView(title = 'Não foi possível carregar os produtos', text = 'Verifique sua conexão e tente novamente.') {
  return `<div class="container">${stateBlock({ title, text, variant: 'error', action: { id: 'retry', label: 'Tentar novamente' } })}</div>`;
}

async function ensureData() {
  await Promise.all([loadCatalog(), loadCategories()]);
}

const sectionHead = (title, { kicker, link, id } = {}) => `
  <div class="section-head">
    <div>
      ${kicker ? `<p class="section-head__kicker t-label">${esc(kicker)}</p>` : ''}
      <h2 class="t-h2" ${id ? `id="${id}"` : ''}>${esc(title)}</h2>
    </div>
    ${link ? `<a class="section-head__link" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}
  </div>`;

/* =========================================================
   INÍCIO
   ========================================================= */
function heroHTML() {
  return `
    <section class="hero on-dark" aria-labelledby="hero-title">
      <div class="hero__media">
        <picture>
          <source media="(min-width: 768px)" srcset="assets/img/hero-1600.webp">
          <img src="assets/img/hero-900.webp" alt="Cápsulas e ervas frescas sobre pedra verde-escura" width="1600" height="1067" fetchpriority="high">
        </picture>
      </div>
      <div class="container hero__inner">
        <h1 id="hero-title" class="t-display hero__title">Seu cuidado começa com <em>boas escolhas.</em></h1>
        <p class="hero__sub">Produtos selecionados para fazer parte da sua rotina.</p>
        <div class="hero__ctas">
          <a class="btn btn--primary btn--lg" href="#/produtos">Comprar agora</a>
          <a class="btn btn--outline-light btn--lg" href="#/categorias">Explorar categorias</a>
        </div>
      </div>
    </section>`;
}

function spotlightHTML(p) {
  const pr = getPricing(p);
  const av = getAvailability(p);
  return `
    <article class="spotlight on-dark">
      <a class="spotlight__media" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">
        ${productImage(p)}
        ${pr.discounted ? `<span class="badge badge--offer">-${pr.percent}%</span>` : ''}
      </a>
      <div class="spotlight__body">
        <p class="spotlight__kicker t-label">${esc(p.brand || 'Oferta')}</p>
        <h3 class="t-h1 spotlight__name">${esc(p.name)}</h3>
        ${p.description ? `<p class="spotlight__desc">${esc(p.description)}</p>` : ''}
        ${priceBlock(p)}
        ${pr.offer?.title ? `<p class="spotlight__offer-title">${esc(pr.offer.title)}</p>` : ''}
        <div class="spotlight__actions">
          ${av.purchasable
            ? `<button type="button" class="btn btn--lime btn--lg" data-action="add-to-cart" data-id="${esc(p.id)}">Comprar</button>`
            : `<button type="button" class="btn btn--lg" disabled>Indisponível</button>`}
          <a class="btn btn--outline-light btn--lg" href="${productUrl(p)}">Ver produto</a>
        </div>
      </div>
    </article>`;
}

export async function renderHome() {
  setView(`
    ${heroHTML()}
    <section class="section" aria-labelledby="h-cats">
      <div class="container">
        ${sectionHead('Compre por categoria', { id: 'h-cats', link: { href: '#/categorias', label: 'Ver todas' } })}
        <ul class="cat-rail" id="home-cats">${categoryRailSkeleton(6)}</ul>
      </div>
    </section>
    <div id="home-dynamic"><div class="container"><div class="product-grid product-grid--4">${cardSkeleton(4)}</div></div></div>
  `);

  try { await ensureData(); } catch { $('#home-dynamic').innerHTML = errorView(); $('#home-cats').innerHTML = ''; return; }

  const products = getState().catalog.items;
  const categories = getState().categories.items;
  const counts = categoryCounts(products);
  $('#home-cats').innerHTML = categories.map((c, i) => categoryTile(c, counts.get(c.slug) || 0, { eager: i < 6 })).join('');

  const offers = products.filter(hasActiveDiscount);
  let banners = [];
  try { banners = await fetchHomeBanners(); } catch (err) { console.warn('Não foi possível carregar os banners da Home:', err); }
  const bannerBefore = banners.find((b) => b.position === 1);
  const bannerAfter = banners.find((b) => b.position === 2);
  const recent = sortProducts(products, 'recentes').slice(0, 8);
  const brands = [...countBy(products, (p) => p.brand).keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const types = [...countBy(products, (p) => p.type).entries()].sort((a, b) => b[1] - a[1]);

  $('#home-dynamic').innerHTML = `
    ${homeBannerHTML(bannerBefore, 'Banner antes das ofertas', 'home-banner-before-offers')}

    ${offers.length ? `
    <section class="section section--tight" aria-labelledby="h-offers">
      <div class="container">
        ${sectionHead('Ofertas ativas', { id: 'h-offers', kicker: plural(offers.length, 'produto com desconto', 'produtos com desconto'), link: offers.length > 1 ? { href: '#/ofertas', label: 'Ver ofertas' } : null })}
        <div class="offers-carousel">
          <button class="offers-carousel__arrow" type="button" data-action="offers-prev" aria-label="Ofertas anteriores">‹</button>
          <div class="offers-list" id="home-offers-rail" tabindex="0" aria-label="Ofertas ativas; deslize para os lados">
            ${offers.map(spotlightHTML).join('')}
          </div>
          <button class="offers-carousel__arrow" type="button" data-action="offers-next" aria-label="Próximas ofertas">›</button>
        </div>
      </div>
    </section>` : ''}

    ${homeBannerHTML(bannerAfter, 'Banner depois das ofertas', 'home-banner-after-offers')}

    <section class="section" aria-labelledby="h-new">
      <div class="container">
        ${sectionHead('Novidades', { id: 'h-new', link: { href: '#/novidades', label: 'Ver todas' } })}
        ${recent.length ? productGrid(recent, { cols: 4, favorites: favs(), rail: true }) : stateBlock({ title: 'Nenhum produto publicado ainda.' })}
      </div>
    </section>

    <section class="section editorial" aria-labelledby="h-edit">
      <div class="container editorial__grid">
        <figure class="editorial__media">
          <img src="assets/img/ingredients-900.webp" alt="Camomila, própolis, canela, gengibre, mel e cápsulas sobre linho" width="900" height="1350" loading="lazy" decoding="async">
        </figure>
        <div class="editorial__body">
          <p class="t-label section-head__kicker">O catálogo</p>
          <h2 class="t-h1" id="h-edit">Natural, encapsulado e organizado por necessidade.</h2>
          <p class="editorial__lead">Fitoterápicos, vitaminas, minerais, xaropes e cuidados diários reunidos em um só lugar, com marcas que você reconhece.</p>
          <div class="figures">
            <div><p class="figure__value">${products.length}</p><p class="figure__label t-small">produtos</p></div>
            <div><p class="figure__value">${brands.length}</p><p class="figure__label t-small">marcas</p></div>
            <div><p class="figure__value">${categories.length}</p><p class="figure__label t-small">categorias</p></div>
          </div>
          ${brands.length ? `
          <div>
            <p class="t-label t-muted filters__group-title">Marcas no catálogo</p>
            <ul class="brand-list">${brands.map((b) => `<li><a href="${buildHash('/produtos', { marca: b })}">${esc(b)}</a></li>`).join('')}</ul>
          </div>` : ''}
        </div>
      </div>
    </section>

    ${types.length ? `
    <section class="types-band on-dark" aria-labelledby="h-types">
      <div class="container types-band__inner">
        <div>
          <p class="t-label spotlight__kicker">Formato</p>
          <h2 class="t-h2" id="h-types">Escolha do seu jeito</h2>
        </div>
        <ul class="chips">${types.map(([t, n]) => `<li><a class="chip" href="${buildHash('/produtos', { tipo: t })}">${esc(t)} <span aria-hidden="true">· ${n}</span><span class="sr-only">, ${plural(n, 'produto', 'produtos')}</span></a></li>`).join('')}</ul>
      </div>
    </section>` : ''}
  `;
}

/* =========================================================
   LISTAGEM (produtos, categoria, ofertas, novidades)
   ========================================================= */
const pageSizes = new Map();

function filterLink(path, query, key, value) {
  const q = { ...query, [key]: query[key] === value ? undefined : value };
  delete q.n;
  return buildHash(path, q);
}

function filtersHTML({ path, query, base, categories, showCategories }) {
  const types = [...countBy(base, (p) => p.type).entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  const brands = [...countBy(base, (p) => p.brand).entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  const catCounts = categoryCounts(base);
  const group = (title, entries, key) => entries.length ? `
    <div>
      <h2 class="t-label filters__group-title">${title}</h2>
      <ul class="filters__list">${entries.map(([v, n]) => `
        <li><a class="filters__link" href="${filterLink(path, query, key, v)}" aria-current="${query[key] === v}"><span>${esc(v)}</span><span>${n}</span></a></li>`).join('')}
      </ul>
    </div>` : '';
  return `
    ${showCategories ? `
    <div>
      <h2 class="t-label filters__group-title">Categorias</h2>
      <ul class="filters__list">${categories.map((c) => `
        <li><a class="filters__link" href="${categoryUrl(c)}"><span>${esc(c.name)}</span><span>${catCounts.get(c.slug) || 0}</span></a></li>`).join('')}
      </ul>
    </div>` : ''}
    ${group('Formato', types, 'tipo')}
    ${group('Marca', brands, 'marca')}`;
}

export async function renderListing({ path, query, mode, slug }) {
  setView(`<div class="container"><div class="section--tight"><div class="skeleton skeleton--line-lg"></div></div><div class="product-grid product-grid--4">${cardSkeleton(8)}</div></div>`, 'Produtos');
  try { await ensureData(); } catch { setView(errorView(), 'Produtos'); return; }

  const all = getState().catalog.items;
  const categories = getState().categories.items;
  let base = all;
  let title = 'Produtos';
  let sub = '';
  let crumbs = [['#/', 'Início']];
  let catHero = '';
  let emptyText = 'Nenhum produto corresponde aos filtros selecionados.';
  let defaultSort = 'nome';

  if (mode === 'category') {
    const cat = findCategoryBySlug(slug);
    if (!cat) { renderNotFound('Categoria não encontrada'); return; }
    base = filterProducts(all, { category: slug });
    title = cat.name;
    crumbs.push(['#/categorias', 'Categorias']);
    catHero = `
      <header class="cat-hero">
        ${cat.imageUrl ? `<div class="cat-hero__media"><img src="${esc(cat.imageUrl)}" alt="" width="400" height="400" fetchpriority="high"></div>` : ''}
        <div>
          <h1 class="t-h1">${esc(cat.name)}</h1>
          ${cat.description ? `<p class="page-head__sub">${esc(cat.description)}</p>` : ''}
        </div>
      </header>`;
    emptyText = 'Ainda não há produtos publicados nesta categoria.';
  } else if (mode === 'offers') {
    base = all.filter(hasActiveDiscount);
    title = 'Ofertas';
    sub = 'Produtos com desconto vigente.';
    emptyText = 'Não há ofertas ativas no momento.';
  } else if (mode === 'new') {
    title = 'Novidades';
    sub = 'Os produtos adicionados mais recentemente ao catálogo.';
    defaultSort = 'recentes';
  }

  const sort = SORTS[query.ordem] ? query.ordem : defaultSort;
  const filtered = sortProducts(filterProducts(base, { type: query.tipo, brand: query.marca }), sort);
  const key = location.hash;
  const size = pageSizes.get(key) || CONFIG.PAGE_SIZE;
  const visible = filtered.slice(0, size);
  const activeChips = [['tipo', query.tipo], ['marca', query.marca]].filter(([, v]) => v);

  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb">${crumbs.map(([h, l]) => `<li><a href="${h}">${esc(l)}</a></li>`).join('')}<li aria-current="page">${esc(title)}</li></ol></nav>
      ${catHero || `<header class="page-head"><h1 class="t-h1">${esc(title)}</h1>${sub ? `<p class="page-head__sub">${esc(sub)}</p>` : ''}</header>`}

      <div class="listing">
        <aside class="listing__aside" aria-label="Filtros">
          <button type="button" class="btn btn--outline btn--sm filters-toggle" data-action="toggle-filters" aria-expanded="false" aria-controls="filters-panel">${icon('filter', 'icon--sm')} Filtrar</button>
          <div class="filters filters-panel" id="filters-panel">${filtersHTML({ path, query, base, categories, showCategories: mode !== 'category' })}</div>
        </aside>

        <section class="listing__main" aria-label="Resultados">
          <div class="toolbar">
            <p class="toolbar__count" aria-live="polite">${plural(filtered.length, 'produto', 'produtos')}</p>
            <div class="toolbar__sort">
              <label class="t-small t-muted" for="sort">Ordenar por</label>
              <select class="select" id="sort" data-action="sort">
                ${Object.entries(SORTS).map(([k, s]) => `<option value="${k}" ${k === sort ? 'selected' : ''}>${s.label}</option>`).join('')}
              </select>
            </div>
          </div>
          ${activeChips.length ? `<ul class="chips active-filters">${activeChips.map(([k, v]) => `<li><a class="chip" aria-current="true" href="${filterLink(path, query, k, v)}">${esc(v)} ${icon('close', 'icon--sm')}<span class="sr-only">remover filtro</span></a></li>`).join('')}</ul>` : ''}
          ${visible.length
            ? productGrid(visible, { cols: 3, favorites: favs() })
            : stateBlock({ title: 'Nada por aqui', text: emptyText, action: activeChips.length ? { href: buildHash(path, {}), label: 'Limpar filtros' } : { href: '#/produtos', label: 'Ver todos os produtos' } })}
          ${filtered.length > visible.length ? `<div class="load-more"><button type="button" class="btn btn--outline" data-action="load-more">Carregar mais (${filtered.length - visible.length})</button></div>` : ''}
        </section>
      </div>
    </div>`, title);

  $('#sort')?.addEventListener('change', (e) => { location.hash = buildHash(path, { ...query, ordem: e.target.value, n: undefined }); });
  $('[data-action="load-more"]')?.addEventListener('click', () => {
    pageSizes.set(key, size + CONFIG.PAGE_SIZE);
    const y = window.scrollY;
    renderListing({ path, query, mode, slug }).then(() => window.scrollTo(0, y));
  });
}

/* =========================================================
   CATEGORIAS
   ========================================================= */
export async function renderCategories() {
  setView(`<div class="container section--tight"><ul class="cat-rail">${categoryRailSkeleton(12)}</ul></div>`, 'Categorias');
  try { await ensureData(); } catch { setView(errorView('Não foi possível carregar as categorias'), 'Categorias'); return; }
  const cats = getState().categories.items;
  const counts = categoryCounts(getState().catalog.items);
  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Categorias</li></ol></nav>
      <header class="page-head"><h1 class="t-h1">Categorias</h1></header>
      ${cats.length ? `<ul class="cat-rail">${cats.map((c, i) => categoryTile(c, counts.get(c.slug) || 0, { eager: i < 6 })).join('')}</ul>` : stateBlock({ title: 'Nenhuma categoria publicada.' })}
    </div>`, 'Categorias');
}

/* =========================================================
   BUSCA
   ========================================================= */
let searchController = null;
export async function renderSearch({ query }) {
  const term = (query.q || '').trim();
  const head = (count) => `
    <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Busca</li></ol></nav>
    <header class="page-head"><h1 class="t-h1">${term ? `Resultados para “${esc(term)}”` : 'Buscar produtos'}</h1>${count != null ? `<p class="page-head__sub">${plural(count, 'produto encontrado', 'produtos encontrados')}</p>` : ''}</header>`;
  if (term.length < CONFIG.SEARCH_MIN_CHARS) {
    setView(`<div class="container">${head()}${stateBlock({ title: `Digite pelo menos ${CONFIG.SEARCH_MIN_CHARS} letras na busca.` })}</div>`, 'Busca');
    return;
  }
  setView(`<div class="container">${head()}<div class="product-grid product-grid--4" aria-busy="true">${cardSkeleton(4)}</div></div>`, `Busca: ${term}`);
  searchController?.abort();
  searchController = new AbortController();
  try {
    const items = await runSearch(term, { signal: searchController.signal, limit: 60 });
    setView(`<div class="container">${head(items.length)}${items.length
      ? productGrid(items, { cols: 4, favorites: favs() })
      : stateBlock({ title: 'Nenhum produto encontrado', text: 'Tente outro termo, como o nome do produto, da marca ou do ingrediente.', action: { href: '#/categorias', label: 'Explorar categorias' } })}</div>`, `Busca: ${term}`);
  } catch (err) {
    if (err.name === 'AbortError') return;
    setView(`<div class="container">${head()}${stateBlock({ title: 'A busca falhou', text: 'Não foi possível consultar o catálogo agora.', variant: 'error', action: { id: 'retry', label: 'Tentar novamente' } })}</div>`, 'Busca');
  }
}

/* =========================================================
   PRODUTO
   ========================================================= */
export async function renderProduct({ params }) {
  setView(`<div class="container section--tight"><div class="pdp"><div class="pdp__gallery"><div class="skeleton skeleton--media"></div></div><div class="pdp__info"><div class="skeleton skeleton--line skeleton--w40"></div><div class="skeleton skeleton--line-lg"></div><div class="skeleton skeleton--line"></div><div class="skeleton skeleton--btn"></div></div></div></div>`, 'Produto');
  try { await ensureData(); } catch { setView(errorView('Não foi possível carregar o produto'), 'Produto'); return; }

  const p = findProductBySlug(params.slug);
  if (!p) { renderNotFound('Produto não encontrado'); return; }
  const av = getAvailability(p);
  const pr = getPricing(p);
  const mainCat = p.categories[0];
  const isFav = favs().has(p.id);
  const related = mainCat
    ? getState().catalog.items.filter((x) => x.id !== p.id && x.categories.some((c) => c.slug === mainCat.slug)).slice(0, 4)
    : [];

  let stockText = '';
  if (av.reason === 'out-of-stock') stockText = '<p class="pdp__stock pdp__stock--out">Produto indisponível no momento.</p>';
  else if (av.purchasable) stockText = `<p class="pdp__stock pdp__stock--ok">Em estoque${av.maxQty <= 5 ? ` · últimas ${av.maxQty} unidades` : ''}</p>`;

  const specs = [['SKU', p.sku], ['Marca', p.brand], ['Formato', p.type], ['Apresentação', p.dose]].filter(([, v]) => v);

  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb">
        <li><a href="#/">Início</a></li><li><a href="#/produtos">Produtos</a></li>
        ${mainCat ? `<li><a href="#/categoria/${encodeURIComponent(mainCat.slug)}">${esc(mainCat.name)}</a></li>` : ''}
        <li aria-current="page">${esc(p.name)}</li>
      </ol></nav>

      <article class="pdp">
        <div class="pdp__gallery">
          <div class="pdp__main-img" id="pdp-main">${productImage(p, { eager: true })}</div>
          ${p.images.length > 1 ? `<div class="pdp__thumbs">${p.images.map((img, i) => `
            <button type="button" class="pdp__thumb" data-action="pdp-thumb" data-index="${i}" aria-current="${i === 0}" aria-label="Imagem ${i + 1} de ${p.images.length}">
              <img src="${esc(img.url)}" alt="" width="64" height="64" loading="lazy">
            </button>`).join('')}</div>` : ''}
        </div>

        <div class="pdp__info">
          ${p.brand ? `<p class="pdp__brand t-label">${esc(p.brand)}</p>` : ''}
          <h1 class="t-h1">${esc(p.name)}</h1>
          ${pr.discounted ? `<p><span class="badge badge--offer">-${pr.percent}%</span></p>` : ''}

          <div class="pdp__buy">
            ${priceBlock(p, { size: 'pdp' })}
            ${stockText}
            ${av.purchasable ? `
              <div class="pdp__buy-row">
                <div class="qty qty--lg" role="group" aria-label="Quantidade">
                  <button type="button" class="qty__btn" data-action="pdp-dec" aria-label="Diminuir" disabled>−</button>
                  <span class="qty__value" id="pdp-qty" aria-live="polite">1</span>
                  <button type="button" class="qty__btn" data-action="pdp-inc" aria-label="Aumentar" ${av.maxQty <= 1 ? 'disabled' : ''}>+</button>
                </div>
                <button type="button" class="btn btn--primary btn--lg" data-action="pdp-add" data-id="${esc(p.id)}">Adicionar ao carrinho</button>
              </div>` : `
              <button type="button" class="btn btn--lg btn--block" disabled>${av.reason === 'out-of-stock' ? 'Indisponível' : 'Compra indisponível'}</button>
              ${av.reason !== 'out-of-stock' ? '<p class="pdp__notice">Preço e disponibilidade ainda não foram informados para este produto.</p>' : ''}`}
            <button type="button" class="btn btn--ghost" data-action="toggle-fav" data-id="${esc(p.id)}" aria-pressed="${isFav}">${icon('heart', 'icon--sm')} <span data-fav-label>${isFav ? 'Nos favoritos' : 'Favoritar'}</span></button>
          </div>

          ${p.description ? `<p class="pdp__desc">${esc(p.description)}</p>` : ''}
          ${specs.length ? `<dl class="pdp__specs">${specs.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
          ${p.categories.length ? `<ul class="pdp__cats">${p.categories.map((c) => `<li><a class="chip" href="#/categoria/${encodeURIComponent(c.slug)}">${esc(c.name)}</a></li>`).join('')}</ul>` : ''}
        </div>
      </article>

      <section class="section" aria-labelledby="h-reviews">
        <h2 class="t-h2" id="h-reviews">Avaliações</h2>
        <div class="reviews" id="reviews" aria-busy="true"><div class="skeleton skeleton--line skeleton--w70"></div></div>
      </section>

      ${related.length ? `
      <section class="section section--tight" aria-labelledby="h-related">
        ${sectionHead(`Mais em ${mainCat.name}`, { id: 'h-related', link: { href: `#/categoria/${encodeURIComponent(mainCat.slug)}`, label: 'Ver categoria' } })}
        ${productGrid(related, { cols: 4, favorites: favs(), rail: true })}
      </section>` : ''}
    </div>`, p.name);

  // Quantidade
  let qty = 1;
  const qv = $('#pdp-qty');
  const dec = $('[data-action="pdp-dec"]');
  const inc = $('[data-action="pdp-inc"]');
  const sync = () => { qv.textContent = qty; dec.disabled = qty <= 1; inc.disabled = qty >= av.maxQty; };
  dec?.addEventListener('click', () => { qty = Math.max(1, qty - 1); sync(); });
  inc?.addEventListener('click', () => { qty = Math.min(av.maxQty, qty + 1); sync(); });
  $('[data-action="pdp-add"]')?.addEventListener('click', (e) => addToCart(e.currentTarget.dataset.id, qty));

  // Galeria
  $$('[data-action="pdp-thumb"]').forEach((b) => b.addEventListener('click', () => {
    const img = p.images[Number(b.dataset.index)];
    $('#pdp-main').innerHTML = `<img src="${esc(img.url)}" alt="${esc(img.alt || p.name)}" width="400" height="400">`;
    $$('[data-action="pdp-thumb"]').forEach((t) => t.setAttribute('aria-current', String(t === b)));
  }));

  // Avaliações (somente aprovadas)
  const box = $('#reviews');
  try {
    const reviews = await fetchApprovedReviews(p.id);
    box.removeAttribute('aria-busy');
    box.innerHTML = reviews.length
      ? reviews.map((r) => `
        <article class="review">
          ${r.rating ? `<p class="review__rating" aria-label="Nota ${r.rating} de 5">${'★'.repeat(Math.max(0, Math.min(5, r.rating)))}${'☆'.repeat(5 - Math.max(0, Math.min(5, r.rating)))}</p>` : ''}
          ${r.title ? `<p class="review__title">${esc(r.title)}</p>` : ''}
          ${r.comment ? `<p class="review__text">${esc(r.comment)}</p>` : ''}
          <p class="review__date">${formatDate(r.created_at)}</p>
        </article>`).join('')
      : '<p class="t-muted">Este produto ainda não possui avaliações.</p>';
  } catch {
    box.removeAttribute('aria-busy');
    box.innerHTML = '<p class="field__error">Não foi possível carregar as avaliações.</p>';
  }
}

/* =========================================================
   CARRINHO
   ========================================================= */
export async function renderCartPage() {
  try { await loadCatalog(); } catch { setView(errorView('Não foi possível carregar o carrinho'), 'Carrinho'); return; }
  const lines = resolveCart();
  const head = `<nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Carrinho</li></ol></nav>
    <header class="page-head"><h1 class="t-h1">Carrinho</h1></header>`;
  if (!lines.length) {
    setView(`<div class="container">${head}${stateBlock({ title: 'Seu carrinho está vazio', text: 'Escolha produtos no catálogo para começar.', action: { href: '#/produtos', label: 'Ver produtos' } })}</div>`, 'Carrinho');
    return;
  }
  const totals = cartTotals(lines);
  const { auth } = getState();
  if (auth.status !== 'authenticated' || !auth.customer) {
    setView(`
      <div class="container">${head}
        <div class="cart-page">
          <section class="cart-page__list" aria-label="Itens do carrinho"><ul>${lines.map(cartLine).join('')}</ul></section>
          <aside class="cart-page__summary"><h2 class="t-h3">Resumo</h2>${summaryBlock(totals)}
            <p class="summary-note">Entre na sua conta para escolher entrega ou retirada e concluir o pedido.</p>
            <a class="btn btn--primary btn--lg btn--block" href="#/conta">Entrar ou criar conta</a>
          </aside>
        </div>
      </div>`, 'Carrinho');
    return;
  }

  let addresses = [];
  try { addresses = await fetchAddresses(auth.customer.id); } catch { /* endereço novo pode ser cadastrado no checkout */ }
  const needsNewAddress = addresses.length === 0;
  setView(`
    <div class="container">
      ${head}
      <div class="cart-page">
        <section class="cart-page__list" aria-label="Itens do carrinho"><ul>${lines.map(cartLine).join('')}</ul></section>
        <aside class="cart-page__summary" aria-labelledby="h-summary">
          <h2 class="t-h3" id="h-summary">Resumo do pedido</h2>
          ${summaryBlock(totals)}
          ${totals.hasIssues ? '<p class="field__error">Revise os itens indisponíveis antes de continuar.</p>' : ''}
        </aside>
        <section class="auth-card checkout-card" aria-labelledby="h-checkout">
          <h2 class="t-h3" id="h-checkout">Como deseja receber?</h2>
          <form id="checkout-form" novalidate>
            <fieldset class="checkout-options">
              <legend class="field__label">Forma de recebimento</legend>
              <label class="checkout-choice"><input type="radio" name="fulfillment_type" value="delivery" checked> <span><strong>Receber em casa</strong><small>Pedido mínimo de R$ 20,00. A taxa de entrega será confirmada pela loja.</small></span></label>
              <label class="checkout-choice"><input type="radio" name="fulfillment_type" value="pickup"> <span><strong>Retirar na loja</strong><small>Retirada gratuita. Você paga quando buscar o pedido.</small></span></label>
            </fieldset>
            <div id="checkout-delivery-fields">
              ${addresses.length ? `<div class="field"><label class="field__label" for="checkout-address">Endereço de entrega</label><select class="select" id="checkout-address" name="address_id">${addresses.map((a) => `<option value="${esc(a.id)}">${esc(a.label || 'Endereço')} — ${esc([a.street, a.number, a.neighborhood].filter(Boolean).join(', '))}</option>`).join('')}<option value="new" ${needsNewAddress ? 'selected' : ''}>Cadastrar novo endereço</option></select></div>` : '<p class="summary-note">Informe o endereço para entrega.</p>'}
              <div id="checkout-new-address" ${needsNewAddress ? '' : 'hidden'}>
                ${!auth.customer.phone ? '<div class="field"><label class="field__label" for="checkout-phone">Telefone / WhatsApp</label><input class="input" id="checkout-phone" name="phone" type="tel" autocomplete="tel" maxlength="15" placeholder="(21) 99999-9999" required></div>' : ''}
                ${addressFieldsHTML('checkout')}
              </div>
            </div>
            <fieldset class="checkout-options">
              <legend class="field__label">Como deseja pagar?</legend>
              <label class="checkout-choice"><input type="radio" name="payment_method" value="pix" checked> <span><strong>Pix</strong><small>Pagamento presencial no recebimento ou retirada.</small></span></label>
              <label class="checkout-choice"><input type="radio" name="payment_method" value="cash"> <span><strong>Dinheiro</strong><small>Pagamento na entrega ou retirada.</small></span></label>
              <label class="checkout-choice"><input type="radio" name="payment_method" value="card"> <span><strong>Cartão de crédito ou débito</strong><small>Pagamento na entrega ou retirada, conforme disponibilidade da loja.</small></span></label>
            </fieldset>
            <div class="field"><label class="field__label" for="checkout-notes">Observações (opcional)</label><textarea class="input" id="checkout-notes" name="notes" rows="3" maxlength="500" placeholder="Referência, instruções ou observações"></textarea></div>
            <p class="summary-note">Nenhum pagamento será cobrado pelo site. O pagamento será feito presencialmente. O valor de eventual taxa de entrega será confirmado pela loja antes do envio.</p>
            <div class="form-message" id="checkout-message" role="alert" hidden></div>
            <button type="submit" class="btn btn--primary btn--lg btn--block" ${totals.hasIssues ? 'disabled' : ''}>Confirmar pedido · ${money(totals.total)}</button>
          </form>
        </section>
      </div>
    </div>`, 'Finalizar pedido');

  const form = $('#checkout-form');
  const deliveryFields = $('#checkout-delivery-fields', form);
  const newAddress = $('#checkout-new-address', form);
  const addressSelect = $('#checkout-address', form);
  const syncFulfillment = () => {
    const delivery = form.elements.fulfillment_type.value === 'delivery';
    deliveryFields.hidden = !delivery;
    if (addressSelect) newAddress.hidden = !delivery || addressSelect.value !== 'new';
  };
  form.addEventListener('change', (e) => {
    if (e.target.name === 'fulfillment_type' || e.target.name === 'address_id') syncFulfillment();
  });
  syncFulfillment();
  if ($('#checkout-cep', form)) bindAddressFields(form, 'checkout');
  if ($('#checkout-phone', form)) bindPhoneMask($('#checkout-phone', form));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('#checkout-message', form);
    const btn = $('button[type="submit"]', form);
    const fulfillmentType = form.elements.fulfillment_type.value;
    const paymentMethod = form.elements.payment_method.value;
    const useNewAddress = fulfillmentType === 'delivery' && (!addressSelect || addressSelect.value === 'new');
    msg.hidden = true;

    if (totals.hasIssues) { msg.textContent = 'Há itens indisponíveis. Atualize o carrinho antes de continuar.'; msg.className = 'form-message form-message--error'; msg.hidden = false; return; }
    if (fulfillmentType === 'delivery' && totals.total < 20) { msg.textContent = 'Para entrega, o pedido mínimo é de R$ 20,00. Você pode escolher retirada gratuita.'; msg.className = 'form-message form-message--error'; msg.hidden = false; return; }

    let addressId = fulfillmentType === 'delivery' && addressSelect && !useNewAddress ? addressSelect.value : null;
    if (useNewAddress) {
      const required = $$('input[required], select[required]', newAddress).filter((el) => !el.disabled);
      const invalid = required.find((el) => !el.checkValidity() || !String(el.value || '').trim());
      if (invalid) { invalid.setAttribute('aria-invalid', 'true'); invalid.focus(); msg.textContent = 'Preencha corretamente os dados do endereço de entrega.'; msg.className = 'form-message form-message--error'; msg.hidden = false; return; }
    }

    btn.disabled = true; btn.classList.add('is-loading');
    try {
      if (useNewAddress) {
        const address = readAddress(form);
        const phone = $('#checkout-phone', form)?.value;
        if (phone) await updateCustomerPhone(auth.customer.id, maskPhone(phone));
        const created = await createAddress(auth.customer.id, {
          ...address,
          recipient_name: auth.customer.name || auth.session.user?.user_metadata?.name || null,
          label: 'Entrega',
          is_default: true,
        });
        if (!created?.id) throw new Error('Não foi possível salvar o endereço.');
        addressId = created.id;
      }
      const result = await createCustomerOrder({
        fulfillmentType,
        paymentMethod,
        addressId,
        notes: form.elements.notes.value.trim(),
        items: lines.map((line) => ({ product_id: line.product_id, quantity: line.quantity })),
      });
      const orderId = Array.isArray(result) ? result[0] : result;
      clearCart();
      setView(`<div class="container"><div class="checkout-success"><p class="t-label">AuraCaps</p><h1 class="t-h1">Pedido recebido!</h1><p>Seu pedido foi registrado. Você pagará ${paymentMethod === 'pix' ? 'por Pix' : paymentMethod === 'cash' ? 'em dinheiro' : 'com cartão de crédito ou débito'} no momento ${fulfillmentType === 'pickup' ? 'da retirada na loja' : 'da entrega'}.</p><p class="summary-note">Acompanhe as atualizações em Minha conta. Número do pedido: <strong>${esc(String(orderId || '').slice(0, 8).toUpperCase())}</strong></p><a class="btn btn--primary" href="#/conta">Acompanhar pedido</a> <a class="btn btn--outline" href="#/produtos">Continuar comprando</a></div></div>`, 'Pedido recebido');
    } catch (err) {
      const raw = `${err?.message || ''} ${err?.details?.message || ''}`;
      const message = /DELIVERY_MINIMUM_NOT_MET/.test(raw) ? 'O pedido mínimo para entrega é R$ 20,00.'
        : /CUSTOMER_PROFILE_NOT_FOUND/.test(raw) ? 'Não encontramos seu cadastro de cliente. Saia e entre novamente na sua conta.'
        : /INSUFFICIENT_STOCK_OR_PRICE|PRODUCT_NOT_AVAILABLE/.test(raw) ? 'Um dos produtos ficou indisponível ou teve o estoque alterado. Atualize o carrinho.'
        : /DELIVERY_ADDRESS_REQUIRED/.test(raw) ? 'Informe um endereço válido para entrega.'
        : 'Não foi possível registrar o pedido. Confira os dados e tente novamente.';
      msg.textContent = message; msg.className = 'form-message form-message--error'; msg.hidden = false;
    } finally {
      btn.disabled = false; btn.classList.remove('is-loading');
    }
  });
}

/* =========================================================
   FAVORITOS
   ========================================================= */
export async function renderFavorites() {
  setView(`<div class="container section--tight"><div class="product-grid product-grid--4">${cardSkeleton(4)}</div></div>`, 'Favoritos');
  try { await loadCatalog(); } catch { setView(errorView(), 'Favoritos'); return; }
  const ids = favs();
  const items = getState().catalog.items.filter((p) => ids.has(p.id));
  const logged = getState().auth.customer;
  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Favoritos</li></ol></nav>
      <header class="page-head"><h1 class="t-h1">Favoritos</h1>
        ${!logged ? '<p class="page-head__sub"><a href="#/conta">Entre na sua conta</a> para guardar seus favoritos.</p>' : ''}
      </header>
      ${items.length ? productGrid(items, { cols: 4, favorites: ids }) : stateBlock({ title: 'Nenhum favorito ainda', text: 'Toque no coração de um produto para guardá-lo aqui.', action: { href: '#/produtos', label: 'Ver produtos' } })}
    </div>`, 'Favoritos');
}

/* =========================================================
   CONTA
   ========================================================= */
export async function cancelOrderFromAccount(orderId) {
  if (!orderId || !window.confirm('Deseja realmente cancelar este pedido?')) return;
  try {
    await cancelCustomerOrder(orderId);
    toast('Pedido cancelado com sucesso.');
    await renderAccount();
  } catch (error) {
    const raw = String(error?.message || '');
    const message = /ORDER_CANNOT_BE_CANCELLED/.test(raw)
      ? 'Este pedido já está em preparação ou saiu para entrega e não pode ser cancelado por aqui.'
      : /ORDER_PAYMENT_ALREADY_PROCESSED/.test(raw)
        ? 'Este pedido já possui pagamento processado. Entre em contato com a loja.'
        : /ORDER_NOT_FOUND/.test(raw) ? 'Pedido não encontrado.' : 'Não foi possível cancelar o pedido. Tente novamente.';
    toast(message, 'error');
  }
}

export async function deleteOrderFromAccount(orderId) {
  if (!orderId || !window.confirm('Apagar definitivamente este pedido e seus itens? Esta ação não pode ser desfeita.')) return;
  try {
    await deleteCustomerOrder(orderId);
    toast('Pedido apagado da sua conta.');
    await renderAccount();
  } catch (error) {
    const raw = String(error?.message || '');
    const message = /ORDER_CANNOT_BE_DELETED/.test(raw)
      ? 'Só é possível apagar pedidos que ainda estejam como Pedido recebido.'
      : /ORDER_PAYMENT_ALREADY_PROCESSED/.test(raw)
        ? 'Este pedido já possui pagamento processado e não pode ser apagado.'
        : /ORDER_NOT_FOUND/.test(raw) ? 'Pedido não encontrado.' : 'Não foi possível apagar o pedido. Tente novamente.';
    toast(message, 'error');
  }
}

export async function hideHistoricalOrderFromAccount(orderId) {
  if (!orderId || !window.confirm('Remover este pedido antigo da sua lista? O registro continuará preservado no histórico administrativo da loja.')) return;
  try {
    await hideHistoricalCustomerOrder(orderId);
    toast('Pedido removido da sua lista.');
    await renderAccount();
  } catch (error) {
    const raw = String(error?.message || '');
    const message = /ORDER_NOT_HISTORICAL/.test(raw)
      ? 'Só é possível remover pedidos entregues ou cancelados.'
      : /ORDER_NOT_FOUND/.test(raw) ? 'Pedido não encontrado.' : 'Não foi possível remover o pedido. Tente novamente.';
    toast(message, 'error');
  }
}

export async function renderAccount() {
  const { auth } = getState();
  const crumbs = `<nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Conta</li></ol></nav>`;

  if (auth.status === 'loading') {
    setView(`<div class="container">${crumbs}<div class="skeleton skeleton--line-lg"></div></div>`, 'Conta');
    return;
  }

  if (auth.status === 'authenticated') {
    const c = auth.customer;
    setView(`
      <div class="container">
        ${crumbs}
        <header class="page-head"><h1 class="t-h1">Olá${c?.name ? `, ${esc(c.name.split(' ')[0])}` : ''}</h1>
          <p class="page-head__sub">${esc(c?.email || auth.session.user?.email || '')}</p></header>
        <p class="account-admin-link" id="account-admin-link" hidden><a href="#/admin/banners">Gerenciar banners da Home</a></p>
        <div class="account account--split">
          <section class="auth-card" aria-labelledby="h-orders">
            <div class="order-section-head"><h2 class="t-h3" id="h-orders">Meus pedidos</h2><button type="button" class="btn btn--ghost btn--sm" data-action="refresh-orders">Atualizar status</button></div>
            <div id="orders" aria-busy="true"><div class="skeleton skeleton--line"></div></div>
          </section>
          <section class="auth-card" aria-labelledby="h-profile">
            <h2 class="t-h3" id="h-profile">Dados</h2>
            ${c ? `<dl class="pdp__specs">
              <dt>Nome</dt><dd>${esc(c.name || '—')}</dd>
              <dt>E-mail</dt><dd>${esc(c.email || '—')}</dd>
              <dt>Telefone</dt><dd>${esc(c.phone || '—')}</dd>
            </dl>` : '<p class="t-muted">Cadastro de cliente não encontrado para este usuário.</p>'}
            <button type="button" class="btn btn--outline" data-action="logout">Sair</button>
          </section>
          <section class="auth-card account__wide" aria-labelledby="h-addr">
            <h2 class="t-h3" id="h-addr">Endereços</h2>
            <div id="addresses" aria-busy="true"><div class="skeleton skeleton--line"></div></div>
          </section>
        </div>
      </div>`, 'Minha conta');
    const adminLink = $('#account-admin-link');
    if (auth.session?.user?.id && adminLink) {
      fetchCurrentAdmin(auth.session.user.id).then((admin) => { if (admin?.role === 'SUPER_ADMIN') adminLink.hidden = false; }).catch(() => {});
    }
    if (c) renderAddresses(c);
    const box = $('#orders');
    if (!c) { box.innerHTML = '<p class="t-muted">Nenhum pedido.</p>'; box.removeAttribute('aria-busy'); return; }
    try {
      const orders = await fetchOrders(c.id);
      box.removeAttribute('aria-busy');
      box.innerHTML = orders.length ? orders.map((o) => {
        // Normaliza status gravados pelo app Android (português ou inglês).
        const raw = String(o.status || 'received').trim().toLowerCase();
        const statusKey = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\s-]+/g, '_');
        const canceled = ['cancelled','canceled','cancelado'].includes(statusKey);
        const ready = ['ready_for_pickup','ready','pronto_para_retirada','pronto_para_retirar'].includes(statusKey);
        const completed = ['completed','delivered','concluido','retirado','entregue'].includes(statusKey);
        const departed = ['out_for_delivery','shipped','enviado','enviada','saiu_para_entrega','em_transito','em_entrega','saiu_para_entrega_hoje'].includes(statusKey);
        const packed = ['packed','packaged','empacotado','empacotada','embalado','embalada','processing','preparing','em_preparacao','preparando'].includes(statusKey);
        const stage = canceled ? -1 : completed ? 3 : ready || departed ? 2 : packed ? 1 : 0;
        const steps = ['Pedido recebido', 'Empacotado', 'Saiu para entrega', 'Entregue'];
        const payment = ({ pix: 'Pix', cash: 'Dinheiro', card: 'Cartão' })[o.paymentMethod] || 'A combinar';
        const canCancel = !canceled && !completed && ['received', 'pending'].includes(raw) && ['pending', 'unpaid'].includes(String(o.paymentStatus || 'pending').toLowerCase());
        const itemsHTML = o.items?.length ? `<div class="order-items"><strong>Produtos do pedido</strong><ul>${o.items.map((item) => `<li><span>${esc(item.name)} <small>× ${item.quantity}</small></span><strong>${item.subtotal != null ? money(item.subtotal) : '—'}</strong></li>`).join('')}</ul></div>` : '<p class="order-card__meta">Itens deste pedido não disponíveis.</p>';
        return `<article class="order-card">
          <div class="order-card__head"><div><p class="t-label">Pedido ${esc(String(o.id || '').slice(0, 8).toUpperCase())}</p><p class="t-small t-muted">${formatDate(o.createdAt)}</p></div><strong>${o.total != null ? money(o.total) : '—'}</strong></div>
          <p class="order-card__meta">${o.fulfillmentType === 'pickup' ? 'Retirada na loja' : 'Entrega'} · Pagamento: ${payment} no recebimento</p>
          ${itemsHTML}
          ${canceled ? '<p class="field__error">Pedido cancelado</p>' : `<ol class="order-progress" aria-label="Andamento do pedido">${steps.map((label, i) => `<li class="${i <= stage ? 'is-done' : ''}"><span>${i + 1}</span><small>${label}</small></li>`).join('')}</ol>${completed ? '<p class="summary-note">Pedido concluído.</p>' : ''}`}
          ${canCancel ? `<div class="order-card__actions"><button type="button" class="btn btn--outline btn--sm" data-action="cancel-order" data-id="${esc(o.id)}">Cancelar pedido</button><button type="button" class="btn btn--outline btn--sm" data-action="delete-order" data-id="${esc(o.id)}">Apagar pedido</button><small>Disponível enquanto o pedido estiver como “Pedido recebido”.</small></div>` : ''}
          ${(canceled || completed) ? `<div class="order-card__actions"><button type="button" class="btn btn--ghost btn--sm" data-action="hide-old-order" data-id="${esc(o.id)}">Remover pedido antigo da minha lista</button></div>` : ''}
        </article>`;
      }).join('') : '<p class="t-muted">Você ainda não fez pedidos.</p>';
    } catch {
      box.removeAttribute('aria-busy');
      box.innerHTML = '<p class="field__error">Não foi possível carregar seus pedidos.</p>';
    }
    return;
  }

  setView(`
    <div class="container">
      ${crumbs}
      <div class="account account--narrow">
        <section class="auth-card" aria-label="Acesso à conta">
          <div class="auth-tabs" role="tablist">
            <button type="button" role="tab" id="tab-login" aria-selected="true" aria-controls="panel-login">Entrar</button>
            <button type="button" role="tab" id="tab-signup" aria-selected="false" aria-controls="panel-signup" tabindex="-1">Criar conta</button>
          </div>
          <form id="panel-login" role="tabpanel" aria-labelledby="tab-login" novalidate>
            <div class="field"><label class="field__label" for="li-email">E-mail</label><input class="input" id="li-email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label class="field__label" for="li-pass">Senha</label><input class="input" id="li-pass" name="password" type="password" autocomplete="current-password" required></div>
            <div class="form-message" role="alert" hidden></div>
            <button type="submit" class="btn btn--primary btn--lg">Entrar</button>
          </form>
          <form id="panel-signup" role="tabpanel" aria-labelledby="tab-signup" novalidate hidden>
            <div class="field"><label class="field__label" for="su-name">Nome</label><input class="input" id="su-name" name="name" autocomplete="name" required></div>
            <div class="field"><label class="field__label" for="su-email">E-mail</label><input class="input" id="su-email" name="email" type="email" autocomplete="email" required></div>
            <div class="field"><label class="field__label" for="su-phone">Telefone / WhatsApp</label><input class="input" id="su-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" maxlength="15" required></div>
            <div class="field"><label class="field__label" for="su-pass">Senha</label><input class="input" id="su-pass" name="password" type="password" autocomplete="new-password" minlength="6" required><span class="field__hint">Mínimo de 6 caracteres.</span></div>
            ${addressFieldsHTML('su')}
            <div class="form-message" role="alert" hidden></div>
            <button type="submit" class="btn btn--primary btn--lg">Criar conta</button>
          </form>
        </section>
      </div>
    </div>`, 'Entrar');

  // Abas
  const tabs = $$('[role="tab"]');
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    tab.focus();
  };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(t));
    t.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') select(tabs[(i + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length]);
    });
  });

  bindPhoneMask($('#su-phone'));
  bindAddressFields($('#panel-signup'), 'su');

  const bind = (form, handler) => form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-message', form);
    const btn = $('button[type="submit"]', form);
    msg.hidden = true;
    let valid = true;
    $$('input[required], select[required]', form).forEach((inp) => {
      let ok = inp.checkValidity();
      if (ok && inp.name === 'phone') ok = isValidPhone(inp.value);
      if (ok && inp.name === 'postal_code') ok = isValidCep(inp.value);
      inp.setAttribute('aria-invalid', String(!ok));
      if (!ok) valid = false;
    });
    if (!valid) {
      msg.className = 'form-message form-message--error';
      msg.textContent = 'Preencha os campos obrigatórios corretamente.';
      msg.hidden = false;
      return;
    }
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
      const ok = await handler(Object.fromEntries(new FormData(form)));
      if (ok) { msg.className = 'form-message form-message--ok'; msg.textContent = ok; msg.hidden = false; }
    } catch (err) {
      msg.className = 'form-message form-message--error';
      msg.textContent = authErrorMessage(err);
      msg.hidden = false;
    } finally {
      btn.classList.remove('is-loading'); btn.disabled = false;
    }
  });

  bind($('#panel-login'), async ({ email, password }) => { await signIn(email, password); return null; });
  bind($('#panel-signup'), async ({ email, password, name, phone }) => {
    const address = readAddress($('#panel-signup'));
    const res = await signUp(email, password, { name: name.trim(), phone: maskPhone(phone), address });
    return res?.access_token ? null : `Enviamos um link de confirmação para ${email}. Confirme para entrar.`;
  });
}

/* ---------- Endereços na conta ---------- */
async function renderAddresses(c) {
  const box = $('#addresses');
  if (!box) return;
  let list = [];
  try {
    list = await fetchAddresses(c.id);
  } catch {
    box.removeAttribute('aria-busy');
    box.innerHTML = '<p class="field__error">Não foi possível carregar seus endereços.</p>';
    return;
  }
  box.removeAttribute('aria-busy');
  const needsPhone = !c.phone;
  box.innerHTML = `
    ${list.length ? `<ul class="address-list">${list.map((a) => `
      <li class="address-card">
        <p class="t-label">${esc(a.label || 'Endereço')}${a.is_default ? ' <span class="badge badge--soft">Principal</span>' : ''}</p>
        <p class="t-small">${formatAddress(a)}</p>
      </li>`).join('')}</ul>` : '<p class="t-muted">Nenhum endereço cadastrado.</p>'}
    <details class="address-add" ${list.length ? '' : 'open'}>
      <summary class="btn btn--outline">${list.length ? 'Adicionar outro endereço' : 'Cadastrar endereço'}</summary>
      <form id="address-form" novalidate>
        ${needsPhone ? `<div class="field"><label class="field__label" for="ad-phone">Telefone / WhatsApp</label><input class="input" id="ad-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="(21) 99999-9999" maxlength="15" required></div>` : ''}
        ${addressFieldsHTML('ad')}
        <div class="form-message" role="alert" hidden></div>
        <button type="submit" class="btn btn--primary">Salvar endereço</button>
      </form>
    </details>`;
  const form = $('#address-form');
  bindAddressFields(form, 'ad');
  if (needsPhone) bindPhoneMask($('#ad-phone'));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form-message', form);
    const btn = $('button[type="submit"]', form);
    let valid = true;
    $$('input[required], select[required]', form).forEach((inp) => {
      let ok = inp.checkValidity();
      if (ok && inp.name === 'phone') ok = isValidPhone(inp.value);
      if (ok && inp.name === 'postal_code') ok = isValidCep(inp.value);
      inp.setAttribute('aria-invalid', String(!ok));
      if (!ok) valid = false;
    });
    if (!valid) {
      msg.className = 'form-message form-message--error';
      msg.textContent = 'Preencha os campos obrigatórios corretamente.';
      msg.hidden = false;
      return;
    }
    btn.classList.add('is-loading'); btn.disabled = true;
    try {
      if (needsPhone) {
        const phone = maskPhone(form.elements.phone.value);
        await updateCustomerPhone(c.id, phone);
        c.phone = phone;
      }
      await createAddress(c.id, { ...readAddress(form), recipient_name: c.name || null, is_default: !list.length, label: list.length ? 'Outro' : 'Principal' });
      toast('Endereço salvo');
      renderAccount();
    } catch {
      msg.className = 'form-message form-message--error';
      msg.textContent = 'Não foi possível salvar o endereço. Tente novamente.';
      msg.hidden = false;
      btn.classList.remove('is-loading'); btn.disabled = false;
    }
  });
}

export async function logout() { await signOut(); }

/* =========================================================
   INSTITUCIONAIS
   ========================================================= */
export async function renderAbout() {
  let figures = '';
  try {
    await ensureData();
    const products = getState().catalog.items;
    figures = `<div class="figures">
      <div><p class="figure__value">${products.length}</p><p class="figure__label t-small">produtos</p></div>
      <div><p class="figure__value">${countBy(products, (p) => p.brand).size}</p><p class="figure__label t-small">marcas</p></div>
      <div><p class="figure__value">${getState().categories.items.length}</p><p class="figure__label t-small">categorias</p></div>
    </div>`;
  } catch { /* página continua sem os números */ }

  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Sobre</li></ol></nav>
      <div class="about">
        <figure class="about__media"><img src="assets/img/ingredients-900.webp" alt="Ingredientes naturais e cápsulas sobre linho" width="900" height="1350"></figure>
        <div class="about__body">
          <h1 class="t-h1">Sobre a AuraCaps</h1>
          <div class="about__text">
            <p><strong>A AuraCaps reúne produtos naturais, encapsulados, vitaminas, minerais, fitoterápicos e nutracêuticos em um só lugar.</strong></p>
            <p>O catálogo é organizado por necessidade, para você encontrar rápido o que procura e comparar marcas e formatos.</p>
          </div>
          ${figures}
          <div class="pillars">
            <div><p class="pillar__title">Qualidade</p><p class="pillar__text">Produtos selecionados</p></div>
            <div><p class="pillar__title">Compra segura</p><p class="pillar__text">Experiência confiável</p></div>
            <div><p class="pillar__title">Produtos selecionados</p><p class="pillar__text">Escolhas para sua rotina</p></div>
            <div><p class="pillar__title">Atendimento próximo</p><p class="pillar__text">Uma loja de verdade</p></div>
          </div>
        </div>
      </div>
    </div>`, 'Sobre');
}

export async function renderBannerAdmin() {
  const { auth } = getState();
  if (auth.status !== 'authenticated' || !auth.session?.user?.id) {
    setView(`<div class="container"><div class="page-head"><h1 class="t-h1">Gerenciar banners</h1><p class="page-head__sub">Entre com sua conta administradora para continuar.</p><a class="btn btn--primary" href="#/conta">Entrar na conta</a></div></div>`, 'Gerenciar banners');
    return;
  }
  setView(`<div class="container"><div class="page-head"><h1 class="t-h1">Gerenciar banners</h1><p class="page-head__sub">Carregando permissões...</p></div></div>`, 'Gerenciar banners');
  try {
    const admin = await fetchCurrentAdmin(auth.session.user.id);
    if (!admin || admin.role !== 'SUPER_ADMIN') {
      setView(`<div class="container"><div class="page-head"><h1 class="t-h1">Acesso restrito</h1><p class="page-head__sub">Esta área é exclusiva para usuários SUPER_ADMIN ativos.</p><a class="btn btn--outline" href="#/conta">Voltar para minha conta</a></div></div>`, 'Acesso restrito');
      return;
    }
    bannerAdminRows = await fetchBannerRecords();
    renderBannerAdminContent();
  } catch (err) {
    setView(`<div class="container"><div class="page-head"><h1 class="t-h1">Gerenciar banners</h1><p class="field__error">Não foi possível carregar os banners ou validar sua permissão. ${esc(err.message || '')}</p><a class="btn btn--outline" href="#/conta">Voltar</a></div></div>`, 'Gerenciar banners');
  }
}

function renderBannerAdminContent(edit = null) {
  const b = edit || {};
  const localDate = (value) => { if (!value) return ''; const d = new Date(value); const pad = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  setView(`<div class="container banner-admin">
    <nav class="breadcrumb" aria-label="Navegação estrutural"><a href="#/">Início</a><span>/</span><a href="#/conta">Conta</a><span>/</span><span aria-current="page">Banners</span></nav>
    <header class="page-head"><h1 class="t-h1">Banners da página inicial</h1><p class="page-head__sub">Cadastre e programe as duas posições da Home (um banner ativo por posição). As imagens são enviadas ao bucket público <strong>banners</strong> do Supabase.</p></header>
    <section class="auth-card banner-admin__form"><h2 class="t-h3">${b.id ? 'Editar banner' : 'Novo banner'}</h2>
      <form id="banner-form" data-banner-id="${esc(b.id || '')}">
        <div class="field"><label class="field__label" for="banner-title">Título</label><input class="input" id="banner-title" name="title" maxlength="120" value="${esc(b.title || '')}" placeholder="Ex.: Cuide de você todos os dias"></div>
        <div class="field"><label class="field__label" for="banner-subtitle">Texto complementar</label><input class="input" id="banner-subtitle" name="subtitle" maxlength="180" value="${esc(b.subtitle || '')}" placeholder="Texto curto opcional"></div>
        <div class="field"><label class="field__label" for="banner-position">Posição na Home</label><select class="input" id="banner-position" name="position" required><option value="1" ${Number(b.position || 1) === 1 ? 'selected' : ''}>Antes de Ofertas ativas</option><option value="2" ${Number(b.position || 1) === 2 ? 'selected' : ''}>Depois de Ofertas ativas</option></select></div>
        <div class="field"><label class="field__label" for="banner-image">Imagem desktop (obrigatória para novo banner)</label><input class="input" id="banner-image" name="image" type="file" accept="image/jpeg,image/png,image/webp" ${b.image_url ? '' : 'required'}><span class="field__hint">JPG, PNG ou WebP. Máximo de 8 MB. ${b.image_url ? 'Envie outro arquivo somente se quiser substituir a imagem atual.' : ''}</span></div>
        <div class="field"><label class="field__label" for="banner-mobile">Imagem mobile (opcional)</label><input class="input" id="banner-mobile" name="mobile_image" type="file" accept="image/jpeg,image/png,image/webp"><span class="field__hint">Se não enviar, a imagem desktop será usada no celular.</span></div>
        <div class="field"><label class="field__label" for="banner-link">Link ao clicar (opcional)</label><input class="input" id="banner-link" name="link_url" type="url" value="${esc(b.link_url || '')}" placeholder="https://... ou #/produtos"></div>
        <div class="field"><label class="field__label" for="banner-start">Início da exibição (opcional)</label><input class="input" id="banner-start" name="start_at" type="datetime-local" value="${esc(localDate(b.start_at))}"></div>
        <div class="field"><label class="field__label" for="banner-end">Fim da exibição (opcional)</label><input class="input" id="banner-end" name="end_at" type="datetime-local" value="${esc(localDate(b.end_at))}"></div>
        <label class="checkbox-line"><input type="checkbox" name="active" ${b.active === false ? '' : 'checked'}> Banner ativo</label>
        <p class="form-message" id="banner-form-message" role="alert" hidden></p>
        <div class="banner-admin__actions"><button class="btn btn--primary" type="submit">${b.id ? 'Salvar alterações' : 'Cadastrar banner'}</button><button class="btn btn--outline" type="button" data-action="banner-reset">Limpar formulário</button></div>
      </form>
    </section>
    <section class="section"><div class="section-head"><h2 class="t-h2">Banners cadastrados</h2><span class="t-small t-muted">${bannerAdminRows.length} registro(s)</span></div>
      ${bannerAdminRows.length ? `<div class="banner-admin__list">${bannerAdminRows.map((row) => `<article class="banner-admin__item"><img src="${esc(row.image_url || '')}" alt="${esc(row.title || 'Banner')}"><div class="banner-admin__meta"><strong>${esc(row.title || 'Banner sem título')}</strong><span>${Number(row.position) === 1 ? 'Antes das ofertas' : 'Depois das ofertas'} · ${row.active ? 'Ativo' : 'Inativo'}</span><small>${row.start_at ? `Início: ${formatDate(row.start_at)}` : 'Sem data de início'} · ${row.end_at ? `Fim: ${formatDate(row.end_at)}` : 'Sem data de fim'}</small></div><div class="banner-admin__actions"><button type="button" class="btn btn--outline btn--sm" data-action="banner-edit" data-id="${esc(row.id)}">Editar</button><button type="button" class="btn btn--ghost btn--sm" data-action="banner-delete" data-id="${esc(row.id)}">Excluir</button></div></article>`).join('')}</div>` : '<p class="t-muted">Nenhum banner cadastrado.</p>'}
    </section>
  </div>`, 'Gerenciar banners');
}

export function editBanner(id) {
  const row = bannerAdminRows.find((item) => item.id === id);
  if (row) renderBannerAdminContent(row);
}

export function resetBannerForm() { renderBannerAdminContent(); }

export async function saveBannerForm(form) {
  const message = form.querySelector('#banner-form-message');
  const submit = form.querySelector('[type="submit"]');
  const data = new FormData(form);
  const id = form.dataset.bannerId || null;
  const showError = (text) => { message.textContent = text; message.hidden = false; };
  submit.disabled = true; submit.textContent = 'Salvando...'; message.hidden = true;
  try {
    const current = id ? bannerAdminRows.find((r) => r.id === id) : null;
    let imageUrl = current?.image_url || '';
    let mobileImageUrl = current?.mobile_image_url || '';
    const desktopFile = data.get('image');
    const mobileFile = data.get('mobile_image');
    if (desktopFile?.size) imageUrl = await uploadPublicFile('banners', desktopFile, 'home');
    if (mobileFile?.size) mobileImageUrl = await uploadPublicFile('banners', mobileFile, 'home/mobile');
    if (!imageUrl) throw new Error('Selecione a imagem principal do banner.');
    const link = String(data.get('link_url') || '').trim();
    if (link && !/^(https?:\/\/|\/(?!\/)|#)/i.test(link)) throw new Error('O link deve começar com https://, http://, / ou #.');
    const start = data.get('start_at') ? new Date(data.get('start_at')).toISOString() : null;
    const end = data.get('end_at') ? new Date(data.get('end_at')).toISOString() : null;
    if (start && end && new Date(end) <= new Date(start)) throw new Error('A data final precisa ser posterior à data inicial.');
    await saveBannerRecord(id, {
      title: String(data.get('title') || '').trim() || null,
      subtitle: String(data.get('subtitle') || '').trim() || null,
      image_url: imageUrl,
      mobile_image_url: mobileImageUrl || null,
      link_url: link || null,
      position: Number(data.get('position')),
      active: data.get('active') === 'on',
      start_at: start,
      end_at: end,
    });
    bannerAdminRows = await fetchBannerRecords();
    renderBannerAdminContent();
    toast('Banner salvo com sucesso.');
  } catch (err) {
    showError(err.message || 'Não foi possível salvar o banner.');
    submit.disabled = false; submit.textContent = id ? 'Salvar alterações' : 'Cadastrar banner';
  }
}

export async function removeBanner(id) {
  if (!confirm('Deseja excluir este banner?')) return;
  try {
    await deleteBannerRecord(id);
    bannerAdminRows = await fetchBannerRecords();
    renderBannerAdminContent();
    toast('Banner excluído.');
  } catch (err) { toast(err.message || 'Não foi possível excluir o banner.'); }
}

export function renderContact() {
  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Contato</li></ol></nav>
      <header class="page-head"><h1 class="t-h1">Contato</h1></header>
      ${stateBlock({ title: 'Canais de atendimento em breve', text: 'Os canais oficiais de atendimento da AuraCaps serão publicados nesta página.', action: { href: '#/produtos', label: 'Ver produtos' } })}
    </div>`, 'Contato');
}

export function renderBestsellers() {
  setView(`
    <div class="container">
      <nav aria-label="Navegação estrutural"><ol class="breadcrumb"><li><a href="#/">Início</a></li><li aria-current="page">Mais vendidos</li></ol></nav>
      <header class="page-head"><h1 class="t-h1">Mais vendidos</h1></header>
      ${stateBlock({ title: 'Ranking ainda não disponível', text: 'Esta lista será montada a partir dos pedidos reais da loja assim que houver histórico de vendas.', action: { href: '#/novidades', label: 'Ver novidades' } })}
    </div>`, 'Mais vendidos');
}

export function renderNotFound(title = 'Página não encontrada') {
  setView(`<div class="container">${stateBlock({ title, text: 'O endereço pode ter mudado ou não existe mais.', action: { href: '#/', label: 'Voltar ao início' } })}</div>`, title);
}
