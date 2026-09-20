// Onglet Tribu — v1 branchée sur le worker papa-tribu : inscription pseudo,
// fil du département, posts Sortie/Entraide, pouces, commentaires,
// signalement. L'écran interne (fil ↔ commentaires) vit ici.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { couleurs, espace, rayon, police, typo, cadre, ombre } from '../theme.js';
import { Chip, Strip } from '../components/ui.js';
import { VILLES } from '../config.js';
import {
  lireIdentite, inscrire, chargerFil, publierPost, basculerPouce, signalerPost, tempsRelatif,
} from '../tribu-api.js';
import { Commentaires } from './Commentaires.js';

export function Tribu({ profil }) {
  const ville = VILLES.find((v) => v.id === profil.villeId) || VILLES[0];
  const [identite, setIdentite] = useState(null);
  const [pret, setPret] = useState(false);
  const [posts, setPosts] = useState([]);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [postOuvert, setPostOuvert] = useState(null);
  const [menuPost, setMenuPost] = useState(null); // id du post dont le menu ⋯ est ouvert

  const charger = useCallback(async (jeton) => {
    setChargement(true);
    setErreur(null);
    try {
      const data = await chargerFil(ville.dept, jeton);
      setPosts(data.posts || []);
    } catch (e) {
      setErreur(e.message || 'Impossible de charger le fil.');
    } finally {
      setChargement(false);
    }
  }, [ville.dept]);

  useEffect(() => {
    lireIdentite().then((id) => {
      setIdentite(id);
      setPret(true);
      charger(id?.jeton);
    });
  }, [charger]);

  const pouce = async (post) => {
    if (!identite) return;
    // Optimiste : on met à jour tout de suite, le serveur confirme.
    setPosts((liste) => liste.map((p) => (p.id === post.id
      ? { ...p, monPouce: !p.monPouce, pouces: p.pouces + (p.monPouce ? -1 : 1) }
      : p)));
    try {
      const etat = await basculerPouce(post.id, identite.jeton);
      setPosts((liste) => liste.map((p) => (p.id === post.id ? { ...p, monPouce: etat.aime, pouces: etat.pouces } : p)));
    } catch {
      charger(identite.jeton);
    }
  };

  const signaler = async (post) => {
    setMenuPost(null);
    if (!identite) return;
    try {
      await signalerPost(post.id, identite.jeton);
      setErreur(null);
    } catch { /* silencieux : le signalement rejoué est ignoré côté serveur */ }
  };

  if (!pret) return <View style={styles.ecran} />;

  if (postOuvert) {
    return (
      <Commentaires
        post={postOuvert}
        identite={identite}
        onRetour={() => { setPostOuvert(null); charger(identite?.jeton); }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.ecran}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => charger(identite?.jeton)} />}
    >
      <Strip style={styles.strip}>
        <Text style={styles.stripCode}>MODULE · TRIBU</Text>
        <Text style={styles.stripStatut}>{ville.dept.toUpperCase()}</Text>
      </Strip>

      <Text style={styles.titre}>Entre papas, on se comprend.</Text>

      {!identite && <Inscription ville={ville} onInscrit={(id) => { setIdentite(id); charger(id.jeton); }} />}

      {identite && (
        <Composer
          identite={identite}
          onPublie={() => charger(identite.jeton)}
          jeton={identite.jeton}
        />
      )}

      {chargement && (
        <View style={styles.etat}><ActivityIndicator color={couleurs.accent} size="large" /></View>
      )}
      {!chargement && erreur && (
        <View style={styles.etat}>
          <Text style={styles.etatTexte}>{erreur}</Text>
          <Pressable onPress={() => charger(identite?.jeton)}><Text style={styles.lien}>Réessayer</Text></Pressable>
        </View>
      )}
      {!chargement && !erreur && posts.length === 0 && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Le fil est tout neuf.</Text>
          <Text style={styles.etatTexte}>Sois le premier papa du {ville.dept} à poster !</Text>
        </View>
      )}

      {!chargement && posts.map((p) => (
        <View key={p.id} style={styles.post}>
          <View style={styles.postEntete}>
            <Text style={styles.auteur}>
              {p.auteur.pseudo}{p.auteur.ville ? ` · ${p.auteur.ville}` : ''}
              {p.auteur.fondateur ? '  🏅' : ''}
            </Text>
            <View style={styles.enteteDroite}>
              <Text style={styles.temps}>{tempsRelatif(p.creeLe)}</Text>
              <Pressable onPress={() => setMenuPost(menuPost === p.id ? null : p.id)} hitSlop={8}>
                <Text style={styles.menu}>⋯</Text>
              </Pressable>
            </View>
          </View>
          {menuPost === p.id && (
            <Pressable style={styles.menuSignaler} onPress={() => signaler(p)}>
              <Text style={styles.menuSignalerTexte}>🚩 Signaler ce post</Text>
            </Pressable>
          )}
          <View style={[styles.type, p.type === 'sortie' ? styles.typeSortie : styles.typeEntraide]}>
            <Text style={[styles.typeTexte, { color: p.type === 'sortie' ? couleurs.reussite : couleurs.accent }]}>
              {p.type === 'sortie' ? 'Sortie' : 'Entraide'}
            </Text>
          </View>
          <Text style={styles.texte}>{p.texte}</Text>
          <View style={styles.actions}>
            <Pressable onPress={() => pouce(p)} hitSlop={8} disabled={!identite}>
              <Text style={[styles.action, p.monPouce && styles.actionActive]}>👍 {p.pouces}</Text>
            </Pressable>
            <Pressable onPress={() => setPostOuvert(p)} hitSlop={8}>
              <Text style={styles.action}>💬 {p.nbCommentaires}</Text>
            </Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/** Carte d'inscription : un pseudo, et c'est tout. */
function Inscription({ ville, onInscrit }) {
  const [pseudo, setPseudo] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const valider = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      onInscrit(await inscrire({ pseudo: pseudo.trim(), ville: ville.nom, dept: ville.dept }));
    } catch (e) {
      setErreur(e.message || 'Inscription impossible pour le moment.');
      setEnvoi(false);
    }
  };

  return (
    <View style={styles.carteInscription}>
      <Text style={styles.inscriptionTitre}>Rejoins la tribu</Text>
      <Text style={styles.inscriptionTexte}>
        Un pseudo suffit — pas d'e-mail, pas de mot de passe. Les 100 premiers
        papas ont le badge Fondateur 🏅.
      </Text>
      <TextInput
        style={styles.champ}
        placeholder="Ton pseudo (ex. Wassim)"
        placeholderTextColor={couleurs.discret}
        value={pseudo}
        onChangeText={setPseudo}
        maxLength={20}
        autoCapitalize="words"
      />
      {!!erreur && <Text style={styles.inscriptionErreur}>{erreur}</Text>}
      {/* Panneau déjà ambre : le bouton se détache à l'encre, pas en ambre sur ambre. */}
      <Pressable
        style={[styles.cta, styles.ctaEncre, (envoi || pseudo.trim().length < 2) && styles.ctaInactif]}
        onPress={valider}
        disabled={envoi || pseudo.trim().length < 2}
      >
        <Text style={[styles.ctaTexte, styles.ctaTexteEncre]}>{envoi ? '…' : 'Je rejoins'}</Text>
      </Pressable>
    </View>
  );
}

/** Composeur de post : type + texte. */
function Composer({ jeton, onPublie }) {
  const [type, setType] = useState('sortie');
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const publier = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await publierPost({ type, texte: texte.trim() }, jeton);
      setTexte('');
      onPublie();
    } catch (e) {
      setErreur(e.message || 'Publication impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <View style={styles.composer}>
      <View style={styles.composerTypes}>
        <Chip label="🎈 Sortie" actif={type === 'sortie'} onPress={() => setType('sortie')} />
        <Chip label="🤝 Entraide" actif={type === 'entraide'} onPress={() => setType('entraide')} />
      </View>
      <TextInput
        style={[styles.champ, styles.champMultiligne]}
        placeholder={type === 'sortie' ? 'Raconte ta sortie, donne le bon plan…' : 'Pose ta question aux papas…'}
        placeholderTextColor={couleurs.discret}
        value={texte}
        onChangeText={setTexte}
        multiline
        maxLength={600}
      />
      {!!erreur && <Text style={styles.inscriptionErreur}>{erreur}</Text>}
      <Pressable
        style={[styles.cta, (envoi || texte.trim().length < 3) && styles.ctaInactif]}
        onPress={publier}
        disabled={envoi || texte.trim().length < 3}
      >
        <Text style={styles.ctaTexte}>{envoi ? '…' : 'Publier'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: 120 },

  strip: { marginBottom: espace.l },
  stripCode: { color: couleurs.stripTexte, fontSize: 15, letterSpacing: 0.5, fontFamily: police.corpsFort },
  stripStatut: { ...typo.instrument, color: couleurs.accent, fontFamily: police.corpsFort, marginTop: espace.xs, textTransform: 'uppercase' },

  titre: { ...typo.displayL, color: couleurs.encre, fontFamily: police.display, marginBottom: espace.l },

  // Inscription : l'action d'entrée de l'écran, donc le panneau ambre.
  carteInscription: {
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    padding: espace.xl,
    marginBottom: espace.xl,
    ...cadre,
    ...ombre.relief,
  },
  inscriptionTitre: { ...typo.displayL, fontSize: 24, lineHeight: 26, color: couleurs.encre, fontFamily: police.display },
  inscriptionTexte: { color: couleurs.encre, fontSize: 14.5, lineHeight: 21, marginTop: espace.s, marginBottom: espace.l, fontFamily: police.corps },
  inscriptionErreur: { color: couleurs.alerte, fontSize: 13, marginTop: espace.s, fontFamily: police.corpsFort },

  composer: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.xl,
    ...cadre,
  },
  composerTypes: { flexDirection: 'row', marginBottom: espace.s },

  champ: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    paddingHorizontal: espace.l,
    paddingVertical: espace.m,
    fontSize: 15,
    color: couleurs.encre,
    fontFamily: police.corps,
    ...cadre,
  },
  champMultiligne: { minHeight: 80, textAlignVertical: 'top' },
  cta: {
    marginTop: espace.m,
    backgroundColor: couleurs.accent,
    borderRadius: rayon.pill,
    paddingVertical: espace.m,
    alignItems: 'center',
    ...cadre,
  },
  ctaInactif: { opacity: 0.45 },
  ctaTexte: { color: couleurs.encre, fontSize: 16, fontFamily: police.corpsFort },
  ctaEncre: { backgroundColor: couleurs.encre },
  ctaTexteEncre: { color: couleurs.stripTexte },

  etat: { alignItems: 'center', paddingVertical: espace.xxl },
  etatTitre: { ...typo.displayL, fontSize: 22, color: couleurs.encre, fontFamily: police.display },
  etatTexte: { color: couleurs.discret, fontSize: 15, textAlign: 'center', marginTop: espace.s, fontFamily: police.corps },
  lien: { color: couleurs.accentEncre, fontSize: 15, marginTop: espace.m, fontFamily: police.corpsFort },

  post: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.m,
    ...cadre,
  },
  postEntete: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  enteteDroite: { flexDirection: 'row', alignItems: 'center', gap: espace.m },
  auteur: { color: couleurs.encre, fontSize: 14.5, flexShrink: 1, fontFamily: police.corpsFort },
  temps: { color: couleurs.discret, fontSize: 12.5, fontFamily: police.corps },
  menu: { color: couleurs.discret, fontSize: 18, fontFamily: police.corpsFort },
  menuSignaler: {
    alignSelf: 'flex-end',
    backgroundColor: couleurs.fond,
    borderRadius: rayon.s,
    paddingHorizontal: espace.m,
    paddingVertical: espace.s,
    marginTop: espace.s,
    ...cadre,
  },
  menuSignalerTexte: { color: couleurs.alerte, fontSize: 13, fontFamily: police.corpsFort },
  type: {
    alignSelf: 'flex-start',
    borderWidth: 1.5,
    borderRadius: rayon.pill,
    paddingHorizontal: espace.m,
    paddingVertical: 2,
    marginTop: espace.s,
  },
  typeSortie: { borderColor: couleurs.reussite, backgroundColor: couleurs.reussiteDoux },
  typeEntraide: { borderColor: couleurs.encre },
  typeTexte: { fontSize: 11.5, letterSpacing: 0.4, fontFamily: police.corpsFort, textTransform: 'uppercase' },
  texte: { color: couleurs.texte, fontSize: 15, lineHeight: 22, marginTop: espace.m, fontFamily: police.corps },
  actions: {
    flexDirection: 'row',
    gap: espace.xl,
    marginTop: espace.m,
    paddingTop: espace.m,
    borderTopWidth: 1,
    borderTopColor: couleurs.ligne,
  },
  action: { color: couleurs.texte, fontSize: 14, fontFamily: police.corpsFort },
  actionActive: { color: couleurs.accentEncre },
});
