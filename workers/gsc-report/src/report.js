// Construction du rapport : mois analysé + comparaisons à 1, 3 et 6 mois,
// deltas, tendance mensuelle sur 7 mois, insights factuels.
// Règle héritée du skill wassim-gsc-report : aucun chiffre inventé — tout est
// calculé depuis la data GSC (ou les mocks, flagués comme tels).

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Seuil de stabilité (cf. skill) : sous ±2 %, on parle de stabilité. */
const STABLE_THRESHOLD = 2;

/** Horizons de comparaison : mois analysé vs M-1, M-3, M-6. */
export const HORIZONS = [
  { id: 'm1', back: 1, label: '1 mois' },
  { id: 'm3', back: 3, label: '3 mois' },
  { id: 'm6', back: 6, label: '6 mois' },
];

/**
 * Bornes du mois calendaire situé `monthsBack` mois avant une date de référence.
 * @param {Date} ref
 * @param {number} monthsBack 1 = mois précédent, 2 = celui d'avant…
 */
export function monthBounds(ref, monthsBack) {
  const first = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth() - monthsBack, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return {
    startDate: first.toISOString().slice(0, 10),
    endDate: last.toISOString().slice(0, 10),
    label: `${MONTHS_FR[first.getUTCMonth()]} ${first.getUTCFullYear()}`,
    key: first.toISOString().slice(0, 7), // YYYY-MM
  };
}

/**
 * Résout les 7 mois du rapport : le mois analysé + les 6 mois qui précèdent
 * (nécessaires pour les comparaisons M-1 / M-3 / M-6 et la courbe de tendance).
 * @param {Date} now date du run (le cron tourne le 3 → mois précédent complet)
 * @param {string} [periodKey] YYYY-MM explicite (run manuel) — sinon mois précédent
 * @returns {{ months: object[], current: object }} months ordonnés du plus ancien au mois analysé
 */
export function resolveMonths(now, periodKey) {
  let backToCurrent = 1;
  if (periodKey) {
    const [y, m] = periodKey.split('-').map(Number);
    backToCurrent = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
  }
  const months = [];
  for (let back = backToCurrent + 6; back >= backToCurrent; back--) {
    months.push(monthBounds(now, back));
  }
  return { months, current: months[months.length - 1] };
}

