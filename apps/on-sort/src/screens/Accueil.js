// L'écran cœur : je choisis un jour → top 5 scoré, préférée en avant.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { couleurs, espace } from '../theme.js';
import { Chip } from '../components/ui.js';
import { CarteSortie } from '../components/CarteSortie.js';
import { chargerTop } from '../api.js';
import { optionsDates, libelleLong } from '../dates.js';
import { VILLES } from '../config.js';

function emojiMeteo(meteo) {
  if (!meteo) return '';
  if (meteo.pluie) return '🌧️';
  return meteo.code <= 1 ? '☀️' : meteo.code <= 3 ? '⛅' : '🌫️';
}

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
      setData(await chargerTop({ dateISO: date, lat: ville.lat, lon: ville.lon, age: profil.age }));
    } catch (e) {
      setErreur(e.message || 'Impossible de charger les sorties.');
    } finally {
      setChargement(false);
    }
  }, [ville.lat, ville.lon, profil.age]);

  useEffect(() => { charger(dateISO); }, [dateISO, charger]);

  const meteo = data?.meteo;
  const top = data?.top || [];

  return (
    <ScrollView
      style={styles.ecran}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => charger(dateISO)} />}
    >
      <Text style={styles.surTitre}>{ville.nom} · {profil.age} an{profil.age > 1 ? 's' : ''}</Text>
      <Text style={styles.titre}>{libelleLong(dateISO)}</Text>
      {!!meteo && (
        <Text style={styles.meteo}>{emojiMeteo(meteo)} {meteo.resume}</Text>
      )}

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
          <Text style={styles.etatTitre}>Oups.</Text>
          <Text style={styles.etatTexte}>{erreur}</Text>
          <Pressable onPress={() => charger(dateISO)} accessibilityRole="button">
            <Text style={styles.lien}>Réessayer</Text>
          </Pressable>
        </View>
      )}

      {!chargement && !erreur && top.length === 0 && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Rien trouvé ce jour-là 🤷</Text>
          <Text style={styles.etatTexte}>Essayez un autre jour ou élargissez la zone.</Text>
        </View>
      )}

      {!chargement && !erreur && top.map((ev, i) => (
        <CarteSortie
          key={ev.id || ev.titre}
          ev={ev}
          preferee={i === 0}
          onPress={() => onOuvrirDetail(ev)}
        />
      ))}

      <Pressable onPress={onModifierProfil} accessibilityRole="button" style={styles.pied}>
        <Text style={styles.lien}>Changer de ville ou d'âge</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: espace.xxl },
  surTitre: { color: couleurs.discret, fontSize: 14, fontWeight: '600' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace.xs },
  meteo: { color: couleurs.texte, fontSize: 15, marginTop: espace.s },
  datesRangee: { marginTop: espace.l, marginBottom: espace.xl, flexGrow: 0 },
  etat: { alignItems: 'center', paddingVertical: espace.xxl * 2 },
  etatTitre: { color: couleurs.encre, fontSize: 18, fontWeight: '700', marginBottom: espace.s },
  etatTexte: { color: couleurs.discret, fontSize: 15, textAlign: 'center', marginTop: espace.m },
  lien: { color: couleurs.accent, fontWeight: '700', fontSize: 15, marginTop: espace.l },
  pied: { alignItems: 'center', marginTop: espace.l },
});
