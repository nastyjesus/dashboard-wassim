# 🗺️ Roadmap & état d'avancement

> **Dernier point : 6 octobre 2026** (section suivante). Le point du
> 18 septembre et les lots qui en découlent restent plus bas, statuts mis à
> jour. Tout est vérifié dans le code, en prod ou sur `/mesures` ; aucun
> chiffre n'est estimé.

## Les 3 phases (à ne pas confondre)

| Phase | La question | État |
|---|---|---|
| **1. Construire** | Avec quoi je fabrique l'app ? | ✅ **Fait** (Expo / React Native) |
| **2. Publier** | Où les gens la trouvent / installent ? | 🟡 PWA en ligne et déployée à chaque push ; lien pas encore diffusé ; Play Store à faire |
| **3. Monétiser** | Comment ça rapporte de l'argent ? | 🔴 Modèle choisi (abonnement + achat à vie), rien de codé |

---

## 📍 Point du 6 octobre 2026

### Usage réel (`GET /mesures?jours=14`)

~16 ouvertures, 14 tops affichés, 4 tops vides, **1 sortie gardée, 0 compte,
0 alerte envoyée** sur deux semaines. Le « zéro à casser » du 18 septembre
n'est pas cassé : **le lien n'a pas été diffusé.** C'est le premier blocage,
et il n'est pas technique.

### Fait depuis le 18 septembre

- **Lots 1, 1 bis, 1 ter, 1 quater, 2** : faits (voir plus bas).
- **Lot 3** : Cockpit en prod, build allégé de 68 %, politique de
  confidentialité en ligne (`/confidentialite`). Bouton Google **masqué**
  (flux web incomplet). Partage aux papas : **pas fait**.
- **Entrée sans compte** (23/09) : le top s'affiche avant toute inscription ;
  le compte n'apparaît qu'au premier « garder ». Voir `decisions.md`.
- **Mesure d'usage** `/mesures` + page Cockpit ; **alerte du week-end** par
  e-mail le vendredi (Resend) ; **site = seule vitrine indexée**, app en
  `noindex` ; checklist et vérificateur DNS pour `app.<domaine>`.
- **Sources** : DATAtourisme réparé (API v1), RSS des médiathèques de Lorient,
  **tournées des cirques** Pinder / Arlette Gruss / Medrano (cron quotidien),
  **« Que faire à Paris »** (open data Ville de Paris).
- **Admin** `/admin` : sorties d'une ville, consignes (masquer, corriger,
  épingler, ajouter), sources, stats, journal.
- **Qualité du top (6 octobre)** — audit 18 villes × 3 dates :
  - lecture d'OpenAgenda corrigée (à Paris, des séries de 2020 prenaient les
    300 places : rien de ce qui commençait après le 15 septembre n'était vu) ;
  - **l'exceptionnel passe devant** (« À ne pas rater » : cirque, fête
    foraine, carnaval, festival, marché de Noël…) ; une seule lecture et une
    seule sortie par série dans un top ;
  - lecture/conte : 43 % → 30 % des top 5, 42 % → 31 % des GO ; 11 GO « À
    ne pas rater » sur 39. Paris : le GO du 10 octobre est un cirque.
- **CPU du plan gratuit** : erreurs 1102 corrigées (scoring ÷4, admin ville
  par ville). Paris tient à ~680 événements analysés.

### Prochaines étapes, dans l'ordre

1. **Diffuser le lien à 10-20 papas** (Wassim). Suivre comptes, sorties
   gardées, demandes de ville sur `/mesures`.
2. **Bouton Google sur le web** : finir le flux ou l'assumer masqué.
3. **Sous-domaine `app.<domaine>`** : DNS prêt, en attente de la migration.
4. **Lot 4 — Play Store** : Data safety, build EAS `.aab`, test interne
   (politique de confidentialité déjà en ligne, `eas.json` présent).
5. **Lot 5 — facturation** et **Lot 6 — Open-Meteo commercial** : inchangés.
6. **Sources, à la demande** : agenda Nantes Métropole, test Ticketmaster,
   fêtes foraines et marchés de Noël saisis une fois par an dans l'admin.

---

## 📍 L'état réel au 18 septembre 2026 (historique)

### Ce qui tourne en ligne

