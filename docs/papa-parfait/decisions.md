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
- **Zones ouvertes** (décidé le 19 septembre 2026) : Papa Parfait est une
  app **nationale, née en Bretagne**. La Bretagne reste l'origine et le
  premier bassin de testeurs (réseau de Wassim), pas la frontière.
  - Bretagne : Ille-et-Vilaine, Côtes-d'Armor, Morbihan, Finistère (9 villes).
  - Loire-Atlantique (Nantes, Saint-Nazaire), Nord (Lille, Valenciennes,
    Dunkerque), Gironde (Bordeaux, Libourne, Arcachon), Paris.
  - Calvados testé puis écarté le même jour : 21 sorties « famille » au
    diagnostic brut, mais 0 à 3 retenues sur cinq dates une fois les créneaux
    du jour et l'âge appliqués. Le diagnostic brut ne suffit pas : la règle
    d'ouverture se vérifie sur le top réel.
  - **Règle d'ouverture** : on ouvre là où OpenAgenda a de la matière, mesurée
    (`/diagnostic?dept=`), pas là où la carte a un trou. Mesure du 19 septembre
    2026, sorties famille un samedi : Nord 90, Loire-Atlantique 57, Gironde 44,
    Paris 43, Ille-et-Vilaine 26, Calvados 21 — puis Toulouse 17, et Lyon,
    Marseille, Strasbourg, Montpellier, Angers, Le Mans sous 8.
  - **Correction d'une croyance** : la « densité validée » de la Bretagne ne
    vaut que pour l'Ille-et-Vilaine. Côtes-d'Armor (1), Finistère (3) et
    Morbihan (7) sont minces. On les garde, et l'app le dit honnêtement quand
    le top est vide, au lieu d'un « Rien ce jour-là » qui sonne comme une panne.
- **Charte** : « **Cockpit clair** » — sable `#ECE6DA` + encre `#1B1815` + un seul
  accent, l'ambre `#FF8A00` (GO, sortie préférée, action primaire). Panneaux
  cadrés à l'encre 2px, Saira Condensed (titres) + IBM Plex Sans (corps). La
  source de vérité est `apps/on-sort/docs/charte-graphique.md`, les jetons vivent
  dans `apps/on-sort/src/theme.js`.
  **Abandonné le 18 septembre 2026** : l'ancien thème crème `#FAF6EF` + terracotta
  `#D95B43` et les cartes molles à ombre grise. On n'y revient pas.
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

## Comptes & identité (décidé le 18 septembre 2026, révisé le 23 septembre 2026)

- **Le compte n'est plus un préalable** (révision du 23 septembre 2026). L'app
  s'ouvre sur deux réglages — âge de l'enfant, ville — et sort le top tout de
  suite. Rien d'autre n'est demandé pour voir des sorties.
  - **Pourquoi** : l'usage visé est « vendredi soir, dernière minute ». Le site
    promet « ta sortie en quelques secondes », l'app imposait un email et un mot
    de passe avant la moindre valeur. Le risque était déjà écrit ci-dessous ; on
    ne l'assume plus, on le supprime.
  - **Où le compte apparaît** : au premier « garder une sortie » (invitation
    montrée une fois, refusable), et dans le pied de l'accueil. Nulle part
    ailleurs.
  - **Ce qu'il apporte vraiment** : retrouver ses sorties gardées sur un autre
    appareil (table `favoris`, fusion local ↔ compte à la connexion). Il ne
    déverrouille aucune sortie — les piliers Couple/Moi/Tribu sont en teaser, ils
    ne peuvent pas servir de carotte.
  - **Arrivée par lien** : le site peut envoyer droit au résultat avec
    `?ville=rennes&age=3`. L'app applique le lien, nettoie l'URL et affiche le
    top sans écran intermédiaire.
- **Décision initiale (18 septembre 2026, dépassée)** : le compte était
  obligatoire dès les premiers testeurs — prénom, email, mot de passe, âge,
  département, ville, avec Google en option.
- **Backend : Supabase** (PostgreSQL + Auth), projet créé, tables `profils` et
  `demandes_ville` en place avec RLS, confirmation par email désactivée pour
  réduire la friction. Détail : `apps/on-sort/docs/backend-supabase.md`.
- **Risque qui s'est confirmé** : un écran de mot de passe sur une PWA envoyée
  par lien fait décrocher une partie des visiteurs. Constaté en live le
  23 septembre 2026 sur le parcours site → app, corrigé le jour même.
