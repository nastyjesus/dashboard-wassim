// Worker gsc-report-wassim — point d'entrée.
// Rapport GSC mensuel automatisé pour les clients SEO de Wassim :
//   - cron le 3 du mois → un rapport HTML par client (mois précédent complet),
//   - stockage KV (config clients + rapports), lien public non-devinable /r/:slug,
//   - log optionnel dans la page Notion du client.
//
// Endpoints :
//   GET  /health          — public
//   GET  /r/:slug         — public (rapport HTML, slug non-devinable, noindex)
//   GET  /clients         — auth  (config clients)
//   PUT  /clients         — auth  (remplace la config : [{id,name,property,notionPageId?,compare?}])
//   POST /run             — auth  (run manuel : {client?, period? "YYYY-MM", notion? bool})
//   GET  /reports         — auth  (index des rapports générés, filtre ?client=)
//   GET  /latest          — auth  (dernier rapport par client — pour le dashboard)

import { GscClient } from './gsc-client.js';
import { resolveMonths, buildReport } from './report.js';
import { renderReport } from './render.js';
import { logReportToNotion, notionConfigured } from './notion-log.js';
import { jsonResponse, preflightResponse } from './cors.js';
import { logger } from './logger.js';
import { MOCK_CLIENTS } from './mocks.js';

const CLIENTS_KEY = 'config:clients';

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return jsonResponse({ ok: true, mock: isMock(env), ts: new Date().toISOString() }, 200, request, env);
    }

    // Rapport public — le slug (aléatoire, 26+ caractères) fait office de capacité.
    const slugMatch = path.match(/^\/r\/([a-z0-9]+)$/);
    if (slugMatch && request.method === 'GET') {
      if (!env.REPORTS) return htmlError('Stockage indisponible', 503);
      const ref = await env.REPORTS.get(`slug:${slugMatch[1]}`);
      if (!ref) return htmlError('Rapport introuvable', 404);
      const stored = await env.REPORTS.get(ref, 'json');
      if (!stored) return htmlError('Rapport introuvable', 404);
      return new Response(stored.html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' },
      });
    }

    const authError = checkWassimAuth(request, env);
    if (authError) return authError;

    try {
      if (path === '/clients' && request.method === 'GET') {
        const clients = await getClients(env);
        return jsonResponse({ clients, mock: isMock(env) }, 200, request, env);
      }

      if (path === '/clients' && request.method === 'PUT') {
        const body = await safeJson(request);
        const invalid = validateClients(body);
        if (invalid) return jsonResponse({ error: 'bad_request', message: invalid }, 400, request, env);
        if (!env.REPORTS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        await env.REPORTS.put(CLIENTS_KEY, JSON.stringify(body));
        return jsonResponse({ ok: true, count: body.length }, 200, request, env);
      }

      if (path === '/run' && request.method === 'POST') {
        const body = (await safeJson(request)) || {};
        const result = await runReports(env, url.origin, {
          clientId: body.client,
          periodKey: body.period,
          notion: body.notion !== false,
        });
        return jsonResponse(result, 200, request, env);
      }

      if (path === '/reports' && request.method === 'GET') {
        if (!env.REPORTS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const clientFilter = url.searchParams.get('client');
        const prefix = clientFilter ? `report:${clientFilter}:` : 'report:';
        const list = await env.REPORTS.list({ prefix });
        const reports = [];
        for (const k of list.keys) {
          const stored = await env.REPORTS.get(k.name, 'json');
          if (stored) reports.push(indexEntry(stored, url.origin));
        }
        reports.sort((a, b) => b.period.localeCompare(a.period));
        return jsonResponse({ reports }, 200, request, env);
      }

      if (path === '/latest' && request.method === 'GET') {
        if (!env.REPORTS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const list = await env.REPORTS.list({ prefix: 'report:' });
        const byClient = {};
        for (const k of list.keys) {
          const stored = await env.REPORTS.get(k.name, 'json');
          if (!stored) continue;
          const entry = indexEntry(stored, url.origin);
          const prev = byClient[entry.clientId];
          if (!prev || entry.period > prev.period) byClient[entry.clientId] = entry;
        }
        return jsonResponse({ latest: byClient }, 200, request, env);
      }

      return jsonResponse({ error: 'not_found', path }, 404, request, env);
    } catch (err) {
      logger.error('worker.error', { err: String(err), path });
      const status = err && typeof err === 'object' && 'status' in err ? err.status : 500;
      return jsonResponse({ error: 'worker_error', message: err.message || 'unknown' }, status || 500, request, env);
    }
  },

  /** Cron mensuel (le 3 à 6h UTC) — rapports du mois précédent pour tous les clients. */
  async scheduled(_event, env, ctx) {
    const origin = env.PUBLIC_BASE_URL || 'https://gsc-report-wassim.workers.dev';
    ctx.waitUntil(
      runReports(env, origin, { notion: true })
        .then((r) => logger.info('cron.reports.done', { generated: r.generated.length, errors: r.errors.length }))
        .catch((e) => logger.error('cron.reports.error', { err: String(e) })),
    );
  },
};

function isMock(env) {
  return (env.MOCK_MODE || '').toLowerCase() === 'true';
}

async function getClients(env) {
  if (env.REPORTS) {
    const stored = await env.REPORTS.get(CLIENTS_KEY, 'json');
    if (Array.isArray(stored) && stored.length) return stored;
  }
  // Aucune config encore : en mock on sert l'exemple, sinon liste vide.
  return isMock(env) ? MOCK_CLIENTS : [];
}

function validateClients(body) {
  if (!Array.isArray(body)) return 'expected an array of clients';
  for (const c of body) {
    if (!c || typeof c !== 'object') return 'each client must be an object';
    if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) return `invalid id: ${c && c.id}`;
    if (!c.name) return `missing name for ${c.id}`;
    if (!c.property) return `missing property for ${c.id}`;
  }
  return null;
}

