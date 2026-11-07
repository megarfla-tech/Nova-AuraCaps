/**
 * ENDEREÇO — campos, máscaras, validação e preenchimento por CEP (ViaCEP).
 * Campos mapeados 1:1 para a tabela public.addresses.
 */
import { CONFIG } from './config.js';
import { esc, $ } from './ui.js';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const digits = (v) => String(v || '').replace(/\D/g, '');

export function maskPhone(v) {
  const d = digits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCep(v) {
  const d = digits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const isValidPhone = (v) => [10, 11].includes(digits(v).length);
export const isValidCep = (v) => digits(v).length === 8;

const field = (id, label, { name, required = true, autocomplete = '', inputmode = '', maxlength = '', cls = '', hint = '' } = {}) => `
  <div class="field ${cls}">
    <label class="field__label" for="${id}">${label}${required ? '' : ' <span class="t-muted">(opcional)</span>'}</label>
    <input class="input" id="${id}" name="${name}" ${required ? 'required' : ''} ${autocomplete ? `autocomplete="${autocomplete}"` : ''} ${inputmode ? `inputmode="${inputmode}"` : ''} ${maxlength ? `maxlength="${maxlength}"` : ''}>
    ${hint ? `<span class="field__hint" id="${id}-hint">${hint}</span>` : ''}
  </div>`;

/** HTML do bloco de endereço. `prefix` evita IDs duplicados na página. */
export function addressFieldsHTML(prefix) {
  return `
    <fieldset class="address-fields">
      <legend class="t-label address-fields__legend">Endereço de entrega</legend>
      <div class="address-grid">
        ${field(`${prefix}-cep`, 'CEP', { name: 'postal_code', autocomplete: 'postal-code', inputmode: 'numeric', maxlength: 9, cls: 'address-grid__cep', hint: '' })}
        <p class="field__hint address-grid__cep-status" id="${prefix}-cep-status" aria-live="polite"></p>
        ${field(`${prefix}-street`, 'Rua / Avenida', { name: 'street', autocomplete: 'address-line1', cls: 'address-grid__full' })}
        ${field(`${prefix}-number`, 'Número', { name: 'number', inputmode: 'numeric', cls: 'address-grid__num' })}
        ${field(`${prefix}-complement`, 'Complemento', { name: 'complement', required: false, autocomplete: 'address-line2', cls: 'address-grid__comp' })}
        ${field(`${prefix}-neighborhood`, 'Bairro', { name: 'neighborhood', cls: 'address-grid__full' })}
        ${field(`${prefix}-city`, 'Cidade', { name: 'city', autocomplete: 'address-level2', cls: 'address-grid__city' })}
        <div class="field address-grid__uf">
          <label class="field__label" for="${prefix}-state">UF</label>
          <select class="select" id="${prefix}-state" name="state" required autocomplete="address-level1">
            <option value="">—</option>
            ${UFS.map((u) => `<option value="${u}">${u}</option>`).join('')}
          </select>
        </div>
        ${field(`${prefix}-reference`, 'Ponto de referência', { name: 'reference', required: false, cls: 'address-grid__full' })}
      </div>
    </fieldset>`;
}

/** Liga máscara e busca de CEP aos campos já renderizados. */
export function bindAddressFields(root, prefix) {
  const cep = $(`#${prefix}-cep`, root);
  const status = $(`#${prefix}-cep-status`, root);
  let controller = null;
  let lastCep = '';

  cep.addEventListener('input', async () => {
    cep.value = maskCep(cep.value);
    const d = digits(cep.value);
    if (d.length !== 8 || d === lastCep) { if (d.length < 8) status.textContent = ''; return; }
    lastCep = d;
    controller?.abort();
    controller = new AbortController();
    status.textContent = 'Buscando endereço…';
    status.classList.remove('field__error');
    try {
      const res = await fetch(CONFIG.CEP_LOOKUP_URL.replace('{cep}', d), { signal: controller.signal });
      const data = await res.json();
      if (!res.ok || data.erro) throw new Error('not-found');
      const set = (name, v) => { const el = $(`[name="${name}"]`, root); if (el && v) { el.value = v; el.setAttribute('aria-invalid', 'false'); } };
      set('street', data.logradouro);
      set('neighborhood', data.bairro);
      set('city', data.localidade);
      set('state', data.uf);
      status.textContent = 'Endereço encontrado. Confira e informe o número.';
      $(`#${prefix}-number`, root)?.focus();
    } catch (err) {
      if (err.name === 'AbortError') return;
      status.textContent = 'CEP não encontrado. Preencha o endereço manualmente.';
      status.classList.add('field__error');
    }
  });
}

export function bindPhoneMask(input) {
  input.addEventListener('input', () => { input.value = maskPhone(input.value); });
}

/** Lê os valores do formulário no formato da tabela addresses. */
export function readAddress(form) {
  const v = (n) => (form.elements[n]?.value || '').trim();
  return {
    postal_code: maskCep(v('postal_code')),
    street: v('street'),
    number: v('number'),
    complement: v('complement'),
    neighborhood: v('neighborhood'),
    city: v('city'),
    state: v('state'),
    reference: v('reference'),
  };
}

export function formatAddress(a) {
  const l1 = [a.street, a.number].filter(Boolean).join(', ') + (a.complement ? ` — ${a.complement}` : '');
  const l2 = [a.neighborhood, [a.city, a.state].filter(Boolean).join(' / ')].filter(Boolean).join(' · ');
  return `${esc(l1)}<br>${esc(l2)}${a.postal_code ? `<br>CEP ${esc(a.postal_code)}` : ''}`;
}
