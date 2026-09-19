// Profil local (ville + âge de l'enfant). AsyncStorage peut échouer
// (stockage plein, web privé) : toujours retomber sur « pas de profil ».

import AsyncStorage from '@react-native-async-storage/async-storage';

const CLE = 'onsort:profil';

export async function lireProfil() {
  try {
    const brut = await AsyncStorage.getItem(CLE);
    if (!brut) return null;
    const p = JSON.parse(brut);
    return p && p.villeId && p.age ? p : null;
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