/**
 * Génère les rapports (tous les clients, ou un seul).
 * @param {object} env
 * @param {string} origin base URL pour construire les liens /r/:slug
 * @param {{ clientId?: string, periodKey?: string, notion?: boolean }} opts
 */
async function runReports(env, origin, opts = {}) {
  const clients = await getClients(env);
  const targets = opts.clientId ? clients.filter((c) => c.id === opts.clientId) : clients;
  if (opts.clientId && !targets.length) {
    const err = new Error(`unknown client: ${opts.clientId}`);
    err.status = 404;
    throw err;
  }

  const gsc = new GscClient(env);
  const now = new Date();
  const generated = [];
  const errors = [];

  for (const client of targets) {
    try {
      const { months, current } = resolveMonths(now, opts.periodKey);
      const { daily, queries, pages, mock } = await gsc.fetchReportData(
        client.property,
        months[0].startDate,
        current,
      );
      const report = buildReport({
        client, months, daily, queries, pages, mock,
        generatedAt: new Date().toISOString(),
      });
      const html = renderReport(report);
      const slug = randomSlug();
      const reportUrl = `${origin}/r/${slug}`;
      const stored = { slug, url: reportUrl, data: report, html };

      if (env.REPORTS) {
        const key = `report:${client.id}:${current.key}`;
        // Un re-run du même mois remplace le rapport mais garde l'ancien slug
        // valide s'il existait (les liens déjà envoyés au client ne cassent pas).
        await env.REPORTS.put(key, JSON.stringify(stored));
        await env.REPORTS.put(`slug:${slug}`, key);
      }

      let notionLogged = false;
      if (opts.notion && client.notionPageId && notionConfigured(env)) {
        try {
          await logReportToNotion(env, client.notionPageId, report, reportUrl);
          notionLogged = true;
        } catch (e) {
          logger.error('notion.log.failed', { client: client.id, err: String(e) });
        }
      }

      generated.push({
        clientId: client.id,
        period: current.key,
        url: reportUrl,
        mock: report.meta.mock,
        notionLogged,
        kpis: summaryKpis(report),
      });
    } catch (e) {
      logger.error('report.failed', { client: client.id, err: String(e) });
      errors.push({ clientId: client.id, error: e.message || String(e) });
    }
  }

  return { generated, errors, mock: gsc.mock };
}

function summaryKpis(report) {
  const { kpis } = report;
  const one = (k) => ({
    value: k.current,
    deltas: { m1: k.horizons.m1.delta, m3: k.horizons.m3.delta, m6: k.horizons.m6.delta },
  });
  return {
    clicks: one(kpis.clicks),
    impressions: one(kpis.impressions),
    ctr: one(kpis.ctr),
    position: one(kpis.position),
  };
}

function indexEntry(stored, origin) {
  const m = stored.data.meta;
  return {
    clientId: m.clientId,
    clientName: m.clientName,
    property: m.property,
    period: m.period.key,
    periodLabel: m.period.label,
    generatedAt: m.generatedAt,
    mock: m.mock,
    url: `${origin}/r/${stored.slug}`,
    kpis: summaryKpis(stored.data),
  };
}

function randomSlug() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function checkWassimAuth(request, env) {
  const expected = env.WASSIM_AUTH_TOKEN;
  if (!expected) {
    if (isMock(env)) return null;
    return jsonResponse({ error: 'unauthorized', reason: 'WASSIM_AUTH_TOKEN missing' }, 401, request, env);
  }
  const got = request.headers.get('X-Wassim-Auth');
  if (got !== expected) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  return null;
}

async function safeJson(request) {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function htmlError(message, status) {
  return new Response(
    `<!DOCTYPE html><html lang="fr"><meta charset="utf-8"><title>${message}</title><body style="font-family:sans-serif;padding:40px;color:#1c2733"><h1 style="color:#1e3a5f">${message}</h1></body></html>`,
    { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}
