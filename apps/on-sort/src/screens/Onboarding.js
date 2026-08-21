// Onboarding en un seul écran : votre coin + l'âge de l'enfant, c'est tout.

import { useState } from 'react';
import { ScrollView, Text, View, Pressable, StyleSheet } from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';
import { Chip } from '../components/ui.js';
import { VILLES, AGES } from '../config.js';

export function Onboarding({ profilInitial, onValider }) {
  const [villeId, setVilleId] = useState(profilInitial?.villeId || 'rennes');
  const [age, setAge] = useState(profilInitial?.age || 3);

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Text style={styles.titre}>On sort ? 👋</Text>
      <Text style={styles.intro}>
        Dites-nous où vous êtes et l'âge de votre enfant : on vous propose les
        meilleures sorties du jour, météo comprise.
      </Text>

      <Text style={styles.section}>Votre coin</Text>
      <View style={styles.chips}>
        {VILLES.map((v) => (
          <Chip key={v.id} label={v.nom} actif={v.id === villeId} onPress={() => setVilleId(v.id)} />
        ))}
      </View>

      <Text style={styles.section}>L'âge de votre enfant</Text>
      <View style={styles.chips}>
        {AGES.map((a) => (
          <Chip key={a} label={`${a} an${a > 1 ? 's' : ''}`} actif={a === age} onPress={() => setAge(a)} />
        ))}
      </View>

      <Pressable style={styles.cta} onPress={() => onValider({ villeId, age })} accessibilityRole="button">
        <Text style={styles.ctaTexte}>C'est parti !</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 72, paddingBottom: espace.xxl },
  titre: { fontSize: 34, fontWeight: '800', color: couleurs.encre },
  intro: { fontSize: 16, lineHeight: 23, color: couleurs.texte, marginTop: espace.m },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: couleurs.discret,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: espace.xxl,
    marginBottom: espace.m,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  cta: {
    marginTop: espace.xxl,
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    paddingVertical: espace.l,
    alignItems: 'center',
  },
  ctaTexte: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
});
