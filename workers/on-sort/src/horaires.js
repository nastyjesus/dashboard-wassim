// Créneaux horaires d'un événement pour un jour donné, et leur libellé.
//
// OpenAgenda fournit `timings` : la liste exacte des créneaux (début/fin ISO
// avec fuseau). C'est la source fiable. À défaut, on lit les heures dans le
// texte `daterange_fr` (« Vendredi 18 septembre, 09h30, 10h15 »).
//
// Deux usages :
//  - le scoring : en semaine, un créneau en pleine journée (enfant gardé, papa
//    au travail) ne doit pas gagner le GO — constaté sur données réelles ;
//  - l'affichage : « 09h30 et 10h15 » plutôt qu'une liste brute à virgules.

const JOURS_SEMAINE_CONTRAINTS = new Set([1, 2, 4, 5]); // lun, mar, jeu, ven
const FIN_JOURNEE_GARDE = 16.5; // 16h30 : sortie d'école / de crèche
const DEBUT_SOIREE = 19.5; // 19h30 : au-delà, ce n'est plus une sortie avec un petit

/** Heure décimale locale d'un ISO avec fuseau (« 2026-09-18T09:30:00+02:00 » → 9.5). */
function heureLocale(iso) {
  const m = /T(\d{2}):(\d{2})/.exec(iso || '');
  return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

/** « 09h30 » ; « 10h » pour une heure ronde. */
function formatHeure(h) {
  const heures = Math.floor(h);
  const minutes = Math.round((h - heures) * 60);
  return minutes ? `${String(heures).padStart(2, '0')}h${String(minutes).padStart(2, '0')}` : `${heures}h`;
}

/**
 * Créneaux du jour demandé : [{debut, fin}] en heures décimales locales,
 * triés par début. Vide si aucune info exploitable.
 */
export function creneauxDuJour(ev, dateISO) {
  if (!dateISO) return [];

  if (Array.isArray(ev.creneaux) && ev.creneaux.length) {
    return ev.creneaux
      .filter((c) => (c.debut || '').slice(0, 10) === dateISO)
      .map((c) => ({ debut: heureLocale(c.debut), fin: heureLocale(c.fin) }))
      .filter((c) => c.debut !== null)
      .sort((a, b) => a.debut - b.debut);
  }

  // Secours : heures citées dans le texte. Sans fin explicite (« 09h30,
  // 10h15 »), chaque créneau est supposé durer une heure.
  const heures = heuresDansTexte(ev.horaires);
  if (!heures.length) return [];
  if (/(\d{1,2}h(?:\d{2})?)\s*(?:-|–|à|a)\s*(\d{1,2}h(?:\d{2})?)/i.test(ev.horaires) && heures.length === 2) {
    return [{ debut: heures[0], fin: heures[1] }];
  }
  return heures.map((h) => ({ debut: h, fin: h + 1 }));
}

function heuresDansTexte(texte) {
  const heures = [];
  for (const m of (texte || '').matchAll(/\b(\d{1,2})h(\d{2})?\b/gi)) {
    const h = Number(m[1]) + (m[2] ? Number(m[2]) / 60 : 0);
    if (h >= 0 && h < 24) heures.push(h);
  }
  return heures;
}

/**
 * Le jour demandé est-il un jour où l'enfant est gardé et le papa au travail ?
 * Lundi, mardi, jeudi, vendredi. Le mercredi et le week-end ne comptent pas.
 */
export function jourDeGarde(dateISO) {
  if (!dateISO) return false;
  return JOURS_SEMAINE_CONTRAINTS.has(new Date(`${dateISO}T12:00:00Z`).getUTCDay());
}

/**
 * Verdict horaire pour le scoring :
 *  - 'tard'     : tous les créneaux commencent à 19h30 ou après (quel que soit
 *                 le jour) — trop tard pour un petit ;
 *  - 'journee'  : jour de garde et tous les créneaux finissent avant 16h30 ;
 *  - 'soir'     : jour de garde et au moins un créneau commence à 16h30 ou après ;
 *  - null       : pas de contrainte (week-end, mercredi, ou horaires inconnus).
 */
export function verdictHoraire(ev, dateISO) {
  const creneaux = creneauxDuJour(ev, dateISO);
  if (!creneaux.length) return null;
  if (creneaux.every((c) => c.debut >= DEBUT_SOIREE)) return 'tard';
  if (!jourDeGarde(dateISO)) return null;
  if (creneaux.some((c) => c.debut >= FIN_JOURNEE_GARDE)) return 'soir';
  if (creneaux.every((c) => (c.fin ?? c.debut) <= FIN_JOURNEE_GARDE)) return 'journee';
  return null;
}

/**
 * Libellé lisible des horaires du jour :
 *  - un créneau : « 09h30 – 11h » ;
 *  - deux ou trois : « 09h30 et 10h15 », « 10h, 14h et 16h » ;
 *  - plus : « dès 09h30 (5 créneaux) ».
 * Retourne null si aucun créneau exploitable (l'appelant garde le texte brut).
 */
export function libelleHoraires(ev, dateISO) {
  const creneaux = creneauxDuJour(ev, dateISO);
  if (!creneaux.length) return null;

  if (creneaux.length === 1) {
    const [c] = creneaux;
    const duree = c.fin !== null ? c.fin - c.debut : 0;
    return duree >= 1.5 ? `${formatHeure(c.debut)} – ${formatHeure(c.fin)}` : formatHeure(c.debut);
  }
  if (creneaux.length <= 3) {
    const heures = creneaux.map((c) => formatHeure(c.debut));
    return `${heures.slice(0, -1).join(', ')} et ${heures[heures.length - 1]}`;
  }
  return `dès ${formatHeure(creneaux[0].debut)} (${creneaux.length} créneaux)`;
}
