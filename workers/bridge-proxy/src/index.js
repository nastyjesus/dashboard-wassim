// Worker bridge-proxy-wassim — point d'entrée.
// - Endpoints REST consommés par le dashboard (page Finances).
// - Cron qui lance /sync trois fois par jour.

import { BridgeClient } from './bridge-client.js';
import { QontoClient, hasQontoCreds } from './qonto-client.js';
import { StripeClient, hasStripeCreds } from './stripe-client.js';
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
        const { accounts, mock, sources } = await listAllAccounts(env);
        return jsonResponse({ accounts, mock, sources }, 200, request, env);
      }

      if (path === '/transactions' && request.method === 'GET') {
        const since = url.searchParams.get('since') || undefined;
        const { transactions, mock, sources } = await listAllTransactions(env, { since });
        return jsonResponse({ transactions, mock, sources }, 200, request, env);
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

      if (path === '/stripe/summary' && request.method === 'GET') {
        if (!hasStripeCreds(env)) {
          return jsonResponse({ error: 'stripe_not_configured', message: 'STRIPE_KEY missing' }, 503, request, env);
        }
        const stripe = new StripeClient(env);
        const data = await stripe.summary();
        return jsonResponse(data, 200, request, env);
      }

      if (path === '/scraped/ingest' && request.method === 'POST') {
        if (!env.SCRAPED) {
          return jsonResponse({ error: 'kv_not_bound', message: 'SCRAPED KV namespace not bound' }, 503, request, env);
        }
        const body = await safeJson(request);
        if (!body || !Array.isArray(body.accounts) || !Array.isArray(body.transactions)) {
          return jsonResponse({ error: 'bad_request', message: 'expected {accounts:[], transactions:[]}' }, 400, request, env);
        }
        // Bucket par banque slug (présent sur chaque compte/transaction)
        const buckets = {};
        for (const acc of body.accounts) {
          const slug = acc.bank_slug || 'unknown';
          (buckets[slug] ||= { accounts: [], transactions: [] }).accounts.push(acc);
        }
        const accountIdToSlug = new Map();
        for (const acc of body.accounts) accountIdToSlug.set(acc.id, acc.bank_slug);
        for (const tx of body.transactions) {
          const slug = accountIdToSlug.get(tx.account_id) || 'unknown';
          (buckets[slug] ||= { accounts: [], transactions: [] }).transactions.push(tx);
        }
        const scrapedAt = body.scraped_at || new Date().toISOString();
        for (const [slug, bucket] of Object.entries(buckets)) {
          if (slug === 'unknown') continue;
          await env.SCRAPED.put(`bank:${slug}`, JSON.stringify({ scraped_at: scrapedAt, ...bucket }));
        }
        return jsonResponse({ ok: true, banks: Object.keys(buckets), counts: Object.fromEntries(Object.entries(buckets).map(([k, v]) => [k, { accounts: v.accounts.length, transactions: v.transactions.length }])) }, 200, request, env);
      }

      const scrapedMatch = path.match(/^\/scraped\/([a-z0-9_-]+)$/);
      if (scrapedMatch && request.method === 'GET') {
        const slug = scrapedMatch[1];
        if (slug === 'ingest') return jsonResponse({ error: 'not_found', path }, 404, request, env);
        if (!env.SCRAPED) {
          return jsonResponse({ error: 'kv_not_bound', message: 'SCRAPED KV namespace not bound' }, 503, request, env);
        }
        const raw = await env.SCRAPED.get(`bank:${slug}`);
        if (!raw) return jsonResponse({ scraped_at: null, accounts: [], transactions: [], message: 'no data yet — cron has not run' }, 200, request, env);
        return jsonResponse(JSON.parse(raw), 200, request, env);
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
  const notion = new NotionClient(env);
  const { accounts, mock } = await listAllAccounts(env);
  const { transactions } = await listAllTransactions(env, {});
  const result = await runSync(notion, { accounts, transactions });
  return { ...result, mock };
}

/**
 * Compose les comptes depuis Bridge (ou mocks) + Qonto si credentials présents.
 * Les comptes Bridge `bank_name === 'Qonto'` sont écrasés par les vrais Qonto.
 */
async function listAllAccounts(env) {
  const bridge = new BridgeClient(env);
  const bridgeAccounts = await bridge.listAccounts();
  if (!hasQontoCreds(env)) {
    return { accounts: bridgeAccounts, mock: bridge.mock, sources: ['bridge'] };
  }
  const qonto = new QontoClient(env);
  const qontoAccounts = await qonto.listAccounts();
  const merged = [
    ...bridgeAccounts.filter((a) => a.bank_name !== 'Qonto'),
    ...qontoAccounts,
  ];
  return { accounts: merged, mock: bridge.mock, sources: ['bridge', 'qonto'] };
}

/**
 * Compose les transactions. Tout ce qui appartenait à un compte Bridge Qonto
 * (mock) est retiré et remplacé par les transactions Qonto réelles.
 */
async function listAllTransactions(env, opts) {
  const bridge = new BridgeClient(env);
  const bridgeTx = await bridge.listTransactions(opts);
  if (!hasQontoCreds(env)) {
    return { transactions: bridgeTx, mock: bridge.mock, sources: ['bridge'] };
  }
  const bridgeAccounts = await bridge.listAccounts();
  const qontoBridgeAccountIds = new Set(
    bridgeAccounts.filter((a) => a.bank_name === 'Qonto').map((a) => a.id),
  );
  const filtered = bridgeTx.filter((t) => !qontoBridgeAccountIds.has(t.account_id));
  const qonto = new QontoClient(env);
  const qontoTx = await qonto.listTransactions(opts);
  return { transactions: [...filtered, ...qontoTx], mock: bridge.mock, sources: ['bridge', 'qonto'] };
}
