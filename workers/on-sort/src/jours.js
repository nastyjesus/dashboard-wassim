// Événements récurrents : « 29 mars - 27 décembre, les dimanches » couvre un
// samedi par sa plage de dates… mais n'a pas lieu le samedi. On extrait les
// jours de la semaine mentionnés dans les horaires (puis la description en
// secours) pour exclure les propositions hors-jour — le défaut n°1 repéré
// sur les premières données réelles.

const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

/** Index (0 = dimanche, comme getUTCDay) des jours cités dans un texte. */
export function joursMentionnes(texte) {
  const t = (texte || '').toLowerCase();
  const trouves = new Set();

  // « du mardi au dimanche » : plage cyclique inclusive.
  for (const m of t.matchAll(/du\s+(\w+)\s+au\s+(\w+)/g)) {
    const debut = JOURS.indexOf(m[1]);
    const fin = JOURS.indexOf(m[2]);
    if (debut >= 0 && fin >= 0) {
      for (let i = debut; ; i = (i + 1) % 7) {
        trouves.add(i);
        if (i === fin) break;
      }
    }
  }

  if (/week-?end/.test(t)) { trouves.add(6); trouves.add(0); }

  for (let i = 0; i < JOURS.length; i++) {
    if (new RegExp(`\\b${JOURS[i]}s?\\b`).test(t)) trouves.add(i);
  }
  return trouves;
}

/**
 * L'événement peut-il avoir lieu le jour demandé ?
 * - « tous les jours » ou aucun jour cité dans les horaires ni la description
 *   → pas de contrainte, on garde ;
 * - des jours cités et le jour demandé n'en fait pas partie → exclu.
 * Sans dateISO (tests unitaires du scoring seul), pas de contrainte.
 */
export function jourCompatible(ev, dateISO) {
  if (!dateISO) return true;
  const jour = new Date(`${dateISO}T12:00:00Z`).getUTCDay();

  // Les horaires sont la source la plus fiable ; la description en secours
  // (début seulement : la suite part souvent sur autre chose).
  for (const texte of [ev.horaires, (ev.description || '').slice(0, 300)]) {
    if (!texte) continue;
    if (/tous les jours|7j\/7/i.test(texte)) return true;
    const jours = joursMentionnes(texte);
    if (jours.size > 0) return jours.has(jour);
  }
  return true;
}

/** Durée de la plage de dates en jours (null si dates incomplètes). */
export function dureeJours(ev) {
  if (!ev.dateDebut || !ev.dateFin) return null;
  const ms = new Date(`${ev.dateFin}T00:00:00Z`) - new Date(`${ev.dateDebut}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}
