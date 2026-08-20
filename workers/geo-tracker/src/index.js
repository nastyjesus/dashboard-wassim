// Worker geo-tracker-wassim — point d'entrée.
// Tracker GEO maison : les 1er et 15 du mois, interroge les moteurs IA
// (Perplexity, Claude, ChatGPT, Gemini) sur les prompts cibles de chaque
// client, détecte mentions et citations du domaine, stocke l'historique en KV
// et logge un récap dans la page Notion du client.
//
// Endpoints :
//   GET  /health          — public
//   GET  /clients         — auth  (config clients)
//   PUT  /clients         — auth  (remplace la config : [{id,name,domain,prompts[],aliases?,notionPageId?}])
//   POST /run             — auth  (run manuel : {client?, notion? bool})
//   GET  /runs?client=id  — auth  (historique des relevés — résumés ; &date=YYYY-MM-DD pour le détail complet)
//   GET  /latest          — auth  (dernier relevé par client — pour le dashboard)

import { enabledEngines, askEngine, isMock } from './engines.js';
import { analyzeAnswer, summarize } from './detect.js';
import { logRunToNotion, notionConfigured } from './notion-log.js';
import { jsonResponse, preflightResponse } from './cors.js';
import { logger } from './logger.js';
import { MOCK_CLIENTS } from './mocks.js';

const CLIENTS_KEY = 'config:clients';
const MAX_PROMPTS = 20;
/** Extrait de réponse conservé pour la traçabilité (pas la réponse entière). */
const EXCERPT_LEN = 300;

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health' || path === '/') {
      return jsonResponse(
        { ok: true, mock: isMock(env), engines: enabledEngines(env), ts: new Date().toISOString() },
        200, request, env,
      );
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
        if (!env.RUNS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        await env.RUNS.put(CLIENTS_KEY, JSON.stringify(body));
        return jsonResponse({ ok: true, count: body.length }, 200, request, env);
      }

      if (path === '/run' && request.method === 'POST') {
        const body = (await safeJson(request)) || {};
        const result = await runTracking(env, {
          clientId: body.client,
          notion: body.notion !== false,
        });
        return jsonResponse(result, 200, request, env);
      }

      if (path === '/runs' && request.method === 'GET') {
        if (!env.RUNS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const clientId = url.searchParams.get('client');
        if (!clientId) return jsonResponse({ error: 'bad_request', message: 'client param required' }, 400, request, env);
        const date = url.searchParams.get('date');
        if (date) {
          const full = await env.RUNS.get(`run:${clientId}:${date}`, 'json');
          if (!full) return jsonResponse({ error: 'not_found' }, 404, request, env);
          return jsonResponse({ run: full }, 200, request, env);
        }
        const runs = await listRuns(env, clientId);
        return jsonResponse({ runs: runs.map(runSummary) }, 200, request, env);
      }

      if (path === '/latest' && request.method === 'GET') {
        if (!env.RUNS) return jsonResponse({ error: 'kv_not_bound' }, 503, request, env);
        const clients = await getClients(env);
        const latest = {};
        for (const client of clients) {
          const runs = await listRuns(env, client.id);
          if (runs.length) latest[client.id] = runSummary(runs[runs.length - 1]);
        }
        return jsonResponse({ latest }, 200, request, env);
      }

      return jsonResponse({ error: 'not_found', path }, 404, request, env);
    } catch (err) {
      logger.error('worker.error', { err: String(err), path });
      const status = err && typeof err === 'object' && 'status' in err ? err.status : 500;
      return jsonResponse({ error: 'worker_error', message: err.message || 'unknown' }, status || 500, request, env);
    }
  },

  /** Cron bi-mensuel (1er et 15 à 6h UTC) — relevé pour tous les clients. */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runTracking(env, { notion: true })
        .then((r) => logger.info('cron.tracking.done', { tracked: r.tracked.length, errors: r.errors.length }))
        .catch((e) => logger.error('cron.tracking.error', { err: String(e) })),
    );
  },
};

async function getClients(env) {
  if (env.RUNS) {
    const stored = await env.RUNS.get(CLIENTS_KEY, 'json');
    if (Array.isArray(stored) && stored.length) return stored;
  }
  return isMock(env) ? MOCK_CLIENTS : [];
}

