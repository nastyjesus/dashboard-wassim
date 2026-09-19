// Petits composants partagés : chips de sélection, pastilles de raisons.

import { Pressable, Text, StyleSheet, View } from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';

export function Chip({ label, actif, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, actif && styles.chipActif]}
      accessibilityRole="button"
      accessibilityState={{ selected: !!actif }}
    >
      <Text style={[styles.chipTexte, actif && styles.chipTexteActif]}>{label}</Text>
    </Pressable>
  );
}

export function Pastille({ label, tonique }) {
  return (
    <View style={[styles.pastille, tonique && styles.pastilleTonique]}>
      <Text style={[styles.pastilleTexte, tonique && styles.pastilleTexteTonique]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: espace.l,
    paddingVertical: espace.s + 2,
    borderRadius: rayon.pill,
    backgroundColor: couleurs.carte,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    marginRight: espace.s,
    marginBottom: espace.s,
  },
  chipActif: { backgroundColor: couleurs.encre, borderColor: couleurs.encre },
  chipTexte: { color: couleurs.texte, fontSize: 15, fontWeight: '500' },
  chipTexteActif: { color: '#FFFFFF' },

  pastille: {
    paddingHorizontal: espace.m,
    paddingVertical: espace.xs + 1,
    borderRadius: rayon.pill,
    backgroundColor: couleurs.fond,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    marginRight: espace.s,
    marginBottom: espace.s,
  },
  pastilleTonique: { backgroundColor: couleurs.reussiteDoux, borderColor: couleurs.reussiteDoux },
  pastilleTexte: { color: couleurs.discret, fontSize: 12.5, fontWeight: '600' },
  pastilleTexteTonique: { color: couleurs.reussite },
});
