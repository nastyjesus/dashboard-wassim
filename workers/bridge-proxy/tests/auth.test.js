// Tests vitest pour les endpoints / auth du worker bridge-proxy.
// On stub `fetch` pour éviter les appels réseau réels.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import worker from '../src/index.js';

const baseEnv = {
  MOCK_MODE: 'true',
  ALLOWED_ORIGINS: 'https://nastyjesus.github.io,http://localhost:5173',
  BRIDGE_BASE_URL: 'https://api.bridgeapi.io',
  BRIDGE_VERSION: '2025-01-15',
  NOTION_VERSION: '2022-06-28',
  NOTION_API_BASE: 'https://api.notion.com',
};

const ctx = { waitUntil: () => {} };

function req(path, init = {}) {
  return new Request(`https://worker.test${path}`, init);
}

describe('GET /health', () => {
  it('renvoie 200 sans auth', async () => {
    const res = await worker.fetch(req('/health'), baseEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });
});

describe('Auth X-Wassim-Auth', () => {
  it('en mode mock sans token configuré, accepte la requête', async () => {
    const res = await worker.fetch(req('/accounts'), baseEnv, ctx);
    expect(res.status).toBe(200);
  });

  it('refuse 401 si token configuré mais absent du header', async () => {
    const env = { ...baseEnv, MOCK_MODE: 'false', WASSIM_AUTH_TOKEN: 'sec' };
    const res = await worker.fetch(req('/accounts'), env, ctx);
    expect(res.status).toBe(401);
  });

  it('accepte si X-Wassim-Auth match', async () => {
    const env = { ...baseEnv, WASSIM_AUTH_TOKEN: 'sec' };
    const res = await worker.fetch(
      req('/accounts', { headers: { 'X-Wassim-Auth': 'sec' } }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
  });
});

describe('CORS', () => {
  it('OPTIONS renvoie 204 + headers complets', async () => {
    const res = await worker.fetch(
      req('/accounts', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      }),
      baseEnv,
      ctx,
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('x-requested-with');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
  });
});

describe('GET /accounts (mock)', () => {
  it('renvoie les 4 comptes Wassim', async () => {
    const res = await worker.fetch(req('/accounts'), baseEnv, ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.mock).toBe(true);
    expect(body.accounts).toHaveLength(4);
    const banks = body.accounts.map((a) => a.bank_name).sort();
    expect(banks).toEqual(['Banque Populaire', 'Fortuneo', 'Qonto', 'Trade Republic']);
  });
});
