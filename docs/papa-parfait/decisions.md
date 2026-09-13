# 🧠 Décisions produit & business

Toutes les décisions déjà arrêtées, pour ne pas les re-débattre. Si on change
d'avis, on met à jour ce fichier.

## Identité de marque

- **Nom** : Papa Parfait
- **Tagline** : « Le QG des papas »
- **Ton** : complice / tribu — « Entre papas, on se comprend ». Tutoiement.
  Ni donneur de leçons, ni « performance ». Bienveillant, direct.
- **Cible** : les papas (public 18+, ce n'est PAS une app pour enfants — important
  pour les règles des stores).
- **Zone de lancement** : la **Bretagne** (Ille-et-Vilaine, Côtes-d'Armor,
  Morbihan, Finistère), 9 villes. Choisie pour : densité de données validée,
  réseau de Wassim sur place, storytelling « app bretonne ».
- **Charte** : crème (#FAF6EF) + encre (#26221B) + accent terracotta (#D95B43).
  Icône : monogramme « PP » blanc sur terracotta (placeholder, remplaçable par un
  vrai logo).
- **Identifiant d'app** : `com.papaparfait.app` (définitif une fois publié).

## Le produit : 4 piliers, mais UN seul actif au lancement

Stratégie : **les Sorties sont LE produit d'appel**. Les 3 autres piliers sont en
teaser (écran « Bientôt » + bouton « Ça m'intéresse » qui vote). On complète
selon les votes réels des utilisateurs, une fois que les Sorties attirent du
monde. Les écrans complets des 3 piliers sont **déjà codés** (réactivables via
`PILIERS_ACTIFS` dans `src/config.js`).

| Pilier | État | Contenu |
|---|---|---|
| 🎈 **Sorties** | **ACTIF** | Top 5 du jour, météo comprise, près de chez toi. Le cœur. |
| ❤️ Couple | teaser | Mission de la semaine, radar date night, dates qui comptent |
| 💪 Moi | teaser | Batterie papa (check-in), défi de la semaine, micro-conseils |
| 🔥 Tribu | teaser | Fil communautaire par département (backend prêt, à activer) |

**Pourquoi ce choix** : une app moyenne sur 4 sujets attire moins qu'une app
excellente sur 1. Les votes nous diront quel pilier construire en priorité.

## Sorties : ce qui fait la valeur

- On ne fait pas un annuaire (comme Kidiklik / CitizenKid) : on fait un
  **assistant qui décide pour toi** (« samedi il pleut, ta fille a 3 ans → voici
  les 5 meilleures options »). C'est la différence Doctolib vs Pages Jaunes.
- Le top 5 est scoré : famille, âge, distance, jour réel, météo (intérieur si
  pluie), gratuité, événements ponctuels priorisés sur les expos permanentes.
- **Partage viral** : chaque fiche a un bouton « Partager » qui envoie la sortie
  + le lien de l'app. Chaque partage entre parents = acquisition gratuite.

## Monétisation — LE but du projet (⚠️ à finaliser)

Objectif : une app **monétisable** (référence de départ : le jeu myefarm de
Wassim rapporte 100-150 €/mois).

**Question ouverte à trancher avec Wassim** : *comment myefarm est-il monétisé
exactement ?* (pub / achats intégrés / abonnement / autre — et sur quel store).
On réutilisera de préférence le canal qu'il maîtrise déjà. **Ne rien supposer.**

Leviers possibles (à valider, aucun chiffre inventé) :
1. **Pub** dans l'app (régie à confirmer selon ce qu'utilise myefarm).
2. **Abonnement freemium** : gratuit avec pub + Premium payant (sans pub, fonctions
   en plus).
3. **Commissions / partenariats** locaux (restos, activités famille).
4. **B2B / sponsoring** (mairies, comités d'entreprise, marques famille).

**Point clé** : la pub mobile et les abonnements in-app se monétisent **sur les
stores**, pas sur la version web. La PWA web sert à **tester gratuitement** ;
la monétisation réelle passe par la publication sur le Play Store.

## Communauté (Tribu)

- Décidé : social **in-app** (pas WhatsApp externe), backend prêt (worker
  papa-tribu + D1).
- Identité légère : un pseudo, un jeton gardé sur le téléphone. Pas d'email, pas
  de mot de passe (RGPD-friendly, rien à fuiter).
- Modération : signalement → masquage auto à 3 signalements + endpoints admin
  (masquer, bannir). À compléter avant une sortie publique : bouton « bloquer un
  utilisateur » (exigé par Google pour le contenu communautaire).
- Badge **Fondateur** pour les 100 premiers inscrits.

## Ce qu'on NE fait PAS (pour rester focus)

- Pas de géolocalisation auto au lancement (villes en dur, plus simple ; le GPS
  viendra si besoin).
- Pas les 4 piliers complets d'un coup.
- Pas de no-code : le sur-mesure (scoring, agrégation, tribu) le justifie, et on
  garde le code + zéro abonnement mensuel.
