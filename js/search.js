/**
 * BUSCA — consulta real em api_product_catalog com debounce e cancelamento.
 * Estados: typing | loading | results | empty | error
 */
import { CONFIG } from './config.js';
import { searchProducts } from './api.js';
import { esc, money, debounce, $, $$ } from './ui.js';
import { getPricing, productUrl, loadCatalog, searchCatalog } from './products.js';
import { getState } from './state.js';

/**
 * Busca principal: catálogo em memória (sem acento, sem nova requisição).
 * Fallback: consulta ao Supabase quando o catálogo não pôde ser carregado.
 */
export async function runSearch(term, { signal, limit = CONFIG.SEARCH_LIMIT } = {}) {
  try {
    const items = await loadCatalog();
    return searchCatalog(items, term, limit);
  } catch (err) {
    if (getState().catalog.status === 'success') throw err;
    return searchProducts(term, { signal, limit });
  }
}

export function initSearch(form) {
  const input = $('input[type="search"]', form);
  const panel = $('.search-panel', form);
  const status = $('.search-panel__status', form);
  const list = $('.search-panel__list', form);
  const all = $('.search-panel__all', form);
  let controller = null;
  let active = -1;

  const open = () => { panel.hidden = false; input.setAttribute('aria-expanded', 'true'); };
  const close = () => { panel.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; input.removeAttribute('aria-activedescendant'); };

  function setStatus(text, error = false) {
    status.hidden = !text;
    status.textContent = text || '';
    status.classList.toggle('search-panel__status--error', error);
  }

  function renderResults(items, term) {
    list.innerHTML = items.map((p, i) => {
      const pr = getPricing(p);
      const img = p.images[0];
      return `<li class="search-panel__item" role="presentation">
        <a id="${form.id}-opt-${i}" role="option" aria-selected="false" href="${productUrl(p)}">
          ${img ? `<img class="search-panel__thumb" src="${esc(img.url)}" alt="" width="44" height="44" loading="lazy">` : '<span class="search-panel__thumb" aria-hidden="true"></span>'}
          <span><span class="search-panel__name">${esc(p.name)}</span><br><span class="search-panel__meta">${esc([p.brand, p.type].filter(Boolean).join(' · '))}</span></span>
          <span class="search-panel__price">${pr.hasPrice ? money(pr.final) : ''}</span>
        </a></li>`;
    }).join('');
    all.hidden = items.length === 0;
    all.href = `#/busca?q=${encodeURIComponent(term)}`;
  }

  const run = debounce(async (term) => {
    controller?.abort();
    controller = new AbortController();
    setStatus('Buscando…');
    list.innerHTML = '';
    all.hidden = true;
    try {
      const items = await runSearch(term, { signal: controller.signal });
      if (input.value.trim() !== term) return;
      if (!items.length) { setStatus(`Nenhum produto encontrado para “${term}”.`); return; }
      setStatus('');
      renderResults(items, term);
    } catch (err) {
      if (err.name === 'AbortError') return;
      setStatus('Não foi possível buscar agora. Tente novamente.', true);
    }
  }, CONFIG.SEARCH_DEBOUNCE_MS);

  input.addEventListener('input', () => {
    const term = input.value.trim();
    active = -1;
    if (!term) { run.cancel(); controller?.abort(); close(); return; }
    open();
    if (term.length < CONFIG.SEARCH_MIN_CHARS) {
      run.cancel(); controller?.abort();
      list.innerHTML = ''; all.hidden = true;
      setStatus(`Digite pelo menos ${CONFIG.SEARCH_MIN_CHARS} letras.`);
      return;
    }
    setStatus('Buscando…');
    run(term);
  });

  input.addEventListener('focus', () => { if (input.value.trim()) open(); });

  input.addEventListener('keydown', (e) => {
    const opts = $$('[role="option"]', list);
    if (e.key === 'Escape') { close(); return; }
    if (!opts.length || panel.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      active = e.key === 'ArrowDown' ? (active + 1) % opts.length : (active - 1 + opts.length) % opts.length;
      opts.forEach((o, i) => o.setAttribute('aria-selected', String(i === active)));
      input.setAttribute('aria-activedescendant', opts[active].id);
      opts[active].scrollIntoView({ block: 'nearest' });
    }
    if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      location.hash = opts[active].getAttribute('href');
      close(); input.blur();
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = input.value.trim();
    if (!term) { input.focus(); return; }
    close();
    location.hash = `#/busca?q=${encodeURIComponent(term)}`;
  });

  document.addEventListener('click', (e) => { if (!form.contains(e.target)) close(); });
  panel.addEventListener('click', (e) => { if (e.target.closest('a')) { close(); input.blur(); } });
  window.addEventListener('hashchange', close);
}
