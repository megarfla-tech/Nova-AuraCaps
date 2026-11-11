/**
 * Configuração pública do frontend.
 * Somente credenciais de acesso público (publishable key).
 * Nunca colocar service_role ou segredos aqui.
 */
export const CONFIG = Object.freeze({
  SUPABASE_URL: 'https://knupkactmifimxbemvyh.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_9tZaB_KLgTPLhr5q0t7A5g_Dr15NWrV',

  // Views públicas já existentes no projeto
  VIEWS: {
    PRODUCTS: 'api_product_catalog',
    CATEGORIES: 'api_categories',
    BANNERS: 'api_banners',
  },

  PAGE_SIZE: 12,
  SEARCH_DEBOUNCE_MS: 300,
  SEARCH_MIN_CHARS: 2,
  SEARCH_LIMIT: 8,
  CATALOG_CACHE_MS: 5 * 60 * 1000,
  SYNC: {
    REALTIME_TABLES: ['products', 'orders'],   // tabelas presentes na publicação supabase_realtime
    POLL_MS: 60 * 1000,              // revalidação periódica (tabelas fora do Realtime)
    FOCUS_MIN_GAP_MS: 10 * 1000,     // revalidação ao voltar para a aba
    REALTIME_DEBOUNCE_MS: 600,       // agrupa várias alterações seguidas
  },
  CEP_LOOKUP_URL: 'https://viacep.com.br/ws/{cep}/json/', // serviço público de CEP (somente leitura)
  LOCALE: 'pt-BR',
  CURRENCY: 'BRL',
});
