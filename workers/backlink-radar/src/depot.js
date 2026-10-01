// Accès D1 — toutes les requêtes SQL du worker vivent ici. Les fonctions
// prennent `db` (binding env.DB) en premier argument pour rester testables
// (les routes sont testées avec un dépôt simulé ; le SQL réel est vérifié par
// le smoke test du workflow de déploiement, sur la vraie D1).

import { computeScore } from './score.js';

const BATCH_SIZE = 50;

function uuid() {
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

async function runBatched(db, statements) {
  for (let i = 0; i < statements.length; i += BATCH_SIZE) {
    await db.batch(statements.slice(i, i + BATCH_SIZE));
  }
}

function parseJson(s) {
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/* ---------- clients ---------- */

function hydrateClient(row, competitors) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    domain: row.domain,
    sector: row.sector,
    is_local: Boolean(row.is_local),
    weights: parseJson(row.weights_json),
    authority_source: row.authority_source,
    created_at: row.created_at,
    competitors,
  };
}

export async function listClients(db) {
  const { results: clients } = await db.prepare('SELECT * FROM clients ORDER BY name').all();
  const { results: comps } = await db.prepare('SELECT client_id, domain FROM competitors ORDER BY domain').all();
  const { results: counts } = await db.prepare(
    'SELECT client_id, status, COUNT(*) AS n FROM opportunities GROUP BY client_id, status',
  ).all();
  return clients.map((c) => {
    const client = hydrateClient(c, comps.filter((x) => x.client_id === c.id).map((x) => x.domain));
    client.counts = Object.fromEntries(counts.filter((x) => x.client_id === c.id).map((x) => [x.status, x.n]));
    return client;
  });
}

export async function getClient(db, id) {
  const row = await db.prepare('SELECT * FROM clients WHERE id = ?1').bind(id).first();
  if (!row) return null;
  const { results } = await db.prepare('SELECT domain FROM competitors WHERE client_id = ?1 ORDER BY domain').bind(id).all();
  return hydrateClient(row, results.map((r) => r.domain));
}

export async function createClient(db, c) {
  const statements = [
    db.prepare(
      'INSERT INTO clients (id, name, domain, sector, is_local, weights_json, authority_source, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)',
    ).bind(c.id, c.name, c.domain, c.sector || null, c.is_local ? 1 : 0,
      c.weights ? JSON.stringify(c.weights) : null, c.authority_source || 'semrush', nowIso()),
    ...c.competitors.map((d) => db.prepare('INSERT INTO competitors (client_id, domain) VALUES (?1, ?2)').bind(c.id, d)),
  ];
  await db.batch(statements);
}

/** Met à jour les champs fournis ; `competitors` remplace la liste entière. */
export async function updateClient(db, id, patch) {
  const statements = [];
  const cols = { name: 'name', domain: 'domain', sector: 'sector', authority_source: 'authority_source' };
  for (const [key, col] of Object.entries(cols)) {
    if (patch[key] !== undefined) statements.push(db.prepare(`UPDATE clients SET ${col} = ?1 WHERE id = ?2`).bind(patch[key], id));
  }
  if (patch.is_local !== undefined) {
    statements.push(db.prepare('UPDATE clients SET is_local = ?1 WHERE id = ?2').bind(patch.is_local ? 1 : 0, id));
  }
  if (patch.weights !== undefined) {
    statements.push(db.prepare('UPDATE clients SET weights_json = ?1 WHERE id = ?2')
      .bind(patch.weights ? JSON.stringify(patch.weights) : null, id));
  }
  if (patch.competitors) {
    statements.push(db.prepare('DELETE FROM competitors WHERE client_id = ?1').bind(id));
    for (const d of patch.competitors) {
      statements.push(db.prepare('INSERT INTO competitors (client_id, domain) VALUES (?1, ?2)').bind(id, d));
    }
  }
  if (statements.length) await db.batch(statements);
}

/** Recalcule le score de toutes les opportunités d'un client (après changement de pondération). */
export async function recomputeScores(db, client) {
  const { results } = await db.prepare(
    'SELECT id, semrush_as, ahrefs_dr, competitors_linked, competitors_total FROM opportunities WHERE client_id = ?1',
  ).bind(client.id).all();
  const opts = { weights: client.weights, authoritySource: client.authority_source };
  const statements = results.map((o) => {
    const { score, detail } = computeScore(o, opts);
    return db.prepare('UPDATE opportunities SET score = ?1, score_detail_json = ?2 WHERE id = ?3')
      .bind(score, JSON.stringify(detail), o.id);
  });
  await runBatched(db, statements);
  return results.length;
}

