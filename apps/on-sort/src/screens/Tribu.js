// Onglet Tribu — maquette du fil communautaire. Les posts affichés sont des
// EXEMPLES DE DÉMO clairement marqués : le vrai backend social (comptes,
// posts, modération) est le chantier suivant. Cette maquette sert à valider
// l'expérience avant d'investir le dev.

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';

const POSTS_DEMO = [
  {
    id: 'd1', auteur: 'Julien · Rennes', temps: 'il y a 2 h', type: 'sortie',
    texte: 'Testé le parcours pieds nus à la Prévalaye avec mes deux loulous (2 et 5 ans) — gros succès, prévoyez le change complet 😅',
    reactions: '👍 8 · 💬 3',
  },
  {
    id: 'd2', auteur: 'Mehdi · Vannes', temps: 'il y a 5 h', type: 'entraide',
    texte: 'Les papas, comment vous gérez les réveils à 5h45 ? Le petit dernier ne veut rien entendre, je suis rincé.',
    reactions: '💬 12',
  },
  {
    id: 'd3', auteur: 'Thomas · Brest', temps: 'hier', type: 'sortie',
    texte: '3 papas + 5 enfants à Océanopolis samedi matin, il reste de la place si des Brestois veulent se joindre !',
    reactions: '🙋 3 · 💬 5',
  },
];

const COULEUR_TYPE = { sortie: couleurs.reussite, entraide: couleurs.accent };
const LABEL_TYPE = { sortie: 'Sortie', entraide: 'Entraide' };

export function Tribu() {
  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Text style={styles.surTitre}>Tribu</Text>
      <Text style={styles.titre}>Entre papas, on se comprend.</Text>

      <View style={styles.bandeau}>
        <Text style={styles.bandeauTitre}>🔥 La tribu ouvre bientôt en Bretagne</Text>
        <Text style={styles.bandeauTexte}>
          Voici à quoi ressemblera le fil — les posts ci-dessous sont des
          exemples. Les 100 premiers papas auront le badge Fondateur.
        </Text>
      </View>

      {POSTS_DEMO.map((p) => (
        <View key={p.id} style={styles.post}>
          <View style={styles.postEntete}>
            <Text style={styles.auteur}>{p.auteur}</Text>
            <Text style={styles.temps}>{p.temps}</Text>
          </View>
          <View style={[styles.type, { borderColor: COULEUR_TYPE[p.type] }]}>
            <Text style={[styles.typeTexte, { color: COULEUR_TYPE[p.type] }]}>{LABEL_TYPE[p.type]}</Text>
          </View>
          <Text style={styles.texte}>{p.texte}</Text>
          <View style={styles.piedRangee}>
            <Text style={styles.reactions}>{p.reactions}</Text>
            <Text style={styles.demo}>exemple</Text>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: 120 },
  surTitre: { color: couleurs.discret, fontSize: 14, fontWeight: '600' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace.xs, marginBottom: espace.xl },
  bandeau: {
    backgroundColor: couleurs.accentDoux,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.xl,
  },
  bandeauTitre: { color: couleurs.accent, fontWeight: '800', fontSize: 16 },
  bandeauTexte: { color: couleurs.encre, fontSize: 14, lineHeight: 20, marginTop: espace.s },
  post: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    padding: espace.l,
    marginBottom: espace.l,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  postEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  auteur: { color: couleurs.encre, fontWeight: '700', fontSize: 14.5 },
  temps: { color: couleurs.discret, fontSize: 12.5 },
  type: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: rayon.pill,
    paddingHorizontal: espace.s + 2,
    paddingVertical: 2,
    marginTop: espace.s,
  },
  typeTexte: { fontSize: 11.5, fontWeight: '700' },
  texte: { color: couleurs.texte, fontSize: 15, lineHeight: 22, marginTop: espace.m },
  piedRangee: { flexDirection: 'row', justifyContent: 'space-between', marginTop: espace.m },
  reactions: { color: couleurs.discret, fontSize: 13, fontWeight: '600' },
  demo: {
    color: couleurs.discret,
    fontSize: 11,
    fontStyle: 'italic',
    backgroundColor: couleurs.fond,
    paddingHorizontal: espace.s,
    paddingVertical: 2,
    borderRadius: rayon.pill,
    overflow: 'hidden',
  },
});
