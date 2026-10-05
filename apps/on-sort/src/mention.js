// Mention de source exigée par la Licence Ouverte de DATAtourisme : le
// créateur de la donnée et sa date de mise à jour, sur chaque sortie affichée.
// Le worker ne remplit `source` (nom du créateur) et `majLe` (YYYY-MM-DD) que
// pour cette source ; ailleurs ils valent null et rien ne s'affiche.

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet',
  'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-09-23 » → « 23 septembre 2026 » ; « 1er » pour le premier du mois. */
function dateLisible(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  if (!m) return null;
  const jour = Number(m[3]);
  const mois = MOIS[Number(m[2]) - 1];
  if (!mois || !jour) return null;
  return `${jour === 1 ? '1er' : jour} ${mois} ${m[1]}`;
}

/**
 * « Source : Office de Tourisme de la Baie de Quiberon, mise à jour le
 * 23 septembre 2026 », ou null si la sortie n'a rien à citer.
 */
// Avant le 5 octobre 2026, `source` portait l'étiquette technique de la
// provenance (« openagenda »…). Un top en cache ou une sortie gardée peut
// encore l'avoir : ce n'est pas un créateur à citer.
const ETIQUETTES_TECHNIQUES = new Set(['openagenda', 'datatourisme', 'mock', 'test']);

export function mentionSource(ev) {
  if (!ev?.source || ETIQUETTES_TECHNIQUES.has(ev.source)) return null;
  const date = dateLisible(ev.majLe);
  return date ? `Source : ${ev.source}, mise à jour le ${date}` : `Source : ${ev.source}`;
}
