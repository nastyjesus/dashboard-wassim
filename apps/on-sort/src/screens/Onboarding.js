// Création de compte — le poste d'embarquement du QG.
// Prénom + email + mot de passe (ou Google), l'âge de l'enfant (0-5), et le
// coin (département → ville, avec demande si la ville manque).
// Charte « Cockpit clair » (voir docs/charte-graphique.md).

import { useState } from 'react';
// Pas d'Alert : react-native-web ne l'implémente pas (`alert() {}`), les
// erreurs seraient invisibles sur la PWA. Tous les retours passent par des
// messages dans la page.
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, police, typo, cadre, rayon } from '../theme.js';
import { Chip, Bouton, Champ } from '../components/ui.js';
import { AGES_ENFANT, DEPARTEMENTS, villesParDept, GOOGLE_ACTIF } from '../config.js';
import { creerCompte, connexionGoogle, demanderVille } from '../compte-api.js';

const labelAge = (a) => (a === 0 ? '< 1 an' : a === 1 ? '1 an' : `${a} ans`);

export function Onboarding({ profilInitial, session, onValider }) {
  // `session` : compte déjà connecté (retour de Google, ou PWA réinstallée)
  // dont le profil n'est pas complet. Dans ce cas l'identité est acquise :
  // on ne redemande ni e-mail ni mot de passe, juste l'enfant et le coin.
  const connecte = Boolean(session);
  const [prenom, setPrenom] = useState(profilInitial?.prenom || session?.prenomSuggere || '');
  const [email, setEmail] = useState(profilInitial?.email || session?.email || '');
  const [motDePasse, setMotDePasse] = useState('');
  const [age, setAge] = useState(profilInitial?.age ?? 3);
  const [deptCode, setDeptCode] = useState(profilInitial?.code || '');
  const [villeId, setVilleId] = useState(profilInitial?.villeId || '');

  const [demande, setDemande] = useState(false); // formulaire « ma ville n'est pas là »
  const [villeLibre, setVilleLibre] = useState('');
  const [demandeEnvoyee, setDemandeEnvoyee] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const villes = deptCode ? villesParDept(deptCode) : [];
  const emailOk = /\S+@\S+\.\S+/.test(email);
  const identiteOk = connecte ? true : emailOk && motDePasse.length >= 6;
  const valide = Boolean(prenom.trim() && identiteOk && villeId);

  const choisirDept = (code) => {
    setDeptCode(code);
    setVilleId('');
    setDemande(false);
  };

  const envoyerDemande = async () => {
    if (!villeLibre.trim()) return;
    setEnvoi(true);
    await demanderVille({ nom: villeLibre, email, code: deptCode });
    setEnvoi(false);
    // Même si l'enregistrement a échoué, on ne bloque pas le papa : la demande
    // est un bonus, pas une étape.
    setDemandeEnvoyee(true);
  };

  // Branché sur le bouton Google quand GOOGLE_ACTIF repassera à true. En
  // l'état, l'authentification réussit mais ne produit ni profil ni
  // navigation : le retour de session reste à écrire (voir config.js).
  // Sur web, la page part vers Google : la suite se joue au retour, dans App.
  const google = async () => {
    setErreur(null);
    try {
      await connexionGoogle();
    } catch (e) {
      setErreur(e.message || 'La connexion Google n’a pas abouti. Réessaie.');
    }
  };

  const [creation, setCreation] = useState(false);

  const soumettre = async () => {
    if (!valide || creation) return;
    setCreation(true);
    setErreur(null);
    try {
      const compte = await creerCompte({ prenom, email, password: motDePasse, age, villeId, code: deptCode });
      onValider(compte);
    } catch (e) {
      setErreur(e.message || 'Compte non créé. Réessaie dans un instant.');
    } finally {
      setCreation(false);
    }
  };

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {/* Bandeau instrument */}
      <View style={styles.strip}>
        <Text style={styles.stripTitre}>PAPA PARFAIT</Text>
        <Text style={styles.stripSous}>LE QG DES PAPAS · CRÉATION DE COMPTE</Text>
      </View>

      <Text style={styles.intro}>
        {connecte
          ? 'Ton compte est reconnu. Il reste deux choses à préciser pour te proposer les bonnes sorties.'
          : 'Ton poste de pilotage pour les sorties des enfants, le couple et tes temps de pause. On crée ton QG en une minute.'}
      </Text>

      {/* Identité */}
      <Text style={styles.section}>TON IDENTITÉ</Text>
      <Champ
        label="Prénom"
        valeur={prenom}
        onChangeText={setPrenom}
        placeholder="Ton prénom"
        autoCapitalize="words"
      />

      {connecte ? (
        <Text style={styles.compte}>Connecté avec {email}</Text>
      ) : (
        <>
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
          {GOOGLE_ACTIF && (
            <Bouton variante="google" icone="G" label="Continuer avec Google" onPress={google} pleineLargeur />
          )}
        </>
      )}

      {/* Enfant */}
      <Text style={styles.section}>L'ÂGE DE TON ENFANT</Text>
      <View style={styles.chips}>
        {AGES_ENFANT.map((a) => (
          <Chip key={a} label={labelAge(a)} actif={a === age} onPress={() => setAge(a)} />
        ))}
      </View>

      {/* Coin : département → ville */}
      <Text style={styles.section}>TON DÉPARTEMENT</Text>
      <View style={styles.chips}>
        {DEPARTEMENTS.map((d) => (
          <Chip key={d.code} label={d.nom} actif={d.code === deptCode} onPress={() => choisirDept(d.code)} />
        ))}
      </View>

      {deptCode ? (
        <>
          <Text style={styles.section}>TA VILLE</Text>
          <View style={styles.chips}>
            {villes.map((v) => (
              <Chip key={v.id} label={v.nom} actif={v.id === villeId} onPress={() => setVilleId(v.id)} />
            ))}
          </View>

          {!demande ? (
            <Bouton
              variante="secondaire"
              label="Ma ville n'est pas là"
              onPress={() => setDemande(true)}
            />
          ) : demandeEnvoyee ? (
            <Text style={styles.confirme}>✓ Demande envoyée. On te préviendra dès que ta ville est dispo.</Text>
          ) : (
            <View style={styles.demandeBloc}>
              <Champ
                label="Le nom de ta ville"
                valeur={villeLibre}
                onChangeText={setVilleLibre}
                placeholder="Ex : Concarneau"
                autoCapitalize="words"
              />
              <Bouton
                label={envoi ? 'Envoi…' : 'Envoyer la demande'}
                onPress={envoyerDemande}
                disabled={envoi || !villeLibre.trim()}
              />
            </View>
          )}
        </>
      ) : null}

      {/* Validation */}
      <View style={styles.pied}>
        {erreur ? <Text style={styles.erreur}>{erreur}</Text> : null}
        <Bouton label={creation ? 'Création…' : 'Créer mon QG'} onPress={soumettre} disabled={!valide || creation} />
        {!valide ? (
          <Text style={styles.aide}>
            {connecte
              ? 'Ton prénom et ta ville pour décoller.'
              : 'Prénom, email valide, mot de passe (6+) et ta ville pour décoller.'}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: espace.xxxl },

  strip: {
    backgroundColor: couleurs.strip,
    borderRadius: 10,
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

  compte: {
    ...typo.corps,
    fontSize: 14,
    color: couleurs.reussite,
    fontFamily: police.corpsFort,
    backgroundColor: couleurs.reussiteDoux,
    borderWidth: 2,
    borderColor: couleurs.reussite,
    borderRadius: rayon.s,
    paddingVertical: espace.s,
    paddingHorizontal: espace.m,
  },

  section: {
    ...typo.section,
    color: couleurs.encre,
    fontFamily: police.displayMoyen,
    marginTop: espace.xl,
    marginBottom: espace.m,
  },

  chips: { flexDirection: 'row', flexWrap: 'wrap' },

  demandeBloc: { marginTop: espace.m },
  confirme: { ...typo.corps, color: couleurs.reussite, fontFamily: police.corpsFort, marginTop: espace.s },

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

  pied: { marginTop: espace.xxl, ...cadre, borderLeftWidth: 0, borderRightWidth: 0, borderBottomWidth: 0, paddingTop: espace.xl },
  aide: { ...typo.corps, fontSize: 13, color: couleurs.discret, fontFamily: police.corps, marginTop: espace.m },
});
