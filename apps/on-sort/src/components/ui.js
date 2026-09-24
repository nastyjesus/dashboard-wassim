// Composants partagés — charte « Cockpit clair » (voir docs/charte-graphique.md).
// Panneaux cadrés à l'encre, un seul accent ambre, boutons largeur-contenu.

import { Pressable, Text, TextInput, StyleSheet, View } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre } from '../theme.js';

// Libellé de section — grotesque condensée, capitales (voir charte §3).
export function Section({ children, style }) {
  return <Text style={[styles.section, style]}>{children}</Text>;
}

// Bandeau instrument sombre (cluster de cadrans en haut d'un écran).
export function Strip({ children, style }) {
  return <View style={[styles.strip, style]}>{children}</View>;
}

// Bouton — largeur du contenu par défaut (jamais pleine ligne sauf demande).
// variantes : 'primaire' (ambre, action GO), 'secondaire' (contour), 'google'.
export function Bouton({ label, onPress, variante = 'primaire', pleineLargeur = false, disabled, icone }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.bouton,
        variante === 'primaire' && styles.boutonPrimaire,
        variante === 'secondaire' && styles.boutonSecondaire,
        variante === 'google' && styles.boutonGoogle,
        pleineLargeur ? styles.pleineLargeur : styles.largeurContenu,
        pressed && styles.boutonPresse,
        disabled && styles.boutonInactif,
      ]}
    >
      {icone ? <Text style={styles.icone}>{icone}</Text> : null}
      <Text
        style={[
          styles.boutonTexte,
          variante === 'secondaire' && styles.boutonTexteContour,
          variante === 'google' && styles.boutonTexteContour,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// Champ de saisie — libellé d'instrument en capitales + input cadré à l'encre.
export function Champ({ label, valeur, onChangeText, placeholder, ...props }) {
  return (
    <View style={styles.champBloc}>
      {label ? <Text style={styles.champLabel}>{label}</Text> : null}
      <TextInput
        value={valeur}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={couleurs.discret}
        style={styles.champ}
        {...props}
      />
    </View>
  );
}

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

// Case à cocher — cadre encre 2px, coche à l'encre quand elle est active.
// Pas d'ambre : la charte le réserve au GO et à l'action primaire. La zone
// tapable couvre la case ET son libellé.
export function Case({ label, aide, coche, onChange }) {
  return (
    <Pressable
      onPress={() => onChange(!coche)}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: !!coche }}
      accessibilityLabel={label}
      style={styles.caseBloc}
    >
      <View style={[styles.case, coche && styles.caseCochee]}>
        {coche ? <Text style={styles.caseCoche}>✓</Text> : null}
      </View>
      <View style={styles.caseTextes}>
        <Text style={styles.caseLabel}>{label}</Text>
        {aide ? <Text style={styles.caseAide}>{aide}</Text> : null}
      </View>
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
  section: {
    ...typo.section,
    color: couleurs.encre,
    fontFamily: police.displayMoyen,
    textTransform: 'uppercase',
    marginTop: espace.xl,
    marginBottom: espace.m,
  },
  strip: {
    backgroundColor: couleurs.strip,
    borderRadius: rayon.m,
    paddingHorizontal: espace.l,
    paddingVertical: espace.l,
  },

  // Boutons
  bouton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: espace.s,
    paddingHorizontal: espace.xl,
    paddingVertical: espace.m,
    borderRadius: rayon.pill,
    ...cadre,
  },
  largeurContenu: { alignSelf: 'flex-start' },
  pleineLargeur: { alignSelf: 'stretch' },
  boutonPrimaire: { backgroundColor: couleurs.accent },
  boutonSecondaire: { backgroundColor: 'transparent' },
  boutonGoogle: { backgroundColor: couleurs.panneau },
  boutonPresse: { opacity: 0.85 },
  boutonInactif: { opacity: 0.45 },
  boutonTexte: { color: couleurs.encre, fontSize: 16, fontFamily: police.corpsFort },
  boutonTexteContour: { color: couleurs.encre },
  icone: { fontSize: 16 },

  // Champ
  champBloc: { marginBottom: espace.l },
  champLabel: {
    fontSize: 12,
    letterSpacing: 0.6,
    color: couleurs.discret,
    fontFamily: police.corpsFort,
    textTransform: 'uppercase',
    marginBottom: espace.s,
  },
  champ: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    paddingHorizontal: espace.l,
    paddingVertical: espace.m,
    fontSize: 16,
    color: couleurs.encre,
    fontFamily: police.corps,
    ...cadre,
  },

  // Chip de sélection — actif = encre (l'ambre reste réservé au GO)
  chip: {
    paddingHorizontal: espace.l,
    paddingVertical: espace.s + 2,
    borderRadius: rayon.pill,
    backgroundColor: couleurs.panneau,
    marginRight: espace.s,
    marginBottom: espace.s,
    ...cadre,
  },
  chipActif: { backgroundColor: couleurs.encre },
  chipTexte: { color: couleurs.encre, fontSize: 15, fontFamily: police.corpsFort },
  chipTexteActif: { color: couleurs.panneau },

  // Case à cocher
  caseBloc: { flexDirection: 'row', alignItems: 'flex-start', gap: espace.m, marginBottom: espace.l },
  case: {
    width: 26,
    height: 26,
    borderRadius: rayon.s,
    backgroundColor: couleurs.panneau,
    alignItems: 'center',
    justifyContent: 'center',
    ...cadre,
  },
  caseCochee: { backgroundColor: couleurs.encre },
  caseCoche: { color: couleurs.panneau, fontSize: 15, lineHeight: 18, fontFamily: police.corpsFort },
  caseTextes: { flex: 1 },
  caseLabel: { color: couleurs.encre, fontSize: 15, lineHeight: 21, fontFamily: police.corpsFort },
  caseAide: { color: couleurs.discret, fontSize: 13, lineHeight: 19, marginTop: 2, fontFamily: police.corps },

  // Pastille / tag
  pastille: {
    paddingHorizontal: espace.m,
    paddingVertical: espace.xs + 1,
    borderRadius: rayon.pill,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: couleurs.encre,
    marginRight: espace.s,
    marginBottom: espace.s,
  },
  pastilleTonique: { borderColor: couleurs.reussite, backgroundColor: couleurs.reussiteDoux },
  pastilleTexte: { color: couleurs.encre, fontSize: 12.5, fontFamily: police.corpsFort },
  pastilleTexteTonique: { color: couleurs.reussite },
});
