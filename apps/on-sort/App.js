// « On sort ? » — l'app qui répond à « qu'est-ce qu'on fait avec les enfants ? ».
// POC week-end 2 : 3 écrans (onboarding, accueil, fiche), branchés sur le
// worker on-sort-poc qui fait tout le travail (sources, météo, scoring).
// Navigation volontairement minimale (état local) : pas de dépendance de nav
// pour 3 écrans.

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { couleurs } from './src/theme.js';
import { lireProfil, ecrireProfil } from './src/storage.js';
import { Onboarding } from './src/screens/Onboarding.js';
import { Accueil } from './src/screens/Accueil.js';
import { Detail } from './src/screens/Detail.js';

export default function App() {
  const [pret, setPret] = useState(false);
  const [profil, setProfil] = useState(null);
  const [edition, setEdition] = useState(false); // onboarding rouvert depuis l'accueil
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    lireProfil().then((p) => { setProfil(p); setPret(true); });
  }, []);

  const validerProfil = (p) => {
    setProfil(p);
    setEdition(false);
    ecrireProfil(p);
  };

  let ecran = null;
  if (pret) {
    if (!profil || edition) {
      ecran = <Onboarding profilInitial={profil} onValider={validerProfil} />;
    } else if (detail) {
      ecran = <Detail ev={detail} onRetour={() => setDetail(null)} />;
    } else {
      ecran = (
        <Accueil
          profil={profil}
          onOuvrirDetail={setDetail}
          onModifierProfil={() => setEdition(true)}
        />
      );
    }
  }

  return (
    <View style={styles.racine}>
      <StatusBar style="dark" />
      {ecran}
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
});
