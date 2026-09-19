// Écran « Bientôt » d'un pilier en teaser (Couple, Moi, Tribu) : aperçu de
// ce qui arrive + vote « Ça m'intéresse » compté côté worker — les votes
// décident quel pilier sera construit en premier.

import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';
import { aDejaVote, voter } from '../votes.js';

const CONTENUS = {
  couple: {
    surTitre: 'Couple',
    titre: 'Elle aussi, elle compte.',
    emoji: '❤️',
    apercu: [
      ['💌', 'La mission de la semaine — un petit geste concret, chaque semaine'],
      ['🍷', 'Le radar date night — restos + garde d\'enfants du même soir'],
      ['📅', 'Les dates qui comptent — rappels discrets avant les moments importants'],
    ],
  },
  moi: {
    surTitre: 'Moi',
    titre: 'Et toi, ça va ?',
    emoji: '💪',
    apercu: [
      ['🔋', 'Ta batterie papa — un check-in en un tap, rien que pour toi'],
      ['🎯', 'Le défi de la semaine — de petits caps entre papas'],
      ['💡', 'Des conseils courts, sans jargon ni leçons de morale'],
    ],
  },
  tribu: {
    surTitre: 'Tribu',
    titre: 'Entre papas, on se comprend.',
    emoji: '🔥',
    apercu: [
      ['🎈', 'Les bons plans sorties testés par les papas de ton coin'],
      ['🤝', 'L\'entraide sans jugement — sommeil, colères, charge mentale'],
      ['🏅', 'Le badge Fondateur pour les 100 premiers papas'],
    ],
  },
};

export function Teaser({ pilier }) {
  const contenu = CONTENUS[pilier];
  const [vote, setVote] = useState(null); // null = inconnu, false = pas voté, true = voté
  const [total, setTotal] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    setTotal(null);
    aDejaVote(pilier).then((v) => setVote(v));
  }, [pilier]);

  const jeVote = async () => {
    setEnvoi(true);
    try {
      setTotal(await voter(pilier));
      setVote(true);
    } catch { /* réseau : le bouton reste, on réessaiera */ } finally {
      setEnvoi(false);
    }
  };

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Text style={styles.surTitre}>{contenu.surTitre}</Text>
      <Text style={styles.titre}>{contenu.titre}</Text>

      <View style={styles.bandeau}>
        <Text style={styles.bandeauTexte}>{contenu.emoji} Bientôt dans Papa Parfait</Text>
      </View>

      <View style={styles.carte}>
        {contenu.apercu.map(([icone, texte]) => (
          <View key={texte} style={styles.ligne}>
            <Text style={styles.ligneIcone}>{icone}</Text>
            <Text style={styles.ligneTexte}>{texte}</Text>
          </View>
        ))}
      </View>

      {vote === false && (
        <Pressable style={[styles.cta, envoi && styles.ctaInactif]} onPress={jeVote} disabled={envoi}>
          <Text style={styles.ctaTexte}>{envoi ? '…' : 'Ça m\'intéresse 🙋'}</Text>
        </Pressable>
      )}
      {vote === true && (
        <View style={styles.merci}>
          <Text style={styles.merciTexte}>
            C'est noté ✔{total ? ` — vous êtes ${total} à l'attendre.` : ''}
          </Text>
          <Text style={styles.merciSous}>Les votes décident de ce qu'on construit en premier.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: 120 },
  surTitre: { color: couleurs.discret, fontSize: 14, fontWeight: '600' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace.xs },
  bandeau: {
    alignSelf: 'flex-start',
    backgroundColor: couleurs.accentDoux,
    borderRadius: rayon.pill,
    paddingHorizontal: espace.l,
    paddingVertical: espace.s,
    marginTop: espace.l,
    marginBottom: espace.xl,
  },
  bandeauTexte: { color: couleurs.accent, fontWeight: '800', fontSize: 14 },
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    padding: espace.xl,
  },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: espace.m },
  ligneIcone: { width: 32, fontSize: 18 },
  ligneTexte: { flex: 1, color: couleurs.texte, fontSize: 15.5, lineHeight: 22 },
  cta: {
    marginTop: espace.xl,
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    paddingVertical: espace.l,
    alignItems: 'center',
  },
  ctaInactif: { opacity: 0.4 },
  ctaTexte: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  merci: {
    marginTop: espace.xl,
    backgroundColor: couleurs.reussiteDoux,
    borderRadius: rayon.m,
    padding: espace.l,
    alignItems: 'center',
  },
  merciTexte: { color: couleurs.reussite, fontWeight: '800', fontSize: 15.5 },
  merciSous: { color: couleurs.texte, fontSize: 13, marginTop: espace.xs },
});
