// Profil local (ville + âge de l'enfant). AsyncStorage peut échouer
// (stockage plein, web privé) : toujours retomber sur « pas de profil ».

import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'onsort:profil';

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
