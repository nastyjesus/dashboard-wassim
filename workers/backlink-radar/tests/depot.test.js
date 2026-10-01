// Tests du SQL réel (src/depot.js + schema.sql) sur une base SQLite en
// mémoire, via une fine couche qui imite l'API D1 (prepare/bind/first/all/
// run/batch). D1 est du SQLite : mêmes requêtes, mêmes contraintes.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as depot from '../src/depot.js';

// Chargé par require : la version de Vite utilisée par vitest 1.x ne connaît
// pas encore « node:sqlite » comme module natif.
const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite');

function d1(sqlite) {
  const stmt = (sql, params = []) => ({
    sql,
    params,
    bind: (...p) => stmt(sql, p),
    first: async () => sqlite.prepare(sql).get(...params) ?? null,
    all: async () => ({ results: sqlite.prepare(sql).all(...params) }),
    run: async () => sqlite.prepare(sql).run(...params),
  });
  return {
    prepare: (sql) => stmt(sql),
    batch: async (statements) => {
      sqlite.exec('BEGIN');
      try {
        for (const s of statements) sqlite.prepare(s.sql).run(...s.params);
        sqlite.exec('COMMIT');
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const schema = readFileSync(new URL('../schema.sql', import.meta.url), 'utf8');
const CLIENT = {
  id: 'cabinet-dupont', name: 'Cabinet Dupont', domain: 'dupont.fr', sector: 'avocat', is_local: true,
  competitors: ['rival.fr', 'autre-rival.fr'], weights: null, authority_source: 'semrush',
};
const imported = (records) => ({ source: 'test_source', method: 'link_gap', rowCount: records.length, records, skipped: [] });

let db;
beforeEach(async () => {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(schema);
  sqlite.exec(schema); // idempotent : rejoué à chaque déploiement
  db = d1(sqlite);
  await depot.createClient(db, CLIENT);
});

describe('clients', () => {
  it('création, lecture, mise à jour des concurrents', async () => {
    const c = await depot.getClient(db, 'cabinet-dupont');
    expect(c).toMatchObject({ domain: 'dupont.fr', is_local: true, competitors: ['autre-rival.fr', 'rival.fr'] });
    await depot.updateClient(db, c.id, { competitors: ['nouveau.fr'], weights: { authority: 2 }, is_local: false });
    expect(await depot.getClient(db, c.id)).toMatchObject({ competitors: ['nouveau.fr'], weights: { authority: 2 }, is_local: false });
  });
});

describe('import et pipeline', () => {
  it('upsert : un réimport met à jour les chiffres sans perdre statut ni notes', async () => {
    const client = await depot.getClient(db, CLIENT.id);
    expect(await depot.upsertOpportunities(db, client, imported([
      { domain: 'a.fr', semrush_as: 40, competitors_linked: 1, competitors_total: 2 },
      { domain: 'b.fr', semrush_as: null },
    ]), { filename: 'export.csv' })).toEqual({ created: 2, updated: 0 });

    let [a] = await depot.listOpportunities(db, client.id, { sort: 'score' });
    expect(a).toMatchObject({ domain: 'a.fr', score: 45, status: 'a_contacter' });
    await depot.updateOpportunity(db, a, { status: 'contacte', next_followup_at: '2026-10-08', contact_note: 'mail envoyé' }, 'premier contact');

    // Réimport : AS change, le nouvel export n'a pas la colonne concurrents.
    expect(await depot.upsertOpportunities(db, client, imported([
      { domain: 'a.fr', semrush_as: 60, competitors_linked: null, competitors_total: null },
    ]), {})).toEqual({ created: 0, updated: 1 });
    a = await depot.getOpportunity(db, a.id);
    expect(a).toMatchObject({
      semrush_as: 60, competitors_linked: 1, competitors_total: 2, score: 55,
      status: 'contacte', contact_note: 'mail envoyé', next_followup_at: '2026-10-08',
    });
    expect(a.score_detail.components.authority.raw).toBe(60);
    expect(await depot.listEvents(db, a.id)).toEqual([
      expect.objectContaining({ from_status: 'a_contacter', to_status: 'contacte', note: 'premier contact' }),
    ]);
  });

  it('tri par score (inconnus en dernier), filtres, compteurs', async () => {
    const client = await depot.getClient(db, CLIENT.id);
    await depot.upsertOpportunities(db, client, imported([
      { domain: 'faible.fr', semrush_as: 10 },
      { domain: 'inconnu.fr' },
      { domain: 'fort.fr', semrush_as: 80 },
    ]), {});
    const list = await depot.listOpportunities(db, client.id, { sort: 'score' });
    expect(list.map((o) => o.domain)).toEqual(['fort.fr', 'faible.fr', 'inconnu.fr']);
    expect(list[2].score).toBeNull();
    await depot.updateOpportunity(db, list[0], { status: 'ignore' });
    expect(await depot.listOpportunities(db, client.id, { status: 'ignore' })).toHaveLength(1);
    const [listed] = await depot.listClients(db);
    expect(listed.counts).toEqual({ a_contacter: 2, ignore: 1 });
  });

  it('recalcul des scores après changement de source d\'autorité', async () => {
    const client = await depot.getClient(db, CLIENT.id);
    await depot.upsertOpportunities(db, client, imported([{ domain: 'a.fr', semrush_as: 40, ahrefs_dr: 70 }]), {});
    await depot.updateClient(db, client.id, { authority_source: 'ahrefs' });
    expect(await depot.recomputeScores(db, await depot.getClient(db, client.id))).toBe(1);
    const [a] = await depot.listOpportunities(db, client.id);
    expect(a.score).toBe(70);
  });

  it('relances dues, contrôles de liens, liens à revérifier', async () => {
    const client = await depot.getClient(db, CLIENT.id);
    await depot.upsertOpportunities(db, client, imported([{ domain: 'a.fr' }, { domain: 'b.fr' }]), {});
    const [a, b] = await depot.listOpportunities(db, client.id, { sort: 'domain' });
    await depot.updateOpportunity(db, a, { status: 'contacte', next_followup_at: '2026-09-30' });
    await depot.updateOpportunity(db, b, { status: 'obtenu', link_url: 'https://b.fr/article' });

    const due = await depot.dueFollowups(db, '2026-10-01');
    expect(due).toEqual([expect.objectContaining({ domain: 'a.fr', client_name: 'Cabinet Dupont' })]);
    expect(await depot.dueFollowups(db, '2026-09-29')).toEqual([]);

    let toCheck = await depot.linksToCheck(db, 40, 7);
    expect(toCheck).toEqual([expect.objectContaining({ domain: 'b.fr', client_domain: 'dupont.fr' })]);

    await depot.recordCheck(db, b.id, { http_status: 200, result: 'missing', rel: null, detail: 'x' });
    await new Promise((r) => setTimeout(r, 5));
    await depot.recordCheck(db, b.id, { http_status: 404, result: 'http_error', rel: null, detail: 'HTTP 404' });
    expect(await depot.lastCheckResults(db, b.id, 2)).toEqual(['http_error', 'missing']);
    expect((await depot.getOpportunity(db, b.id)).last_check_result).toBe('http_error');
    expect(await depot.listChecks(db, b.id)).toHaveLength(2);

    toCheck = await depot.linksToCheck(db, 40, 7);
    expect(toCheck).toEqual([]); // vérifié à l'instant : pas avant 7 jours
  });

  it('la suppression d\'un client emporte ses opportunités (cascade)', async () => {
    const client = await depot.getClient(db, CLIENT.id);
    await depot.upsertOpportunities(db, client, imported([{ domain: 'a.fr' }]), {});
    await db.batch([db.prepare('DELETE FROM clients WHERE id = ?1').bind(client.id)]);
    expect(await depot.listOpportunities(db, client.id)).toEqual([]);
  });
});
