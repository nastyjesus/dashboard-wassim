// Score d'une opportunité, sur 0–100, explicable : chaque composante est
// stockée avec sa valeur et son poids (score_detail_json).
//
// Règles (spec § 6) :
//   - l'autorité vient uniquement des exports : Semrush AS ou Ahrefs DR, selon
//     la source choisie pour le client, sans repli sur l'autre échelle (deux
//     métriques propriétaires différentes, jamais converties) ;
//   - une composante inconnue est exclue et les poids restants renormalisés,
//     jamais remplacée par zéro ;
//   - aucune composante connue → score null.

export const DEFAULT_WEIGHTS = Object.freeze({ authority: 1, ease: 1 });
export const AUTHORITY_SOURCES = ['semrush', 'ahrefs'];

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

/** Pondération valide (nombres ≥ 0 sur les composantes connues) ou null. */
export function validateWeights(w) {
  if (!w || typeof w !== 'object' || Array.isArray(w)) return null;
  const out = {};
  for (const key of Object.keys(w)) {
    if (!(key in DEFAULT_WEIGHTS)) return null;
    if (!isNum(w[key]) || w[key] < 0) return null;
    out[key] = w[key];
  }
  return out;
}

/**
 * @param {{ semrush_as?: number|null, ahrefs_dr?: number|null,
 *           competitors_linked?: number|null, competitors_total?: number|null }} opp
 * @param {{ weights?: object|null, authoritySource?: string }} [opts]
 * @returns {{ score: number|null, detail: object }}
 */
export function computeScore(opp, opts = {}) {
  const weights = { ...DEFAULT_WEIGHTS, ...(opts.weights || {}) };
  const source = AUTHORITY_SOURCES.includes(opts.authoritySource) ? opts.authoritySource : 'semrush';
  const components = {};

  const raw = source === 'ahrefs' ? opp.ahrefs_dr : opp.semrush_as;
  components.authority = isNum(raw)
    ? { value: clamp01(raw / 100), raw, source, weight: weights.authority }
    : { missing: true, source, weight: weights.authority };

  const linked = opp.competitors_linked;
  const total = opp.competitors_total;
  components.ease = isNum(linked) && isNum(total) && total > 0
    ? { value: clamp01(linked / total), raw: `${linked}/${total}`, weight: weights.ease }
    : { missing: true, weight: weights.ease };

  let sum = 0;
  let weightSum = 0;
  for (const c of Object.values(components)) {
    if (c.missing) continue;
    sum += c.value * c.weight;
    weightSum += c.weight;
  }
  const score = weightSum > 0 ? Math.round((sum / weightSum) * 1000) / 10 : null;
  return { score, detail: { components } };
}
