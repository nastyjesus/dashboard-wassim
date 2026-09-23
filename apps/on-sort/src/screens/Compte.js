// Compte — jamais un péage, toujours une offre. On n'arrive ici que par un
// geste qui gagne quelque chose : garder une sortie et la retrouver ailleurs.
// Tout ce que le papa a fait en invité (profil, sorties gardées) est conservé
// et remonte sur le compte à la création.
// Charte « Cockpit clair » (voir docs/charte-graphique.md).

import { useState } from 'react';
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, police, typo, cadre, rayon } from '../theme.js';
import { Bouton, Champ } from '../components/ui.js';
import { GOOGLE_ACTIF } from '../config.js';
import { creerCompte, connexionGoogle } from '../compte-api.js';
import { synchroniserFavoris } from '../favoris.js';

const ARGUMENTS = [
  'Tes sorties gardées te suivent sur tous tes appareils.',
  'Changement de téléphone, PWA réinstallée : tu retrouves ton QG.',
  'Tu seras prévenu en premier quand Couple, Moi et Tribu ouvriront.',
];

export function Compte({ profil, motif, onFait, onFermer }) {
  const [prenom, setPrenom] = useState(profil?.prenom || '');
  const [email, setEmail] = useState(profil?.email || '');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);

  const emailOk = /\S+@\S+\.\S+/.test(email);
  const valide = Boolean(prenom.trim()) && emailOk && motDePasse.length >= 6;

  const google = async () => {
    setErreur(null);
    try {
      await connexionGoogle();
    } catch (e) {
      setErreur(e.message || 'La connexion Google n’a pas abouti. Réessaie.');
    }
  };

  const soumettre = async () => {
    if (!valide || envoi) return;
    setEnvoi(true);
    setErreur(null);
    try {
      const compte = await creerCompte({
        prenom,
        email,
        password: motDePasse,
        age: profil.age,
        villeId: profil.villeId,
        code: profil.code,
      });
      // Les sorties gardées en invité montent maintenant sur le compte.
      await synchroniserFavoris();
      onFait(compte);
    } catch (e) {
      setErreur(e.message || 'Compte non créé. Réessaie dans un instant.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      <View style={styles.strip}>
        <Text style={styles.stripTitre}>TON COMPTE</Text>
        <Text style={styles.stripSous}>
          {motif === 'favori' ? 'SORTIE GARDÉE · À METTRE À L’ABRI' : 'PAPA PARFAIT · LE QG DES PAPAS'}
        </Text>
      </View>

      <Text style={styles.intro}>
        {motif === 'favori'
          ? 'Cette sortie est gardée sur ce téléphone. Un compte, et elle te suit partout.'
          : 'Le compte ne débloque pas les sorties : elles sont déjà à toi. Il met ton QG à l’abri.'}
      </Text>

      <View style={styles.arguments}>
        {ARGUMENTS.map((a) => (
          <View key={a} style={styles.argument}>
            <Text style={styles.puce}>▸</Text>
            <Text style={styles.argumentTexte}>{a}</Text>
          </View>
        ))}
      </View>

      {GOOGLE_ACTIF && (
        <View style={styles.google}>
          <Bouton variante="google" icone="G" label="Continuer avec Google" onPress={google} pleineLargeur />
        </View>
      )}

      <Text style={styles.section}>OU AVEC UN E-MAIL</Text>
      <Champ
        label="Prénom"
        valeur={prenom}
        onChangeText={setPrenom}
        placeholder="Ton prénom"
        autoCapitalize="words"
      />
      <Champ
        label="Email"
        valeur={email}
        onChangeText={setEmail}
        placeholder="papa@exemple.fr"
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
      />
      <Champ
        label="Mot de passe"
        valeur={motDePasse}
        onChangeText={setMotDePasse}
        placeholder="6 caractères minimum"
        secureTextEntry
        autoCapitalize="none"
      />

      <View style={styles.pied}>
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
        <Bouton
          label={envoi ? 'Création…' : 'Créer mon compte'}
          onPress={soumettre}
          disabled={!valide || envoi}
        />
        <Text style={styles.aide}>
          Déjà un compte ? Le même formulaire te reconnecte avec ton mot de passe.
        </Text>
        <View style={styles.plusTard}>
          <Bouton variante="secondaire" label="Plus tard" onPress={onFermer} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: espace.xxxl },

  strip: {
    backgroundColor: couleurs.strip,
    borderRadius: rayon.m,
    paddingHorizontal: espace.l,
    paddingVertical: espace.l,
    marginBottom: espace.l,
  },
  stripTitre: {
    ...typo.displayXL,
    fontSize: 38,
    lineHeight: 38,
    color: couleurs.stripTexte,
    fontFamily: police.display,
  },
  stripSous: {
    ...typo.instrument,
    color: couleurs.accent,
    fontFamily: police.corpsFort,
    marginTop: espace.xs,
  },

  intro: { ...typo.corps, color: couleurs.texte, fontFamily: police.corps, marginBottom: espace.l },

  arguments: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.xl,
    ...cadre,
  },
  argument: { flexDirection: 'row', marginVertical: espace.xs },
  puce: { width: 20, color: couleurs.encre, fontSize: 14, fontFamily: police.corpsFort },
  argumentTexte: { flex: 1, ...typo.corps, color: couleurs.texte, fontFamily: police.corps },

  google: { marginBottom: espace.l },

  section: {
    ...typo.section,
    color: couleurs.encre,
    fontFamily: police.displayMoyen,
    marginBottom: espace.m,
  },

  erreur: {
    ...typo.corps,
    fontSize: 14,
    color: couleurs.alerte,
    fontFamily: police.corpsFort,
    borderLeftWidth: 3,
    borderLeftColor: couleurs.alerte,
    paddingLeft: espace.m,
    marginBottom: espace.l,
  },

  pied: { marginTop: espace.l },
  aide: { ...typo.corps, fontSize: 13, color: couleurs.discret, fontFamily: police.corps, marginTop: espace.m },
  plusTard: { marginTop: espace.xl },
});
