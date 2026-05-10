// Wrapper Qonto Business API v2.
//
// Auth officielle Qonto : header `Authorization: <sign-in>:<secret-key>`,
// pas de préfixe Bearer, deux valeurs requises.
// Doc : https://docs.qonto.com/get-started/business-api/authentication/api-key
//
// Variables d'environnement attendues :
//   QONTO_LOGIN       — le sign-in (ex: "wassim-loumi-1234")
//   QONTO_SECRET_KEY  — la secret key (64 hex chars)
//
// Rétro-compat : si QONTO_API_TOKEN est fourni au format "login:secret",
// on le découpe automatiquement.

import { logger } from './logger.js';

const QONTO_BASE_URL = 'https://thirdparty.qonto.com/v2';

/**
 * @typedef {Object} QontoEnv
 * @property {string} [QONTO_LOGIN]
 * @property {string} [QONTO_SECRET_KEY]
 * @property {string} [QONTO_API_TOKEN]   // accepte "login:secret" en fallback
 * @property {string} [QONTO_BASE_URL]
 */

export class QontoClient {
  /** @param {QontoEnv} env */
  constructor(env) {
    this.env = env;
    this.baseUrl = (env.QONTO_BASE_URL || QONTO_BASE_URL).replace(/\/+$/, '');
    const { login, secret } = parseQontoCreds(env);
    this.login = login;
    this.secret = secret;
  }

  headers() {
    return {
      Authorization: `${this.login}:${this.secret}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async #fetch(path, init = {}) {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, { ...init, headers: { ...this.headers(), ...(init.headers || {}) } });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      throw new QontoError(`Qonto ${res.status} ${path}: ${body?.errors?.[0]?.detail || body?.message || text}`, res.status);
    }
    return body;
  }

  /**
   * Récupère l'organisation + ses bank_accounts, normalisés au format worker.
   * @returns {Promise<Array>}
   */
  async listAccounts() {
    const data = await this.#fetch('/organization');
    const org = data?.organization;
    if (!org) return [];
    const banks = Array.isArray(org.bank_accounts) ? org.bank_accounts : [];
    return banks.map((ba) => normalizeAccount(ba, org));
  }

  /**
   * Pour chaque bank_account, paginer les transactions et tout concaténer.
   * @param {{ since?: string }} [opts]
   * @returns {Promise<Array>}
   */
  async listTransactions(opts = {}) {
    const accounts = await this.listAccounts();
    const all = [];
    for (const acc of accounts) {
      const bankAccountId = acc.qonto_bank_account_id;
      let page = 1;
      let safety = 0;
      while (safety < 50) {
        safety++;
        const params = new URLSearchParams({
          bank_account_id: bankAccountId,
          current_page: String(page),
          per_page: '100',
        });
        if (opts.since) params.set('settled_at_from', new Date(opts.since).toISOString());
        const data = await this.#fetch(`/transactions?${params}`);
        const txs = Array.isArray(data?.transactions) ? data.transactions : [];
        for (const t of txs) all.push(normalizeTransaction(t, acc));
        const next = data?.meta?.next_page;
        if (!next || txs.length === 0) break;
        page = next;
      }
    }
    logger.info('qonto.transactions.fetched', { count: all.length });
    return all;
  }
}

/**
 * Normalise un bank_account Qonto au format attendu par le front + Notion.
 */
function normalizeAccount(ba, org) {
  const iban = ba.iban || '';
  const balance = Number(ba.balance ?? ba.authorized_balance ?? 0);
  return {
    id: `qonto_${ba.id}`,
    qonto_bank_account_id: ba.id,
    item_id: `qonto_${org.slug || 'org'}`,
    name: `${ba.name || 'Compte Qonto'} — ${org.legal_name || org.slug || 'Qonto'}`,
    bank_name: 'Qonto',
    iban_last4: iban ? iban.replace(/\s+/g, '').slice(-4) : '',
    type: 'Pro',
    currency_code: ba.currency || 'EUR',
    balance,
    accounting_balance: Number(ba.authorized_balance ?? balance),
    instant_balance: balance,
    data_access: 'enabled',
    last_refresh_status: ba.status === 'active' ? 'ok' : 'reconnect_required',
  };
}

/**
 * Normalise une transaction Qonto. Côté débit = montant négatif.
 */
function normalizeTransaction(t, account) {
  const rawAmount = Number(t.amount ?? 0);
  const signed = t.side === 'debit' ? -Math.abs(rawAmount) : Math.abs(rawAmount);
  return {
    id: `qonto_${t.transaction_id || t.id}`,
    account_id: account.id,
    amount: signed,
    currency_code: t.currency || account.currency_code || 'EUR',
    date: t.settled_at || t.emitted_at || new Date().toISOString(),
    description: t.label || t.reference || t.operation_type || '(sans libellé)',
    bridge_category: t.category || null,
    is_recurring: false,
  };
}

export function hasQontoCreds(env) {
  if (!env) return false;
  const { login, secret } = parseQontoCreds(env);
  return !!(login && secret);
}

/**
 * Récupère login + secret depuis l'environnement, en supportant 2 formats :
 *  1) QONTO_LOGIN + QONTO_SECRET_KEY (préféré)
 *  2) QONTO_API_TOKEN = "login:secret" (rétro-compat)
 */
function parseQontoCreds(env) {
  const login = env.QONTO_LOGIN || '';
  const secret = env.QONTO_SECRET_KEY || '';
  if (login && secret) return { login, secret };
  const token = env.QONTO_API_TOKEN || '';
  if (token.includes(':')) {
    const idx = token.indexOf(':');
    return { login: token.slice(0, idx), secret: token.slice(idx + 1) };
  }
  return { login: '', secret: '' };
}

export class QontoError extends Error {
  constructor(msg, status) {
    super(msg);
    this.name = 'QontoError';
    this.status = status;
  }
}