/** Delta % signé, arrondi à une décimale. `null` si base à zéro. */
export function deltaPct(cur, prev) {
  if (!prev) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

/** Direction avec seuil de stabilité ±2 %. */
export function direction(delta) {
  if (delta === null || Math.abs(delta) < STABLE_THRESHOLD) return 'stable';
  return delta > 0 ? 'hausse' : 'baisse';
}

function fmtDelta(d) {
  if (d === null) return '—';
  const sign = d > 0 ? '+' : '';
  return `${sign}${String(d).replace('.', ',')}%`;
}

function fmtInt(n) {
  return Math.round(n).toLocaleString('fr-FR');
}

function fmtCtr(ctr) {
  return `${(ctr * 100).toFixed(1).replace('.', ',')}%`;
}

function fmtPos(p) {
  return p.toFixed(1).replace('.', ',');
}

/**
 * Agrège les lignes quotidiennes GSC d'un mois : totaux + série.
 * CTR et position recalculés en pondéré (la moyenne des moyennes serait fausse).
 * @param {Array<{date:string, clicks:number, impressions:number, position:number}>} daily
 * @param {{startDate:string, endDate:string}} bounds
 */
export function aggregateMonth(daily, bounds) {
  const series = daily
    .filter((d) => d.date >= bounds.startDate && d.date <= bounds.endDate)
    .sort((a, b) => a.date.localeCompare(b.date));
  const clicks = series.reduce((s, d) => s + d.clicks, 0);
  const impressions = series.reduce((s, d) => s + d.impressions, 0);
  const posWeighted = series.reduce((s, d) => s + (d.position || 0) * d.impressions, 0);
  return {
    totals: {
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      position: impressions ? posWeighted / impressions : 0,
    },
    series: series.map((d, i) => ({ day: i + 1, clicks: d.clicks, impressions: d.impressions })),
  };
}

/**
 * Insights factuels en français — dérivés uniquement des chiffres calculés,
 * ton sobre lisible par un dirigeant non-technique (règle du skill).
 */
export function buildInsights(kpis, trend, topQueries, mock) {
  const out = [];
  const { clicks, impressions, position } = kpis;
  const m1 = (k) => k.horizons.m1;

  const trendWord = { hausse: 'en hausse', baisse: 'en baisse' };
  if (m1(clicks).direction === 'stable') {
    out.push(`Les clics depuis Google sont stables ce mois-ci (${fmtDelta(m1(clicks).delta)} par rapport au mois précédent).`);
  } else {
    out.push(`Les clics depuis Google sont ${trendWord[m1(clicks).direction]} de ${fmtDelta(m1(clicks).delta).replace('+', '')} sur un mois (${fmtInt(clicks.current)} clics sur la période).`);
  }

  if (m1(impressions).direction !== 'stable' && m1(impressions).direction !== m1(clicks).direction) {
    if (m1(impressions).direction === 'hausse') {
      out.push(`La visibilité progresse (${fmtDelta(m1(impressions).delta)} d'impressions) sans que les clics suivent encore : le site apparaît plus souvent dans les résultats, mais les titres et descriptions des pages peuvent être retravaillés pour convertir cette visibilité en visites.`);
    } else {
      out.push(`Les impressions reculent (${fmtDelta(m1(impressions).delta)}) alors que les clics tiennent : le site convertit mieux sa visibilité, mais celle-ci s'érode — un point à surveiller.`);
    }
  }

  // Position : baisse du chiffre = amélioration.
  if (m1(position).direction === 'baisse') {
    out.push(`La position moyenne s'améliore (${fmtPos(position.current)} contre ${fmtPos(m1(position).previous)} le mois précédent) : le site remonte dans les résultats de recherche.`);
  } else if (m1(position).direction === 'hausse') {
    out.push(`La position moyenne recule (${fmtPos(position.current)} contre ${fmtPos(m1(position).previous)} le mois précédent) : le site descend dans les résultats — à creuser requête par requête.`);
  }

  // Trajectoire 6 mois — la lecture qui compte pour un programme de 6 mois.
  const h6 = clicks.horizons.m6;
  if (h6.delta !== null) {
    const oldest = trend[0];
    const latest = trend[trend.length - 1];
    if (h6.direction === 'stable') {
      out.push(`Sur 6 mois, les clics mensuels sont stables : ${fmtInt(oldest.clicks)} en ${oldest.label}, ${fmtInt(latest.clicks)} ce mois-ci (${fmtDelta(h6.delta)}).`);
    } else {
      out.push(`Sur 6 mois, les clics mensuels sont passés de ${fmtInt(oldest.clicks)} (${oldest.label}) à ${fmtInt(latest.clicks)} (${fmtDelta(h6.delta)}) : la trajectoire de fond est ${h6.direction === 'hausse' ? 'positive' : 'négative'}.`);
    }
  }

  if (topQueries && topQueries.length) {
    const top = topQueries[0];
    out.push(`La requête qui apporte le plus de visites est « ${top.keys[0]} » (${fmtInt(top.clicks)} clics).`);
  }

  if (mock) {
    out.push('⚠️ Données de démonstration : ce rapport est généré en mode test, sans connexion à Search Console.');
  }

  return out;
}

/**
 * Gagnants / perdants entre deux mois pour un tableau à clé unique (requêtes ou
 * pages). Arithmétique pure sur la data GSC — `delta = mois analysé − mois
 * précédent`, positif = gain.
 * @param {Array<{keys:string[], clicks:number, impressions:number, position:number}>} cur
 * @param {Array<{keys:string[], clicks:number, impressions:number, position:number}>} prev
 */
export function buildMovers(cur, prev) {
  const prevMap = new Map((prev || []).map((r) => [r.keys[0], r]));
  const curMap = new Map((cur || []).map((r) => [r.keys[0], r]));
  const up = [];
  const down = [];
  const fresh = [];
  const lost = [];
  for (const r of cur || []) {
    const p = prevMap.get(r.keys[0]);
    if (!p) {
      if (r.clicks > 0) fresh.push({ key: r.keys[0], clicks: r.clicks, impressions: r.impressions, position: r.position });
      continue;
    }
    const deltaClicks = r.clicks - p.clicks;
    const entry = {
      key: r.keys[0],
      clicks: r.clicks, prevClicks: p.clicks, deltaClicks,
      position: r.position, prevPosition: p.position,
    };
    if (deltaClicks > 0) up.push(entry);
    else if (deltaClicks < 0) down.push(entry);
  }
  for (const p of prev || []) {
    if (!curMap.has(p.keys[0]) && p.clicks > 0) {
      lost.push({ key: p.keys[0], prevClicks: p.clicks, prevPosition: p.position });
    }
  }
  up.sort((a, b) => b.deltaClicks - a.deltaClicks);
  down.sort((a, b) => a.deltaClicks - b.deltaClicks);
  fresh.sort((a, b) => b.clicks - a.clicks);
  lost.sort((a, b) => b.prevClicks - a.prevClicks);
  return { up: up.slice(0, 15), down: down.slice(0, 15), new: fresh.slice(0, 15), lost: lost.slice(0, 15) };
}

/**
 * Opportunités : requêtes déjà visibles (position moyenne 4 à 20) avec un vrai
 * volume d'impressions — le gisement classique d'un audit (title/meta/contenu
 * à retravailler pour gagner les premières positions). Filtre factuel, aucune
 * estimation.
 * @param {Array<{keys:string[], clicks:number, impressions:number, ctr:number, position:number}>} queries
 * @param {number} [minImpressions]
 */
export function findOpportunities(queries, minImpressions = 20) {
  return (queries || [])
    .filter((q) => q.position >= 4 && q.position <= 20 && q.impressions >= minImpressions)
    .map((q) => ({ query: q.keys[0], clicks: q.clicks, impressions: q.impressions, ctr: q.ctr, position: q.position }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 15);
}

/**
 * Assemble le rapport complet.
 * @param {{ client: object, months: object[], daily: array, queries: array,
 *           pages: array, appearance?: array, mock: boolean, generatedAt: string }} input
 *   `months` : les 7 mois ordonnés (cf. resolveMonths), le dernier = mois analysé.
 *   `daily`  : lignes quotidiennes GSC couvrant tout l'intervalle.
 *   `appearance` : lignes searchAppearance du mois (vide si Google n'expose rien).
 *   `queriesPrev` / `pagesPrev` : tops du mois précédent (gagnants/perdants).
 *   `devices` / `countries` : répartitions du mois analysé.
 */
export function buildReport({ client, months, daily, queries, pages, queriesPrev, pagesPrev, devices, countries, appearance, mock, generatedAt }) {
  const perMonth = months.map((m) => ({ ...m, ...aggregateMonth(daily, m) }));
  const current = perMonth[perMonth.length - 1];

  const mkKpi = (key) => {
    const horizons = {};
    for (const h of HORIZONS) {
      const ref = perMonth[perMonth.length - 1 - h.back];
      const prev = ref ? ref.totals[key] : 0;
      const delta = deltaPct(current.totals[key], prev);
      horizons[h.id] = { previous: prev, delta, direction: direction(delta) };
    }
    return { current: current.totals[key], horizons };
  };

  const kpis = {
    clicks: mkKpi('clicks'),
    impressions: mkKpi('impressions'),
    ctr: mkKpi('ctr'),
    position: mkKpi('position'),
  };

  const trend = perMonth.map((m) => ({
    key: m.key,
    label: m.label,
    clicks: m.totals.clicks,
    impressions: m.totals.impressions,
  }));

  const prevMonth = perMonth[perMonth.length - 2];

  return {
    meta: {
      clientId: client.id,
      clientName: client.name,
      property: client.property,
      period: { startDate: current.startDate, endDate: current.endDate, label: current.label, key: current.key },
      compareLabels: {
        m1: prevMonth ? prevMonth.label : '',
        m3: perMonth[perMonth.length - 4] ? perMonth[perMonth.length - 4].label : '',
        m6: perMonth[0] ? perMonth[0].label : '',
      },
      generatedAt,
      mock,
    },
    kpis,
    series: {
      current: current.series,
      compare: prevMonth ? prevMonth.series : [],
    },
    trend,
    tables: {
      queries: (queries || []).slice(0, 250),
      pages: (pages || []).slice(0, 100),
      devices: devices || [],
      countries: countries || [],
      // Apparences dans les résultats — inclura l'IA Overview le jour où
      // Google l'expose dans l'API ; en attendant ce trafic est dans les totaux.
      searchAppearance: (appearance || []).slice(0, 25),
    },
    // Vues d'audit pré-calculées (arithmétique sur la data GSC, rien d'estimé) —
    // consommées par l'extraction JSON pour analyse par un skill Claude.
    audit: {
      comparedTo: prevMonth ? prevMonth.label : null,
      queries: buildMovers(queries, queriesPrev),
      pages: buildMovers(pages, pagesPrev),
      opportunities: findOpportunities(queries),
    },
    insights: buildInsights(kpis, trend, queries, mock),
  };
}

export const fmt = { fmtInt, fmtCtr, fmtPos, fmtDelta };