/* ---------- imports ---------- */

/**
 * Upsert des opportunités importées. Un réimport met à jour les métriques
 * (une valeur absente du nouvel export garde l'ancienne) sans toucher au
 * statut, aux notes ni au lien obtenu.
 */
export async function upsertOpportunities(db, client, imported, meta) {
  const { results: existing } = await db.prepare(
    'SELECT * FROM opportunities WHERE client_id = ?1 AND method = ?2',
  ).bind(client.id, imported.method).all();
  const byDomain = new Map(existing.map((o) => [o.domain, o]));
  const opts = { weights: client.weights, authoritySource: client.authority_source };
  const ts = nowIso();
  const keep = (next, prev) => (next === null || next === undefined ? prev ?? null : next);
  let created = 0;
  let updated = 0;
  const statements = [];

  for (const rec of imported.records) {
    const prev = byDomain.get(rec.domain);
    const merged = {
      sample_url: keep(rec.sample_url, prev?.sample_url),
      semrush_as: keep(rec.semrush_as, prev?.semrush_as),
      ahrefs_dr: keep(rec.ahrefs_dr, prev?.ahrefs_dr),
      competitors_linked: keep(rec.competitors_linked, prev?.competitors_linked),
      competitors_total: keep(rec.competitors_total, prev?.competitors_total),
    };
    const { score, detail } = computeScore(merged, opts);
    if (prev) {
      updated += 1;
      statements.push(db.prepare(
        `UPDATE opportunities SET sample_url = ?1, semrush_as = ?2, ahrefs_dr = ?3, competitors_linked = ?4,
           competitors_total = ?5, score = ?6, score_detail_json = ?7, updated_at = ?8 WHERE id = ?9`,
      ).bind(merged.sample_url, merged.semrush_as, merged.ahrefs_dr, merged.competitors_linked,
        merged.competitors_total, score, JSON.stringify(detail), ts, prev.id));
    } else {
      created += 1;
      statements.push(db.prepare(
        `INSERT INTO opportunities (id, client_id, domain, method, sample_url, semrush_as, ahrefs_dr,
           competitors_linked, competitors_total, score, score_detail_json, status, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'a_contacter', ?12, ?12)`,
      ).bind(uuid(), client.id, rec.domain, imported.method, merged.sample_url, merged.semrush_as,
        merged.ahrefs_dr, merged.competitors_linked, merged.competitors_total, score, JSON.stringify(detail), ts));
    }
  }
  statements.push(db.prepare(
    `INSERT INTO imports (id, client_id, source, filename, row_count, created, updated, skipped, imported_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
  ).bind(uuid(), client.id, imported.source, meta.filename || null, imported.rowCount, created, updated,
    imported.skipped.length, ts));
  await runBatched(db, statements);
  return { created, updated };
}

/* ---------- opportunités ---------- */

const SORTS = {
  score: 'score IS NULL, score DESC, domain',
  domain: 'domain',
  updated: 'updated_at DESC',
  followup: 'next_followup_at IS NULL, next_followup_at, domain',
};

function hydrateOpportunity(o) {
  if (!o) return null;
  const { score_detail_json: detailJson, ...rest } = o;
  return { ...rest, score_detail: parseJson(detailJson) };
}

export async function listOpportunities(db, clientId, { status, method, sort } = {}) {
  const where = ['client_id = ?1'];
  const binds = [clientId];
  if (status) {
    binds.push(status);
    where.push(`status = ?${binds.length}`);
  }
  if (method) {
    binds.push(method);
    where.push(`method = ?${binds.length}`);
  }
  const order = SORTS[sort] || SORTS.score;
  const { results } = await db.prepare(
    `SELECT * FROM opportunities WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 2000`,
  ).bind(...binds).all();
  return results.map(hydrateOpportunity);
}

export async function getOpportunity(db, id) {
  return hydrateOpportunity(await db.prepare('SELECT * FROM opportunities WHERE id = ?1').bind(id).first());
}

/** Applique des champs + journalise l'événement de pipeline s'il y a changement de statut. */
export async function updateOpportunity(db, current, fields, note) {
  const allowed = ['status', 'contact_note', 'next_followup_at', 'link_url'];
  const keys = Object.keys(fields).filter((k) => allowed.includes(k));
  const ts = nowIso();
  const sets = keys.map((k, i) => `${k} = ?${i + 1}`);
  sets.push(`updated_at = ?${keys.length + 1}`);
  const statements = [
    db.prepare(`UPDATE opportunities SET ${sets.join(', ')} WHERE id = ?${keys.length + 2}`)
      .bind(...keys.map((k) => fields[k]), ts, current.id),
  ];
  if (fields.status && fields.status !== current.status) {
    statements.push(db.prepare(
      'INSERT INTO events (id, opportunity_id, at, from_status, to_status, note) VALUES (?1, ?2, ?3, ?4, ?5, ?6)',
    ).bind(uuid(), current.id, ts, current.status, fields.status, note || null));
  }
  await db.batch(statements);
}

export async function listEvents(db, opportunityId) {
  const { results } = await db.prepare(
    'SELECT at, from_status, to_status, note FROM events WHERE opportunity_id = ?1 ORDER BY at DESC',
  ).bind(opportunityId).all();
  return results;
}

/** Relances dues (date ≤ aujourd'hui), tous clients. */
export async function dueFollowups(db, today) {
  const { results } = await db.prepare(
    `SELECT o.id, o.client_id, c.name AS client_name, o.domain, o.status, o.next_followup_at, o.contact_note
       FROM opportunities o JOIN clients c ON c.id = o.client_id
      WHERE o.status IN ('contacte', 'relance') AND o.next_followup_at <= ?1
      ORDER BY o.next_followup_at, c.name`,
  ).bind(today).all();
  return results;
}

/** Liens perdus, tous clients — pour le bandeau d'alerte. */
export async function lostLinks(db) {
  const { results } = await db.prepare(
    `SELECT o.id, o.client_id, c.name AS client_name, o.domain, o.link_url, o.last_check_result, o.last_checked_at
       FROM opportunities o JOIN clients c ON c.id = o.client_id
      WHERE o.status = 'perdu' ORDER BY o.updated_at DESC LIMIT 100`,
  ).all();
  return results;
}

/* ---------- vérification des liens ---------- */

export async function linksToCheck(db, limit, everyDays) {
  const { results } = await db.prepare(
    `SELECT o.*, c.domain AS client_domain FROM opportunities o JOIN clients c ON c.id = o.client_id
      WHERE o.status = 'obtenu' AND o.link_url IS NOT NULL
        AND (o.last_checked_at IS NULL OR o.last_checked_at <= ?1)
      ORDER BY o.last_checked_at IS NOT NULL, o.last_checked_at
      LIMIT ?2`,
  ).bind(new Date(Date.now() - everyDays * 86400000).toISOString(), limit).all();
  return results;
}

export async function clientDomainOf(db, clientId) {
  const row = await db.prepare('SELECT domain FROM clients WHERE id = ?1').bind(clientId).first();
  return row?.domain || null;
}

export async function recordCheck(db, opportunityId, check) {
  const ts = nowIso();
  await db.batch([
    db.prepare(
      'INSERT INTO link_checks (id, opportunity_id, checked_at, http_status, result, rel, detail) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)',
    ).bind(uuid(), opportunityId, ts, check.http_status ?? null, check.result, check.rel ?? null, check.detail ?? null),
    db.prepare('UPDATE opportunities SET last_check_result = ?1, last_checked_at = ?2 WHERE id = ?3')
      .bind(check.result, ts, opportunityId),
  ]);
}

/** Résultats des derniers contrôles, du plus récent au plus ancien. */
export async function lastCheckResults(db, opportunityId, n = 2) {
  const { results } = await db.prepare(
    'SELECT result FROM link_checks WHERE opportunity_id = ?1 ORDER BY checked_at DESC LIMIT ?2',
  ).bind(opportunityId, n).all();
  return results.map((r) => r.result);
}

export async function listChecks(db, opportunityId) {
  const { results } = await db.prepare(
    'SELECT checked_at, http_status, result, rel, detail FROM link_checks WHERE opportunity_id = ?1 ORDER BY checked_at DESC LIMIT 20',
  ).bind(opportunityId).all();
  return results;
}
