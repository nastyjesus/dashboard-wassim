// Écran « Bientôt » d'un pilier en teaser (Couple, Moi, Tribu) — charte
// « Cockpit clair ». Aperçu en panneau cadré + vote « Ça m'intéresse ».

import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre } from '../theme.js';
import { Strip, Bouton } from '../components/ui.js';
import { aDejaVote, voter } from '../votes.js';

const CONTENUS = {
  couple: {
    code: 'COUPLE',
    titre: 'Elle aussi, elle compte.',
    apercu: [
      ['💌', 'La mission de la semaine — un petit geste concret, chaque semaine'],
      ['🍷', 'Le radar date night — restos + garde d\'enfants du même soir'],
      ['📅', 'Les dates qui comptent — rappels discrets avant les moments importants'],
    ],
  },
  moi: {
    code: 'MOI',
    titre: 'Et toi, ça va ?',
    apercu: [
      ['🔋', 'Ta batterie papa — un check-in en un tap, rien que pour toi'],
      ['🎯', 'Le défi de la semaine — de petits caps entre papas'],
      ['💡', 'Des conseils courts, sans jargon ni leçons de morale'],
    ],
  },
  tribu: {
    code: 'TRIBU',
    titre: 'Entre papas, on se comprend.',
    apercu: [
      ['🎈', 'Les bons plans sorties testés par les papas de ton coin'],
      ['🤝', 'L\'entraide sans jugement — sommeil, colères, charge mentale'],
      ['🏅', 'Le badge Fondateur pour les 100 premiers papas'],
    ],
  },
};

export function Teaser({ pilier }) {
  const contenu = CONTENUS[pilier];
  const [vote, setVote] = useState(null);
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
      <Strip style={styles.strip}>
        <Text style={styles.stripCode}>MODULE · {contenu.code}</Text>
        <Text style={styles.stripStatut}>EN CONSTRUCTION</Text>
      </Strip>

      <Text style={styles.titre}>{contenu.titre}</Text>

      <View style={styles.panneau}>
        {contenu.apercu.map(([icone, texte]) => (
          <View key={texte} style={styles.ligne}>
            <Text style={styles.ligneIcone}>{icone}</Text>
            <Text style={styles.ligneTexte}>{texte}</Text>
          </View>
        ))}
      </View>

      {vote === false && (
        <View style={styles.action}>
          <Bouton label={envoi ? 'Envoi…' : 'Ça m\'intéresse'} onPress={jeVote} disabled={envoi} />
          <Text style={styles.aide}>Ton vote décide de ce qu'on construit en premier.</Text>
        </View>
      )}
      {vote === true && (
        <View style={styles.merci}>
          <Text style={styles.merciTexte}>
            ✓ C'est noté{total ? ` — vous êtes ${total} à l'attendre.` : '.'}
          </Text>
          <Text style={styles.merciSous}>On construit le module le plus demandé en premier.</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: 120 },

  strip: { marginBottom: espace.l },
  stripCode: { color: couleurs.stripTexte, fontSize: 15, letterSpacing: 0.5, fontFamily: police.corpsFort },
  stripStatut: { ...typo.instrument, color: couleurs.accent, fontFamily: police.corpsFort, marginTop: espace.xs, textTransform: 'uppercase' },

  titre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display, marginBottom: espace.l },

  panneau: { backgroundColor: couleurs.panneau, borderRadius: rayon.m, padding: espace.xl, ...cadre },
  ligne: { flexDirection: 'row', alignItems: 'flex-start', marginVertical: espace.m },
  ligneIcone: { width: 32, fontSize: 18 },
  ligneTexte: { flex: 1, color: couleurs.texte, fontSize: 15.5, lineHeight: 22, fontFamily: police.corps },

  action: { marginTop: espace.xl },
  aide: { color: couleurs.discret, fontSize: 13, marginTop: espace.m, fontFamily: police.corps },

  merci: { marginTop: espace.xl, backgroundColor: couleurs.reussiteDoux, borderRadius: rayon.m, padding: espace.l, borderWidth: 2, borderColor: couleurs.reussite },
  merciTexte: { color: couleurs.reussite, fontFamily: police.corpsFort, fontSize: 15.5 },
  merciSous: { color: couleurs.texte, fontSize: 13, marginTop: espace.xs, fontFamily: police.corps },
});
