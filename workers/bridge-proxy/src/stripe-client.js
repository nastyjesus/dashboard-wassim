// Wrapper Stripe API v1 — read-only, conçu pour la page MyeFarm.
//
// Auth Stripe : `Authorization: Bearer rk_live_xxx` (ou sk_test_xxx en sandbox).
// Doc : https://stripe.com/docs/api
//
// La clé fournie DOIT être restricted (lecture seule) avec au minimum :
//   Balance / Balance transactions / Charges / Payouts / Customers (Read)
//   Subscriptions (Read) si tu vends en récurrent.
//
// Variables d'environnement attendues :
//   STRIPE_KEY  — la clé restricted ou secret (rk_live_… ou sk_test_…)

import { logger } from './logger.js';

const STRIPE_BASE_URL = 'https://api.stripe.com/v1';

export class StripeClient {
  constructor(env) {
    this.env = env;
    this.key = env.STRIPE_KEY || '';
    this.baseUrl = (env.STRIPE_BASE_URL || STRIPE_BASE_URL).replace(/\/+$/, '');
  }

  headers() {
    return {
      Authorization: `Bearer ${this.key}`,
      Accept: 'application/json',
    };
  }

  async #fetch(path) {
    const res = await fetch(`${this.baseUrl}${path}`, { headers: this.headers() });
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!res.ok) {
      const msg = body?.error?.message || body?.error || text || 'unknown';
      throw new StripeError(`Stripe ${res.status} ${path}: ${msg}`, res.status);
    }
    return body;
  }

  /**
   * Construit un résumé MyeFarm en un seul appel :
   *  - solde disponible / pending
   *  - revenus & volume des 30 derniers jours
   *  - prochain payout
   *  - 25 derniers paiements
   *  - 10 derniers payouts
   */
  async summary() {
    const since = Math.floor((Date.now() - 30 * 24 * 3600 * 1000) / 1000);
    const [balance, charges, payouts, upcoming] = await Promise.all([
      this.#fetch('/balance'),
      this.#fetch(`/charges?limit=100&created[gte]=${since}`),
      this.#fetch('/payouts?limit=10'),
      this.#fetch('/payouts?status=pending&limit=1'),
    ]);

    const available = sumEntries(balance?.available);
    const pending = sumEntries(balance?.pending);
    const recentCharges = Array.isArray(charges?.data) ? charges.data : [];
    const okCharges = recentCharges.filter((c) => c.paid && !c.refunded);
    const refundedCount = recentCharges.filter((c) => c.refunded).length;
    const totalRevenueCents = okCharges.reduce((sum, c) => sum + (c.amount_captured || c.amount || 0), 0);
    const avgCents = okCharges.length ? Math.round(totalRevenueCents / okCharges.length) : 0;
    const nextPayout = upcoming?.data?.[0] || null;

    return {
      balance: {
        available_cents: available.cents,
        available_currency: available.currency,
        pending_cents: pending.cents,
        pending_currency: pending.currency,
      },
      last_30d: {
        revenue_cents: totalRevenueCents,
        currency: okCharges[0]?.currency?.toUpperCase() || available.currency || 'EUR',
        charge_count: okCharges.length,
        refunded_count: refundedCount,
        avg_cents: avgCents,
      },
      next_payout: nextPayout ? {
        amount_cents: nextPayout.amount,
        currency: nextPayout.currency?.toUpperCase() || 'EUR',
        arrival_date: nextPayout.arrival_date,
        status: nextPayout.status,
      } : null,
      charges: recentCharges.slice(0, 25).map(normalizeCharge),
      payouts: (Array.isArray(payouts?.data) ? payouts.data : []).map(normalizePayout),
    };
  }
}

/** Stripe renvoie une liste { amount, currency } par devise — on en prend une seule (EUR par défaut). */
function sumEntries(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return { cents: 0, currency: 'EUR' };
  const eur = arr.find((e) => (e.currency || '').toLowerCase() === 'eur') || arr[0];
  return { cents: Number(eur.amount || 0), currency: (eur.currency || 'EUR').toUpperCase() };
}

function normalizeCharge(c) {
  return {
    id: c.id,
    amount_cents: c.amount_captured || c.amount || 0,
    currency: (c.currency || 'EUR').toUpperCase(),
    status: c.refunded ? 'refunded' : (c.paid ? 'paid' : c.status),
    description: c.description || c.statement_descriptor || c.calculated_statement_descriptor || '',
    customer_email: c.billing_details?.email || c.receipt_email || '',
    customer_name: c.billing_details?.name || '',
    created: c.created ? new Date(c.created * 1000).toISOString() : null,
  };
}

function normalizePayout(p) {
  return {
    id: p.id,
    amount_cents: p.amount || 0,
    currency: (p.currency || 'EUR').toUpperCase(),
    status: p.status,
    method: p.method,
    arrival_date: p.arrival_date,
    created: p.created ? new Date(p.created * 1000).toISOString() : null,
  };
}

export function hasStripeCreds(env) {
  return !!(env && env.STRIPE_KEY);
}

export class StripeError extends Error {
  constructor(msg, status) {
    super(msg);
    this.name = 'StripeError';
    this.status = status;
  }
}
