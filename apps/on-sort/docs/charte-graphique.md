# Charte graphique — Papa Parfait

**Concept : « Cockpit clair ».** Papa Parfait est le QG des papas. On traduit
ce QG littéralement : un tableau de bord d'opérations, lumineux et chaud, où la
journée famille se pilote comme un cockpit. Pas de cockpit sombre et tactique —
un poste de pilotage de plein jour : contrastes francs, une seule couleur signal
(l'ambre du « GO »), des panneaux d'instrument cadrés à l'encre, une finition
premium (le niveau Revolut, en version chaude et solaire).

Cette charte est la source de vérité visuelle. Tout écran s'y conforme. Les
jetons de code vivent dans [`src/theme.js`](../src/theme.js) et reprennent
exactement les valeurs ci-dessous.

---

## 1. Parti pris en une phrase

> Un poste de pilotage de plein jour : fond sable chaud, panneaux blancs cadrés
> à l'encre noire, **un seul accent — l'ambre solaire du GO**, titres condensés
> d'instrument, données qui se lisent comme des cadrans.

L'audace est concentrée en un seul endroit par écran (le panneau « On sort ? »
et son GO ambre). Tout le reste est calme et discipliné.

---

## 2. Couleurs

Palette « Cockpit clair » — 6 couleurs de base + états sémantiques.

