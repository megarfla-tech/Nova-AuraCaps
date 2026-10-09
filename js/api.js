/**
 * DATA SERVICE — única camada que consulta o Supabase.
 * Componentes nunca chamam `rest()` diretamente.
 * Usa somente views, tabelas e campos existentes no projeto.
 */
import { CONFIG } from './config.js';
import { rest } from './supabase.js';

const toNumber = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

/* ---------- Normalização ---------- */

function normalizeProduct(row) {
  const images = Array.isArray(row.images) ? [...row.images] : [];
  images.sort((a, b) => (b.is_primary === true) - (a.is_primary === true) || (a.position ?? 0) - (b.position ?? 0));
  return {
    id: row.id,
    sku: row.sku || null,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    brand: row.brand || null,
    type: row.product_type || null,
    dose: row.quantity_dose || null,
    price: toNumber(row.price),
    salePrice: toNumber(row.sale_price),
    stock: toNumber(row.stock),
    featured: row.featured === true,
    createdAt: row.created_at,
    images: images.filter((i) => i && i.image_url).map((i) => ({ url: i.image_url, alt: i.alt_text || '' })),
    categories: Array.isArray(row.categories) ? row.categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })) : [],
    offers: Array.isArray(row.offers) ? row.offers.map((o) => ({
      id: o.id,
      title: o.title || '',
      description: o.description || '',
      type: o.discount_type,
      value: toNumber(o.discount_value),
      startAt: o.start_at,
      endAt: o.end_at,
    })) : [],
  };
}

function normalizeCategory(row) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description || '',
    imageUrl: row.image_url && /^https?:\/\//.test(row.image_url) ? row.image_url : null,
    position: row.position ?? 0,
  };
}

/* ---------- Catálogo ---------- */

const PRODUCT_FIELDS = 'id,sku,name,slug,description,brand,product_type,quantity_dose,price,sale_price,stock,featured,created_at,images,categories,offers';

export async function fetchCatalog() {
  const rows = await rest(CONFIG.VIEWS.PRODUCTS, {
    query: { select: PRODUCT_FIELDS, order: 'name.asc', limit: '1000' },
  });
  return rows.map(normalizeProduct);
}

export async function fetchCategories() {
  const rows = await rest(CONFIG.VIEWS.CATEGORIES, {
    query: { select: 'id,name,slug,description,image_url,position', order: 'position.asc,name.asc' },
  });
  return rows.map(normalizeCategory);
}

/** Busca no servidor por nome, descrição, marca ou SKU. */
export async function searchProducts(term, { signal, limit = CONFIG.SEARCH_LIMIT } = {}) {
  const safe = term.replace(/[%*,()."\\]/g, ' ').trim();
  if (!safe) return [];
  const p = `*${safe}*`;
  const rows = await rest(CONFIG.VIEWS.PRODUCTS, {
    signal,
    query: {
      select: PRODUCT_FIELDS,
      or: `(name.ilike.${p},description.ilike.${p},brand.ilike.${p},sku.ilike.${p})`,
      order: 'name.asc',
      limit: String(limit),
    },
  });
  return rows.map(normalizeProduct);
}

/** Avaliações: RLS só expõe as aprovadas. */
export async function fetchApprovedReviews(productId) {
  return rest('reviews', {
    query: {
      select: 'id,rating,title,comment,created_at',
      product_id: `eq.${productId}`,
      approved: 'eq.true',
      order: 'created_at.desc',
      limit: '20',
    },
  });
}

/* ---------- Cliente autenticado (RLS: somente dados próprios) ---------- */

export async function fetchCustomer(authUserId) {
  const rows = await rest('customers', {
    query: { select: 'id,name,email,phone,active', auth_user_id: `eq.${authUserId}`, limit: '1' },
  });
  return rows[0] || null;
}

export async function fetchOrders(customerId) {
  const rows = await rest('orders', {
    query: { select: '*', customer_id: `eq.${customerId}` },
  });
  return rows
    .map((o) => ({
      id: o.Id,
      status: o.status,
      paymentStatus: o.payment_status,
      total: toNumber(o.total),
      createdAt: o['created at'] || o.updated_at || null,
    }))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function fetchFavorites(customerId) {
  const rows = await rest('favorites', {
    query: { select: 'product_id', customer_id: `eq.${customerId}` },
  });
  return rows.map((r) => r.product_id);
}

export async function addFavorite(customerId, productId) {
  return rest('favorites', {
    method: 'POST',
    body: { customer_id: customerId, product_id: productId },
    prefer: 'return=minimal',
  });
}

export async function removeFavorite(customerId, productId) {
  return rest('favorites', {
    method: 'DELETE',
    query: { customer_id: `eq.${customerId}`, product_id: `eq.${productId}` },
    prefer: 'return=minimal',
  });
}

/* ---------- Endereços (RLS: somente os próprios) ---------- */
const ADDRESS_FIELDS = 'id,label,recipient_name,street,number,complement,neighborhood,city,state,postal_code,reference,is_default';

export async function fetchAddresses(customerId) {
  return rest('addresses', {
    query: { select: ADDRESS_FIELDS, customer_id: `eq.${customerId}`, order: 'is_default.desc.nullslast' },
  });
}

export async function createAddress(customerId, a) {
  const rows = await rest('addresses', {
    method: 'POST',
    prefer: 'return=representation',
    body: {
      customer_id: customerId,
      label: a.label || 'Principal',
      recipient_name: a.recipient_name || null,
      street: a.street,
      number: a.number,
      complement: a.complement || null,
      neighborhood: a.neighborhood,
      city: a.city,
      state: a.state,
      postal_code: a.postal_code,
      reference: a.reference || null,
      is_default: a.is_default ?? true,
      created_at: new Date().toISOString(),
    },
  });
  return rows?.[0] || null;
}

export async function updateCustomerPhone(customerId, phone) {
  return rest('customers', {
    method: 'PATCH',
    query: { id: `eq.${customerId}` },
    body: { phone },
    prefer: 'return=minimal',
  });
}
