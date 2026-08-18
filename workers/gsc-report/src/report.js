// Construction du rapport : périodes, deltas, insights factuels.
// Règle héritée du skill wassim-gsc-report : aucun chiffre inventé — tout est
// calculé depuis la data GSC (ou les mocks, flagués comme tels).

const MONTHS_FR = [
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
];

/** Seuil de stabilité (cf. skill) : sous ±2 %, on parle de stabilité. */
const STABLE_THRESHOLD = 2;

/**
 * Bornes du mois calendaire précédent une date de référence.
 * @param {Date} ref
 * @param {number} monthsBack 1 = mois précédent, 2 = celui d'avant, 13 = N-1 du mois précédent…
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
 * Résout période d'analyse + comparaison pour un run.
 * @param {Date} now date du run (le cron tourne le 3 → mois précédent complet)
 * @param {'prev'|'yoy'} compareMode vs mois précédent, ou vs même mois N-1 (saisonnalité)
 * @param {string} [periodKey] YYYY-MM explicite (run manuel) — sinon mois précédent
 */
export function resolvePeriods(now, compareMode = 'prev', periodKey) {
  let current;
  if (periodKey) {
    const [y, m] = periodKey.split('-').map(Number);
    // monthsBack depuis "now" jusqu'au mois demandé
    const back = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
    current = monthBounds(now, back);
  } else {
    current = monthBounds(now, 1);
  }
  const refDate = new Date(`${current.startDate}T00:00:00Z`);
  const compare = compareMode === 'yoy'
    ? monthBounds(new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth() + 1, 1)), 13)
    : monthBounds(refDate, 1);
  return { current, compare };
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
 * Normalise une série quotidienne en jours relatifs (J1, J2…) pour superposer
 * deux périodes de longueurs différentes sur le même axe.
 */
function normalizeSeries(series) {
  return series.map((d, i) => ({ day: i + 1, clicks: d.clicks, impressions: d.impressions }));
}

/**
 * Insights factuels en français — dérivés uniquement des chiffres calculés,
 * ton sobre lisible par un dirigeant non-technique (règle du skill).
 */
export function buildInsights(kpis, topQueries, mock) {
  const out = [];
  const { clicks, impressions, position } = kpis;

  const trendWord = { hausse: 'en hausse', baisse: 'en baisse', stable: 'stables' };
  if (clicks.direction === 'stable') {
    out.push(`Les clics depuis Google sont stables ce mois-ci (${fmtDelta(clicks.delta)} par rapport à la période de comparaison).`);
  } else {
    out.push(`Les clics depuis Google sont ${trendWord[clicks.direction]} de ${fmtDelta(clicks.delta).replace('+', '')} (${fmtInt(clicks.current)} clics sur la période).`);
  }

  if (impressions.direction !== 'stable' && impressions.direction !== clicks.direction) {
    if (impressions.direction === 'hausse') {
      out.push(`La visibilité progresse (${fmtDelta(impressions.delta)} d'impressions) sans que les clics suivent encore : le site apparaît plus souvent dans les résultats, mais les titres et descriptions des pages peuvent être retravaillés pour convertir cette visibilité en visites.`);
    } else {
      out.push(`Les impressions reculent (${fmtDelta(impressions.delta)}) alors que les clics tiennent : le site convertit mieux sa visibilité, mais celle-ci s'érode — un point à surveiller.`);
    }
  }

  // Position : baisse du chiffre = amélioration.
  if (position.direction === 'baisse') {
    out.push(`La position moyenne s'améliore (${fmtPos(position.current)} contre ${fmtPos(position.previous)} auparavant) : le site remonte dans les résultats de recherche.`);
  } else if (position.direction === 'hausse') {
    out.push(`La position moyenne recule (${fmtPos(position.current)} contre ${fmtPos(position.previous)} auparavant) : le site descend dans les résultats — à creuser requête par requête.`);
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
 * Assemble le rapport complet à partir des deux pulls GSC.
 * @returns {{ meta: object, kpis: object, series: object, tables: object, insights: string[] }}
 */
export function buildReport({ client, current, compare, currentData, compareData, generatedAt }) {
  const mkKpi = (key, cur, prev, transform = (v) => v) => {
    const c = transform(cur.totals[key]);
    const p = transform(prev.totals[key]);
    const delta = deltaPct(c, p);
    return { current: c, previous: p, delta, direction: direction(delta) };
  };

  const kpis = {
    clicks: mkKpi('clicks', currentData, compareData),
    impressions: mkKpi('impressions', currentData, compareData),
    ctr: mkKpi('ctr', currentData, compareData),
    position: mkKpi('position', currentData, compareData),
  };

  const mock = Boolean(currentData.mock || compareData.mock);

  return {
    meta: {
      clientId: client.id,
      clientName: client.name,
      property: client.property,
      period: { ...current },
      compare: { ...compare },
      generatedAt,
      mock,
    },
    kpis,
    series: {
      current: normalizeSeries(currentData.series),
      compare: normalizeSeries(compareData.series),
    },
    tables: {
      queries: (currentData.queries || []).slice(0, 10),
      pages: (currentData.pages || []).slice(0, 10),
    },
    insights: buildInsights(kpis, currentData.queries, mock),
  };
}

export const fmt = { fmtInt, fmtCtr, fmtPos, fmtDelta };
