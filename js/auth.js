/**
 * AUTENTICAÇÃO — Supabase Auth existente.
 * O cadastro dispara o trigger on_auth_user_created (cria public.customers).
 */
import * as sb from './supabase.js';
import { fetchCustomer, fetchAddresses, createAddress } from './api.js';
import { setState, getState } from './state.js';

export function initAuth() {
  sb.onAuthChange(async (session) => {
    if (!session) {
      setState('auth', { session: null, customer: null, status: 'anonymous' });
      return;
    }
    setState('auth', { session, customer: getState().auth.customer, status: 'loading' });
    try {
      const customer = await fetchCustomer(session.user.id);
      if (customer) await savePendingAddress(session, customer);
      setState('auth', { session, customer, status: 'authenticated' });
    } catch {
      setState('auth', { session, customer: null, status: 'authenticated' });
    }
  });
  sb.restoreSession();
}

/**
 * O endereço informado no cadastro fica em user_metadata.pending_address
 * (com confirmação de e-mail não há sessão no momento do cadastro).
 * No primeiro login ele é gravado em public.addresses e removido do metadata.
 */
async function savePendingAddress(session, customer) {
  const pending = session.user?.user_metadata?.pending_address;
  if (!pending) return;
  try {
    const existing = await fetchAddresses(customer.id);
    if (!existing.length) await createAddress(customer.id, { ...pending, recipient_name: customer.name || null, is_default: true });
    await sb.updateUserMetadata({ pending_address: null });
  } catch { /* tenta novamente no próximo login */ }
}

const MESSAGES = {
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar.',
  user_already_exists: 'Já existe uma conta com este e-mail.',
  weak_password: 'A senha precisa ser mais forte (mínimo de 6 caracteres).',
  over_email_send_rate_limit: 'Muitas tentativas. Aguarde alguns minutos.',
};

export function authErrorMessage(err) {
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code];
  if (err?.status === 0) return 'Sem conexão com o servidor. Tente novamente.';
  if (/invalid login/i.test(err?.message || '')) return MESSAGES.invalid_credentials;
  return 'Não foi possível concluir. Tente novamente.';
}

export const signIn = (email, password) => sb.signInWithPassword(email, password);
export const signUp = (email, password, { name, phone, address }) =>
  sb.signUp(email, password, { name, phone, pending_address: address });
export const signOut = () => sb.signOut();
