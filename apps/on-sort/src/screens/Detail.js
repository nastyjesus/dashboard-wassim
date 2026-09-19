// Fiche d'une sortie : l'essentiel pour décider, puis deux actions —
// voir l'événement (page source) et y aller (plan).

import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';
import { Pastille } from '../components/ui.js';
import { LIEN_APP } from '../config.js';

/** Message de partage : la sortie + la signature Papa Parfait. Chaque
 *  partage entre parents est de l'acquisition gratuite. */
function messagePartage(ev) {
  const lignes = [`🎈 ${ev.titre}`];
  if (ev.horaires) lignes.push(`🕐 ${ev.horaires}`);
  const lieu = [ev.lieuNom, ev.ville].filter(Boolean).join(', ');
  if (lieu) lignes.push(`📍 ${lieu}`);
  if (ev.gratuit) lignes.push('💸 Gratuit');
  if (ev.url) lignes.push(ev.url);
  lignes.push('', 'Trouvé avec l\'appli Papa Parfait 🧡');
  if (LIEN_APP) lignes.push(LIEN_APP);
  return lignes.join('\n');
}

async function partager(ev) {
  try {
    await Share.share({ message: messagePartage(ev) });
  } catch { /* partage annulé ou non supporté (web) : rien à faire */ }
}

function urlPlan(ev) {
  if (ev.lat && ev.lon) return `https://maps.google.com/?q=${ev.lat},${ev.lon}`;
  if (ev.adresse) return `https://maps.google.com/?q=${encodeURIComponent(ev.adresse)}`;
  return null;
}

function Ligne({ icone, texte }) {
  if (!texte) return null;
  return (
    <View style={styles.ligne}>
      <Text style={styles.ligneIcone}>{icone}</Text>
      <Text style={styles.ligneTexte}>{texte}</Text>
    </View>
  );
}

export function Detail({ ev, onRetour }) {
  const plan = urlPlan(ev);
  const age = ev.age ? (ev.age.max !== null ? `${ev.age.min}-${ev.age.max} ans` : `dès ${ev.age.min} ans`) : null;

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Pressable onPress={onRetour} accessibilityRole="button" style={styles.retour}>
        <Text style={styles.retourTexte}>← Retour</Text>
      </Pressable>

      <Text style={styles.titre}>{ev.titre}</Text>

      <View style={styles.raisons}>
        {(ev.raisons || []).map((r) => <Pastille key={r} label={r} tonique />)}
      </View>

      <View style={styles.bloc}>
        <Ligne icone="📍" texte={ev.lieuNom || ev.adresse} />
        {!!ev.lieuNom && !!ev.adresse && <Ligne icone=" " texte={ev.adresse} />}
        <Ligne icone="🕐" texte={ev.horaires} />
        <Ligne icone="🎂" texte={age} />
        <Ligne
          icone="🚗"
          texte={ev.distanceKm !== null && ev.distanceKm !== undefined ? `à ${ev.distanceKm} km` : null}
        />
      </View>

      {!!ev.description && <Text style={styles.description}>{ev.description}</Text>}

      {!!ev.url && (
        <Pressable style={styles.cta} onPress={() => Linking.openURL(ev.url)} accessibilityRole="button">
          <Text style={styles.ctaTexte}>Voir l'événement</Text>
        </Pressable>
      )}
      <Pressable style={styles.ctaSecondaire} onPress={() => partager(ev)} accessibilityRole="button">
        <Text style={styles.ctaSecondaireTexte}>Partager cette sortie 📤</Text>
      </Pressable>
      {!!plan && (
        <Pressable style={styles.ctaSecondaire} onPress={() => Linking.openURL(plan)} accessibilityRole="button">
          <Text style={styles.ctaSecondaireTexte}>Y aller 🗺️</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: espace.xxl },
  retour: { marginBottom: espace.l },
  retourTexte: { color: couleurs.accent, fontSize: 16, fontWeight: '700' },
  titre: { color: couleurs.encre, fontSize: 26, fontWeight: '800', lineHeight: 33 },
  raisons: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espace.l },
  bloc: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.m,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    padding: espace.l,
    marginTop: espace.m,
  },
  ligne: { flexDirection: 'row', marginVertical: espace.xs },
  ligneIcone: { width: 28, fontSize: 15 },
  ligneTexte: { flex: 1, color: couleurs.texte, fontSize: 15, lineHeight: 21 },
  description: { color: couleurs.texte, fontSize: 15.5, lineHeight: 24, marginTop: espace.xl },
  cta: {
    marginTop: espace.xxl,
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    paddingVertical: espace.l,
    alignItems: 'center',
  },
  ctaTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  ctaSecondaire: {
    marginTop: espace.m,
    backgroundColor: couleurs.carte,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    borderRadius: rayon.m,
    paddingVertical: espace.l,
    alignItems: 'center',
  },
  ctaSecondaireTexte: { color: couleurs.encre, fontSize: 16, fontWeight: '700' },
});
