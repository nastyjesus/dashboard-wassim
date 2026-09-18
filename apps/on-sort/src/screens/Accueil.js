// L'écran cœur — charte « Cockpit clair ». Bandeau instrument (QG, météo,
// enfant), hero « ON SORT ? », puis le panneau GO (préférée) et le top numéroté.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { couleurs, espace, police, typo } from '../theme.js';
import { Chip, Section, Strip, Bouton } from '../components/ui.js';
import { CarteSortie } from '../components/CarteSortie.js';
import { chargerTop } from '../api.js';
import { optionsDates, libelleLong } from '../dates.js';
import { VILLES } from '../config.js';

function emojiMeteo(meteo) {
  if (!meteo) return '';
  if (meteo.pluie) return '🌧️';
  return meteo.code <= 1 ? '☀️' : meteo.code <= 3 ? '⛅' : '🌫️';
}

const labelAge = (a) => (a === 0 ? '< 1 an' : `${a} an${a > 1 ? 's' : ''}`);

export function Accueil({ profil, onOuvrirDetail, onModifierProfil }) {
  const dates = optionsDates();
  const [dateISO, setDateISO] = useState(dates[0].dateISO);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [data, setData] = useState(null);

  const ville = VILLES.find((v) => v.id === profil.villeId) || VILLES[0];

  const charger = useCallback(async (date) => {
    setChargement(true);
    setErreur(null);
    try {
      setData(await chargerTop({
        dateISO: date, lat: ville.lat, lon: ville.lon, age: profil.age,
        dept: ville.dept, code: ville.code,
      }));
    } catch (e) {
      setErreur(e.message || 'Impossible de charger les sorties.');
    } finally {
      setChargement(false);
    }
  }, [ville.lat, ville.lon, ville.dept, ville.code, profil.age]);

  useEffect(() => { charger(dateISO); }, [dateISO, charger]);

  const meteo = data?.meteo;
  const top = data?.top || [];

  return (
    <ScrollView
      style={styles.ecran}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => charger(dateISO)} />}
    >
      <Strip style={styles.strip}>
        <View style={styles.stripRangee}>
          <Text style={styles.stripQg}>QG · {ville.nom.toUpperCase()}</Text>
          {!!meteo && <Text style={styles.stripMeteo}>{emojiMeteo(meteo)} {meteo.resume}</Text>}
        </View>
        <Text style={styles.stripEnfant}>ENFANT · {labelAge(profil.age).toUpperCase()}</Text>
      </Strip>

      <Text style={styles.hero}>ON SORT ?</Text>
      <Text style={styles.heroSous}>{libelleLong(dateISO)}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesRangee}>
        {dates.map((d) => (
          <Chip key={d.dateISO} label={d.label} actif={d.dateISO === dateISO} onPress={() => setDateISO(d.dateISO)} />
        ))}
      </ScrollView>

      {chargement && (
        <View style={styles.etat}>
          <ActivityIndicator color={couleurs.accent} size="large" />
          <Text style={styles.etatTexte}>On cherche les pépites du jour…</Text>
        </View>
      )}

      {!chargement && erreur && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Pas de liaison.</Text>
          <Text style={styles.etatTexte}>{erreur}</Text>
          <View style={styles.etatBouton}>
            <Bouton label="Réessayer" onPress={() => charger(dateISO)} />
          </View>
        </View>
      )}

      {!chargement && !erreur && top.length === 0 && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Rien ce jour-là.</Text>
          <Text style={styles.etatTexte}>Essaie un autre jour depuis les puces au-dessus.</Text>
        </View>
      )}

      {!chargement && !erreur && top.length > 0 && (
        <>
          <CarteSortie ev={top[0]} preferee rang={1} onPress={() => onOuvrirDetail(top[0])} />
          {top.length > 1 && <Section>Le reste du top</Section>}
          {top.slice(1).map((ev, i) => (
            <CarteSortie key={ev.id || ev.titre} ev={ev} rang={i + 2} onPress={() => onOuvrirDetail(ev)} />
          ))}
        </>
      )}

      <View style={styles.pied}>
        <Bouton variante="secondaire" label="Changer de ville ou d'âge" onPress={onModifierProfil} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: espace.xxl },

  strip: { marginBottom: espace.l },
  stripRangee: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripQg: { color: couleurs.stripTexte, fontSize: 15, letterSpacing: 0.5, fontFamily: police.corpsFort },
  stripMeteo: { color: couleurs.stripTexte, fontSize: 14, fontFamily: police.corps },
  stripEnfant: { ...typo.instrument, color: couleurs.accent, fontFamily: police.corpsFort, marginTop: espace.xs, textTransform: 'uppercase' },

  hero: { ...typo.displayXL, color: couleurs.encre, fontFamily: police.display },
  heroSous: { color: couleurs.texte, fontSize: 15, marginTop: espace.xs, fontFamily: police.corps },

  datesRangee: { marginTop: espace.l, marginBottom: espace.l, flexGrow: 0 },

  etat: { alignItems: 'center', paddingVertical: espace.xxxl },
  etatTitre: { ...typo.displayL, fontSize: 22, color: couleurs.encre, fontFamily: police.display, marginBottom: espace.s },
  etatTexte: { color: couleurs.discret, fontSize: 15, textAlign: 'center', marginTop: espace.s, fontFamily: police.corps },
  etatBouton: { marginTop: espace.l },

  pied: { marginTop: espace.xl },
});
