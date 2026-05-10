// Wrapper Bridge API v3.
// En mode mock, retourne des données fixes (utiles tant que l'inscription
// au programme partenaire Bridge n'est pas finalisée).

import { logger } from './logger.js';
import { MOCK_ACCOUNTS, MOCK_TRANSACTIONS } from './mocks.js';

/**
 * @typedef {Object} BridgeEnv
 * @property {string} [BRIDGE_BASE_URL]
 * @property {string} [BRIDGE_VERSION]
 * @property {string} [BRIDGE_CLIENT_ID]
 * @property {string} [BRIDGE_CLIENT_SECRET]
 * @property {string} [BRIDGE_ACCESS_TOKEN]
 * @property {string} [MOCK_MODE]
 */

export class BridgeClient {
  /** @param {BridgeEnv} env */
  constructor(env) {
    this.env = env;
    this.baseUrl = env.BRIDGE_BASE_URL || 'https://api.bridgeapi.io';
    this.version = env.BRIDGE_VERSION || '2025-01-15';
    this.mock = isMock(env);
  }

  /**
   * En-têtes communs Bridge.
   */
  headers() {
    return {
      'Bridge-Version': this.version,
      'Client-Id': this.env.BRIDGE_CLIENT_ID || '',
      'Client-Secret': this.env.BRIDGE_CLIENT_SECRET || '',
      Authorization: `Bearer ${this.env.BRIDGE_ACCESS_TOKEN || ''}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Liste les comptes agrégés.
   * @returns {Promise<Array>}
   */
  async listAccounts() {
    if (this.mock) {
      logger.info('bridge.mock.accounts');
      return MOCK_ACCOUNTS;
    }
    const url = `${this.baseUrl}/v3/aggregation/accounts`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new BridgeError(`accounts ${res.status}`, res.status);
    const data = await res.json();
    return Array.isArray(data?.resources) ? data.resources : Array.isArray(data) ? data : [];
  }

  /**
   * Liste les transactions depuis une date donnée. Pagine jusqu'à terminé.
   * @param {{ since?: string, limit?: number }} [opts]
   */
  async listTransactions(opts = {}) {
    if (this.mock) {
      logger.info('bridge.mock.transactions');
      const since = opts.since ? new Date(opts.since).getTime() : 0;
      return MOCK_TRANSACTIONS.filter((t) => new Date(t.date).getTime() >= since);
    }
    const limit = opts.limit ?? 100;
    const params = new URLSearchParams({ limit: String(limit) });
    if (opts.since) params.set('since', opts.since);
    let url = `${this.baseUrl}/v3/aggregation/transactions?${params}`;
    const all = [];
    let safety = 0;
    while (url && safety < 50) {
      safety++;
      const res = await fetch(url, { headers: this.headers() });
      if (!res.ok) throw new BridgeError(`transactions ${res.status}`, res.status);
      const data = await res.json();
      if (Array.isArray(data?.resources)) all.push(...data.resources);
      url = data?.pagination?.next_uri
        ? data.pagination.next_uri.startsWith('http')
          ? data.pagination.next_uri
          : `${this.baseUrl}${data.pagination.next_uri}`
        : null;
    }
    return all;
  }

  /**
   * Crée une connect_session pour ajouter une nouvelle banque.
   * @param {{ externalUserId: string }} opts
   */
  async createConnectSession({ externalUserId }) {
    if (this.mock) {
      return {
        id: 'mock_session',
        url: 'https://connect.bridgeapi.io/?mock=true',
        expires_at: new Date(Date.now() + 3600_000).toISOString(),
      };
    }
    const url = `${this.baseUrl}/v3/aggregation/connect-sessions`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ user: { external_user_id: externalUserId } }),
    });
    if (!res.ok) throw new BridgeError(`connect-session ${res.status}`, res.status);
    return res.json();
  }
}

/**
 * Décide si on tourne en mode mock. On tolère "1", "true", "yes" pour la
 * variable MOCK_MODE, ou l'absence des secrets Bridge.
 * @param {BridgeEnv} env
 */
export function isMock(env) {
  const flag = (env.MOCK_MODE || '').toLowerCase();
  if (['1', 'true', 'yes'].includes(flag)) return true;
  // Fallback : si pas de credentials, on bascule en mock automatiquement.
  if (!env.BRIDGE_CLIENT_ID || !env.BRIDGE_CLIENT_SECRET) return true;
  return false;
}

export class BridgeError extends Error {
  constructor(msg, status) {
    super(msg);
    this.name = 'BridgeError';
    this.status = status;
  }
}
