# 🏗️ Architecture technique

Papa Parfait = **1 app** + **3 petits serveurs** (workers Cloudflare) + **1 base
managée** (Supabase, depuis septembre 2026). Côté Cloudflare tout est gratuit ou
quasi (des millions de requêtes sans frais sur le plan de base).

## Vue d'ensemble

```
   ┌─────────────────────────┐
   │   L'app Papa Parfait     │   apps/on-sort/  (Expo / React Native)
   │   4 onglets              │   → tourne sur téléphone (Expo Go, puis stores)
   │                          │   → et en web (PWA) via le worker web
   └───────────┬──────────────┘
               │ appels HTTPS
   ┌───────┬───┴───────────┬─────────────────┬──────────────┐
   ▼       ▼               ▼                 ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐  (l'app web est
│ on-sort  │ │papa-tribu│ │ (open data)  │ │  Supabase  │   servie par
│ SORTIES  │ │ TRIBU    │ │ OpenAgenda   │ │ COMPTES    │   papa-parfait-web)
│ + votes  │ │ + D1     │ │ Open-Meteo   │ │ PostgreSQL │
└──────────┘ └──────────┘ └──────────────┘ └────────────┘
```

## Les 5 composants

### 1. `apps/on-sort/` — l'application
- **Techno** : Expo (React Native) + export web pour la PWA.
- **Navigation** : maison, par état local (pas de librairie de nav). 4 onglets :
  Sorties, Couple, Moi, Tribu.
- **Ne calcule rien** : elle affiche ce que les workers lui préparent.
- **Stockage local** (AsyncStorage) : le profil (ville + âge), les check-ins
  bien-être, le jeton Tribu, l'identifiant d'appareil pour les votes.

### 2. `workers/on-sort/` — backend « Sorties » (worker `on-sort-poc`)
- **URL** : https://on-sort-poc.loumiwassim.workers.dev
- **Rôle** : agrège les événements, croise avec la météo, score, renvoie le top 5.
- **Endpoints** :
  - `GET /top?date=&lat=&lon=&age=&rayon=&dept=&code=` → le top 5 scoré
  - `GET /diagnostic` → densité de données + verdict (outil de contrôle)
  - `POST /votes` + `GET /votes` → votes « Ça m'intéresse » des piliers en teaser
    (stockés dans un namespace KV, un vote par appareil et par pilier)
- **Sources de données** :
  - **OpenAgenda** (via le miroir OpenDataSoft, sans clé) — source principale, marche.
  - **DATAtourisme** (API ouverte 2026) — endpoint exact **pas encore confirmé**
    (voir roadmap) ; le worker sonde plusieurs URLs candidates.
  - **Open-Meteo** (météo, sans clé) — à passer sur une offre commerciale avant
    de monétiser.
- **Le scoring** (`src/scoring.js` + `src/famille.js` + `src/jours.js`) : filtre
  « famille » par mots-clés (mots entiers), tranche d'âge, distance, jour de la
  semaine réel, intérieur/extérieur selon la pluie, gratuité, durée (les
  événements ponctuels passent devant les expos permanentes).

### 3. `workers/papa-tribu/` — backend « Tribu » (worker `papa-tribu`)
- **URL** : https://papa-tribu.loumiwassim.workers.dev
- **Rôle** : la communauté — inscription (pseudo seul, pas d'email), fil par
  département, posts Sortie/Entraide, pouces, commentaires, signalements avec
  masquage auto, endpoints admin.
- **Base de données** : Cloudflare **D1** (SQLite), schéma dans `schema.sql`.
- **État** : codé et testé, mais **pas encore actif en ligne** — il faut donner
  la permission « D1 » au jeton Cloudflare (voir roadmap). En attendant, l'onglet
  Tribu de l'app est en **teaser**.

### 4. `workers/papa-parfait-web/` — hébergement web (worker `papa-parfait-web`)
- **URL** : https://papa-parfait-web.loumiwassim.workers.dev
- **Rôle** : sert la version web de l'app (export Expo transformé en PWA
  installable). C'est ce qu'on partage pour tester sans passer par un store.
- **Comment** : le workflow construit l'app web, la transforme en PWA
  (`apps/on-sort/scripts/pwa-postbuild.mjs` : manifest, service worker, icônes),
  puis le worker sert ces fichiers en statique.

### 5. Supabase — comptes et back-office (depuis septembre 2026)
- **Rôle** : l'authentification (email + mot de passe, Google) et la base
  PostgreSQL des comptes.
- **Tables** : `profils` (prénom, âge de l'enfant, ville, département, lié à
  `auth.users`) et `demandes_ville` (les villes réclamées par les papas hors
  zone), plus la vue `demandes_ville_frequence`. Schéma :
  `apps/on-sort/supabase/schema.sql`, avec RLS — chaque papa ne voit que son
  propre profil.
- **Côté app** : `src/supabase.js` (client) et `src/compte-api.js` (création de
  compte, Google, demande de ville).
- **Configuration** : deux variables `EXPO_PUBLIC_SUPABASE_URL` et
  `EXPO_PUBLIC_SUPABASE_ANON_KEY`, lues au démarrage. Tant qu'elles sont
  absentes, l'app retombe en mode démo local et **ne crée aucun compte réel**.
  Mode d'emploi : `apps/on-sort/docs/backend-supabase.md`.

## Déploiement (automatique)

Chaque worker a un workflow dans `.github/workflows/deploy-*.yml`. Un `git push`
sur la branche de travail redéploie automatiquement ce qui a changé. Aucune
manipulation manuelle sur Cloudflare n'est nécessaire (namespaces KV et base D1
créés par les workflows).

**Secrets nécessaires** (déjà configurés dans le repo GitHub) :
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Le token doit avoir la
permission **D1 Edit** pour activer la Tribu (c'est le point en attente).

⚠️ **Les variables Supabase sont lues au moment du build.** Le workflow
`deploy-papa-parfait-web.yml` ne les passe pas encore : tant qu'elles n'y sont
pas ajoutées (en secrets GitHub puis en variables d'environnement du build), la
PWA déployée tourne en mode démo, même si le code est branché.

## Ce qui est stocké où

| Donnée | Où | Remarque |
|---|---|---|
| Compte (email, mot de passe) | Supabase Auth | mot de passe haché côté serveur, jamais stocké par l'app |
| Profil (prénom, âge enfant, ville) | table `profils` (Supabase) **et** copie locale | la copie locale fait tourner l'app hors ligne |
| Demandes de ville | table `demandes_ville` (Supabase) | sert à décider des prochaines villes |
| Check-ins bien-être | téléphone | 100 % local |
| Votes des piliers | KV du worker on-sort | 1 par appareil |
| Posts / commentaires Tribu | base D1 du worker papa-tribu | pseudo, pas d'identité civile |
| Événements affichés | open data public | pas de donnée perso dans ces requêtes |