| Brique | État vérifié |
|---|---|
| Worker Sorties `on-sort-poc` | **En ligne.** `/diagnostic` ce jour-là : OpenAgenda 300 événements, 51 « famille » explicites, météo OK. |
| PWA `papa-parfait-web` | **En ligne (HTTP 200)** mais elle sert **l'ancienne version** : le HTML contient encore la terracotta `#D95B43`. La charte Cockpit clair n'est pas déployée. |
| Votes des piliers | En ligne, **0 vote** (`{couple:0, moi:0, tribu:0}`). Aucun signal utilisateur à ce jour. |
| Worker Tribu `papa-tribu` | **Pas déployé** : `/health` et `/` renvoient 404 / `error code: 1042`. |
| DATAtourisme | Toujours KO : les deux URLs candidates renvoient HTTP 404. |
| Supabase | **Projet créé et configuré.** Les tables `profils` et `demandes_ville` répondent, la confirmation par email est désactivée (`mailer_autoconfirm: true`), le provider Google est activé. Le nombre de comptes n'est pas lisible depuis l'app : la RLS limite la lecture de `profils` à son propre compte. |

### Le chantier codé mais ni commité ni déployé

Environ 933 lignes modifiées et 6 fichiers non suivis vivent uniquement sur le
PC de Wassim :

- **Charte « Cockpit clair »** (`apps/on-sort/docs/charte-graphique.md`) et
  `src/theme.js` refait : sable `#ECE6DA`, ambre `#FF8A00`, cadres encre 2px,
  Saira Condensed + IBM Plex Sans.
- **Écrans migrés** : Accueil, Detail, Onboarding, Teaser, CarteSortie,
  BarreOnglets, `ui.js` (6 composants).
- **Comptes Supabase** : `src/supabase.js`, `src/compte-api.js`,
  `supabase/schema.sql`, `docs/backend-supabase.md`, `.env.example`.
- **Onboarding devenu création de compte** : prénom, email, mot de passe, âge de
  l'enfant (0-5), département, ville, et demande d'ajout de ville.
- **Worker Sorties** : clé de cache versionnée, scoring et filtre famille
  affinés, identifiant réel du namespace KV des votes.

L'app compile : `npx expo export --platform web` passe (bundle 797 Ko,
dossier `dist` 4,7 Mo).

---

## ✅ Les décisions prises le 18 septembre 2026

1. **Cap court terme** : mettre l'existant en ligne et le faire tester par de
   vrais papas. Pas de nouvelle fonctionnalité tant qu'il n'y a pas de donnée.
2. **Compte obligatoire dès les premiers testeurs** (email + mot de passe).
   Risque assumé : un écran de mot de passe sur une PWA envoyée par lien fait
   décrocher une partie des visiteurs. Si peu de comptes se créent, c'est le
   premier suspect.
3. **Déploiement d'un seul tenant** : charte Cockpit et comptes réels partent
   ensemble, une fois les secrets CI posés.
4. **Demande de ville** : la route `POST /ville-demande` est implémentée côté
   worker (stockage KV) plutôt que supprimée.
5. **Monétisation** : achats intégrés — **abonnement mensuel + achat à vie**,
   les deux proposés. Le découpage gratuit / payant sera tranché **avec les
   données des testeurs**, pas avant.
6. **Compte développeur Google Play : créé et vérifié.** Plus aucune attente
   administrative côté store.

---

## 🔜 Court terme — mettre en ligne et faire tester

**Objectif de sortie** : la PWA publique sert le Cockpit clair, la création de
compte fonctionne de bout en bout, 10 à 20 papas l'ont ouverte. Aujourd'hui les
comptes et les votes sont à zéro ; c'est ce zéro qu'il faut casser.

### Lot 1 — Réparer et sécuriser le chantier

1. **Bug de l'âge 0** — `src/storage.js` valide le profil avec `p.age`, donc
   l'âge `0` (proposé dans `AGES_ENFANT`) est rejeté et le papa reboucle sur
   l'onboarding à chaque lancement. Tester sur `!= null`.
2. **Implémenter `POST /ville-demande`** dans le worker on-sort (KV). Le code de
   l'app appelle déjà cette route en secours ; elle n'existe pas encore, donc
   toute demande partie par ce chemin est perdue en silence.
3. **Supprimer `AGES = [1..8]`** (constante morte dans `src/config.js`) et
   vérifier la cohérence entre la plage 0-5 de l'app et le filtre d'âge du
   scoring du worker.
