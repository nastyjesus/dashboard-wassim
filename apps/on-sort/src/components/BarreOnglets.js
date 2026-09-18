// Barre d'onglets maison — charte « Cockpit clair » : cadre encre en haut,
// libellés condensés en capitales, onglet actif souligné d'ambre.

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, police } from '../theme.js';

export const ONGLETS = [
  { id: 'sorties', emoji: '🎈', label: 'Sorties' },
  { id: 'couple', emoji: '❤️', label: 'Couple' },
  { id: 'moi', emoji: '💪', label: 'Moi' },
  { id: 'tribu', emoji: '🔥', label: 'Tribu' },
];

export function BarreOnglets({ actif, onChange }) {
  return (
    <View style={styles.barre}>
      {ONGLETS.map((o) => {
        const on = actif === o.id;
        return (
          <Pressable
            key={o.id}
            onPress={() => onChange(o.id)}
            style={styles.onglet}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
          >
            <View style={[styles.trait, on && styles.traitActif]} />
            <Text style={[styles.emoji, !on && styles.emojiInactif]}>{o.emoji}</Text>
            <Text style={[styles.label, on && styles.labelActif]}>{o.label.toUpperCase()}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    backgroundColor: couleurs.panneau,
    borderTopWidth: 2,
    borderTopColor: couleurs.encre,
    paddingBottom: espace.xl, // marge geste iPhone
  },
  onglet: { flex: 1, alignItems: 'center' },
  trait: { height: 3, width: 28, backgroundColor: 'transparent', marginBottom: espace.s },
  traitActif: { backgroundColor: couleurs.accent },
  emoji: { fontSize: 21 },
  emojiInactif: { opacity: 0.4 },
  label: {
    fontSize: 11,
    letterSpacing: 0.5,
    color: couleurs.discret,
    fontFamily: police.corpsFort,
    marginTop: 3,
  },
  labelActif: { color: couleurs.encre },
});