function validateClients(body) {
  if (!Array.isArray(body)) return 'expected an array of clients';
  for (const c of body) {
    if (!c || typeof c !== 'object') return 'each client must be an object';
    if (!c.id || !/^[a-z0-9-]+$/.test(c.id)) return `invalid id: ${c && c.id}`;
    if (!c.name) return `missing name for ${c.id}`;
    // Domaine optionnel (pro sans site, visible via sa fiche Google) — mais il
    // faut alors des alias pour détecter les mentions.
    if (c.domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(c.domain)) return `invalid domain for ${c.id}`;
    if (!c.domain && (!Array.isArray(c.aliases) || !c.aliases.length)) {
      return `client ${c.id} needs a domain or at least one alias`;
    }
    if (!Array.isArray(c.prompts) || !c.prompts.length) return `missing prompts for ${c.id}`;
    if (c.prompts.length > MAX_PROMPTS) return `too many prompts for ${c.id} (max ${MAX_PROMPTS})`;
    if (c.prompts.some((p) => typeof p !== 'string' || !p.trim())) return `empty prompt for ${c.id}`;
    if (c.aliases && (!Array.isArray(c.aliases) || c.aliases.some((a) => typeof a !== 'string'))) {
      return `invalid aliases for ${c.id}`;
    }
  }
  return null;
}

/**
 * Lance le tracking (tous les clients, ou un seul).
 * @param {object} env
 * @param {{ clientId?: string, notion?: boolean }} opts
 */
async function runTracking(env, opts = {}) {
  const clients = await getClients(env);
  const targets = opts.clientId ? clients.filter((c) => c.id === opts.clientId) : clients;
  if (opts.clientId && !targets.length) {
    const err = new Error(`unknown client: ${opts.clientId}`);
    err.status = 404;
    throw err;
  }

  const date = new Date().toISOString().slice(0, 10);
  const engines = enabledEngines(env);
  const tracked = [];
  const errors = [];

  for (const client of targets) {
    try {
      const engineResults = {};
      for (const engine of engines) {
        try {
          const results = await Promise.all(
            client.prompts.map(async (prompt) => {
              const answer = await askEngine(env, engine, prompt, client, date);
              const analysis = analyzeAnswer(answer, client);
              return {
                prompt,
                ...analysis,
                excerpt: (answer.text || '').slice(0, EXCERPT_LEN),
              };
            }),
          );
          engineResults[engine] = { ok: true, results };
        } catch (e) {
          logger.error('engine.failed', { engine, client: client.id, err: String(e) });
          engineResults[engine] = { ok: false, error: e.message || String(e) };
        }
      }

      const run = {
        clientId: client.id,
        clientName: client.name,
        domain: client.domain,
        date,
        mock: isMock(env),
        engines: engineResults,
        summary: summarize(engineResults, client),
      };

      let previousRun = null;
      if (env.RUNS) {
        const history = await listRuns(env, client.id);
        previousRun = [...history].reverse().find((r) => r.date < date) || null;
        await env.RUNS.put(`run:${client.id}:${date}`, JSON.stringify(run));
      }

      let notionLogged = false;
      let notionError;
      if (opts.notion && client.notionPageId && notionConfigured(env)) {
        try {
          await logRunToNotion(env, client.notionPageId, run, previousRun);
          notionLogged = true;
        } catch (e) {
          logger.error('notion.log.failed', { client: client.id, err: String(e) });
          notionError = String(e.message || e).slice(0, 300);
        }
      } else if (opts.notion && client.notionPageId) {
        notionError = 'NOTION_TOKEN absent du worker';
      }

      tracked.push({ ...runSummary(run), notionLogged, ...(notionError ? { notionError } : {}) });
    } catch (e) {
      logger.error('tracking.failed', { client: client.id, err: String(e) });
      errors.push({ clientId: client.id, error: e.message || String(e) });
    }
  }

  return { tracked, errors, mock: isMock(env), engines };
}

/** Historique complet d'un client, trié par date croissante. */
async function listRuns(env, clientId) {
  const list = await env.RUNS.list({ prefix: `run:${clientId}:` });
  const runs = [];
  for (const k of list.keys) {
    const run = await env.RUNS.get(k.name, 'json');
    if (run) runs.push(run);
  }
  runs.sort((a, b) => a.date.localeCompare(b.date));
  return runs;
}

function runSummary(run) {
  return {
    clientId: run.clientId,
    clientName: run.clientName,
    domain: run.domain,
    date: run.date,
    mock: run.mock,
    summary: run.summary,
  };
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
