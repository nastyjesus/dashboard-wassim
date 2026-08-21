import { describe, it, expect } from 'vitest';
import worker from '../src/index.js';

/** KV en mémoire, même surface que l'API Workers KV utilisée par le worker. */
function fakeKV() {
  const store = new Map();
  return {
    async get(key, type) {
      const v = store.get(key);
      if (v === undefined) return null;
      return type === 'json' ? JSON.parse(v) : v;
    },
    async put(key, value) {
      store.set(key, value);
    },
    async list({ prefix = '' } = {}) {
      return { keys: [...store.keys()].filter((k) => k.startsWith(prefix)).map((name) => ({ name })) };
    },
    _store: store,
  };
}

function mockEnv(overrides = {}) {
  return {
    MOCK_MODE: 'true',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    REPORTS: fakeKV(),
    ...overrides,
  };
}

const req = (path, init = {}) => new Request(`https://gsc.test${path}`, init);
const run = (env, path, init) => worker.fetch(req(path, init), env, { waitUntil() {} });

describe('auth', () => {
  it('/health est public', async () => {
    const res = await run(mockEnv(), '/health');
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it('refuse sans token quand WASSIM_AUTH_TOKEN est configuré', async () => {
    const env = mockEnv({ WASSIM_AUTH_TOKEN: 'secret' });
    const res = await run(env, '/clients');
    expect(res.status).toBe(401);
  });

  it('accepte avec le bon token', async () => {
    const env = mockEnv({ WASSIM_AUTH_TOKEN: 'secret' });
    const res = await run(env, '/clients', { headers: { 'X-Wassim-Auth': 'secret' } });
    expect(res.status).toBe(200);
  });

  it('hors mock, refuse si aucun token n\'est configuré', async () => {
    const env = mockEnv({ MOCK_MODE: 'false' });
    const res = await run(env, '/clients');
    expect(res.status).toBe(401);
  });
});

describe('config clients', () => {
  it('sert les clients de démo en mock sans config', async () => {
    const res = await run(mockEnv(), '/clients');
    const body = await res.json();
    expect(body.clients.length).toBeGreaterThan(0);
    expect(body.clients[0].property).toContain('sc-domain:');
  });

  it('PUT /clients valide et stocke la config', async () => {
    const env = mockEnv();
    const clients = [{ id: 'acme', name: 'ACME', property: 'sc-domain:acme.fr' }];
    const putRes = await run(env, '/clients', { method: 'PUT', body: JSON.stringify(clients) });
    expect(putRes.status).toBe(200);
    const getRes = await run(env, '/clients');
    expect((await getRes.json()).clients).toEqual(clients);
  });

  it('PUT /clients rejette une config invalide', async () => {
    const res = await run(mockEnv(), '/clients', {
      method: 'PUT',
      body: JSON.stringify([{ id: 'BAD ID', name: 'x', property: 'y' }]),
    });
    expect(res.status).toBe(400);
  });
});

describe('génération de rapports', () => {
  it('POST /run génère un rapport mock, stocké et servi via /r/:slug', async () => {
    const env = mockEnv();
    const res = await run(env, '/run', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.generated.length).toBe(1);
    expect(body.generated[0].mock).toBe(true);
    expect(body.errors).toEqual([]);

    const slugPath = new URL(body.generated[0].url).pathname;
    const page = await run(env, slugPath);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('Données de démonstration');
  });

  it('POST /run avec un client inconnu renvoie 404', async () => {
    const res = await run(mockEnv(), '/run', { method: 'POST', body: JSON.stringify({ client: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('GET /reports et /latest indexent les rapports générés', async () => {
    const env = mockEnv();
    await run(env, '/run', { method: 'POST', body: JSON.stringify({ period: '2026-06' }) });
    await run(env, '/run', { method: 'POST', body: JSON.stringify({ period: '2026-07' }) });

    const reports = (await (await run(env, '/reports')).json()).reports;
    expect(reports.length).toBe(2);
    expect(reports[0].period).toBe('2026-07'); // tri décroissant

    const latest = (await (await run(env, '/latest')).json()).latest;
    expect(latest['demo-wassim'].period).toBe('2026-07');
    expect(latest['demo-wassim'].kpis.clicks.value).toBeGreaterThan(0);
    expect(latest['demo-wassim'].kpis.clicks.deltas).toHaveProperty('m1');
    expect(latest['demo-wassim'].kpis.clicks.deltas).toHaveProperty('m3');
    expect(latest['demo-wassim'].kpis.clicks.deltas).toHaveProperty('m6');
  });

  it('un slug inconnu renvoie 404', async () => {
    const res = await run(mockEnv(), '/r/deadbeefdeadbeefdeadbeefdeadbeef');
    expect(res.status).toBe(404);
  });

  it('GET /export renvoie la data complète (mots-clés, pages, apparences) pour analyse', async () => {
    const env = mockEnv();
    await run(env, '/run', { method: 'POST', body: JSON.stringify({ period: '2026-06' }) });
    await run(env, '/run', { method: 'POST', body: JSON.stringify({ period: '2026-07' }) });

    // Sans filtre : dernier rapport de chaque client, data brute complète.
    const exp = await (await run(env, '/export')).json();
    expect(exp.count).toBe(1);
    const c = exp.clients[0];
    expect(c.meta.clientId).toBe('demo-wassim');
    expect(c.meta.period.key).toBe('2026-07');
    expect(c.url).toContain('/r/');
    expect(c.tables.queries.length).toBeGreaterThan(0);
    expect(c.tables.queries[0]).toHaveProperty('keys');
    expect(c.tables.queries[0]).toHaveProperty('clicks');
    expect(c.tables).toHaveProperty('searchAppearance');
    expect(c.kpis.clicks.horizons.m6).toHaveProperty('delta');

    // Filtre ?period= : le mois demandé, pas le dernier.
    const june = await (await run(env, '/export?period=2026-06')).json();
    expect(june.clients[0].meta.period.key).toBe('2026-06');

    // Filtre ?client= inconnu : export vide, pas d'erreur.
    const none = await (await run(env, '/export?client=nope')).json();
    expect(none.count).toBe(0);
  });
});
