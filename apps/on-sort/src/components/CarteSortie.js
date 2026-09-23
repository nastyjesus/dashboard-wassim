// Carte d'une sortie — charte « Cockpit clair ».
// Préférée = panneau GO ambre (relief plein). Les autres = panneaux blancs
// numérotés (le rang du classement). Raisons = pastilles cadrées à l'encre.

import { Pressable, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre, ombre } from '../theme.js';
import { Pastille } from './ui.js';

function sousTitre(ev) {
  const morceaux = [];
  if (ev.ville) morceaux.push(ev.ville);
  if (ev.distanceKm !== null && ev.distanceKm !== undefined) morceaux.push(`${ev.distanceKm} km`);
  return morceaux.join(' · ');
}

// Bouton « garder » — étoile cadrée à l'encre, jamais ambre (l'ambre reste au
// GO). Pleine = gardée. Le geste marche sans compte.
function Etoile({ gardee, onPress }) {
  if (!onPress) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={gardee ? 'Retirer des sorties gardées' : 'Garder cette sortie'}
      accessibilityState={{ selected: !!gardee }}
      hitSlop={8}
      style={[styles.etoile, gardee && styles.etoilePleine]}
    >
      <Text style={styles.etoileTexte}>{gardee ? '★' : '☆'}</Text>
    </Pressable>
  );
}

export function CarteSortie({ ev, rang, preferee, onPress, gardee, onGarder }) {
  if (preferee) {
    return (
      <Pressable onPress={onPress} style={styles.go} accessibilityRole="button">
        <View style={styles.goEntete}>
          <Text style={styles.goStatut}>STATUT : ON SORT</Text>
          <View style={styles.goActions}>
            <Etoile gardee={gardee} onPress={onGarder} />
            <Text style={styles.goChevron}>›</Text>
          </View>
        </View>
        <Text style={styles.goTitre} numberOfLines={3}>{ev.titre}</Text>
        {!!sousTitre(ev) && <Text style={styles.goSous}>{sousTitre(ev)}</Text>}
        {!!ev.horaires && <Text style={styles.goSous} numberOfLines={1}>🕐 {ev.horaires}</Text>}
        <View style={styles.raisons}>
          {(ev.raisons || []).slice(0, 4).map((r) => <Pastille key={r} label={r} />)}
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress} style={styles.carte} accessibilityRole="button">
      <View style={styles.rangBoite}>
        <Text style={styles.rangTexte}>{String(rang).padStart(2, '0')}</Text>
      </View>
      <View style={styles.corps}>
        <Text style={styles.titre} numberOfLines={2}>{ev.titre}</Text>
        {!!sousTitre(ev) && <Text style={styles.sousTitre}>{sousTitre(ev)}</Text>}
        <View style={styles.raisons}>
          {(ev.raisons || []).slice(0, 3).map((r) => <Pastille key={r} label={r} />)}
        </View>
      </View>
      <Etoile gardee={gardee} onPress={onGarder} />
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Panneau GO (préférée)
  go: {
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    padding: espace.xl,
    marginBottom: espace.l,
    ...cadre,
    ...ombre.relief,
  },
  goEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goActions: { flexDirection: 'row', alignItems: 'center', gap: espace.m },
  goStatut: { ...typo.instrument, color: couleurs.encre, fontFamily: police.corpsFort, textTransform: 'uppercase' },
  goChevron: { fontSize: 26, color: couleurs.encre, lineHeight: 26 },
  goTitre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display, marginTop: espace.s },
  goSous: { color: couleurs.encre, fontSize: 14, marginTop: espace.xs, fontFamily: police.corps },

  // Panneau standard numéroté
  carte: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.m,
    ...cadre,
  },
  rangBoite: {
    width: 40,
    height: 40,
    borderRadius: rayon.s,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: espace.l,
    ...cadre,
  },
  rangTexte: { ...typo.displayL, fontSize: 20, lineHeight: 22, color: couleurs.encre, fontFamily: police.display },
  corps: { flex: 1 },
  titre: { color: couleurs.encre, fontSize: 16, lineHeight: 21, fontFamily: police.corpsFort },
  sousTitre: { color: couleurs.discret, fontSize: 13, marginTop: 2, fontFamily: police.corps },
  chevron: { fontSize: 24, color: couleurs.encre, marginLeft: espace.s },

  raisons: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espace.m },

  // Étoile « garder » — pastille cadrée, pleine quand la sortie est gardée.
  etoile: {
    width: 34,
    height: 34,
    borderRadius: rayon.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: couleurs.encre,
    marginLeft: espace.s,
  },
  etoilePleine: { backgroundColor: couleurs.reussiteDoux, borderColor: couleurs.reussite },
  etoileTexte: { fontSize: 16, lineHeight: 20, color: couleurs.encre },
});
