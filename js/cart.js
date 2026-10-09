/**
 * CARRINHO — estrutura de item preservada:
 *   { product_id, variant_id, quantity, stock }
 * `variant_id` fica null enquanto o banco não possuir variantes.
 * Persistência: memória (adaptador único em `storage`, trocável por backend).
 */
import { getState, setState, subscribe, findProductById } from './state.js';
import { getPricing, getAvailability, productImage, productUrl } from './products.js';
import { esc, money, icon, toast, $, stateBlock } from './ui.js';

const storage = {
  load: () => [],
  save: () => {},
};

export function initCart() {
  setState('cart', storage.load());
  subscribe('cart', (items) => { storage.save(items); renderCartUI(); });
  subscribe('catalog', () => renderCartUI());
  renderCartUI();
}

const sameLine = (a, product_id, variant_id) => a.product_id === product_id && (a.variant_id ?? null) === (variant_id ?? null);

export function addToCart(productId, quantity = 1, variantId = null) {
  const product = findProductById(productId);
  if (!product) return { ok: false, reason: 'not-found' };
  const av = getAvailability(product);
  if (!av.purchasable) {
    toast('Este produto não está disponível para compra.', { type: 'error' });
    return { ok: false, reason: av.reason };
  }
  const cart = getState().cart;
  const current = cart.find((l) => sameLine(l, productId, variantId));
  const nextQty = Math.min((current?.quantity || 0) + quantity, av.maxQty);
  if (current && current.quantity >= av.maxQty) {
    toast(`Limite de estoque atingido (${av.maxQty}).`, { type: 'error' });
    return { ok: false, reason: 'stock-limit' };
  }
  const line = { product_id: productId, variant_id: variantId, quantity: nextQty, stock: av.maxQty };
  setState('cart', current ? cart.map((l) => (sameLine(l, productId, variantId) ? line : l)) : [...cart, line]);
  toast(`${product.name} adicionado ao carrinho.`, { action: { href: '#/carrinho', label: 'Ver carrinho' } });
  return { ok: true };
}

export function setQuantity(productId, quantity, variantId = null) {
  const product = findProductById(productId);
  const max = product ? getAvailability(product).maxQty : 0;
  const q = Math.max(0, Math.min(quantity, max));
  if (q === 0) return removeFromCart(productId, variantId);
  setState('cart', (c) => c.map((l) => (sameLine(l, productId, variantId) ? { ...l, quantity: q, stock: max } : l)));
}

export function removeFromCart(productId, variantId = null) {
  setState('cart', (c) => c.filter((l) => !sameLine(l, productId, variantId)));
}

export function cartCount() {
  return getState().cart.reduce((s, l) => s + l.quantity, 0);
}

/** Linhas resolvidas com o catálogo atual (preço sempre recalculado). */
export function resolveCart() {
  return getState().cart.map((l) => {
    const product = findProductById(l.product_id);
    if (!product) return { ...l, product: null, unit: null, total: null, issue: 'Produto não encontrado no catálogo.' };
    const av = getAvailability(product);
    const pr = getPricing(product);
    let issue = null;
    if (!av.purchasable) issue = 'Produto indisponível no momento.';
    else if (l.quantity > av.maxQty) issue = `Estoque disponível: ${av.maxQty}.`;
    const unit = pr.hasPrice ? pr.final : null;
    return { ...l, product, unit, base: pr.base, total: unit != null ? unit * l.quantity : null, issue, maxQty: av.maxQty };
  });
}

export function cartTotals(lines = resolveCart()) {
  const valid = lines.filter((l) => l.total != null && !l.issue);
  const subtotalBase = valid.reduce((s, l) => s + l.base * l.quantity, 0);
  const total = valid.reduce((s, l) => s + l.total, 0);
  return { subtotalBase, discount: subtotalBase - total, total, hasIssues: lines.some((l) => l.issue) };
}