- **Ce qui manque encore pour trancher par la mesure** : aucun compteur
  d'usage (ouverture, top affiché, sortie gardée, compte créé). Sans lui, le
  gain de l'entrée sans compte restera une conviction, pas un chiffre.
- Les villes demandées par les papas hors zone atterrissent dans
  `demandes_ville` : c'est ce qui décidera des prochaines villes ouvertes.

## Site, app et acquisition (décidé le 24 septembre 2026)

Deux périmètres, deux exécutants, un arbitre (Wassim). Le détail opérationnel
vit dans `docs/papa-parfait/brief-cowork-seo.md`, remis à Claude Cowork.

- **Claude Code** : l'app, les workers, Supabase, les déploiements, et le
  reporting SEO (skills `wassim-seo-program`, `wassim-gsc-report`).
- **Claude Cowork** : le site WordPress — pages, contenu, balises, maillage,
  blog, et l'application des recommandations SEO.
- **Le site est la seule vitrine indexée.** L'app passe en `noindex, follow` et
  sert un vrai `robots.txt` (le routage SPA renvoyait la page de l'app à
  `/robots.txt`). `/confidentialite` reste indexable — Google Play l'exige.
  Le `robots.txt` autorise le parcours : un `Disallow: /` empêcherait les robots
  de lire le `noindex`, et l'URL resterait dans l'index.
- **Un sous-domaine propre** (`app.<domaine>`) remplacera l'adresse
  `workers.dev`, dès que le domaine du site est connu.
- **Le menu « Blog » est retiré** tant qu'il n'y a pas trois articles et un
  rythme tenu.
- **Contrat entre les deux côtés** : le format de lien `?ville=&age=`, la liste
  des villes ouvertes, et la page de confidentialité (source unique, générée par
  le build de l'app). Aucun des deux ne modifie le périmètre de l'autre.

## Monétisation — LE but du projet

Objectif : une app **monétisable** (référence de départ : le jeu myefarm de
Wassim rapporte 100-150 €/mois).

**Décidé le 18 septembre 2026** (réponse de Wassim sur myefarm) :

- Le canal est l'**achat intégré**, pas la publicité.
- Deux produits proposés : **abonnement mensuel** *et* **achat unique à vie**.
- **Ce qui devient payant n'est pas encore tranché** — le découpage gratuit /
  payant sera décidé avec les données des testeurs, pas avant. La roadmap pose le
  socle technique sans figer l'offre.
- **Compte développeur Google Play : créé et vérifié.** Plus d'attente
  administrative.

**Contrainte technique vérifiée dans les docs Expo v57** : le SDK ne fournit
**aucun** paquet d'achat in-app (ni `expo-in-app-purchases`, ni `expo-iap`, ni
StoreKit, ni Google Play Billing ; seul Stripe est listé et ne remplace pas la
facturation du store). Il faudra donc une librairie tierce et un **development
build** — l'app ne tournera plus dans Expo Go.

**Point clé** : les achats in-app se monétisent **sur les stores**, jamais sur la
version web. La PWA sert à **tester gratuitement** ; les revenus passent par le
Play Store.

## Communauté (Tribu)

- Décidé : social **in-app** (pas WhatsApp externe), backend prêt (worker
  papa-tribu + D1).
- Identité légère : un pseudo, un jeton gardé sur le téléphone. Pas d'email, pas
  de mot de passe (RGPD-friendly, rien à fuiter).
- Modération : signalement → masquage auto à 3 signalements + endpoints admin
  (masquer, bannir). À compléter avant une sortie publique : bouton « bloquer un
  utilisateur » (exigé par Google pour le contenu communautaire).
- Badge **Fondateur** pour les 100 premiers inscrits.
- ⚠️ **À réconcilier avant d'activer la Tribu** : l'app a désormais de vrais
  comptes (Supabase, email + mot de passe) alors que la Tribu a été conçue avec
  une identité séparée (pseudo + jeton local). Il faudra choisir : soit la Tribu
  s'appuie sur le compte Supabase, soit les deux identités cohabitent. Sans
  objet tant que la Tribu reste en teaser.

## Ce qu'on NE fait PAS (pour rester focus)

- Pas de géolocalisation auto au lancement (villes en dur, plus simple ; le GPS
  viendra si besoin).
- Pas les 4 piliers complets d'un coup.
- Pas de no-code : le sur-mesure (scoring, agrégation, tribu) le justifie, et on
  garde le code + zéro abonnement mensuel.