4. **Commiter le chantier.** C'est le tout premier geste : 933 lignes non
   sauvegardées ailleurs que sur un disque.

### Lot 1 bis — Le GO doit être jouable (fait le 19 septembre 2026)

Constaté en testant la version Cockpit sur les vraies données : depuis Bruz,
un vendredi, le GO partait à **La Guerche-de-Bretagne (39,3 km) à 9h30**,
devant un équivalent à 10,4 km. Inapplicable pour un papa qui travaille.
Trois correctifs dans le worker, tous testés (72 tests au vert) :

- **Distance par paliers** : ≤ 12 km +3 et raison « Tout près », ≤ 20 km +2,
  ≤ 30 km +0,5, au-delà −1,5. L'ancienne pente (2 points étalés sur 40 km)
  pesait moins que le bonus « ponctuel ».
- **Heure en semaine** (lundi, mardi, jeudi, vendredi) : un créneau qui finit
  avant 16h30 coûte −3 ; un créneau qui commence à 16h30 ou après gagne +1
  et la raison « Après l'école ». Mercredi et week-end sans contrainte. Les
  créneaux viennent du champ `timings` d'OpenAgenda (nouveau module
  `src/horaires.js`), le texte en secours.
- **Horaires lisibles** : « 09h30 et 10h15 », « 14h30 – 17h », « dès 09h30
  (5 créneaux) » au lieu de la liste brute à virgules.

- **Les créneaux font foi pour le jour** : OpenAgenda donne les dates jouées
  exactes (`timings`) pour 100 % des événements. Or **environ 44 %** des
  événements « actifs » sur une date (leur plage la couvre) **n'ont pas lieu
  ce jour-là** — mesuré sur trois dates réelles : 91 sur 208, 94 sur 300, 78
  sur 172. Le top en servait (un solo de danse « 7 - 26 septembre » joué les
  7, 8, 9 et 26, proposé le 18). Désormais : des créneaux mais aucun ce
  jour-là → exclu.

Vérifié en local sur les données réelles après les quatre correctifs : les GO
de vendredi, samedi et mercredi sont tous à moins de 11 km, avec un horaire
réel du jour affiché.

### Lot 1 quater — Chasse aux faux positifs du filtre famille (fait le 19 septembre 2026)

Méthode : corpus réel de **248 événements retenus** par le scoring (5
départements × 3 dates), lus un par un, règles dérivées des motifs observés,
puis rejoués hors ligne sur le corpus brut (3 801 événements) pour mesurer.

Quatre sources de faux positifs, quatre réponses (`src/famille.js`) :

1. **« Enfant(s) » comme sujet, pas comme public** — pièces sur la filiation,
   expos sur l'enfance, « 2 enfants » dans un synopsis, « chorégraphie d'un
   essaim d'enfants ». → Les mots génériques (enfant, famille, familial) ne
   comptent que si le texte **nomme un public** (« pour les enfants », « en
   famille », « parents et enfants », un âge, le tutoiement des médiathèques).
   Sinon c'est un thème : 0,5, plus jamais dans le top.
2. **Réservé aux adultes ou aux parents seuls** — « pour adultes »,
   consultations notariales, formations, cours annuels, baby-sitting dating,
   discussions/débats, humoristes. → Exclusions, dont six sur le titre seul
   (`COMPLET`, `annulé`, `Inscription :`, `Cours de`).
3. **Expressions piégées** — « à tout petit prix », « les sens en éveil ».
   → Nettoyées avant matching.
4. **Âges non lus** — « entre 5 et 8 ans », « 6 mois - 3 ans », « de la
   naissance à 4 ans », « ados », « collège ». → Nouveaux motifs ; un événement
   ados/collège vaut 11 ans et plus, donc exclu pour un petit.

Et deux vrais bugs trouvés en route : « enfant » **et** « enfants » étaient
tous deux dans la liste alors que le matching gère le pluriel — chaque mention
comptait double ; les apostrophes typographiques (’) faisaient rater
« séance d'essai » et « p'tit ».

**Mesure sur le corpus** : 248 retenus → 156. 98 tombés (relus : braderies,
matchs, consultations, comédies pour adultes, expos photo, ateliers bricolage,
cours du soir…), 6 entrés (fête foraine de Nantes, atelier grimage, atelier
6 mois-3 ans). Récupérés de justesse : Barbedouce (« marionnettique »), la
Foire aux manèges de Lille, la Kermesse, les ateliers en tutoiement.

