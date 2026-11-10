// « Pas pour nous » — le papa écarte une sortie du top et dit pourquoi.
//
// Deux effets : la sortie disparaît de son top (mémoire locale, sans compte),
// et le motif part au worker pour régler le classement (route /retour). Aucun
// identifiant de personne ni d'appareil : une sortie, un motif, une ville.
//
// Comme la mesure d'usage : ça ne bloque jamais rien. Hors ligne, la sortie
// est quand même écartée sur le téléphone.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { WORKER_URL } from './config.js';
import { cleFavori } from './favoris.js';

const CLE = 'onsort:ecartees';
/** Au-delà, les plus anciennes sortent : les agendas tournent, la liste aussi. */
const MAX = 300;

/** Motifs proposés, dans l'ordre d'affichage. `id` est ce qui part au worker. */
export const MOTIFS = [
  { id: 'loin', label: 'Trop loin' },
  { id: 'age', label: 'Pas son âge' },
  { id: 'interet', label: 'Pas intéressant' },
  { id: 'deja', label: 'Déjà fait' },
];

/** Clé d'une sortie écartée — la même que pour les sorties gardées. */
export const cleEcartee = cleFavori;

/** Clés des sorties écartées. Toujours un tableau. */
export async function lireEcartees() {
  try {
    const liste = JSON.parse((await AsyncStorage.getItem(CLE)) || '[]');
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

/**
 * Écarte une sortie : mémoire locale + envoi du motif. Rend la liste à jour.
 * @param {object} ev sortie du top
 * @param {string} motif un `id` de MOTIFS
 * @param {{ville?: string, dateISO?: string, age?: number}} contexte
 */
export async function ecarter(ev, motif, { ville, dateISO, age } = {}) {
  const cle = cleEcartee(ev);
  const liste = [cle, ...(await lireEcartees()).filter((c) => c !== cle)].slice(0, MAX);
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(liste));
  } catch {
    // stockage plein : écartée jusqu'à la fermeture de l'app
  }
  try {
    fetch(`${WORKER_URL}/retour`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        motif, titre: ev.titre, cle: ev.cle || null, origine: ev.origine || null,
        ville, date: dateISO, age, km: ev.distanceKm ?? null,
      }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // fetch indisponible : la sortie reste écartée localement
  }
  return liste;
}

/** Remet une sortie dans le top (annulation juste après l'avoir écartée). */
export async function reprendre(ev) {
  const cle = cleEcartee(ev);
  const liste = (await lireEcartees()).filter((c) => c !== cle);
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(liste));
  } catch {
    // sans gravité
  }
  return liste;
}
