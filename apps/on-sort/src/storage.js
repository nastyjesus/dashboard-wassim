// Mémoire locale de l'app : le profil (ville + âge de l'enfant), les sorties
// gardées, et quelques drapeaux d'interface. AsyncStorage peut échouer
// (stockage plein, web privé) : toujours retomber sur une valeur neutre.
//
// Tout marche sans compte. Le compte vient plus tard, quand il apporte
// quelque chose (retrouver ses sorties sur un autre appareil).

import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'onsort:profil';
const CLE_FAVORIS = 'onsort:favoris';

export async function lireProfil() {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (!brut) return null;
    const p = JSON.parse(brut);
    // Attention : l'âge 0 est valide (bébé) et falsy — tester la présence, pas
    // la vérité, sinon un papa de nourrisson reboucle sur l'onboarding.
    return p && p.villeId && p.age != null ? p : null;
  } catch {
    return null;
  }
}

export async function ecrireProfil(profil) {
  try {
    await AsyncStorage.setItem(CLE, JSON.stringify(profil));
  } catch {
    // tant pis : l'app redemandera au prochain lancement
  }
}

/** Sorties gardées, les plus récentes d'abord. Toujours un tableau. */
export async function lireFavoris() {
  try {
    const brut = await AsyncStorage.getItem(CLE_FAVORIS);
    const liste = brut ? JSON.parse(brut) : [];
    return Array.isArray(liste) ? liste : [];
  } catch {
    return [];
  }
}

export async function ecrireFavoris(liste) {
  try {
    await AsyncStorage.setItem(CLE_FAVORIS, JSON.stringify(liste));
  } catch {
    // stockage plein : la sortie reste gardée en mémoire jusqu'à la fermeture
  }
}

/** Drapeau d'interface (ex. « l'invitation à créer un compte a été montrée »). */
export async function lireDrapeau(nom) {
  try {
    return (await AsyncStorage.getItem(`onsort:${nom}`)) === '1';
  } catch {
    return false;
  }
}

export async function ecrireDrapeau(nom) {
  try {
    await AsyncStorage.setItem(`onsort:${nom}`, '1');
  } catch {
    // sans gravité : l'invitation se remontrera
  }
}
