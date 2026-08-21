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
    RUNS: fakeKV(),
    ...overrides,
  };
}

const req = (path, init = {}) => new Request(`https://geo.test${path}`, init);
const run = (env, path, init) => worker.fetch(req(path, init), env, { waitUntil() {} });

describe('auth et health', () => {
  it('/health est public et liste les moteurs actifs', async () => {
    const res = await run(mockEnv(), '/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.engines).toEqual(['perplexity', 'anthropic', 'openai', 'gemini']);
  });

  it('hors mock, seuls les moteurs avec clé sont actifs', async () => {
    const env = mockEnv({ MOCK_MODE: 'false', PERPLEXITY_API_KEY: 'k', WASSIM_AUTH_TOKEN: 't' });
    const body = await (await run(env, '/health')).json();
    expect(body.engines).toEqual(['perplexity']);
  });

  it('refuse sans token quand WASSIM_AUTH_TOKEN est configuré', async () => {
    const env = mockEnv({ WASSIM_AUTH_TOKEN: 'secret' });
    expect((await run(env, '/clients')).status).toBe(401);
    const ok = await run(env, '/clients', { headers: { 'X-Wassim-Auth': 'secret' } });
    expect(ok.status).toBe(200);
  });
});

describe('config clients', () => {
  it('sert le client de démo en mock sans config', async () => {
    const body = await (await run(mockEnv(), '/clients')).json();
    expect(body.clients.length).toBe(1);
    expect(body.clients[0].prompts.length).toBeGreaterThan(0);
  });

  it('PUT /clients valide et stocke la config', async () => {
    const env = mockEnv();
    const clients = [{
      id: 'acme', name: 'ACME', domain: 'acme.fr',
      aliases: ['ACME Conseil'], prompts: ['Qui recommandes-tu pour X ?'],
    }];
    expect((await run(env, '/clients', { method: 'PUT', body: JSON.stringify(clients) })).status).toBe(200);
    expect((await (await run(env, '/clients')).json()).clients).toEqual(clients);
  });

  it('rejette une config invalide (domaine, prompts)', async () => {
    const bad = async (clients) =>
      (await run(mockEnv(), '/clients', { method: 'PUT', body: JSON.stringify(clients) })).status;
    expect(await bad([{ id: 'a', name: 'A', domain: 'pas-un-domaine', prompts: ['x'] }])).toBe(400);
    expect(await bad([{ id: 'a', name: 'A', domain: 'a.fr', prompts: [] }])).toBe(400);
    expect(await bad([{ id: 'a', name: 'A', domain: 'a.fr', prompts: Array(21).fill('p') }])).toBe(400);
    // ni domaine ni alias → refusé
    expect(await bad([{ id: 'a', name: 'A', prompts: ['x'] }])).toBe(400);
  });

  it('accepte et tracke un client sans site (alias seulement)', async () => {
    const env = mockEnv();
    const clients = [{ id: 'osteo', name: 'Nicolas', aliases: ['Nicolas Fournials'], prompts: ['Quel ostéopathe à Bruz ?'] }];
    expect((await run(env, '/clients', { method: 'PUT', body: JSON.stringify(clients) })).status).toBe(200);
    const body = await (await run(env, '/run', { method: 'POST', body: '{}' })).json();
    expect(body.errors).toEqual([]);
    const s = body.tracked[0].summary;
    expect(s.answers).toBe(4);
    expect(s.cited).toBe(0); // pas de domaine → jamais cité, seules les mentions comptent
  });
});

describe('tracking', () => {
  it('POST /run produit un relevé mock complet (4 moteurs × prompts)', async () => {
    const env = mockEnv();
    const res = await run(env, '/run', { method: 'POST', body: '{}' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tracked.length).toBe(1);
    const t = body.tracked[0];
    expect(t.mock).toBe(true);
    expect(t.summary.answers).toBe(4 * 5); // 4 moteurs × 5 prompts démo
    expect(t.summary.perEngine.perplexity.ok).toBe(true);
    expect(body.errors).toEqual([]);
    // pas de domaine cassé dans les concurrents (regression : shift signé du seed mock)
    for (const c of t.summary.topCompetitors) {
      expect(c.domain).toMatch(/^[a-z0-9.-]+\.[a-z]{2,}$/);
    }
  });

  it('l\'historique et /latest exposent les relevés', async () => {
    const env = mockEnv();
    await run(env, '/run', { method: 'POST', body: '{}' });

    const runs = (await (await run(env, '/runs?client=demo-wassim')).json()).runs;
    expect(runs.length).toBe(1);
    expect(runs[0].summary).toHaveProperty('citationRate');
    // les résumés n'embarquent pas le détail par prompt
    expect(runs[0]).not.toHaveProperty('engines');

    const detail = (await (await run(env, `/runs?client=demo-wassim&date=${runs[0].date}`)).json()).run;
    expect(detail.engines.gemini.results.length).toBe(5);
    expect(detail.engines.gemini.results[0]).toHaveProperty('excerpt');

    const latest = (await (await run(env, '/latest')).json()).latest;
    expect(latest['demo-wassim'].date).toBe(runs[0].date);
  });

  it('POST /run avec un client inconnu renvoie 404', async () => {
    const res = await run(mockEnv(), '/run', { method: 'POST', body: JSON.stringify({ client: 'nope' }) });
    expect(res.status).toBe(404);
  });

  it('/runs sans client renvoie 400', async () => {
    expect((await run(mockEnv(), '/runs')).status).toBe(400);
  });

  it('GET /export renvoie config, dernier relevé détaillé et historique par client', async () => {
    const env = mockEnv();
    await run(env, '/run', { method: 'POST', body: '{}' });

    const exp = await (await run(env, '/export')).json();
    expect(exp.count).toBe(1);
    const c = exp.clients[0];
    expect(c.client.id).toBe('demo-wassim');
    expect(c.client.prompts.length).toBeGreaterThan(0);
    // Détail complet : par moteur et par prompt, avec extraits de réponse.
    expect(c.latest.engines.gemini.results[0]).toHaveProperty('excerpt');
    expect(c.latest.summary).toHaveProperty('citationRate');
    // Historique en résumés (sans le détail par prompt).
    expect(c.history.length).toBe(1);
    expect(c.history[0]).not.toHaveProperty('engines');

    // Filtre ?client= inconnu : export vide, pas d'erreur.
    const none = await (await run(env, '/export?client=nope')).json();
    expect(none.count).toBe(0);
  });
});