| Rôle | Nom (jeton) | Hex | Usage |
|------|-------------|-----|-------|
| Sol / fond | `fond` | `#ECE6DA` | Fond de tous les écrans. Sable de plein jour, chaud mais **plus gris que le crème** (on évite volontairement le crème #F4F1EA). |
| Panneau | `panneau` / `carte` | `#FBFAF7` | Surface des instruments, cartes, feuilles. Blanc cassé chaud. |
| Encre | `encre` | `#1B1815` | Texte principal **et** cadres des panneaux. Espresso profond, pas un noir pur froid. |
| Texte | `texte` | `#5C554B` | Corps de texte secondaire. |
| Discret | `discret` | `#8B8375` | Légendes, unités, méta. |
| Ligne | `ligne` | `#D7CFC0` | Filets 1px entre les lignes d'une liste. |
| **Signal** | `accent` | `#FF8A00` | **L'ambre solaire.** GO, la sortie préférée, action primaire. Rien d'autre ne porte cette couleur. |
| Signal vif | `accentVif` | `#FFB020` | Surbrillance, lueur d'un cadran actif. |
| Signal encré | `accentEncre` | `#A85400` | Ambre foncé pour un petit texte ambre sur fond clair (contraste). |
| Bandeau | `strip` | `#1B1815` | Le bandeau instrument sombre en haut des écrans clés (voir §5). Texte dessus : `stripTexte` `#F4EFE6`. |
| GO / réussite | `reussite` | `#2E7D52` sur `#E2EFE6` | État sémantique « validé / à l'abri ». Sobre, ne concurrence jamais l'ambre. |
| Alerte | `alerte` | `#C6432E` | Rare. Erreur réelle uniquement. |

**Règles de couleur**

- **Texte sur ambre = encre**, jamais blanc. Le look est un texte noir sur ambre
  (registre instrument / hazard), lisible et franc. Blanc sur ambre est interdit
  (contraste faible).
- L'ambre ne décore jamais. Il ne sert qu'à trois choses : le GO, la sortie
  préférée, l'action primaire. S'il apparaît ailleurs, on l'a mal utilisé.
- Pas de dégradés décoratifs en aplat de fond. Un seul dégradé toléré : ambre →
  ambre vif dans le panneau GO, s'il renforce la lueur du cadran.

---

## 3. Typographie

Deux familles, franchement distinctes. Les deux se chargent via Google Fonts
(voir §8).

| Rôle | Famille | Détail |
|------|---------|--------|
| Affichage / titres | **Saira Condensed** | Grotesque condensée d'aéronautique. Poids 700–800. Sert les titres d'écran, le hero, les libellés de section, les libellés d'instrument. C'est la voix du cockpit. |
| Corps / interface / données | **IBM Plex Sans** | Humaniste-technique (dessinée pour un contexte d'ingénierie). Corps de texte, boutons, valeurs de données (chiffres tabulaires). |

On n'ajoute pas de troisième police. Les valeurs de données utilisent les
chiffres tabulaires d'IBM Plex Sans, alignés à droite comme un relevé de cadran.

**Échelle de type** (référence : *The Elements of Typographic Style*)

| Niveau | Police / poids | Taille / interligne | Notes |
|--------|----------------|---------------------|-------|
| Display XL — hero | Saira Condensed 800 | 44 / 44 | « ON SORT ? ». Capitales, tracking serré (−0.5). |
| Display L — titre écran | Saira Condensed 700 | 30 / 32 | Capitales ou casse phrase selon l'écran. |
| Libellé de section | Saira Condensed 700 | 15 / 18 | Capitales, tracking +0.5. |
| Libellé d'instrument | IBM Plex Sans 600 | 12 / 14 | Capitales. **Réservé** aux vrais libellés d'instrument/statut (STATUT, BATTERIE, MÉTÉO). |
| Corps L | IBM Plex Sans 400 | 17 / 26 | Ligne < 70 caractères. |
| Corps | IBM Plex Sans 400 | 15 / 23 | |
| Valeur / donnée | IBM Plex Sans 600 (tabular) | selon contexte | Alignée à droite dans son panneau. |

**Capitales — pourquoi c'est un choix, pas un tic.** Les libellés en capitales
sont un cliché d'UI générée *quand ils décorent*. Ici ils sont **motivés par la
métaphore** : un cockpit affiche ses libellés en capitales (STATUT, BATTERIE).
On les réserve donc aux vrais libellés d'instrument et de section. On n'empile
**jamais** une capitale « eyebrow » au-dessus de chaque titre.

---

## 4. Formes, cadres, ombres

**Le geste signature : le panneau d'instrument cadré à l'encre.**

- Les cartes ne sont **pas** des cartes molles à ombre grise douce. Ce sont des
  panneaux d'instrument : **bordure encre 2px**, coins peu arrondis.
- Rayons : `s` 6, `m` 10 (panneaux), `pill` 999 (boutons, chips, tags). Le rayon
  reste discret — c'est le cadre encré qui donne le caractère, pas l'arrondi.
- **Ombres : bannies en version molle** (le `rgba(0,0,0,.1)` diffus est
  interdit). Seule ombre autorisée : un **relief plein décalé** (bloc d'encre
  décalé de 3–4px, sans flou) sous le panneau GO uniquement — l'effet d'une
  étiquette d'instrument sérigraphiée en relief.
- Filets : 1px `ligne` entre les lignes d'une liste. Séparation par le trait, pas
  par l'ombre.
- Tags / pastilles (« 3-5 ans », « Gratuit », « À l'abri ») : pilule, contour
  encre 1.5px, fond transparent ou `panneau`. Le tag « à l'abri » peut prendre
  le vert `reussite`.

---

## 5. Layout

Chaque écran clé s'ouvre sur un **bandeau instrument sombre** (le cluster de
cadrans : ville, météo, batterie papa, statut), puis déroule des panneaux clairs
sur le sol sable. Ce contraste clair/sombre est **structurel**, pas décoratif :
le sombre = les relevés d'état, le clair = le contenu qu'on manipule.

**Alignement.** À gauche par défaut (les libellés d'instrument se lisent à
gauche). Les **valeurs de données s'alignent à droite** dans leur panneau, comme
un relevé de cadran. Jamais de texte justifié ni centré en bloc.

### Écran Sorties (accueil)

```
┌──────────────────────────────────────────┐  ← bandeau instrument (encre)
│ QG · BREST        ☁ 14°    ▓▓▓▓▓░ BATTERIE │
├──────────────────────────────────────────┤
│                                          │   sol sable
│  ON SORT ?                               │   ← Saira 800, encre, XXL
│  ┌────────────────────────────────────┐  │
│  │ [PANNEAU GO — ambre] ····· STATUT: GO │ │   ← hero, aplat ambre,
│  │ Ferme de Kériadenn                  │ │      cadre encre 2px,
│  │ ◐ à l'abri · 3-5 ans · gratuit      │ │      relief plein décalé
│  │                          [ Y ALLER ]│ │      texte = encre
│  └────────────────────────────────────┘  │
│                                          │
│  LE RESTE DU TOP                         │   ← libellé section, Saira
│  ┌──┐                                    │
│  │02│ Musée des beaux-arts     14°   ›   │   ← rang numéroté (séquence
│  ├──┤                                    │      réelle = classement),
│  │03│ Balade du Moulin Blanc   ok    ›   │      valeur à droite, filet 1px
│  └──┘                                    │
└──────────────────────────────────────────┘
   🎈 SORTIES   ❤ COUPLE   💪 MOI   🔥 TRIBU     ← barre d'onglets
```

**Marqueurs numérotés 02/03 : justifiés.** Le top 5 est un vrai classement
(séquence). Le numéro = le rang, pas une décoration. La préférée (rang 01) n'a
pas de numéro — elle EST le panneau GO.

**Chevron › :** uniquement comme affordance « ouvrir la fiche » sur une ligne de
liste. Jamais accolé au texte d'un bouton d'action.

---

## 6. Écriture (copy)

Registre : **tactique complice**. Le cockpit, mais chaleureux et entre papas.

- Libellés d'instrument, courts, en capitales : `STATUT: GO`, `BATTERIE PAPA`,
  `MÉTÉO`, `MISSION COUPLE`.
- Boutons = le verbe de l'action, à l'impératif : **`Y aller`** (pas « Voir »),
  `Lancer la mission`, `Je recharge`. L'action garde le même nom d'un bout à
  l'autre du flux.
- Ton chaud sans folklore lourd : « T'as mérité une pause » oui, mais avec
  parcimonie. Le visuel porte déjà la personnalité.
- États vides et erreurs = direction, pas ambiance. Une erreur dit ce qui s'est
  passé et quoi faire, dans la voix de l'interface : « Pas de réseau — on
  réessaie ? », pas « Oups, une erreur est survenue ».

---

## 7. À éviter (les tells d'UI générée qu'on rejette)

On rejette explicitement, et pour cette app en particulier :

1. **Le crème #F4F1EA + terracotta #D97757.** C'est le cliché n°1 (et c'était
   l'ancien thème). Notre base est un sable plus gris (`#ECE6DA`) et notre accent
   est l'ambre (`#FF8A00`), jamais la terracotta.
2. **Les cartes molles identiques à ombre grise douce.** Remplacées par les
   panneaux cadrés à l'encre.
3. **Un seul mot du titre coloré/en italique** pour « faire accent ».
4. **Les capitales décoratives en eyebrow au-dessus de chaque titre** (nos
   capitales sont des libellés d'instrument motivés, cf §3).
5. **Les méta collées au point médian** « A · B · C » comme chrome par défaut.
6. **La flèche → dans le texte des boutons.**
7. **Le mono comme police de « petits labels data » par défaut** — on n'utilise
   pas de mono ; les données passent en IBM Plex Sans tabulaire.

---

## 8. Mise en place technique

À faire au moment du build (lire d'abord les docs Expo v57 :
https://docs.expo.dev/versions/v57.0.0/).

Polices — ajouter les paquets Google Fonts et charger avant rendu :

```bash
npx expo install expo-font @expo-google-fonts/saira-condensed @expo-google-fonts/ibm-plex-sans
```

Charger dans `App.js` avec `useFonts` (bloquer le rendu tant que non prêt) :

```js
import { useFonts, SairaCondensed_700Bold, SairaCondensed_800ExtraBold } from '@expo-google-fonts/saira-condensed';
import { IBMPlexSans_400Regular, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
```

Les noms de famille exposés par ces paquets sont référencés dans `src/theme.js`
via `police.display` / `police.corps`.

---

*Charte v1 — cockpit clair. Toute évolution passe d'abord par ce fichier, puis
par `src/theme.js`.*
