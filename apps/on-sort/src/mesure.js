// Mesure d'usage — des compteurs, pas un traçage.
//
// On envoie un nom d'étape et rien d'autre : pas d'identifiant d'appareil, pas
// de profil, pas de cookie, rien qui permette de suivre une personne d'un
// écran à l'autre. Le worker n'incrémente qu'un compteur par jour et par étape
// (voir workers/on-sort/src/index.js, route /mesure).
//
// Pourquoi : sans ça, impossible de savoir si l'entrée sans compte a changé
// quoi que ce soit. On saurait que le site envoie du monde, pas ce qu'il
// devient. Cinq étapes suffisent à lire l'entonnoir.
//
// Règle : ça ne bloque jamais rien. Pas d'attente, pas d'erreur remontée à
// l'écran — si le réseau tombe, la mesure est perdue et l'app continue.

import { WORKER_URL } from './config.js';

/** @typedef {'ouverture'|'arrivee-lien'|'top'|'top-vide'|'garde'|'compte'} Etape */

/**
 * Compte une étape d'usage. À appeler sans `await`.
 * @param {Etape} evt
 */
export function mesurer(evt) {
  try {
    fetch(`${WORKER_URL}/mesure`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evt }),
      // La mesure part même si la page se ferme dans la foulée (web).
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch indisponible : tant pis, ce n'est qu'un compteur
  }
}
