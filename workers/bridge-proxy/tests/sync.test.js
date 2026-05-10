// Tests d'idempotence du sync vers Notion.
// On stub `fetch` pour simuler les réponses de l'API Notion.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from '../src/index.js';
import { categorize, DEFAULT_RULES } from '../src/categorize.js';

const env = {
  MOCK_MODE: 'true',
  ALLOWED_ORIGINS: 'http://localhost:5173',
  NOTION_TOKEN: 'secret_test',
  NOTION_API_BASE: 'https://api.notion.com',
  NOTION_VERSION: '2022-06-28',
  NOTION_DB_TRANSACTIONS_ID: 'db_tx',
  NOTION_DB_ACCOUNTS_ID: 'db_acc',
  NOTION_DB_CATEGORIES_ID: 'db_cat',
};

const ctx = { waitUntil: () => {} };

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /sync — idempotence', () => {
  let createdPages = [];
  let updatedPages = [];

  beforeEach(() => {
    createdPages = [];
    updatedPages = [];
    // Map { dbId -> [pages déjà existantes] }
    const existing = { db_acc: [], db_tx: [], db_cat: [] };

    globalThis.fetch = vi.fn(async (input, init = {}) => {
      const url = typeof input === 'string' ? input : input.url;
      const method = (init.method || 'GET').toUpperCase();

      // Notion query
      const queryMatch = url.match(/\/v1\/databases\/([^/]+)\/query/);
      if (queryMatch && method === 'POST') {
        const dbId = queryMatch[1];
        return jsonRes({ results: existing[dbId] || [], has_more: false });
      }

      // Notion create
      if (url.endsWith('/v1/pages') && method === 'POST') {
        const body = JSON.parse(init.body || '{}');
        const id = `page_${createdPages.length + 1}`;
        // On simule la forme exacte renvoyée par l'API Notion : pour un
        // rich_text, l'API renvoie [{ plain_text, text: { content } }] sur
        // les lectures. Notre code lit `plain_text`, donc on l'ajoute ici.
        const propsRead = JSON.parse(JSON.stringify(body.properties));
        for (const v of Object.values(propsRead)) {
          if (Array.isArray(v.rich_text)) {
            v.rich_text = v.rich_text.map((rt) => ({
              ...rt,
              plain_text: rt?.text?.content ?? rt?.plain_text ?? '',
            }));
          }
          if (Array.isArray(v.title)) {
            v.title = v.title.map((rt) => ({
              ...rt,
              plain_text: rt?.text?.content ?? rt?.plain_text ?? '',
            }));
          }
        }
        const created = { id, properties: propsRead };
        createdPages.push(created);
        const dbId = body.parent?.database_id;
        if (dbId && existing[dbId]) existing[dbId].push(created);
        return jsonRes(created);
      }

      // Notion update
      if (url.match(/\/v1\/pages\/[^/]+$/) && method === 'PATCH') {
        updatedPages.push({ url });
        return jsonRes({ id: 'updated' });
      }

      throw new Error(`Unexpected fetch ${method} ${url}`);
    });
  });

  it('crée 4 comptes + N transactions au premier sync', async () => {
    const res = await worker.fetch(
      new Request('https://w.test/sync', { method: 'POST' }),
      env,
      ctx,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.accounts).toBe(4);
    expect(body.transactions).toBeGreaterThan(20);
    expect(body.created).toBeGreaterThan(0);
  });

  it('lancé deux fois, ne crée pas de doublons (la 2e fois met à jour)', async () => {
    // 1er sync : créations.
    await worker.fetch(new Request('https://w.test/sync', { method: 'POST' }), env, ctx);
    const createdAfter1 = createdPages.length;

    // 2e sync : tout doit déjà exister → updates uniquement.
    const res = await worker.fetch(
      new Request('https://w.test/sync', { method: 'POST' }),
      env,
      ctx,
    );
    const body = await res.json();
    expect(createdPages.length).toBe(createdAfter1); // pas de nouvelles créations
    expect(body.created).toBe(0);
    expect(body.updated).toBeGreaterThan(0);
  });
});

describe('categorize()', () => {
  it('matche Adobe sur Logiciels SaaS (Pro)', () => {
    const c = categorize({ description: 'Adobe Creative Cloud Subscription' });
    expect(c?.name).toBe('Logiciels SaaS');
    expect(c?.type).toBe('Pro');
  });

  it('matche Carrefour sur Alimentation (Perso)', () => {
    const c = categorize({ description: 'CARREFOUR Rennes' });
    expect(c?.name).toBe('Alimentation');
    expect(c?.type).toBe('Perso');
  });

  it('renvoie null pour une description vide', () => {
    expect(categorize({ description: '' })).toBeNull();
  });

  it('matche URSSAF', () => {
    const c = categorize({ description: 'URSSAF Cotisations Q1' });
    expect(c?.name).toBe('URSSAF');
  });
});
