// Onglet Couple — v1 de contenu : la mission de la semaine (rotation
// automatique, aucune animation nécessaire) et le teaser des bons plans
// bretons. Le « radar date night » (restos + babysitting le même soir)
// arrivera avec les partenariats.

import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, rayon, ombre } from '../theme.js';

/** Missions courtes, rotation hebdomadaire — du concret, pas des grands mots. */
const MISSIONS = [
  { titre: 'Le café surprise', texte: 'Demain matin, son café ou son thé prêt avant qu\'elle ne se lève. Zéro commentaire, juste le café.' },
  { titre: 'Le SMS de 14h', texte: 'Un message en pleine journée qui ne parle ni des enfants, ni des courses, ni de logistique.' },
  { titre: 'La soirée sans téléphone', texte: 'Ce soir après le coucher : deux téléphones dans un tiroir, un vrai moment à deux.' },
  { titre: 'Réserve, ne propose pas', texte: '« On devrait se faire un resto » ne compte pas. Réserve, trouve la garde, annonce la date.' },
  { titre: 'Le compliment précis', texte: 'Pas « t\'es super » — un compliment sur une chose précise qu\'elle a faite cette semaine.' },
  { titre: 'Une heure pour elle', texte: 'Tu prends les enfants une heure ce week-end, sans qu\'elle le demande. Elle fait ce qu\'elle veut.' },
  { titre: 'La question d\'avant', texte: 'Repose-lui une question que tu lui posais quand vous vous êtes rencontrés.' },
  { titre: 'Le rituel du dimanche soir', texte: '10 minutes à deux pour se caler sur la semaine — et finir par autre chose que le planning.' },
];

function numeroSemaine(d = new Date()) {
  const debut = new Date(d.getFullYear(), 0, 1);
  return Math.floor((d - debut) / (7 * 86400000));
}

export function Couple() {
  const mission = MISSIONS[numeroSemaine() % MISSIONS.length];

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Text style={styles.surTitre}>Couple</Text>
      <Text style={styles.titre}>Elle aussi, elle compte.</Text>

      <View style={styles.carteMission}>
        <Text style={styles.missionBadge}>💌 La mission de la semaine</Text>
        <Text style={styles.missionTitre}>{mission.titre}</Text>
        <Text style={styles.missionTexte}>{mission.texte}</Text>
      </View>

      <View style={styles.carte}>
        <Text style={styles.carteTitre}>🍷 Radar date night</Text>
        <Text style={styles.carteTexte}>
          Bientôt : les restos et les solutions de garde du même soir, près de
          chez toi. On négocie les premiers bons plans bretons avec la tribu.
        </Text>
        <View style={styles.tag}><Text style={styles.tagTexte}>Bientôt en Bretagne</Text></View>
      </View>

      <View style={styles.carte}>
        <Text style={styles.carteTitre}>📅 Les dates qui comptent</Text>
        <Text style={styles.carteTexte}>
          Anniversaire de rencontre, premier rendez-vous… Papa Parfait s'en
          souviendra pour toi. Rappels discrets, quelques jours avant.
        </Text>
        <View style={styles.tag}><Text style={styles.tagTexte}>Bientôt</Text></View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: 120 },
  surTitre: { color: couleurs.discret, fontSize: 14, fontWeight: '600' },
  titre: { color: couleurs.encre, fontSize: 30, fontWeight: '800', marginTop: espace.xs, marginBottom: espace.xl },
  carteMission: {
    backgroundColor: couleurs.encre,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.l,
    ...ombre.carte,
  },
  missionBadge: { color: couleurs.accentDoux, fontWeight: '700', fontSize: 13 },
  missionTitre: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', marginTop: espace.m },
  missionTexte: { color: '#E8E4DC', fontSize: 15.5, lineHeight: 23, marginTop: espace.s },
  carte: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    padding: espace.xl,
    marginBottom: espace.l,
    borderWidth: 1,
    borderColor: couleurs.ligne,
  },
  carteTitre: { color: couleurs.encre, fontSize: 17, fontWeight: '700' },
  carteTexte: { color: couleurs.texte, fontSize: 14.5, lineHeight: 21, marginTop: espace.s },
  tag: {
    alignSelf: 'flex-start',
    backgroundColor: couleurs.accentDoux,
    borderRadius: rayon.pill,
    paddingHorizontal: espace.m,
    paddingVertical: espace.xs,
    marginTop: espace.m,
  },
  tagTexte: { color: couleurs.accent, fontWeight: '700', fontSize: 12 },
});
