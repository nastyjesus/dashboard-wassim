// L'écran cœur — charte « Cockpit clair ». Bandeau instrument (QG, météo,
// enfant), hero « ON SORT ? », puis le panneau GO (préférée) et le top numéroté.
// Trois choses tiennent la promesse « ta sortie en quelques secondes » :
// aucun compte demandé, un repli quand la zone ne rend rien, et l'étoile qui
// garde une sortie tout de suite.

import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { couleurs, espace, police, typo, cadre, rayon } from '../theme.js';
import { Chip, Section, Strip, Bouton } from '../components/ui.js';
import { CarteSortie } from '../components/CarteSortie.js';
import { chargerTop } from '../api.js';
import { optionsDates, libelleLong } from '../dates.js';
import { villeParId, villesProches } from '../config.js';
import { cleFavori } from '../favoris.js';

function emojiMeteo(meteo) {
  if (!meteo) return '';
  if (meteo.pluie) return '🌧️';
  return meteo.code <= 1 ? '☀️' : meteo.code <= 3 ? '⛅' : '🌫️';
}

const labelAge = (a) => (a === 0 ? '< 1 an' : `${a} an${a > 1 ? 's' : ''}`);

export function Accueil({
  profil, favoris = [], invite, aCompte,
  onOuvrirDetail, onModifierProfil, onGarder, onCreerCompte, onFermerInvite,
}) {
  const dates = optionsDates();
  const [dateISO, setDateISO] = useState(dates[0].dateISO);
  // Ville regardée : celle du profil par défaut, une voisine quand le papa
  // suit le repli d'une zone vide. Le profil, lui, ne bouge pas.
  const [villeVueId, setVilleVueId] = useState(profil.villeId);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState(null);
  const [data, setData] = useState(null);

  useEffect(() => { setVilleVueId(profil.villeId); }, [profil.villeId]);

  const ville = villeParId(villeVueId);
  const villeProfil = villeParId(profil.villeId);
  const detournee = ville.id !== villeProfil.id;

  const charger = useCallback(async (date) => {
    setChargement(true);
    setErreur(null);
    try {
      setData(await chargerTop({
        dateISO: date, lat: ville.lat, lon: ville.lon, age: profil.age,
        dept: ville.dept, code: ville.code,
      }));
    } catch (e) {
      setErreur(e.message || 'Impossible de charger les sorties.');
    } finally {
      setChargement(false);
    }
  }, [ville.lat, ville.lon, ville.dept, ville.code, profil.age]);

  useEffect(() => { charger(dateISO); }, [dateISO, charger]);

  const meteo = data?.meteo;
  const top = data?.top || [];
  const clesGardees = new Set(favoris.map(cleFavori));
  const estGardee = (ev) => clesGardees.has(cleFavori(ev));
  const garder = onGarder ? (ev) => onGarder(ev, dateISO) : undefined;

  // Repli : plutôt qu'une page vide, les villes ouvertes les plus proches.
  const voisines = villesProches(ville.id, 3);

  return (
    <ScrollView
      style={styles.ecran}
      contentContainerStyle={styles.contenu}
      refreshControl={<RefreshControl refreshing={false} onRefresh={() => charger(dateISO)} />}
    >
      <Strip style={styles.strip}>
        <View style={styles.stripRangee}>
          <Text style={styles.stripQg}>QG · {ville.nom.toUpperCase()}</Text>
          {!!meteo && <Text style={styles.stripMeteo}>{emojiMeteo(meteo)} {meteo.resume}</Text>}
        </View>
        <Text style={styles.stripEnfant}>ENFANT · {labelAge(profil.age).toUpperCase()}</Text>
      </Strip>

      {detournee && (
        <View style={styles.detour}>
          <Text style={styles.detourTexte}>Tu regardes {ville.nom}.</Text>
          <Bouton
            variante="secondaire"
            label={`Revenir à ${villeProfil.nom}`}
            onPress={() => setVilleVueId(villeProfil.id)}
          />
        </View>
      )}

      <Text style={styles.hero}>ON SORT ?</Text>
      <Text style={styles.heroSous}>{libelleLong(dateISO)}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.datesRangee}>
        {dates.map((d) => (
          <Chip key={d.dateISO} label={d.label} actif={d.dateISO === dateISO} onPress={() => setDateISO(d.dateISO)} />
        ))}
      </ScrollView>

      {chargement && (
        <View style={styles.etat}>
          <ActivityIndicator color={couleurs.accent} size="large" />
          <Text style={styles.etatTexte}>On cherche les pépites du jour…</Text>
        </View>
      )}

      {!chargement && erreur && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Pas de liaison.</Text>
          <Text style={styles.etatTexte}>{erreur}</Text>
          <View style={styles.etatBouton}>
            <Bouton label="Réessayer" onPress={() => charger(dateISO)} />
          </View>
        </View>
      )}

      {/* Vide : pas une panne, un manque de matière. Hors Ille-et-Vilaine et
          grandes métropoles, OpenAgenda est mince — on le dit tel quel, et on
          propose la suite au lieu de laisser le papa devant une page blanche. */}
      {!chargement && !erreur && top.length === 0 && (
        <View style={styles.etat}>
          <Text style={styles.etatTitre}>Rien de référencé à {ville.nom} ce jour-là.</Text>
          <Text style={styles.etatTexte}>
            Essaie un autre jour avec les onglets du haut, ou va voir juste à côté.
          </Text>
          <View style={styles.voisines}>
            {voisines.map(({ ville: v, km }) => (
              <Chip key={v.id} label={`${v.nom} · ${km} km`} onPress={() => setVilleVueId(v.id)} />
            ))}
          </View>
        </View>
      )}

      {!chargement && !erreur && top.length > 0 && (
        <>
          <CarteSortie
            ev={top[0]}
            preferee
            rang={1}
            gardee={estGardee(top[0])}
            onGarder={garder && (() => garder(top[0]))}
            onPress={() => onOuvrirDetail(top[0])}
          />
          {top.length > 1 && <Section>Le reste du top</Section>}
          {top.slice(1).map((ev, i) => (
            <CarteSortie
              key={ev.id || ev.titre}
              ev={ev}
              rang={i + 2}
              gardee={estGardee(ev)}
              onGarder={garder && (() => garder(ev))}
              onPress={() => onOuvrirDetail(ev)}
            />
          ))}
          {top.length < 3 && (
            <View style={styles.mince}>
              <Text style={styles.minceTexte}>
                C'est tout pour ce jour-là par ici — la zone est encore peu couverte.
                Les villes ouvertes les plus proches :
              </Text>
              <View style={styles.voisines}>
                {voisines.map(({ ville: v, km }) => (
                  <Chip key={v.id} label={`${v.nom} · ${km} km`} onPress={() => setVilleVueId(v.id)} />
                ))}
              </View>
            </View>
          )}
        </>
      )}

      {/* Invitation au compte : après un vrai geste (une sortie gardée), une
          seule fois, et refusable. Jamais avant d'avoir montré la valeur. */}
      {invite && !aCompte && (
        <View style={styles.invite}>
          <Text style={styles.inviteTitre}>Gardée sur ce téléphone.</Text>
          <Text style={styles.inviteTexte}>
            Crée ton compte et tes sorties te suivent partout — nouveau téléphone,
            PWA réinstallée, elles sont là.
          </Text>
          <View style={styles.inviteBoutons}>
            <Bouton label="Créer mon compte" onPress={onCreerCompte} />
            <Bouton variante="secondaire" label="Plus tard" onPress={onFermerInvite} />
          </View>
        </View>
      )}

      {favoris.length > 0 && (
        <>
          <Section>Tes sorties gardées</Section>
          {favoris.slice(0, 5).map((ev, i) => (
            <CarteSortie
              key={cleFavori(ev)}
              ev={ev}
              rang={i + 1}
              gardee
              onGarder={garder && (() => garder(ev))}
              onPress={() => onOuvrirDetail(ev)}
            />
          ))}
        </>
      )}

      <View style={styles.pied}>
        <Bouton variante="secondaire" label="Changer de ville ou d'âge" onPress={onModifierProfil} />
        {!aCompte && (
          <View style={styles.piedCompte}>
            <Bouton variante="secondaire" label="Créer mon compte" onPress={onCreerCompte} />
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  ecran: { flex: 1, backgroundColor: couleurs.fond },
  contenu: { padding: espace.xl, paddingTop: 56, paddingBottom: espace.xxl },

  strip: { marginBottom: espace.l },
  stripRangee: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stripQg: { color: couleurs.stripTexte, fontSize: 15, letterSpacing: 0.5, fontFamily: police.corpsFort },
  stripMeteo: { color: couleurs.stripTexte, fontSize: 14, fontFamily: police.corps },
  stripEnfant: { ...typo.instrument, color: couleurs.accent, fontFamily: police.corpsFort, marginTop: espace.xs, textTransform: 'uppercase' },

  detour: { marginBottom: espace.l, gap: espace.s, alignItems: 'flex-start' },
  detourTexte: { ...typo.corps, fontSize: 14, color: couleurs.texte, fontFamily: police.corps },

  hero: { ...typo.displayXL, color: couleurs.encre, fontFamily: police.display },
  heroSous: { color: couleurs.texte, fontSize: 15, marginTop: espace.xs, fontFamily: police.corps },

  datesRangee: { marginTop: espace.l, marginBottom: espace.l, flexGrow: 0 },

  etat: { alignItems: 'center', paddingVertical: espace.xxxl },
  etatTitre: { ...typo.displayL, fontSize: 22, color: couleurs.encre, fontFamily: police.display, marginBottom: espace.s, textAlign: 'center' },
  etatTexte: { color: couleurs.discret, fontSize: 15, textAlign: 'center', marginTop: espace.s, fontFamily: police.corps },
  etatBouton: { marginTop: espace.l },

  voisines: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', marginTop: espace.l },

  mince: { marginTop: espace.s },
  minceTexte: { color: couleurs.discret, fontSize: 13, lineHeight: 19, fontFamily: police.corps },

  invite: {
    marginTop: espace.xl,
    backgroundColor: couleurs.panneau,
    borderRadius: rayon.m,
    padding: espace.l,
    ...cadre,
  },
  inviteTitre: { ...typo.displayL, fontSize: 22, color: couleurs.encre, fontFamily: police.display },
  inviteTexte: { ...typo.corps, color: couleurs.texte, fontFamily: police.corps, marginTop: espace.s },
  inviteBoutons: { flexDirection: 'row', flexWrap: 'wrap', gap: espace.m, marginTop: espace.l },

  pied: { marginTop: espace.xl, gap: espace.m, alignItems: 'flex-start' },
  piedCompte: { marginTop: espace.xs },
});
