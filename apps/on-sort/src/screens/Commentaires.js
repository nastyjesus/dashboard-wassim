// Fil de commentaires d'un post + réponse.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { couleurs, espace, rayon } from '../theme.js';
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
        <Text style={styles.retourTexte}>← Retour au fil</Text>
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
  contenu: { padding: espace.xl, paddingTop: 64, paddingBottom: 120 },
  retour: { marginBottom: espace.l },
  retourTexte: { color: couleurs.accent, fontSize: 16, fontWeight: '700' },
  postOrigine: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.l,
    borderWidth: 1,
    borderColor: couleurs.accent,
    padding: espace.l,
    marginBottom: espace.l,
  },
  commentaire: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.m,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    padding: espace.l,
    marginBottom: espace.m,
    marginLeft: espace.xl,
  },
  auteur: { color: couleurs.encre, fontWeight: '700', fontSize: 14 },
  temps: { color: couleurs.discret, fontSize: 12, fontWeight: '400' },
  texte: { color: couleurs.texte, fontSize: 15, lineHeight: 21, marginTop: espace.s },
  vide: { color: couleurs.discret, fontSize: 14.5, textAlign: 'center', marginVertical: espace.xl },
  erreur: { color: couleurs.accent, fontSize: 13.5, textAlign: 'center', marginVertical: espace.m },
  reponse: { marginTop: espace.l },
  champ: {
    backgroundColor: couleurs.carte,
    borderRadius: rayon.m,
    borderWidth: 1,
    borderColor: couleurs.ligne,
    paddingHorizontal: espace.l,
    paddingVertical: espace.m,
    fontSize: 15,
    color: couleurs.encre,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  cta: {
    marginTop: espace.m,
    backgroundColor: couleurs.accent,
    borderRadius: rayon.m,
    paddingVertical: espace.m,
    alignItems: 'center',
  },
  ctaInactif: { opacity: 0.4 },
  ctaTexte: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});
