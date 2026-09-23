// Fiche d'une sortie — charte « Cockpit clair ». L'essentiel pour décider,
// puis les actions : voir l'événement, partager, y aller.

import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre } from '../theme.js';
import { Pastille, Bouton, Section } from '../components/ui.js';
import { LIEN_APP } from '../config.js';

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

export function Detail({ ev, onRetour, gardee, onGarder }) {
  const plan = urlPlan(ev);
  const age = ev.age ? (ev.age.max !== null ? `${ev.age.min}-${ev.age.max} ans` : `dès ${ev.age.min} ans`) : null;

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Pressable onPress={onRetour} accessibilityRole="button" style={styles.retour}>
        <Text style={styles.retourTexte}>‹ RETOUR</Text>
      </Pressable>

      <Text style={styles.titre}>{ev.titre}</Text>

      <View style={styles.raisons}>
        {(ev.raisons || []).map((r) => <Pastille key={r} label={r} />)}
      </View>

      <Section>Fiche</Section>
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

      <View style={styles.actions}>
        {!!ev.url && <Bouton label="Voir l'événement" onPress={() => Linking.openURL(ev.url)} />}
        {!!onGarder && (
          <Bouton
            variante="secondaire"
            label={gardee ? 'Gardée ★' : 'Garder ☆'}
            onPress={onGarder}
          />
        )}
        {!!plan && <Bouton variante="secondaire" label="Y aller 🗺️" onPress={() => Linking.openURL(plan)} />}
        <Bouton variante="secondaire" label="Partager 📤" onPress={() => partager(ev)} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: espace.xxl },
  retour: { marginBottom: espace.l },
  retourTexte: { color: couleurs.encre, fontSize: 14, letterSpacing: 0.5, fontFamily: police.corpsFort },
  titre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display },
  raisons: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espace.l },
  bloc: { backgroundColor: couleurs.panneau, borderRadius: rayon.m, padding: espace.l, ...cadre },
  ligne: { flexDirection: 'row', marginVertical: espace.xs },
  ligneIcone: { width: 28, fontSize: 15 },
  ligneTexte: { flex: 1, color: couleurs.texte, fontSize: 15, lineHeight: 21, fontFamily: police.corps },
  description: { color: couleurs.texte, fontSize: 15.5, lineHeight: 24, marginTop: espace.xl, fontFamily: police.corps },
  actions: { marginTop: espace.xxl, gap: espace.m, alignItems: 'flex-start' },
});
