// Worker backlink-radar-wassim — point d'entrée. Spec : docs/backlink-radar/README.md
//
// Endpoints (tous protégés par X-Wassim-Auth, sauf /health) :
//   GET   /health                          — public
//   GET   /clients                         — clients + compteurs par statut
//   POST  /clients                         — créer {name, domain, id?, sector?, is_local?, competitors[]}
//   PATCH /clients/:id                     — modifier (dont weights, authority_source) → recalcul des scores
//   POST  /clients/:id/imports             — upload CSV (multipart, champ "file") → rapport d'import
//   GET   /clients/:id/opportunities       — ?status= &method= &sort=score|domain|updated|followup
//   GET   /opportunities/:id               — détail + historique pipeline + contrôles
//   PATCH /opportunities/:id               — {status?, contact_note?, next_followup_at?, link_url?}
//   POST  /opportunities/:id/check         — vérification immédiate du lien
//   GET   /followups                       — relances dues + liens perdus, tous clients
//
// Cron quotidien : revérifie les liens obtenus les plus anciennement contrôlés.

import { jsonResponse, preflightResponse } from './cors.js';
import { normalizeDomain, slugify } from './domain.js';
import { importCsv } from './imports.js';
import { planTransition, STATUSES, isHttpUrl } from './pipeline.js';
import { validateWeights, AUTHORITY_SOURCES } from './score.js';
import { checkLink, shouldMarkLost } from './check.js';
import * as depot from './depot.js';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_COMPETITORS = 10;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const json = (body, status = 200) => jsonResponse(body, status, request, env);

    if (path === '/health' || path === '/') {
      return json({ ok: true, db: Boolean(env.DB), ts: new Date().toISOString() });
    }

    const authError = checkWassimAuth(request, env);
    if (authError) return authError;
    if (!env.DB) return json({ error: 'db_not_bound' }, 503);

    try {
      return await route(request, env, url, path, json);
    } catch (e) {
      console.error(JSON.stringify({ msg: 'unhandled', path, err: String(e?.stack || e) }));
      return json({ error: 'internal', message: String(e?.message || e).slice(0, 300) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledChecks(env));
  },
};

