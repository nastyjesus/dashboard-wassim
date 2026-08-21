// Client Search Console API v3 (searchanalytics.query).
// En MOCK_MODE (ou sans credentials Google), renvoie des données de démonstration
// clairement flaguées `mock: true` — jamais mélangées à de la vraie data.

import { getAccessToken, hasGoogleCreds } from './google-auth.js';
import { mockDailySeries, mockTopTables, mockBreakdowns } from './mocks.js';
import { aggregateMonth } from './report.js';

export class GscClient {
  constructor(env) {
    this.env = env;
    this.base = env.GSC_API_BASE || 'https://searchconsole.googleapis.com';
    this.mock = (env.MOCK_MODE || '').toLowerCase() === 'true' || !hasGoogleCreds(env);
  }

  /**
   * Pull complet pour un rapport-audit : série quotidienne couvrant tout
   * l'intervalle (7 mois — comparaisons 1/3/6 mois + tendance), top requêtes et
   * pages du mois analysé ET du mois précédent (gagnants/perdants), répartition
   * par appareil, pays et apparence dans les résultats.
   * @param {string} property propriété GSC (`sc-domain:example.fr` ou `https://example.fr/`)
   * @param {string} rangeStart YYYY-MM-DD (début du mois le plus ancien)
   * @param {{startDate:string, endDate:string}} currentBounds mois analysé
   * @param {{startDate:string, endDate:string}} [prevBounds] mois précédent (comparaison requêtes/pages)
   * @returns {Promise<{daily: array, queries: array, pages: array, queriesPrev: array,
   *   pagesPrev: array, devices: array, countries: array, appearance: array, mock: boolean}>}
   */
  async fetchReportData(property, rangeStart, currentBounds, prevBounds) {
    if (this.mock) {
      const daily = mockDailySeries(property, rangeStart, currentBounds.endDate);
      const { totals } = aggregateMonth(daily, currentBounds);
      const { queries, pages } = mockTopTables(property, totals);
      const prevTotals = { clicks: Math.round(totals.clicks * 0.85), impressions: Math.round(totals.impressions * 0.85) };
      const prev = mockTopTables(`${property}|prev`, prevTotals);
      const { devices, countries } = mockBreakdowns(property, totals);
      return {
        daily, queries, pages,
        queriesPrev: prev.queries, pagesPrev: prev.pages,
        devices, countries, appearance: [], mock: true,
      };
    }

    const cur = { startDate: currentBounds.startDate, endDate: currentBounds.endDate };
    const prev = prevBounds ? { startDate: prevBounds.startDate, endDate: prevBounds.endDate } : null;
    // Dimensions secondaires en best-effort : une erreur ne fait pas échouer
    // le rapport (les KPIs et mots-clés du mois restent la donnée maîtresse).
    const soft = (p) => p.catch(() => ({ rows: [] }));
    const [dailyRes, queriesRes, pagesRes, queriesPrevRes, pagesPrevRes, devicesRes, countriesRes, appearanceRes] = await Promise.all([
      this.query(property, {
        startDate: rangeStart,
        endDate: currentBounds.endDate,
        dimensions: ['date'],
        rowLimit: 1000, // ~215 jours pour 7 mois — large marge
      }),
      this.query(property, { ...cur, dimensions: ['query'], rowLimit: 250 }),
      this.query(property, { ...cur, dimensions: ['page'], rowLimit: 100 }),
      prev ? soft(this.query(property, { ...prev, dimensions: ['query'], rowLimit: 250 })) : Promise.resolve({ rows: [] }),
      prev ? soft(this.query(property, { ...prev, dimensions: ['page'], rowLimit: 100 })) : Promise.resolve({ rows: [] }),
      soft(this.query(property, { ...cur, dimensions: ['device'] })),
      soft(this.query(property, { ...cur, dimensions: ['country'], rowLimit: 10 })),
      // Apparences dans les résultats (searchAppearance). C'est ici que Google
      // exposera le trafic AI Overviews s'il le publie un jour dans l'API —
      // pour l'instant il est fondu dans les totaux.
      soft(this.query(property, { ...cur, dimensions: ['searchAppearance'], rowLimit: 25 })),
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
      queriesPrev: queriesPrevRes.rows || [],
      pagesPrev: pagesPrevRes.rows || [],
      devices: devicesRes.rows || [],
      countries: countriesRes.rows || [],
      appearance: appearanceRes.rows || [],
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
