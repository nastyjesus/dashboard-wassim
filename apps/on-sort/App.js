// Papa Parfait — le QG des papas. 4 onglets : Sorties (le moteur « On
// sort ? » branché sur le worker), Couple, Moi (bien-être, local), Tribu
// (maquette du fil communautaire, backend à venir).
// Navigation volontairement minimale (état local) : pas de dépendance de nav.

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { couleurs } from './src/theme.js';
import { lireProfil, ecrireProfil } from './src/storage.js';
import { Onboarding } from './src/screens/Onboarding.js';
import { Sorties } from './src/screens/Sorties.js';
import { Couple } from './src/screens/Couple.js';
import { Moi } from './src/screens/Moi.js';
import { Tribu } from './src/screens/Tribu.js';
import { BarreOnglets } from './src/components/BarreOnglets.js';

export default function App() {
  const [pret, setPret] = useState(false);
  const [profil, setProfil] = useState(null);
  const [edition, setEdition] = useState(false); // onboarding rouvert depuis Sorties
  const [onglet, setOnglet] = useState('sorties');

  useEffect(() => {
    lireProfil().then((p) => { setProfil(p); setPret(true); });
  }, []);

  const validerProfil = (p) => {
    setProfil(p);
    setEdition(false);
    ecrireProfil(p);
  };

  if (!pret) {
    return <View style={styles.racine}><StatusBar style="dark" /></View>;
  }

  if (!profil || edition) {
    return (
      <View style={styles.racine}>
        <StatusBar style="dark" />
        <Onboarding profilInitial={profil} onValider={validerProfil} />
      </View>
    );
  }

  return (
    <View style={styles.racine}>
      <StatusBar style="dark" />
      <View style={styles.corps}>
        {onglet === 'sorties' && (
          <Sorties profil={profil} onModifierProfil={() => setEdition(true)} />
        )}
        {onglet === 'couple' && <Couple />}
        {onglet === 'moi' && <Moi />}
        {onglet === 'tribu' && <Tribu />}
      </View>
      <BarreOnglets actif={onglet} onChange={setOnglet} />
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  corps: { flex: 1 },
});