async function route(request, env, url, path, json) {
  const db = env.DB;
  const m = request.method;
  let p;

  if (path === '/clients' && m === 'GET') {
    return json({ clients: await depot.listClients(db) });
  }

  if (path === '/clients' && m === 'POST') {
    const body = await safeJson(request);
    const { error, client } = validateNewClient(body);
    if (error) return json({ error: 'bad_request', message: error }, 400);
    if (await depot.getClient(db, client.id)) {
      return json({ error: 'conflict', message: `le client « ${client.id} » existe déjà` }, 409);
    }
    await depot.createClient(db, client);
    return json({ ok: true, client: await depot.getClient(db, client.id) }, 201);
  }

  if ((p = path.match(/^\/clients\/([a-z0-9-]+)$/)) && m === 'PATCH') {
    const client = await depot.getClient(db, p[1]);
    if (!client) return json({ error: 'not_found' }, 404);
    const body = await safeJson(request);
    const { error, patch } = validateClientPatch(body);
    if (error) return json({ error: 'bad_request', message: error }, 400);
    await depot.updateClient(db, client.id, patch);
    const updated = await depot.getClient(db, client.id);
    let rescored = 0;
    if (patch.weights !== undefined || patch.authority_source !== undefined) {
      rescored = await depot.recomputeScores(db, updated);
    }
    return json({ ok: true, client: updated, rescored });
  }

  if ((p = path.match(/^\/clients\/([a-z0-9-]+)\/imports$/)) && m === 'POST') {
    const client = await depot.getClient(db, p[1]);
    if (!client) return json({ error: 'not_found' }, 404);
    let form;
    try {
      form = await request.formData();
    } catch {
      return json({ error: 'bad_request', message: 'envoi multipart attendu (champ « file »)' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file === 'string') return json({ error: 'bad_request', message: 'champ « file » manquant' }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'too_large', message: 'fichier > 5 Mo' }, 413);
    const imported = importCsv(await file.text(), { clientDomain: client.domain, competitors: client.competitors });
    if (imported.error) return json(imported, 422);
    const { created, updated } = await depot.upsertOpportunities(db, client, imported, { filename: file.name });
    return json({
      ok: true,
      source: imported.source,
      rows: imported.rowCount,
      created,
      updated,
      skipped: imported.skipped.length,
      skippedDetail: imported.skipped.slice(0, 50),
    });
  }

  if ((p = path.match(/^\/clients\/([a-z0-9-]+)\/opportunities$/)) && m === 'GET') {
    const status = url.searchParams.get('status') || undefined;
    if (status && !STATUSES.includes(status)) return json({ error: 'bad_request', message: 'statut inconnu' }, 400);
    const opportunities = await depot.listOpportunities(db, p[1], {
      status,
      method: url.searchParams.get('method') || undefined,
      sort: url.searchParams.get('sort') || undefined,
    });
    return json({ opportunities });
  }

  if ((p = path.match(/^\/opportunities\/([0-9a-f-]{36})$/)) && m === 'GET') {
    const opp = await depot.getOpportunity(db, p[1]);
    if (!opp) return json({ error: 'not_found' }, 404);
    const [events, checks] = await Promise.all([depot.listEvents(db, opp.id), depot.listChecks(db, opp.id)]);
    return json({ opportunity: opp, events, checks });
  }

  if ((p = path.match(/^\/opportunities\/([0-9a-f-]{36})$/)) && m === 'PATCH') {
    const opp = await depot.getOpportunity(db, p[1]);
    if (!opp) return json({ error: 'not_found' }, 404);
    const body = await safeJson(request);
    if (!body || typeof body !== 'object') return json({ error: 'bad_request', message: 'JSON attendu' }, 400);
    let fields = {};
    if (body.status !== undefined && body.status !== opp.status) {
      const plan = planTransition(opp, body.status, body);
      if (plan.error) return json({ error: 'bad_request', message: plan.error }, 400);
      fields = plan.fields;
    } else {
      if (body.next_followup_at !== undefined) {
        if (body.next_followup_at !== null && !/^\d{4}-\d{2}-\d{2}$/.test(body.next_followup_at)) {
          return json({ error: 'bad_request', message: 'next_followup_at doit être au format AAAA-MM-JJ' }, 400);
        }
        fields.next_followup_at = body.next_followup_at;
      }
      if (body.link_url !== undefined) {
        if (body.link_url !== null && !isHttpUrl(body.link_url)) {
          return json({ error: 'bad_request', message: 'link_url doit être une URL http/https' }, 400);
        }
        fields.link_url = body.link_url;
      }
    }
    if (body.contact_note !== undefined) fields.contact_note = body.contact_note ? String(body.contact_note).slice(0, 2000) : null;
    if (!Object.keys(fields).length) return json({ error: 'bad_request', message: 'rien à modifier' }, 400);
    await depot.updateOpportunity(db, opp, fields, body.note);
    let check = null;
    if (fields.status === 'obtenu') check = await runCheck(db, { ...opp, ...fields });
    return json({ ok: true, opportunity: await depot.getOpportunity(db, opp.id), check });
  }

  if ((p = path.match(/^\/opportunities\/([0-9a-f-]{36})\/check$/)) && m === 'POST') {
    const opp = await depot.getOpportunity(db, p[1]);
    if (!opp) return json({ error: 'not_found' }, 404);
    if (!opp.link_url) return json({ error: 'bad_request', message: 'aucune URL de lien enregistrée' }, 400);
    const check = await runCheck(db, opp);
    return json({ ok: true, check, opportunity: await depot.getOpportunity(db, opp.id) });
  }

  if (path === '/followups' && m === 'GET') {
    const today = new Date().toISOString().slice(0, 10);
    const [followups, lost] = await Promise.all([depot.dueFollowups(db, today), depot.lostLinks(db)]);
    return json({ today, followups, lost });
  }

  return json({ error: 'not_found' }, 404);
}

/**
 * Vérifie un lien, enregistre le contrôle et fait évoluer le statut :
 * obtenu → perdu après deux échecs consécutifs ; perdu → obtenu si le lien
 * est revenu.
 */
export async function runCheck(db, opp, fetchImpl = fetch) {
  const clientDomain = opp.client_domain || await depot.clientDomainOf(db, opp.client_id);
  const check = await checkLink(opp.link_url, clientDomain, fetchImpl);
  await depot.recordCheck(db, opp.id, check);
  const live = check.result === 'live_dofollow' || check.result === 'live_nofollow';
  if (opp.status === 'obtenu' && !live) {
    const last = await depot.lastCheckResults(db, opp.id, 2);
    if (shouldMarkLost(last)) {
      await depot.updateOpportunity(db, opp, { status: 'perdu' }, `vérification auto : ${check.result} deux fois de suite`);
    }
  } else if (opp.status === 'perdu' && live) {
    await depot.updateOpportunity(db, opp, { status: 'obtenu' }, `vérification auto : lien retrouvé (${check.result})`);
  }
  return check;
}

export async function runScheduledChecks(env, fetchImpl = fetch) {
  if (!env.DB) return { checked: 0 };
  const limit = Number(env.CHECK_BATCH) || 40;
  const everyDays = Number(env.CHECK_EVERY_DAYS) || 7;
  const due = await depot.linksToCheck(env.DB, limit, everyDays);
  const summary = {};
  for (const opp of due) {
    try {
      const { result } = await runCheck(env.DB, opp, fetchImpl);
      summary[result] = (summary[result] || 0) + 1;
    } catch (e) {
      console.error(JSON.stringify({ msg: 'check.failed', id: opp.id, err: String(e) }));
    }
  }
  console.log(JSON.stringify({ msg: 'cron.checks', checked: due.length, summary }));
  return { checked: due.length, summary };
}

/* ---------- validation ---------- */

function normalizeCompetitors(list) {
  if (list === undefined) return { competitors: [] };
  if (!Array.isArray(list)) return { error: 'competitors doit être une liste de domaines' };
  const out = [];
  for (const raw of list) {
    const d = normalizeDomain(raw);
    if (!d) return { error: `domaine concurrent invalide : ${raw}` };
    if (!out.includes(d)) out.push(d);
  }
  if (out.length > MAX_COMPETITORS) return { error: `${MAX_COMPETITORS} concurrents maximum` };
  return { competitors: out };
}

export function validateNewClient(body) {
  if (!body || typeof body !== 'object') return { error: 'JSON attendu' };
  const name = String(body.name || '').trim();
  if (name.length < 2) return { error: 'name requis' };
  const domain = normalizeDomain(body.domain);
  if (!domain) return { error: 'domain invalide' };
  const id = body.id ? String(body.id) : slugify(name);
  if (!/^[a-z0-9-]{2,60}$/.test(id)) return { error: 'id invalide (a-z, 0-9, tirets)' };
  const { error, competitors } = normalizeCompetitors(body.competitors);
  if (error) return { error };
  if (competitors.includes(domain)) return { error: 'le domaine du client ne peut pas être son propre concurrent' };
  let weights = null;
  if (body.weights !== undefined && body.weights !== null) {
    weights = validateWeights(body.weights);
    if (!weights) return { error: 'weights invalide ({authority, ease} ≥ 0)' };
  }
  const authority_source = body.authority_source || 'semrush';
  if (!AUTHORITY_SOURCES.includes(authority_source)) return { error: 'authority_source : semrush ou ahrefs' };
  return {
    client: {
      id, name, domain, competitors, weights, authority_source,
      sector: body.sector ? String(body.sector).slice(0, 200) : null,
      is_local: Boolean(body.is_local),
    },
  };
}

export function validateClientPatch(body) {
  if (!body || typeof body !== 'object') return { error: 'JSON attendu' };
  const patch = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (name.length < 2) return { error: 'name invalide' };
    patch.name = name;
  }
  if (body.domain !== undefined) {
    const domain = normalizeDomain(body.domain);
    if (!domain) return { error: 'domain invalide' };
    patch.domain = domain;
  }
  if (body.sector !== undefined) patch.sector = body.sector ? String(body.sector).slice(0, 200) : null;
  if (body.is_local !== undefined) patch.is_local = Boolean(body.is_local);
  if (body.competitors !== undefined) {
    const { error, competitors } = normalizeCompetitors(body.competitors);
    if (error) return { error };
    patch.competitors = competitors;
  }
  if (body.weights !== undefined) {
    if (body.weights === null) patch.weights = null;
    else {
      const w = validateWeights(body.weights);
      if (!w) return { error: 'weights invalide ({authority, ease} ≥ 0)' };
      patch.weights = w;
    }
  }
  if (body.authority_source !== undefined) {
    if (!AUTHORITY_SOURCES.includes(body.authority_source)) return { error: 'authority_source : semrush ou ahrefs' };
    patch.authority_source = body.authority_source;
  }
  if (!Object.keys(patch).length) return { error: 'rien à modifier' };
  return { patch };
}

/* ---------- utilitaires ---------- */

async function safeJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkWassimAuth(request, env) {
  const expected = env.WASSIM_AUTH_TOKEN;
  if (!expected) {
    return jsonResponse({ error: 'unauthorized', reason: 'WASSIM_AUTH_TOKEN missing' }, 401, request, env);
  }
  const got = request.headers.get('X-Wassim-Auth') || '';
  if (!timingSafeEqual(got, expected)) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  return null;
}
