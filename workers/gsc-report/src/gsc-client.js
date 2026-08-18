// Client Search Console API v3 (searchanalytics.query).
// En MOCK_MODE (ou sans credentials Google), renvoie des données de démonstration
// clairement flaguées `mock: true` — jamais mélangées à de la vraie data.

import { getAccessToken, hasGoogleCreds } from './google-auth.js';
import { mockDailySeries, mockTopTables } from './mocks.js';
import { aggregateMonth } from './report.js';

export class GscClient {
  constructor(env) {
    this.env = env;
    this.base = env.GSC_API_BASE || 'https://searchconsole.googleapis.com';
    this.mock = (env.MOCK_MODE || '').toLowerCase() === 'true' || !hasGoogleCreds(env);
  }

  /**
   * Pull complet pour un rapport : série quotidienne couvrant tout l'intervalle
   * (7 mois — comparaisons 1/3/6 mois + tendance), et top requêtes / top pages
   * du mois analysé uniquement.
   * @param {string} property propriété GSC (`sc-domain:example.fr` ou `https://example.fr/`)
   * @param {string} rangeStart YYYY-MM-DD (début du mois le plus ancien)
   * @param {{startDate:string, endDate:string}} currentBounds mois analysé
   * @returns {Promise<{daily: array, queries: array, pages: array, mock: boolean}>}
   */
  async fetchReportData(property, rangeStart, currentBounds) {
    if (this.mock) {
      const daily = mockDailySeries(property, rangeStart, currentBounds.endDate);
      const { totals } = aggregateMonth(daily, currentBounds);
      const { queries, pages } = mockTopTables(property, totals);
      return { daily, queries, pages, mock: true };
    }

    const [dailyRes, queriesRes, pagesRes] = await Promise.all([
      this.query(property, {
        startDate: rangeStart,
        endDate: currentBounds.endDate,
        dimensions: ['date'],
        rowLimit: 1000, // ~215 jours pour 7 mois — large marge
      }),
      this.query(property, {
        startDate: currentBounds.startDate,
        endDate: currentBounds.endDate,
        dimensions: ['query'],
        rowLimit: 10,
      }),
      this.query(property, {
        startDate: currentBounds.startDate,
        endDate: currentBounds.endDate,
        dimensions: ['page'],
        rowLimit: 10,
      }),
    ]);

    const daily = (dailyRes.rows || [])
      .map((r) => ({
        date: r.keys[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
        position: r.position || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      daily,
      queries: queriesRes.rows || [],
      pages: pagesRes.rows || [],
      mock: false,
    };
  }

  /** Appel brut searchanalytics.query. */
  async query(property, body) {
    const token = await getAccessToken(this.env);
    const url = `${this.base}/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      const err = new Error(`gsc.query ${res.status}: ${text.slice(0, 200)}`);
      err.status = res.status === 403 || res.status === 404 ? res.status : 502;
      throw err;
    }
    return res.json();
  }
}