**Étiquette honnête** : « Pensé pour les enfants » seulement si un mot
spécifique (jeune public, marionnettes, bébé, comptines…) ou un âge le prouve ;
sinon « Ouvert aux enfants ». Le solo de danse « accessible aux enfants et
parents » porte désormais la bonne étiquette.

**Soirée** : tout ce qui commence à 19h30 ou après perd 3 points, quel que soit
le jour (chorale à 20h, cours à 19h30 vus dans le corpus).

Reste connu, assumé : des expos d'art avec « en famille » dans le texte
passent encore (score bas, rarement en GO) ; « Kermesse » comme nom de
spectacle déclenche le mot.

### Lot 1 ter — Ouvrir les zones où la donnée existe (fait le 19 septembre 2026)

Mesure OpenAgenda par département (sorties famille un samedi) : Nord 90,
Loire-Atlantique 57, Gironde 44, Paris 43, Ille-et-Vilaine 26, Calvados 21 ;
tout le reste sous 17, y compris Lyon, Marseille, Strasbourg, Montpellier,
Angers, Le Mans — et, en Bretagne même, Morbihan 7, Finistère 3,
Côtes-d'Armor 1.

- **Quatre zones ouvertes** dans `config.js` : Loire-Atlantique (Nantes,
  Saint-Nazaire), Paris, Nord (Lille, Valenciennes, Dunkerque), Gironde
  (Bordeaux, Libourne, Arcachon). Coordonnées par géocodage Open-Meteo. Aucun
  changement worker : `dept` et lat/lon sont déjà génériques.
- **Calvados testé puis écarté** : 21 au diagnostic brut, mais 0 à 3 sorties
  retenues sur cinq dates une fois les créneaux du jour et l'âge appliqués.
  Leçon : la règle d'ouverture se vérifie sur le top réel, pas sur le
  diagnostic brut.
- Vérifié sur le top réel du samedi 26 septembre : Nantes 20 retenues (GO à
  1,6 km, 16h30), Lille 41 (GO à 11 km), Bordeaux 25 (GO à 0,5 km), Paris 19
  (GO « Le Palais des enfants » à 3 km).
- **Positionnement acté** : app nationale, née en Bretagne (voir
  `decisions.md`).
- **États vides honnêtes** dans `Accueil.js` : « Peu de sorties référencées
  par ici pour l'instant » au lieu de « Rien ce jour-là », et une ligne
  discrète quand le top compte moins de trois sorties.
- **Écartés pour l'instant** : Toulouse (17), la petite couronne parisienne
  (7 à 14 par département), tout département sous 20.

### Lot 2 — Brancher Supabase au déploiement

5. ✅ **Fait** : le workflow `deploy-papa-parfait-web.yml` injecte désormais
   `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` dans l'étape de
   build (les variables `EXPO_PUBLIC_*` sont lues à la construction, pas au
   déploiement). Deux garde-fous : le job échoue si les secrets sont absents, et
   il échoue aussi si le bundle construit ne contient pas la configuration
   Supabase. Mieux vaut un déploiement rouge qu'une PWA qui affiche un écran
   d'inscription sans créer de compte.
6. ✅ **Secrets posés** : vérifié le 6 octobre 2026, le bundle de la PWA en
   ligne contient bien l'URL du projet Supabase.

### Lot 3 — Déployer, vérifier, partager

7. Un seul push met en ligne la charte Cockpit et les comptes réels.
8. Vérifications après déploiement :
   - la page servie contient `#FF8A00` et plus `#D95B43` ;
   - une inscription réelle atterrit dans la table `profils` ;
   - **le bouton Google fonctionne sur le web.** Doute identifié : le client
     Supabase est créé avec `detectSessionInUrl: false` et `connexionGoogle`
     passe par `WebBrowser.openAuthSessionAsync`, un chemin pensé pour le
     mobile. À tester en priorité.
9. **Alléger le build** : `dist` pèse 4,7 Mo dont 23 fichiers de police pour 4
   graisses réellement utilisées. C'est la première impression en 4G.
10. Partager le lien à 10-20 papas. Trois chiffres à suivre : comptes créés,
    demandes de ville, votes des piliers.

---

## 🎯 Moyen terme — Play Store puis facturation

