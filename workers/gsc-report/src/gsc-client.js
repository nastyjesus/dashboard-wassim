// Client Search Console API v3 (searchanalytics.query).
// En MOCK_MODE (ou sans credentials Google), renvoie des données de démonstration
// clairement flaguées `mock: true` — jamais mélangées à de la vraie data.

import { getAccessToken, hasGoogleCreds } from './google-auth.js';
import { mockPeriodData } from './mocks.js';

export class GscClient {
  constructor(env) {
    this.env = env;
    this.base = env.GSC_API_BASE || 'https://searchconsole.googleapis.com';
    this.mock = (env.MOCK_MODE || '').toLowerCase() === 'true' || !hasGoogleCreds(env);
  }

  /**
   * Pull complet d'une période : totaux, série quotidienne, top requêtes, top pages.
   * @param {string} property propriété GSC (`sc-domain:example.fr` ou `https://example.fr/`)
   * @param {string} startDate YYYY-MM-DD
   * @param {string} endDate YYYY-MM-DD
   */
  async fetchPeriod(property, startDate, endDate) {
    if (this.mock) {
      return { ...mockPeriodData(property, startDate, endDate), mock: true };
    }
    const [daily, queries, pages] = await Promise.all([
      this.query(property, { startDate, endDate, dimensions: ['date'], rowLimit: 1000 }),
      this.query(property, { startDate, endDate, dimensions: ['query'], rowLimit: 10 }),
      this.query(property, { startDate, endDate, dimensions: ['page'], rowLimit: 10 }),
    ]);

    const series = (daily.rows || [])
      .map((r) => ({
        date: r.keys[0],
        clicks: r.clicks || 0,
        impressions: r.impressions || 0,
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const clicks = series.reduce((s, d) => s + d.clicks, 0);
    const impressions = series.reduce((s, d) => s + d.impressions, 0);
    // CTR et position moyens pondérés — recalculés depuis les lignes quotidiennes
    // pour rester exacts (la moyenne des moyennes serait fausse).
    const ctr = impressions ? clicks / impressions : 0;
    const posWeighted = (daily.rows || []).reduce(
      (s, r) => s + (r.position || 0) * (r.impressions || 0),
      0,
    );
    const position = impressions ? posWeighted / impressions : 0;

    return {
      totals: { clicks, impressions, ctr, position },
      series,
      queries: queries.rows || [],
      pages: pages.rows || [],
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
