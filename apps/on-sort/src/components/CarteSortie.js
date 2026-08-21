// Carte d'une sortie. Deux variantes : « préférée » (mise en avant) et
// standard. Les raisons viennent du worker, déjà en français.

import { Pressable, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, rayon, ombre } from '../theme.js';
import { Pastille } from './ui.js';

function sousTitre(ev) {
  const morceaux = [];
  if (ev.ville) morceaux.push(ev.ville);
  if (ev.distanceKm !== null && ev.distanceKm !== undefined) morceaux.push(`${ev.distanceKm} km`);
  return morceaux.join(' · ');
}

export function CarteSortie({ ev, preferee, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.carte, preferee && styles.cartePreferee]}
      accessibilityRole="button"
    >
      {preferee && (
        <View style={styles.badge}>
          <Text style={styles.badgeTexte}>⭐ Notre préférée</Text>
        </View>
      )}
      <Text style={[styles.titre, preferee && styles.titrePreferee]} numberOfLines={2}>
        {ev.titre}
      </Text>
      {!!sousTitre(ev) && <Text style={styles.sousTitre}>{sousTitre(ev)}</Text>}
      {!!ev.horaires && <Text style={styles.horaires} numberOfLines={1}>🕐 {ev.horaires}</Text>}
      <View style={styles.raisons}>
        {(ev.raisons || []).slice(0, 4).map((r) => (
          <Pastille key={r} label={r} tonique={preferee} />
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.l,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    ...ombre.carte,
  },
  cartePreferee: { borderColor: couleurs.accent, borderWidth: 1.5 },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: couleurs.accentDoux,
    borderRadius: rayon.pill,
    paddingHorizontal: espace.m,
    paddingVertical: espace.xs,
    marginBottom: espace.m,
  },
  badgeTexte: { color: couleurs.accent, fontWeight: '700', fontSize: 12.5 },
  titre: { color: couleurs.encre, fontSize: 17, fontWeight: '700', lineHeight: 23 },
  titrePreferee: { fontSize: 20, lineHeight: 27 },
  sousTitre: { color: couleurs.discret, fontSize: 14, marginTop: espace.xs },
  horaires: { color: couleurs.texte, fontSize: 13.5, marginTop: espace.s },
  raisons: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espace.m },
});
