// Onglet Moi — le bien-être du papa, sans jargon : un check-in « batterie »
// en un tap (mémorisé en local, 7 derniers jours affichés), le défi de la
// semaine et un micro-conseil. Tout tourne sans backend.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { couleurs, espace, rayon, police, typo, cadre } from '../theme.js';
import { Strip, Section } from '../components/ui.js';

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
      <Strip style={styles.strip}>
        <Text style={styles.stripCode}>MODULE · MOI</Text>
        <Text style={styles.stripStatut}>
          {checkins[aujourdhui] ? `BATTERIE · ${NIVEAUX[checkins[aujourdhui] - 1].label.toUpperCase()}` : 'BATTERIE · À RELEVER'}
        </Text>
      </Strip>

      <Text style={styles.titre}>Et toi, ça va ?</Text>

      <View style={styles.panneau}>
        <Text style={styles.instrument}>TA BATTERIE PAPA AUJOURD'HUI</Text>
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
                {/* L'ambre reste sur le cran du jour : l'historique se lit à l'encre. */}
                <View style={[styles.jauge, v ? { height: 6 + v * 6, backgroundColor: couleurs.encre } : null]} />
              </View>
            );
          })}
        </View>
        <Text style={styles.historiqueLegende}>Tes 7 derniers jours — juste pour toi, ça reste sur ton téléphone.</Text>
      </View>

      <Section>Le défi de la semaine</Section>
      <View style={styles.panneauDefi}>
        <Text style={styles.defiTexte}>{DEFIS[semaine % DEFIS.length]}</Text>
      </View>

      <Section>À méditer</Section>
      <View style={styles.panneau}>
        <Text style={styles.conseil}>{CONSEILS[semaine % CONSEILS.length]}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: 120 },

  strip: { marginBottom: espace.l },
  stripCode: { color: couleurs.stripTexte, fontSize: 15, letterSpacing: 0.5, fontFamily: police.corpsFort },
  stripStatut: { ...typo.instrument, color: couleurs.accent, fontFamily: police.corpsFort, marginTop: espace.xs, textTransform: 'uppercase' },

  titre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display, marginBottom: espace.l },

  panneau: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    ...cadre,
  },
  instrument: { ...typo.instrument, color: couleurs.discret, fontFamily: police.corpsFort, textTransform: 'uppercase' },

  // Cadran de batterie : les cinq crans, l'ambre marque celui du jour.
  niveaux: { flexDirection: 'row', marginTop: espace.l },
  niveau: {
    alignItems: 'center',
    paddingVertical: espace.s,
    paddingHorizontal: espace.xs,
    borderRadius: rayon.s,
    flex: 1,
    ...cadre,
    marginRight: espace.xs,
  },
  niveauActif: { backgroundColor: couleurs.accent },
  niveauEmoji: { fontSize: 24 },
  niveauLabel: { fontSize: 10.5, color: couleurs.texte, marginTop: espace.xs, fontFamily: police.corpsFort },
  niveauLabelActif: { color: couleurs.encre },

  historique: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 48,
    marginTop: espace.xl,
    paddingTop: espace.s,
    borderTopWidth: 1,
    borderTopColor: couleurs.ligne,
  },
  jour: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  jauge: { width: 14, height: 4, backgroundColor: couleurs.ligne },
  historiqueLegende: { color: couleurs.discret, fontSize: 12, lineHeight: 17, marginTop: espace.m, fontFamily: police.corps },

  panneauDefi: {
    backgroundColor: couleurs.reussiteDoux,
    borderRadius: rayon.m,
    padding: espace.l,
    borderWidth: 2,
    borderColor: couleurs.reussite,
  },
  defiTexte: { color: couleurs.encre, fontSize: 17, lineHeight: 24, fontFamily: police.corpsFort },
  conseil: { color: couleurs.texte, fontSize: 15, lineHeight: 23, fontFamily: police.corps },
});
