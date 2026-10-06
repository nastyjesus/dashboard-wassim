// Fiche d'une sortie — charte « Cockpit clair ». L'essentiel pour décider,
// puis les actions : voir l'événement, partager, y aller.

import { useState } from 'react';
import { Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre } from '../theme.js';
import { Pastille, Bouton, Section } from '../components/ui.js';
import { LIEN_APP } from '../config.js';
import { mentionSource } from '../mention.js';
import { tarif } from '../tarif.js';

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

// Au-delà, la description se replie : les actions (voir, garder, y aller)
// doivent rester à portée de pouce.
const APERCU_CARACTERES = 500;

/**
 * Description en paragraphes : le worker garde un paragraphe par ligne
 * (« \n »). Une ligne qui commence par « - » ou « • » est une puce (programme
 * heure par heure, liste de matériel…).
 */
function Description({ texte }) {
  const [ouverte, setOuverte] = useState(false);
  const paragraphes = texte.split('\n').map((p) => p.trim()).filter(Boolean);
  const longue = texte.length > APERCU_CARACTERES;
  // Replié : les premiers paragraphes jusqu'à ~500 caractères (au moins un).
  let visibles = paragraphes;
  if (longue && !ouverte) {
    let total = 0;
    visibles = paragraphes.filter((p, i) => {
      total += p.length;
      return i === 0 || total <= APERCU_CARACTERES;
    });
  }
  return (
    <View style={styles.description}>
      {visibles.map((p, i) => {
        const puce = /^[-•–]\s+/.test(p);
        // Un paragraphe qui suit une liste reprend l'air d'un paragraphe.
        const apresListe = i > 0 && /^[-•–]\s+/.test(visibles[i - 1]);
        return puce ? (
          <View key={i} style={styles.puce}>
            <Text style={styles.puceSigne}>•</Text>
            <Text style={[styles.paragraphe, styles.puceTexte]}>{p.replace(/^[-•–]\s+/, '')}</Text>
          </View>
        ) : (
          <Text key={i} style={[styles.paragraphe, apresListe && styles.apresListe]}>{p}</Text>
        );
      })}
      {longue && (ouverte || visibles.length < paragraphes.length) && (
        <Pressable onPress={() => setOuverte(!ouverte)} accessibilityRole="button" style={styles.suite}>
          <Text style={styles.suiteTexte}>{ouverte ? 'RÉDUIRE ▴' : 'LIRE LA SUITE ▾'}</Text>
        </Pressable>
      )}
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

      {!!ev.photoUrl && (
        <Image source={{ uri: ev.photoUrl }} style={styles.photo} resizeMode="cover" accessibilityIgnoresInvertColors />
      )}

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
        <Ligne icone="💶" texte={tarif(ev)} />
        <Ligne icone="🎟️" texte={ev.reservation ? 'Réservation obligatoire' : null} />
        <Ligne
          icone="🚗"
          texte={ev.distanceKm !== null && ev.distanceKm !== undefined ? `à ${ev.distanceKm} km` : null}
        />
      </View>

      {!!ev.description && <Description texte={ev.description} />}
      {!!mentionSource(ev) && <Text style={styles.mention}>{mentionSource(ev)}</Text>}
      {!!ev.proposePar && <Text style={styles.mention}>Proposé par {ev.proposePar}</Text>}

      <View style={styles.actions}>
        {/* Un seul bouton ambre : la billetterie quand il faut réserver. */}
        {!!ev.billetterie && <Bouton label="Réserver 🎟️" onPress={() => Linking.openURL(ev.billetterie)} />}
        {!!ev.url && ev.url !== ev.billetterie && (
          <Bouton
            variante={ev.billetterie ? 'secondaire' : undefined}
            label="Voir l'événement"
            onPress={() => Linking.openURL(ev.url)}
          />
        )}
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
  // Hublot cadré (charte §4) : encre 2px, rayon s, recadré.
  photo: { width: '100%', height: 200, borderRadius: rayon.s, marginBottom: espace.l, backgroundColor: couleurs.panneau, ...cadre },
  titre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display },
  raisons: { flexDirection: 'row', flexWrap: 'wrap', marginTop: espace.l },
  bloc: { backgroundColor: couleurs.panneau, borderRadius: rayon.m, padding: espace.l, ...cadre },
  ligne: { flexDirection: 'row', marginVertical: espace.xs },
  ligneIcone: { width: 28, fontSize: 15 },
  ligneTexte: { flex: 1, color: couleurs.texte, fontSize: 15, lineHeight: 21, fontFamily: police.corps },
  description: { marginTop: espace.xl },
  paragraphe: { color: couleurs.texte, fontSize: 15.5, lineHeight: 24, marginBottom: espace.m, fontFamily: police.corps },
  puce: { flexDirection: 'row', paddingLeft: espace.xs },
  puceSigne: { width: 18, color: couleurs.texte, fontSize: 15.5, lineHeight: 24 },
  puceTexte: { flex: 1, marginBottom: espace.xs },
  apresListe: { marginTop: espace.s },
  suite: { paddingVertical: espace.s },
  suiteTexte: { color: couleurs.encre, fontSize: 14, letterSpacing: 0.5, fontFamily: police.corpsFort },
  mention: { color: couleurs.discret, fontSize: 13, lineHeight: 18, marginTop: espace.l, fontFamily: police.corps },
  actions: { marginTop: espace.xxl, gap: espace.m, alignItems: 'flex-start' },
});
