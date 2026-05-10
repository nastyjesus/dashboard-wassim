// Worker bridge-proxy-wassim — point d'entrée.
// - Endpoints REST consommés par le dashboard (page Finances).
// - Cron qui lance /sync trois fois par jour.

import { BridgeClient } from './bridge-client.js';
import { NotionClient, runSync } from './notion-sync.js';
import { jsonResponse, preflightResponse } from './cors.js';
import { logger } from './logger.js';

export default {
  /**
   * Handler HTTP.
   * @param {Request} request
   * @param {object} env
   * @param {ExecutionContext} ctx
   */
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return preflightResponse(request, env);

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    // /health est public (pas d'auth) — utilisé pour le check uptime.
    if (path === '/health' || path === '/') {
      return jsonResponse({ ok: true, ts: new Date().toISOString() }, 200, request, env);
    }

    // Auth partagée entre dashboard et worker.
    const authError = checkWassimAuth(request, env);
    if (authError) return authError;

    try {
      if (path === '/accounts' && request.method === 'GET') {
        const bridge = new BridgeClient(env);
        const accounts = await bridge.listAccounts();
        return jsonResponse({ accounts, mock: bridge.mock }, 200, request, env);
      }

      if (path === '/transactions' && request.method === 'GET') {
        const bridge = new BridgeClient(env);
        const since = url.searchParams.get('since') || undefined;
        const transactions = await bridge.listTransactions({ since });
        return jsonResponse({ transactions, mock: bridge.mock }, 200, request, env);
      }

      if (path === '/auth/connect' && request.method === 'POST') {
        const body = await safeJson(request);
        const externalUserId = body?.external_user_id || 'wassim_loumi';
        const bridge = new BridgeClient(env);
        const session = await bridge.createConnectSession({ externalUserId });
        return jsonResponse({ session, mock: bridge.mock }, 200, request, env);
      }

      if (path === '/sync' && request.method === 'POST') {
        const result = await doSync(env);
        return jsonResponse(result, 200, request, env);
      }

      return jsonResponse({ error: 'not_found', path }, 404, request, env);
    } catch (err) {
      logger.error('worker.error', { err: String(err), path });
      const status = err && typeof err === 'object' && 'status' in err ? err.status : 500;
      return jsonResponse({ error: 'worker_error', message: err.message || 'unknown' }, status || 500, request, env);
    }
  },

  /**
   * Cron handler — déclenche /sync automatiquement.
   * @param {ScheduledController} _event
   * @param {object} env
   * @param {ExecutionContext} ctx
   */
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      doSync(env)
        .then((r) => logger.info('cron.sync.done', { created: r.created, updated: r.updated }))
        .catch((e) => logger.error('cron.sync.error', { err: String(e) })),
    );
  },
};

/**
 * Vérifie le header X-Wassim-Auth. Retourne une réponse d'erreur si invalide,
 * sinon `null`.
 */
function checkWassimAuth(request, env) {
  const expected = env.WASSIM_AUTH_TOKEN;
  // Si pas de token configuré ET qu'on est en mock, on autorise — utile en dev.
  if (!expected) {
    if ((env.MOCK_MODE || '').toLowerCase() === 'true') return null;
    return jsonResponse({ error: 'unauthorized', reason: 'WASSIM_AUTH_TOKEN missing' }, 401, request, env);
  }
  const got = request.headers.get('X-Wassim-Auth');
  if (got !== expected) return jsonResponse({ error: 'unauthorized' }, 401, request, env);
  return null;
}

async function safeJson(request) {
  // Apprentissage du worker précédent : éviter request.json() qui peut
  // poser problème sur certains edges. On lit en text puis JSON.parse.
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function doSync(env) {
  const bridge = new BridgeClient(env);
  const notion = new NotionClient(env);
  const accounts = await bridge.listAccounts();
  const transactions = await bridge.listTransactions({});
  const result = await runSync(notion, { accounts, transactions });
  return { ...result, mock: bridge.mock };
}
