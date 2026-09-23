// Papa Parfait — le QG des papas. 4 onglets : Sorties (le moteur « On
// sort ? » branché sur le worker), Couple, Moi (bien-être, local), Tribu
// (maquette du fil communautaire, backend à venir).
// Navigation volontairement minimale (état local) : pas de dépendance de nav.
//
// Entrée sans compte : le papa règle sa ville et l'âge de son enfant, il a son
// top. Le compte n'arrive qu'au moment où il sert (garder une sortie et la
// retrouver ailleurs) — voir docs/papa-parfait/decisions.md.

import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
// Import par sous-chemin, pas depuis la racine du paquet : l'index racine
// `require()` les 9 graisses de chaque famille, et Metro les embarque toutes
// (23 fichiers .ttf pour 4 utilisés, mesuré le 19 septembre 2026).
import { SairaCondensed_700Bold } from '@expo-google-fonts/saira-condensed/700Bold';
import { SairaCondensed_800ExtraBold } from '@expo-google-fonts/saira-condensed/800ExtraBold';
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { couleurs } from './src/theme.js';
import { lireProfil, ecrireProfil } from './src/storage.js';
import { sessionCourante, enregistrerProfil } from './src/compte-api.js';
import { synchroniserFavoris } from './src/favoris.js';
import { profilDepuisLien, nettoyerLien } from './src/lien.js';
import { Demarrage } from './src/screens/Demarrage.js';
import { Compte } from './src/screens/Compte.js';
import { Sorties } from './src/screens/Sorties.js';
import { Couple } from './src/screens/Couple.js';
import { Moi } from './src/screens/Moi.js';
import { Tribu } from './src/screens/Tribu.js';
import { Teaser } from './src/screens/Teaser.js';
import { BarreOnglets } from './src/components/BarreOnglets.js';
import { PILIERS_ACTIFS } from './src/config.js';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [pret, setPret] = useState(false);
  const [profil, setProfil] = useState(null);
  const [session, setSession] = useState(null); // compte connecté sans profil complet
  const [edition, setEdition] = useState(false); // démarrage rouvert depuis Sorties
  const [motifCompte, setMotifCompte] = useState(null); // écran compte ouvert, et pourquoi
  const [onglet, setOnglet] = useState('sorties');

  const [policesPretes] = useFonts({
    SairaCondensed_700Bold,
    SairaCondensed_800ExtraBold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
  });

  // Au lancement, dans l'ordre :
  //  1. le lien d'arrivée (`?ville=rennes&age=3`) — le site envoie le papa
  //     droit au résultat, c'est lui qui a la main s'il précise une ville ;
  //  2. le profil local (instantané, marche hors ligne et sans compte) ;
  //  3. le compte connecté — au retour de Google, ou après réinstallation de
  //     la PWA. Si son profil est déjà en base, on entre directement ; sinon
  //     le démarrage se rouvre, réduit au prénom, à l'âge et à la ville.
  useEffect(() => {
    let vivant = true;
    (async () => {
      const lien = profilDepuisLien();
      if (lien) {
        nettoyerLien();
        await ecrireProfil(lien);
        if (vivant) { setProfil(lien); setPret(true); }
        return;
      }

      const local = await lireProfil();
      if (local) {
        if (vivant) { setProfil(local); setPret(true); }
        return;
      }

      const s = await sessionCourante();
      if (!vivant) return;
      if (s?.profil) {
        setProfil(s.profil);
        ecrireProfil(s.profil);
        synchroniserFavoris().catch(() => {});
      } else if (s) {
        setSession(s);
      }
      setPret(true);
    })();
    return () => { vivant = false; };
  }, []);

  useEffect(() => {
    if (pret && policesPretes) SplashScreen.hideAsync().catch(() => {});
  }, [pret, policesPretes]);

  // Tenir le rendu tant que profil ET polices ne sont pas prêts.
  if (!pret || !policesPretes) {
    return <View style={styles.racine}><StatusBar style="dark" /></View>;
  }

  const validerProfil = async (p) => {
    setProfil(p);
    setEdition(false);
    await ecrireProfil(p);
    // Compte déjà là (retour de Google) : le profil monte aussi en base. Sinon
    // il n'y a rien à faire — le local suffit à faire tourner l'app.
    if (session) {
      await enregistrerProfil(p);
      setSession(null);
      synchroniserFavoris().catch(() => {});
    }
  };

  const compteCree = (compte) => {
    const fusion = { ...profil, ...compte };
    setProfil(fusion);
    ecrireProfil(fusion);
    setSession(null);
    setMotifCompte(null);
  };

  if (motifCompte && profil) {
    return (
      <View style={styles.racine}>
        <StatusBar style="dark" />
        <Compte
          profil={profil}
          motif={motifCompte}
          onFait={compteCree}
          onFermer={() => setMotifCompte(null)}
        />
      </View>
    );
  }

  if (!profil || edition) {
    return (
      <View style={styles.racine}>
        <StatusBar style="dark" />
        <Demarrage profilInitial={profil} session={session} onValider={validerProfil} />
      </View>
    );
  }

  return (
    <View style={styles.racine}>
      <StatusBar style="dark" />
      <View style={styles.corps}>
        {onglet === 'sorties' && (
          <Sorties
            profil={profil}
            aCompte={Boolean(profil.email)}
            onModifierProfil={() => setEdition(true)}
            onDemanderCompte={(motif) => setMotifCompte(motif || 'menu')}
          />
        )}
        {onglet === 'couple' && (PILIERS_ACTIFS.couple ? <Couple /> : <Teaser pilier="couple" />)}
        {onglet === 'moi' && (PILIERS_ACTIFS.moi ? <Moi /> : <Teaser pilier="moi" />)}
        {onglet === 'tribu' && (PILIERS_ACTIFS.tribu ? <Tribu profil={profil} /> : <Teaser pilier="tribu" />)}
      </View>
      <BarreOnglets actif={onglet} onChange={setOnglet} />
    </View>
  );
}

const styles = StyleSheet.create({
  racine: { flex: 1, backgroundColor: couleurs.fond },
  corps: { flex: 1 },
});
