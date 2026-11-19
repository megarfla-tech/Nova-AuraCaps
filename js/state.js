/**
 * ESTADO — store único em memória com assinatura por chave.
 */
const state = {
  catalog: { status: 'idle', items: [], error: null, loadedAt: 0 },   // idle | loading | success | error
  categories: { status: 'idle', items: [], error: null },
  cart: [],                // [{ product_id, variant_id, quantity, stock }]
  favorites: new Set(),    // product_id
  auth: { session: null, customer: null, status: 'anonymous' }, // anonymous | loading | authenticated
  sync: { realtime: 'idle', lastCheck: 0, lastChange: 0, changes: 0 },
};

const subs = new Map();

export function getState() { return state; }

export function setState(key, value) {
  state[key] = typeof value === 'function' ? value(state[key]) : value;
  (subs.get(key) || []).forEach((fn) => fn(state[key], state));
  (subs.get('*') || []).forEach((fn) => fn(key, state));
}

export function subscribe(key, fn) {
  if (!subs.has(key)) subs.set(key, new Set());
  subs.get(key).add(fn);
  return () => subs.get(key).delete(fn);
}

/* Seletores */
export const selectProducts = () => state.catalog.items;
export const selectCategories = () => state.categories.items;
export const findProductById = (id) => state.catalog.items.find((p) => p.id === id) || null;
export const findProductBySlug = (slug) => state.catalog.items.find((p) => p.slug === slug) || null;
export const findCategoryBySlug = (slug) => state.categories.items.find((c) => c.slug === slug) || null;
