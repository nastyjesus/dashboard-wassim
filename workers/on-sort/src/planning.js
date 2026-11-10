// Travaux programmés — un seul déclencheur Cloudflare pour deux travaux.
//
// Le plan gratuit limite le compte à 5 déclencheurs cron, tous workers
// confondus. Ce worker en prenait deux ; le 10 novembre 2026 le compte a
// atteint la limite et chaque déploiement sortait en erreur. Un déclencheur
// « 0 5,15 * * * » réveille donc le worker deux fois par jour, et c'est l'heure
// du réveil qui dit quoi faire.

/** Le déclencheur unique — identique à [triggers] dans wrangler.toml. */
export const CRON = '0 5,15 * * *';

/**
 * Le travail à faire pour un réveil donné (heures UTC) :
 *  - 5 h, chaque jour   → 'cirques' (tournées + purge des concours) ;
 *  - 15 h, le vendredi  → 'alerte'  (alerte du week-end + veille concurrente) ;
 *  - 15 h, les autres jours → null : réveil sans objet.
 * @param {number} scheduledTime horodatage du réveil, en millisecondes
 * @returns {'cirques'|'alerte'|null}
 */
export function travailProgramme(scheduledTime) {
  const d = new Date(scheduledTime);
  if (d.getUTCHours() === 5) return 'cirques';
  if (d.getUTCHours() === 15 && d.getUTCDay() === 5) return 'alerte';
  return null;
}
