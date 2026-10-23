// Position du papa — une seule lecture, à la demande, jamais en continu.
// expo-location couvre natif et web (navigator.geolocation derrière, HTTPS
// requis — la PWA y est). La précision « Low » (~1 km) suffit pour un rayon
// de 40 km et répond plus vite qu'un vrai fix GPS.
//
// La position est arrondie au centième de degré (~1 km) avant de quitter ce
// module : assez pour classer les sorties par distance, pas assez pour
// désigner une adresse. Bonus : les URL /top restent partageables par le
// cache du worker entre voisins.

import * as Location from 'expo-location';

const DELAI_MS = 12000;
const FRAICHEUR_MS = 10 * 60 * 1000;

const arrondir = (x) => Math.round(x * 100) / 100;

/** Erreur typée : `code` vaut 'refus' (permission) ou 'indispo' (pas de fix). */
function erreur(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

/**
 * Demande la permission si besoin puis lit la position.
 * @param {{ demander?: boolean, delaiMs?: number }} options `demander: false`
 *   ne déclenche jamais la fenêtre système (rafraîchissement silencieux à
 *   l'accueil) ; `delaiMs` borne l'attente d'un fix.
 * @returns {Promise<{ lat: number, lon: number }>}
 */
export async function localiser({ demander = true, delaiMs = DELAI_MS } = {}) {
  let permission;
  try {
    permission = demander
      ? await Location.requestForegroundPermissionsAsync()
      : await Location.getForegroundPermissionsAsync();
  } catch {
    throw erreur('indispo');
  }
  if (!permission?.granted) throw erreur('refus');

  try {
    const recente = await Location.getLastKnownPositionAsync({ maxAge: FRAICHEUR_MS });
    const fix = recente || await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
      new Promise((_, rejeter) => setTimeout(() => rejeter(erreur('indispo')), delaiMs)),
    ]);
    const { latitude, longitude } = fix.coords;
    return { lat: arrondir(latitude), lon: arrondir(longitude) };
  } catch {
    throw erreur('indispo');
  }
}
