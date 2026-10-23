// Quotas gratuits par papa et par mois calendaire (spec § 5). Assez pour
// juger, pas assez pour s'installer sans payer. Un papa abonné passe.

export const QUOTAS = { sos: 5, activite: 5, histoire: 5, plan: 2 };

/** Premier instant du mois de `maintenant`, en UTC (ISO). */
export function debutDuMois(maintenant = new Date()) {
  return new Date(Date.UTC(maintenant.getUTCFullYear(), maintenant.getUTCMonth(), 1)).toISOString();
}

/**
 * @param {{ abonne?: boolean }} papa
 * @param {'sos'|'activite'|'histoire'|'plan'} brique
 * @param {number} dejaUtilise usages de la brique depuis le début du mois
 * @returns {{ ok: boolean, restant: number }} restant = Infinity pour un abonné
 */
export function verifierQuota(papa, brique, dejaUtilise) {
  if (papa?.abonne) return { ok: true, restant: Infinity };
  const plafond = QUOTAS[brique];
  if (plafond === undefined) throw new Error(`brique inconnue : ${brique}`);
  const restant = Math.max(0, plafond - dejaUtilise);
  return { ok: restant > 0, restant };
}

const NOMS = {
  sos: 'coups de main SOS', activite: 'activités maison', histoire: 'histoires du soir', plan: 'plans du week-end',
};

/** Message quand le quota du mois est atteint. */
export function messageQuota(brique, lienAbonnement) {
  return `Tu as utilisé tes ${QUOTAS[brique]} ${NOMS[brique]} gratuits de ce mois-ci. `
    + `Ils reviennent le 1er du mois prochain${lienAbonnement ? `, ou passe en illimité : ${lienAbonnement}` : '.'}`;
}
