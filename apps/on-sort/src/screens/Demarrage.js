// Démarrage — deux réglages, rien d'autre : le coin et l'âge de l'enfant.
// C'est tout ce dont le moteur a besoin pour sortir un top. Pas de compte ici :
// on montre la valeur d'abord (voir docs/papa-parfait/decisions.md).
// Charte « Cockpit clair » (voir docs/charte-graphique.md).

import { useState } from 'react';
// Pas d'Alert : react-native-web ne l'implémente pas (`alert() {}`), les
// erreurs seraient invisibles sur la PWA. Tous les retours passent par des
// messages dans la page.
import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { couleurs, espace, police, typo, cadre, rayon } from '../theme.js';
import { Chip, Bouton, Champ } from '../components/ui.js';
import { AGES_ENFANT, DEPARTEMENTS, villesParDept } from '../config.js';
import { demanderVille } from '../compte-api.js';

const labelAge = (a) => (a === 0 ? '< 1 an' : a === 1 ? '1 an' : `${a} ans`);

export function Demarrage({ profilInitial, session, onValider }) {
  // `session` : compte connecté (retour de Google) dont le profil n'est pas
  // encore en base. L'identité est acquise, on complète juste le pilotage —
  // le prénom sert à personnaliser et part avec le profil.
  const connecte = Boolean(session);
  const [prenom, setPrenom] = useState(profilInitial?.prenom || session?.prenomSuggere || '');
  const [age, setAge] = useState(profilInitial?.age ?? 3);
  const [deptCode, setDeptCode] = useState(profilInitial?.code || '');
  const [villeId, setVilleId] = useState(profilInitial?.villeId || '');

  const [demande, setDemande] = useState(false); // formulaire « ma ville n'est pas là »
  const [villeLibre, setVilleLibre] = useState('');
  const [demandeEnvoyee, setDemandeEnvoyee] = useState(false);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [envoiProfil, setEnvoiProfil] = useState(false);

  const villes = deptCode ? villesParDept(deptCode) : [];
  const valide = Boolean(villeId) && (!connecte || prenom.trim());

  const choisirDept = (code) => {
    setDeptCode(code);
    setVilleId('');
    setDemande(false);
  };

  const envoyerDemande = async () => {
    if (!villeLibre.trim()) return;
    setEnvoi(true);
    await demanderVille({ nom: villeLibre, email: session?.email || '', code: deptCode });
    setEnvoi(false);
    // Même si l'enregistrement a échoué, on ne bloque pas le papa : la demande
    // est un bonus, pas une étape.
    setDemandeEnvoyee(true);
  };

  const soumettre = async () => {
    if (!valide || envoiProfil) return;
    setEnvoiProfil(true);
    setErreur(null);
    try {
      await onValider({
        prenom: prenom.trim() || undefined,
        email: session?.email || undefined,
        age,
        villeId,
        code: deptCode || undefined,
      });
    } catch (e) {
      setErreur(e.message || 'Enregistrement impossible. Réessaie dans un instant.');
    } finally {
      setEnvoiProfil(false);
    }
  };

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu} keyboardShouldPersistTaps="handled">
      {/* Bandeau instrument */}
      <View style={styles.strip}>
        <Text style={styles.stripTitre}>PAPA PARFAIT</Text>
        <Text style={styles.stripSous}>LE QG DES PAPAS · MISE EN ROUTE</Text>
      </View>

      <Text style={styles.intro}>
        {connecte
          ? 'Ton compte est reconnu. Deux réglages et on décolle.'
          : 'Deux réglages et tu as ton top du jour. Aucun compte à créer pour voir les sorties.'}
      </Text>

      {connecte ? (
        <>
          <Text style={styles.section}>TON PRÉNOM</Text>
          <Champ
            label="Prénom"
            valeur={prenom}
            onChangeText={setPrenom}
            placeholder="Ton prénom"
            autoCapitalize="words"
          />
          <Text style={styles.compte}>Connecté avec {session.email}</Text>
        </>
      ) : null}

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
        <Bouton
          label={envoiProfil ? 'Un instant…' : 'Trouver une sortie'}
          onPress={soumettre}
          disabled={!valide || envoiProfil}
        />
        {!valide ? (
          <Text style={styles.aide}>
            {connecte ? 'Ton prénom et ta ville pour décoller.' : 'Choisis ta ville pour décoller.'}
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
