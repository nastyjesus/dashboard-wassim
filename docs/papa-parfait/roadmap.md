# 🗺️ Roadmap & état d'avancement

> **Point global effectué le 18 septembre 2026.** Tout ce qui suit a été vérifié
> dans le code du dépôt et sur les URLs en ligne. Aucun chiffre n'est estimé.

## Les 3 phases (à ne pas confondre)

| Phase | La question | État |
|---|---|---|
| **1. Construire** | Avec quoi je fabrique l'app ? | ✅ **Fait** (Expo / React Native) |
| **2. Publier** | Où les gens la trouvent / installent ? | 🟡 En cours (PWA en ligne, Play Store à faire) |
| **3. Monétiser** | Comment ça rapporte de l'argent ? | 🟡 Modèle choisi (abonnement + achat à vie), offre et socle technique à faire |

---

## 📍 L'état réel au 18 septembre 2026

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

Non traité, noté : le filtre famille étiquette « Pensé pour les enfants » dès
que le texte contient « enfants » — y compris « accessible aux enfants et
parents » sur un spectacle tout public. Sur-promesse, pas erreur de matching.

### Lot 2 — Brancher Supabase au déploiement

5. ✅ **Fait** : le workflow `deploy-papa-parfait-web.yml` injecte désormais
   `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_ANON_KEY` dans l'étape de
   build (les variables `EXPO_PUBLIC_*` sont lues à la construction, pas au
   déploiement). Deux garde-fous : le job échoue si les secrets sont absents, et
   il échoue aussi si le bundle construit ne contient pas la configuration
   Supabase. Mieux vaut un déploiement rouge qu'une PWA qui affiche un écran
   d'inscription sans créer de compte.
6. **Reste à faire par Wassim** : poser ces deux secrets dans le dépôt GitHub
   (Settings → Secrets and variables → Actions). Tant qu'ils manquent, le
   déploiement de la PWA échouera volontairement.

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
- **DATAtourisme** : endpoint introuvable (404), OpenAgenda suffit.
- **Migration Cockpit des écrans Couple, Moi, Tribu, Commentaires** : ils
  utilisent encore les anciens jetons (`ombre`, `rayon`) mais restent invisibles
  tant que les piliers sont en teaser.

Aucun de ces trois points ne bloque la monétisation.

---

## 🐛 Dettes et anomalies relevées le 18 septembre 2026

| Anomalie | Effet | Lot |
|---|---|---|
| `p.age` rejette l'âge 0 (`src/storage.js`) | Un papa de bébé reboucle sur l'onboarding | Lot 1 |
| Route `POST /ville-demande` absente du worker | Demandes de ville perdues en silence en cas de secours | Lot 1 |
| `AGES = [1..8]` inutilisée | Confusion avec `AGES_ENFANT` (0-5) | Lot 1 |
| Secrets Supabase absents du workflow web | La PWA déployée ignore les comptes | Lot 2 |
| Connexion Google non testée sur web | Bouton potentiellement inopérant sur la PWA | Lot 3 |
| 23 polices embarquées pour 4 utilisées | `dist` à 4,7 Mo | Lot 3 |
| `vitest` non installé dans les workers en local | `npm test` échoue tant qu'on n'a pas fait `npm ci` | à l'occasion |

---

## ⏳ Blocages connus, hors chemin critique

| Point | Impact | Action |
|---|---|---|
| **Token Cloudflare sans permission D1** | La Tribu ne peut pas s'activer en ligne | Ajouter « D1 Edit » au token, puis relancer le déploiement de `papa-tribu`. Non bloquant tant que la Tribu est en teaser. |
| **Endpoint DATAtourisme non confirmé** | Une source de sorties en moins | Trouver l'URL réelle de l'endpoint événements et la poser dans `workers/on-sort/wrangler.toml` (`DATATOURISME_ENDPOINTS`). |
| **Bouton « bloquer un utilisateur » manquant** | Exigé par Google pour du contenu communautaire | À ajouter avant toute activation publique de la Tribu, pas avant. |

---

## Historique des sessions

- **POC, app, rebrand Papa Parfait, Tribu, PWA web** : voir `git log` sur la
  branche `claude/side-hustle-brainstorm-ykikf8`.
- **18 septembre 2026** : point global, charte « Cockpit clair », comptes
  Supabase, roadmap court et moyen terme (ce document).

> Pour reprendre avec Claude : « lis `docs/papa-parfait/` et continue Papa Parfait ».
