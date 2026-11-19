/**
 * UI — utilitários de renderização, formatação, ícones e acessibilidade.
 */
import { CONFIG } from './config.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const brl = new Intl.NumberFormat(CONFIG.LOCALE, { style: 'currency', currency: CONFIG.CURRENCY });
export const money = (n) => brl.format(n);

const dateFmt = new Intl.DateTimeFormat(CONFIG.LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
export const formatDate = (iso) => (iso ? dateFmt.format(new Date(iso)) : '');

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function debounce(fn, ms) {
  let t;
  const d = (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  d.cancel = () => clearTimeout(t);
  return d;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---------- Ícones (line 2px) ---------- */
const PATHS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  cart: '<path d="M3 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H6.2"/><circle cx="9.5" cy="20" r="1.2"/><circle cx="17" cy="20" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  heart: '<path d="M12 20s-7-4.5-9-9.2C1.7 7.4 4 4 7.4 4c2 0 3.5 1.1 4.6 2.7C13.1 5.1 14.6 4 16.6 4 20 4 22.3 7.4 21 10.8 19 15.5 12 20 12 20Z"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  award: '<circle cx="12" cy="9" r="5"/><path d="m8.5 13 -1.5 8 5-2.5 5 2.5-1.5-8"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15Z"/><path d="M5 19 13 11"/>',
  store: '<path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  capsule: '<rect x="2" y="8.5" width="20" height="7" rx="3.5" transform="rotate(-35 12 12)"/><path d="m9.2 7.9 5.6 8.2" />',
};

export function icon(name, cls = '') {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
}

/* ---------- Toast (aria-live) ---------- */
export function toast(message, { type = 'info', action = null, timeout = 3500 } = {}) {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const el = document.createElement('div');
  el.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  el.innerHTML = `<span>${esc(message)}</span>${action ? `<a href="${esc(action.href)}">${esc(action.label)}</a>` : ''}`;
  region.appendChild(el);
  setTimeout(() => el.remove(), timeout);
}

/* ---------- Estados genéricos ---------- */
export function stateBlock({ title, text = '', action = null, variant = '', center = false }) {
  return `
    <div class="state ${variant ? `state--${variant}` : ''} ${center ? 'state--center' : ''}" role="${variant === 'error' ? 'alert' : 'status'}">
      <p class="state__title">${esc(title)}</p>
      ${text ? `<p class="state__text">${esc(text)}</p>` : ''}
      ${action ? (action.href
        ? `<a class="btn btn--outline" href="${esc(action.href)}">${esc(action.label)}</a>`
        : `<button type="button" class="btn btn--outline" data-action="${esc(action.id)}">${esc(action.label)}</button>`) : ''}
    </div>`;
}

/* ---------- Drawers (foco preso + Esc) ---------- */
let openDrawer = null;
let lastFocus = null;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])';

function trap(e) {
  if (!openDrawer) return;
  if (e.key === 'Escape') { closeDrawers(); return; }
  if (e.key !== 'Tab') return;
  const items = $$(FOCUSABLE, openDrawer).filter((el) => el.offsetParent !== null);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function openDrawerById(id, trigger) {
  closeDrawers(false);
  const drawer = document.getElementById(id);
  const backdrop = document.getElementById('drawer-backdrop');
  if (!drawer) return;
  lastFocus = trigger || document.activeElement;
  drawer.hidden = false;
  backdrop.hidden = false;
  requestAnimationFrame(() => {
    drawer.classList.add('is-open');
    backdrop.classList.add('is-open');
  });
  drawer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('is-locked');
  $$(`[aria-controls="${id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'true'));
  openDrawer = drawer;
  document.addEventListener('keydown', trap);
  setTimeout(() => ($(FOCUSABLE, drawer) || drawer).focus(), 50);
}

export function closeDrawers(restore = true) {
  const backdrop = document.getElementById('drawer-backdrop');
  $$('.drawer.is-open').forEach((d) => {
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
    $$(`[aria-controls="${d.id}"]`).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    setTimeout(() => { if (!d.classList.contains('is-open')) d.hidden = true; }, 260);
  });
  if (backdrop) {
    backdrop.classList.remove('is-open');
    setTimeout(() => { if (!backdrop.classList.contains('is-open')) backdrop.hidden = true; }, 200);
  }
  document.body.classList.remove('is-locked');
  document.removeEventListener('keydown', trap);
  if (restore && lastFocus && openDrawer) lastFocus.focus();
  openDrawer = null;
}