Le compte Play étant vérifié, il n'y a plus de délai administratif : le test
interne peut suivre immédiatement le court terme.

### Lot 4 — Android en test interne

- **Héberger la politique de confidentialité à une URL publique.** Le fichier
  existe (`apps/on-sort/docs/politique-confidentialite.md`) mais n'est pas en
  ligne, or Google exige une URL.
- **Formulaire Data safety** : l'app collecte désormais email, prénom et âge de
  l'enfant. À déclarer.
- **Build EAS** (`.aab`) puis publication en **test interne** (jusqu'à 100
  testeurs, sans validation Google).

### Lot 5 — Socle de facturation

- **Point dur vérifié dans les docs Expo v57 : le SDK ne fournit aucun paquet
  d'achat in-app.** Ni `expo-in-app-purchases`, ni `expo-iap`, ni StoreKit, ni
  Google Play Billing. Seul Stripe est listé, et Stripe ne remplace pas la
  facturation du store.
- Conséquences : il faut une **librairie tierce** et donc un **development
  build** — l'app ne tournera plus dans Expo Go. C'est un changement de mode de
  travail, pas une simple dépendance.
- **L'achat in-app ne fonctionnera jamais sur la PWA web.** Le web reste la
  vitrine gratuite ; les revenus passent uniquement par le Play Store.
- Déclarer deux produits dans la Play Console : abonnement mensuel et achat à
  vie.
- Le contenu de l'offre (ce qui reste gratuit) se tranche avec les données des
  testeurs.

### Lot 6 — Régularisations avant de vendre

- **Open-Meteo est en usage non commercial aujourd'hui.** Dès le premier euro de
  revenu, c'est hors cadre. Passer à l'offre payante Open-Meteo ou à
  Météo-France open data **avant** la mise en vente.

---

## ⛔ Hors périmètre, assumé

- **Tribu** : worker non déployé, permission D1 absente du token Cloudflare.
- ~~DATAtourisme : endpoint introuvable~~ — **réglé le 5 octobre 2026**
  (connecteur réécrit pour l'API v1, en prod).
- ~~Migration Cockpit des écrans Couple, Moi, Tribu, Commentaires~~ — **faite
  le 20 septembre 2026**.

Le point restant (Tribu) ne bloque pas la monétisation.

---

## 🐛 Dettes et anomalies relevées le 18 septembre 2026

| Anomalie | Effet | Lot |
|---|---|---|
| ✅ `p.age` rejette l'âge 0 (`src/storage.js`) | Corrigé (`p.age != null`) | Lot 1 |
| ✅ Route `POST /ville-demande` absente du worker | Implémentée (KV) | Lot 1 |
| ✅ `AGES = [1..8]` inutilisée | Supprimée | Lot 1 |
| ✅ Secrets Supabase absents du workflow web | Injectés au build, avec garde-fous | Lot 2 |
| Connexion Google non fonctionnelle sur web | Bouton **masqué** depuis le 20/09 (flux incomplet) | Lot 3 |
| ✅ 23 polices embarquées pour 4 utilisées | Build allégé de 68 % | Lot 3 |
| `vitest` non installé dans les workers en local | `npm test` échoue tant qu'on n'a pas fait `npm ci` | à l'occasion |

---

## ⏳ Blocages connus, hors chemin critique

| Point | Impact | Action |
|---|---|---|
| **Token Cloudflare sans permission D1** | La Tribu ne peut pas s'activer en ligne | Ajouter « D1 Edit » au token, puis relancer le déploiement de `papa-tribu`. Non bloquant tant que la Tribu est en teaser. |
| **Bouton « bloquer un utilisateur » manquant** | Exigé par Google pour du contenu communautaire | À ajouter avant toute activation publique de la Tribu, pas avant. |

---

## Historique des sessions

- **POC, app, rebrand Papa Parfait, Tribu, PWA web** : voir `git log` sur la
  branche `claude/side-hustle-brainstorm-ykikf8`.
- **18 septembre 2026** : point global, charte « Cockpit clair », comptes
  Supabase, roadmap court et moyen terme (ce document).
- **6 octobre 2026** : point d'étape ; audit des sorties (trop de lecture,
  OpenAgenda tronqué) ; l'exceptionnel devant, tournées des cirques et
  « Que faire à Paris » en sources.

> Pour reprendre avec Claude : « lis `docs/papa-parfait/` et continue Papa Parfait ».
