// Barre d'onglets maison (4 onglets, pas besoin d'une lib de navigation).

import { Pressable, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace } from '../theme.js';

export const ONGLETS = [
  { id: 'sorties', emoji: '🎈', label: 'Sorties' },
  { id: 'couple', emoji: '❤️', label: 'Couple' },
  { id: 'moi', emoji: '💪', label: 'Moi' },
  { id: 'tribu', emoji: '🔥', label: 'Tribu' },
];

export function BarreOnglets({ actif, onChange }) {
  return (
    <View style={styles.barre}>
      {ONGLETS.map((o) => (
        <Pressable
          key={o.id}
          onPress={() => onChange(o.id)}
          style={styles.onglet}
          accessibilityRole="button"
          accessibilityState={{ selected: actif === o.id }}
        >
          <Text style={[styles.emoji, actif !== o.id && styles.emojiInactif]}>{o.emoji}</Text>
          <Text style={[styles.label, actif === o.id && styles.labelActif]}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  barre: {
    flexDirection: 'row',
    backgroundColor: couleurs.carte,
    borderTopWidth: 1,
    borderTopColor: couleurs.ligne,
    paddingTop: espace.s,
    paddingBottom: espace.xl, // marge pour la zone geste iPhone
  },
  onglet: { flex: 1, alignItems: 'center' },
  emoji: { fontSize: 22 },
  emojiInactif: { opacity: 0.45 },
  label: { fontSize: 11, fontWeight: '600', color: couleurs.discret, marginTop: 2 },
  labelActif: { color: couleurs.accent, fontWeight: '700' },
});
