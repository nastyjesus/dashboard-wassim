// Détection des mentions et citations d'un client dans une réponse IA.
// - "cité"     : le domaine du client apparaît dans les SOURCES de la réponse
//                (l'équivalent GEO d'un ranking — c'est l'indicateur principal).
// - "mentionné": le domaine ou un alias de marque apparaît dans le TEXTE de la
//                réponse (signal plus faible mais réel).
// Règle héritée des skills : on mesure, on n'estime pas — tout part de la
// réponse brute du moteur.

/** Extrait le hostname d'une URL, sans www. Renvoie '' si invalide. */
export function hostOf(url) {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Un hostname appartient-il au domaine (exact ou sous-domaine) ? */
export function hostMatches(host, domain) {
  const d = domain.toLowerCase().replace(/^www\./, '');
  return host === d || host.endsWith(`.${d}`);
}

/**
 * Analyse une réponse moteur pour un client.
 * Un client peut ne pas avoir de site (ex : pro visible uniquement via sa fiche
 * Google) — dans ce cas seuls les alias comptent, et "cité" est impossible.
 * @param {{ text: string, sources: string[] }} answer texte + URLs sources
 * @param {{ domain?: string, aliases?: string[] }} client
 * @returns {{ mentioned: boolean, cited: boolean, sourceDomains: string[] }}
 */
export function analyzeAnswer(answer, client) {
  const text = (answer.text || '').toLowerCase();
  const domain = client.domain ? client.domain.toLowerCase().replace(/^www\./, '') : '';

  const needles = [domain, ...(client.aliases || []).map((a) => a.toLowerCase())].filter(Boolean);
  const mentionedInText = needles.some((n) => text.includes(n));

  const sourceDomains = [...new Set((answer.sources || []).map(hostOf).filter(Boolean))];
  const cited = Boolean(domain) && sourceDomains.some((h) => hostMatches(h, domain));

  return {
    mentioned: mentionedInText || cited,
    cited,
    sourceDomains,
  };
}

/**
 * Un relevé sans aucune réponse (tous moteurs en échec — crédits, quotas…)
 * ne doit jamais écraser un relevé valide du même jour.
 * @param {{summary?: {answers: number}}|null} existing run déjà stocké pour la date
 * @param {{summary: {answers: number}}} next nouveau run
 */
export function keepExistingRun(existing, next) {
  return Boolean(existing && existing.summary && existing.summary.answers > 0 && next.summary.answers === 0);
}

/**
 * Agrège les résultats d'un run en synthèse : taux globaux, détail par moteur,
 * domaines concurrents les plus cités (sources ≠ client).
 * @param {Record<string, {ok: boolean, results?: Array<{mentioned:boolean,cited:boolean,sourceDomains:string[]}>}>} engines
 * @param {{ domain?: string }} client
 */
export function summarize(engines, client) {
  let total = 0;
  let cited = 0;
  let mentioned = 0;
  const perEngine = {};
  const competitorCounts = new Map();

  for (const [name, engine] of Object.entries(engines)) {
    if (!engine.ok || !engine.results) {
      // L'erreur remonte dans la synthèse pour un diagnostic direct (clé
      // invalide, quota, modèle inconnu…) sans avoir à lire les logs worker.
      perEngine[name] = { ok: false, error: engine.error ? String(engine.error).slice(0, 300) : undefined };
      continue;
    }
    const e = { ok: true, total: engine.results.length, cited: 0, mentioned: 0 };
    for (const r of engine.results) {
      total += 1;
      if (r.cited) { cited += 1; e.cited += 1; }
      if (r.mentioned) { mentioned += 1; e.mentioned += 1; }
      for (const h of r.sourceDomains || []) {
        if (!client.domain || !hostMatches(h, client.domain)) {
          competitorCounts.set(h, (competitorCounts.get(h) || 0) + 1);
        }
      }
    }
    perEngine[name] = e;
  }

  const pct = (n) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  const topCompetitors = [...competitorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([domain, count]) => ({ domain, count }));

  return {
    answers: total,
    citationRate: pct(cited),
    mentionRate: pct(mentioned),
    cited,
    mentioned,
    perEngine,
    topCompetitors,
  };
}
