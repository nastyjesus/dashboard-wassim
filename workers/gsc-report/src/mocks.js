// Données de démonstration — utilisées uniquement en MOCK_MODE, jamais mélangées
// à de la vraie data. Générateur déterministe (seed = propriété) pour que les
// tests et les démos soient reproductibles.

/** Petit PRNG déterministe (mulberry32). */
function rng(seedStr) {
  let h = 1779033703;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const MOCK_QUERIES = [
  'consultant seo rennes', 'audit seo prix', 'agence seo bretagne',
  'référencement naturel artisan', 'optimisation google my business',
  'expert seo pme', 'améliorer position google', 'seo local rennes',
  'refonte site vitrine seo', 'accompagnement seo mensuel',
];

const MOCK_PAGES = [
  '/', '/offres/audit-seo/', '/offres/abonnement-seo/', '/blog/seo-local/',
  '/blog/ctr-gsc/', '/contact/', '/a-propos/', '/blog/refonte-sans-perdre-seo/',
  '/offres/site-vitrine/', '/blog/position-moyenne/',
];

/**
 * Série quotidienne mock sur un intervalle (plusieurs mois). Tendance de fond
 * légèrement haussière + position qui s'améliore doucement, pour que les
 * comparaisons 1/3/6 mois de la démo soient parlantes.
 * @param {string} property
 * @param {string} startDate YYYY-MM-DD
 * @param {string} endDate YYYY-MM-DD
 * @returns {Array<{date:string, clicks:number, impressions:number, position:number}>}
 */
export function mockDailySeries(property, startDate, endDate) {
  const rand = rng(property);
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  const days = Math.round((end - start) / 86400000) + 1;

  const base = 8 + Math.floor(rand() * 40); // clics/jour de base
  const growth = 0.4 + rand() * 0.6; // progression sur tout l'intervalle (+40 à +100 %)
  const series = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    const weekday = d.getUTCDay();
    const weekendDip = weekday === 0 || weekday === 6 ? 0.55 : 1;
    const trendFactor = 1 + growth * (i / days);
    const clicks = Math.max(0, Math.round((base + (rand() - 0.35) * base) * weekendDip * trendFactor));
    const impressions = clicks * (14 + Math.round(rand() * 18));
    const position = Math.max(2, 24 - 10 * (i / days) + (rand() - 0.5) * 6);
    series.push({
      date: d.toISOString().slice(0, 10),
      clicks,
      impressions,
      position: Math.round(position * 10) / 10,
    });
  }
  return series;
}

/**
 * Top requêtes / top pages mock pour le mois analysé.
 * @param {string} property
 * @param {{clicks:number, impressions:number}} totals totaux du mois analysé
 */
export function mockTopTables(property, totals) {
  const rand = rng(`${property}|tables`);
  const queries = MOCK_QUERIES.map((q, i) => ({
    keys: [q],
    clicks: Math.max(1, Math.round(totals.clicks * (0.18 - i * 0.015) * (0.7 + rand() * 0.6))),
    impressions: Math.max(10, Math.round(totals.impressions * (0.12 - i * 0.008))),
    ctr: 0.01 + rand() * 0.08,
    position: 3 + rand() * 30,
  })).sort((a, b) => b.clicks - a.clicks);

  const pages = MOCK_PAGES.map((p, i) => ({
    keys: [`https://${property.replace('sc-domain:', '')}${p}`],
    clicks: Math.max(1, Math.round(totals.clicks * (0.2 - i * 0.016) * (0.7 + rand() * 0.6))),
    impressions: Math.max(10, Math.round(totals.impressions * (0.13 - i * 0.009))),
    ctr: 0.01 + rand() * 0.08,
    position: 3 + rand() * 30,
  })).sort((a, b) => b.clicks - a.clicks);

  return { queries, pages };
}

/** Clients d'exemple servis quand aucune config n'existe encore en KV (mock uniquement). */
export const MOCK_CLIENTS = [
  {
    id: 'demo-wassim',
    name: 'Wassim Loumi (démo)',
    property: 'sc-domain:wassimloumicorporate.fr',
  },
];
