// Onglet Moi — le bien-être du papa, sans jargon : un check-in « batterie »
// en un tap (mémorisé en local, 7 derniers jours affichés), le défi de la
// semaine et un micro-conseil. Tout tourne sans backend.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { couleurs, espace, rayon, ombre } from '../theme.js';

const CLE_CHECKINS = 'pp:checkins';
const NIVEAUX = [
  { valeur: 1, emoji: '🪫', label: 'À plat' },
  { valeur: 2, emoji: '😮‍💨', label: 'Ça tire' },
  { valeur: 3, emoji: '😐', label: 'Ça va' },
  { valeur: 4, emoji: '🙂', label: 'En forme' },
  { valeur: 5, emoji: '⚡', label: 'Au top' },
];

const DEFIS = [
  'Cette semaine : un dîner sans écran, tous les soirs. Le tien compris.',
  'Cette semaine : 20 minutes dehors rien que pour toi, trois fois.',
  'Cette semaine : couché avant 23h au moins 4 soirs.',
  'Cette semaine : appelle un pote. Un vrai appel, pas un vocal.',
  'Cette semaine : une activité avec ton enfant sans regarder l\'heure.',
  'Cette semaine : demande de l\'aide une fois au lieu de serrer les dents.',
];

const CONSEILS = [
  'La patience n\'est pas un trait de caractère, c\'est une jauge. Elle se recharge en dormant, en bougeant, en soufflant. Si tu exploses souvent, le problème n\'est pas ta volonté — c\'est ta jauge.',
  'Un papa qui prend du temps pour lui n\'abandonne pas sa famille : il recharge celui qui la porte.',
  'Tu n\'as pas besoin d\'être disponible à 100 % tout le temps. 20 minutes de vraie présence valent mieux qu\'une journée à moitié là.',
  'Le soir où tu n\'en peux plus : baisse le niveau d\'exigence, pas le niveau d\'affection. Pâtes-jambon et câlin, c\'est une excellente soirée.',
];

function numeroSemaine(d = new Date()) {
  const debut = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - debut) / (7 * 86400000));
}

function jourISO(decalage = 0) {
  const d = new Date();
  d.setDate(d.getDate() + decalage);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const j = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${j}`;
}

export function Moi() {
  const [checkins, setCheckins] = useState({});
  const aujourdhui = jourISO(0);

  useEffect(() => {
    AsyncStorage.getItem(CLE_CHECKINS)
      .then((brut) => setCheckins(brut ? JSON.parse(brut) : {}))
      .catch(() => {});
  }, []);

  const pointer = (valeur) => {
    const maj = { ...checkins, [aujourdhui]: valeur };
    setCheckins(maj);
    AsyncStorage.setItem(CLE_CHECKINS, JSON.stringify(maj)).catch(() => {});
  };

  const semaine = numeroSemaine();
  const septJours = Array.from({ length: 7 }, (_, i) => jourISO(i - 6));

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Text style={styles.surTitre}>Moi</Text>
      <Text style={styles.titre}>Et toi, ça va ?</Text>

      <View style={[styles.carte, ombre.carte]}>
        <Text style={styles.carteTitre}>🔋 Ta batterie papa aujourd'hui</Text>
        <View style={styles.niveaux}>
          {NIVEAUX.map((n) => (
            <Pressable
              key={n.valeur}
              onPress={() => pointer(n.valeur)}
              style={[styles.niveau, checkins[aujourdhui] === n.valeur && styles.niveauActif]}
              accessibilityRole="button"
            >
              <Text style={styles.niveauEmoji}>{n.emoji}</Text>
              <Text style={[styles.niveauLabel, checkins[aujourdhui] === n.valeur && styles.niveauLabelActif]}>
                {n.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.historique}>
          {septJours.map((j) => {
            const v = checkins[j];
            return (
              <View key={j} style={styles.jour}>
                <View style={[styles.jauge, v ? { height: 6 + v * 6, backgroundColor: couleurs.accent } : null]} />
              </View>
            );
          })}
        </View>
        <Text style={styles.historiqueLegende}>Tes 7 derniers jours — juste pour toi, ça reste sur ton téléphone.</Text>
      </View>

      <View style={styles.carteDefi}>
        <Text style={styles.defiBadge}>🎯 Le défi de la semaine</Text>
        <Text style={styles.defiTexte}>{DEFIS[semaine % DEFIS.length]}</Text>
      </View>

      <View style={styles.carte}>
        <Text style={styles.carteTitre}>💡 À méditer</Text>
        <Text style={styles.conseil}>{CONSEILS[semaine % CONSEILS.length]}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: 120 },
  surTitre: { color: couleurs.discret, fontSize: 14, fontWeight: '600' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace.xs, marginBottom: espace.xl },
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.l,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  carteTitre: { color: couleurs.encre, fontSize: 17, fontWeight: '700' },
  niveaux: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espace.l },
  niveau: {
    alignItems: 'center',
    paddingVertical: espace.s,
    paddingHorizontal: espace.xs,
    borderRadius: rayon.m,
    flex: 1,
  },
  niveauActif: { backgroundColor: couleurs.accentDoux },
  niveauEmoji: { fontSize: 26 },
  niveauLabel: { fontSize: 10.5, color: couleurs.discret, marginTop: espace.xs, fontWeight: '600' },
  niveauLabelActif: { color: couleurs.accent },
  historique: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 44,
    marginTop: espace.xl,
    paddingHorizontal: espace.s,
  },
  jour: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  jauge: { width: 14, height: 4, borderRadius: 3, backgroundColor: couleurs.ligne },
  historiqueLegende: { color: couleurs.discret, fontSize: 12, marginTop: espace.m },
  carteDefi: {
    backgroundColor: couleurs.reussiteDoux,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.l,
  },
  defiBadge: { color: couleurs.reussite, fontWeight: '700', fontSize: 13 },
  defiTexte: { color: couleurs.encre, fontSize: 17, fontWeight: '700', lineHeight: 24, marginTop: espace.s },
  conseil: { color: couleurs.texte, fontSize: 15, lineHeight: 23, marginTop: espace.s, fontStyle: 'italic' },
});