/* ---------- Render ---------- */
export function cartLine(l) {
  if (!l.product) {
    return `<li class="cart-line"><div></div><div><p class="cart-line__name">Item indisponível</p><p class="cart-line__warn">${esc(l.issue)}</p>
      <button type="button" class="btn btn--ghost btn--sm" data-action="cart-remove" data-id="${esc(l.product_id)}">Remover</button></div><div></div></li>`;
  }
  const p = l.product;
  return `
    <li class="cart-line">
      <a class="cart-line__media" href="${productUrl(p)}" tabindex="-1" aria-hidden="true">${productImage(p, { size: 'thumb' })}</a>
      <div>
        <a class="cart-line__name" href="${productUrl(p)}">${esc(p.name)}</a>
        <p class="cart-line__meta">${l.unit != null ? `${money(l.unit)} un.` : ''}${p.sku ? ` · SKU ${esc(p.sku)}` : ''}</p>
        <div class="cart-line__controls">
          <div class="qty" role="group" aria-label="Quantidade de ${esc(p.name)}">
            <button type="button" class="qty__btn" data-action="cart-dec" data-id="${esc(p.id)}" aria-label="Diminuir">−</button>
            <span class="qty__value" aria-live="polite">${l.quantity}</span>
            <button type="button" class="qty__btn" data-action="cart-inc" data-id="${esc(p.id)}" aria-label="Aumentar" ${l.quantity >= l.maxQty ? 'disabled' : ''}>+</button>
          </div>
          <button type="button" class="icon-btn" data-action="cart-remove" data-id="${esc(p.id)}" aria-label="Remover ${esc(p.name)}">${icon('trash', 'icon--sm')}</button>
        </div>
        ${l.issue ? `<p class="cart-line__warn">${esc(l.issue)}</p>` : ''}
      </div>
      <p class="cart-line__total">${l.total != null ? money(l.total) : '—'}</p>
    </li>`;
}

export function summaryBlock(totals) {
  return `
    <div class="summary-row"><span>Subtotal</span><span>${money(totals.subtotalBase)}</span></div>
    ${totals.discount > 0.004 ? `<div class="summary-row"><span>Descontos</span><span>− ${money(totals.discount)}</span></div>` : ''}
    <div class="summary-row summary-row--total"><span>Total</span><span>${money(totals.total)}</span></div>
    <p class="summary-note">Valores sem frete.</p>`;
}

export const CHECKOUT_NOTE = 'A finalização do pedido ainda não está disponível nesta versão da loja.';

function renderCartUI() {
  const count = cartCount();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = count;
    el.hidden = count === 0;
  });
  document.querySelectorAll('[data-cart-label]').forEach((el) => {
    el.setAttribute('aria-label', `Carrinho, ${count} ${count === 1 ? 'item' : 'itens'}`);
  });

  const body = $('#cart-drawer-body');
  const foot = $('#cart-drawer-foot');
  if (!body) return;
  const lines = resolveCart();
  if (!lines.length) {
    body.innerHTML = `<div class="container">${stateBlock({ title: 'Seu carrinho está vazio', text: 'Os produtos que você adicionar aparecem aqui.', action: { href: '#/produtos', label: 'Ver produtos' } })}</div>`;
    foot.hidden = true;
    return;
  }
  const totals = cartTotals(lines);
  body.innerHTML = `<ul>${lines.map(cartLine).join('')}</ul>`;
  foot.hidden = false;
  foot.innerHTML = `${summaryBlock(totals)}
    <a class="btn btn--primary btn--block btn--lg" href="#/carrinho">Ir para o carrinho</a>`;
}

export function handleCartAction(action, id) {
  const line = getState().cart.find((l) => l.product_id === id);
  if (action === 'cart-inc' && line) setQuantity(id, line.quantity + 1, line.variant_id);
  if (action === 'cart-dec' && line) setQuantity(id, line.quantity - 1, line.variant_id);
  if (action === 'cart-remove') removeFromCart(id, line?.variant_id ?? null);
}
