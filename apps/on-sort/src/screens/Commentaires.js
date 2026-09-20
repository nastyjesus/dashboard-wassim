// Fil de commentaires d'un post + réponse.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { couleurs, espace, rayon, police, cadre } from '../theme.js';
import { chargerCommentaires, commenter, tempsRelatif } from '../tribu-api.js';

export function Commentaires({ post, identite, onRetour }) {
  const [liste, setListe] = useState(null);
  const [texte, setTexte] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    try {
      const data = await chargerCommentaires(post.id);
      setListe(data.commentaires || []);
    } catch (e) {
      setErreur(e.message || 'Impossible de charger les commentaires.');
      setListe([]);
    }
  }, [post.id]);

  useEffect(() => { charger(); }, [charger]);

  const repondre = async () => {
    setEnvoi(true);
    setErreur(null);
    try {
      await commenter(post.id, texte.trim(), identite.jeton);
      setTexte('');
      await charger();
    } catch (e) {
      setErreur(e.message || 'Réponse impossible.');
    } finally {
      setEnvoi(false);
    }
  };

  return (
    <ScrollView style={styles.ecran} contentContainerStyle={styles.contenu}>
      <Pressable onPress={onRetour} accessibilityRole="button" style={styles.retour}>
        <Text style={styles.retourTexte}>‹ RETOUR AU FIL</Text>
      </Pressable>

      <View style={styles.postOrigine}>
        <Text style={styles.auteur}>
          {post.auteur.pseudo}{post.auteur.fondateur ? '  🏅' : ''}
          <Text style={styles.temps}>   {tempsRelatif(post.creeLe)}</Text>
        </Text>
        <Text style={styles.texte}>{post.texte}</Text>
      </View>

      {liste === null && <ActivityIndicator color={couleurs.accent} style={{ marginTop: espace.xl }} />}
      {liste !== null && liste.length === 0 && !erreur && (
        <Text style={styles.vide}>Pas encore de réponse — lance-toi.</Text>
      )}
      {!!erreur && <Text style={styles.erreur}>{erreur}</Text>}

      {(liste || []).map((c) => (
        <View key={c.id} style={styles.commentaire}>
          <Text style={styles.auteur}>
            {c.auteur.pseudo}{c.auteur.fondateur ? '  🏅' : ''}
            <Text style={styles.temps}>   {tempsRelatif(c.creeLe)}</Text>
          </Text>
          <Text style={styles.texte}>{c.texte}</Text>
        </View>
      ))}

      {identite && (
        <View style={styles.reponse}>
          <TextInput
            style={styles.champ}
            placeholder="Ta réponse…"
            placeholderTextColor={couleurs.discret}
            value={texte}
            onChangeText={setTexte}
            multiline
            maxLength={300}
          />
          <Pressable
            style={[styles.cta, (envoi || texte.trim().length < 1) && styles.ctaInactif]}
            onPress={repondre}
            disabled={envoi || texte.trim().length < 1}
          >
            <Text style={styles.ctaTexte}>{envoi ? '…' : 'Répondre'}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: 120 },
  retour: { marginBottom: espace.l },
  retourTexte: { color: couleurs.encre, fontSize: 14, letterSpacing: 0.5, fontFamily: police.corpsFort },

  // Le post d'origine : panneau à liseré ambre, c'est le sujet de l'écran.
  postOrigine: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.l,
    ...cadre,
    borderLeftWidth: 6,
    borderLeftColor: couleurs.accent,
  },
  commentaire: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    marginBottom: espace.m,
    marginLeft: espace.xl,
    ...cadre,
  },
  auteur: { color: couleurs.encre, fontSize: 14, fontFamily: police.corpsFort },
  temps: { color: couleurs.discret, fontSize: 12, fontFamily: police.corps },
  texte: { color: couleurs.texte, fontSize: 15, lineHeight: 21, marginTop: espace.s, fontFamily: police.corps },
  vide: { color: couleurs.discret, fontSize: 14.5, textAlign: 'center', marginVertical: espace.xl, fontFamily: police.corps },
  erreur: { color: couleurs.alerte, fontSize: 13.5, textAlign: 'center', marginVertical: espace.m, fontFamily: police.corpsFort },
  reponse: { marginTop: espace.l },
  champ: {
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    paddingHorizontal: espace.l,
    paddingVertical: espace.m,
    fontSize: 15,
    color: couleurs.encre,
    fontFamily: police.corps,
    minHeight: 60,
    textAlignVertical: 'top',
    ...cadre,
  },
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
});
