// Onglet Couple — v1 de contenu : la mission de la semaine (rotation
// automatique, aucune animation nécessaire) et le teaser des bons plans
// bretons. Le « radar date night » (restos + babysitting le même soir)
// arrivera avec les partenariats.

import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre, ombre } from '../theme.js';
import { Strip, Section, Pastille } from '../components/ui.js';

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
  const semaine = numeroSemaine();
  const mission = MISSIONS[semaine % MISSIONS.length];

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Strip style={styles.strip}>
        <Text style={styles.stripCode}>MODULE · COUPLE</Text>
        <Text style={styles.stripStatut}>MISSION DE LA SEMAINE</Text>
      </Strip>

      <Text style={styles.titre}>Elle aussi, elle compte.</Text>

      {/* L'unique panneau ambre de l'écran : c'est l'action de la semaine. */}
      <View style={styles.mission}>
        <Text style={styles.missionLabel}>MISSION · SEMAINE {semaine}</Text>
        <Text style={styles.missionTitre}>{mission.titre}</Text>
        <Text style={styles.missionTexte}>{mission.texte}</Text>
      </View>

      <Section>En construction</Section>

      <View style={styles.panneau}>
        <Text style={styles.panneauTitre}>Radar date night</Text>
        <Text style={styles.panneauTexte}>
          Bientôt : les restos et les solutions de garde du même soir, près de
          chez toi. On négocie les premiers bons plans avec la tribu.
        </Text>
        <View style={styles.pastilles}><Pastille label="Bientôt" /></View>
      </View>

      <View style={styles.panneau}>
        <Text style={styles.panneauTitre}>Les dates qui comptent</Text>
        <Text style={styles.panneauTexte}>
          Anniversaire de rencontre, premier rendez-vous… Papa Parfait s'en
          souviendra pour toi. Rappels discrets, quelques jours avant.
        </Text>
        <View style={styles.pastilles}><Pastille label="Bientôt" /></View>
      </View>
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

  mission: {
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    padding: espace.xl,
    ...cadre,
    ...ombre.relief,
  },
  missionLabel: { ...typo.instrument, color: couleurs.encre, fontFamily: police.corpsFort, textTransform: 'uppercase' },
  missionTitre: { ...typo.displayL, fontSize: 26, lineHeight: 28, color: couleurs.encre, fontFamily: police.display, marginTop: espace.s },
  missionTexte: { color: couleurs.encre, fontSize: 15.5, lineHeight: 23, marginTop: espace.s, fontFamily: police.corps },

  panneau: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.m,
    ...cadre,
  },
  panneauTitre: { color: couleurs.encre, fontSize: 17, lineHeight: 22, fontFamily: police.corpsFort },
  panneauTexte: { color: couleurs.texte, fontSize: 14.5, lineHeight: 21, marginTop: espace.xs, fontFamily: police.corps },
  pastilles: { flexDirection: 'row', marginTop: espace.m },
});
