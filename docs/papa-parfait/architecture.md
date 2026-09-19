# 🏗️ Architecture technique

Papa Parfait = **1 app** + **3 petits serveurs** (workers Cloudflare). Tout est
gratuit ou quasi (Cloudflare gère des millions de requêtes sans frais sur le
plan de base).

## Vue d'ensemble

```
   ┌─────────────────────────┐
   │   L'app Papa Parfait     │   apps/on-sort/  (Expo / React Native)
   │   4 onglets              │   → tourne sur téléphone (Expo Go, puis stores)
   │                          │   → et en web (PWA) via le worker web
   └───────────┬──────────────┘
               │ appels HTTPS
       ┌───────┼───────────────┬─────────────────────┐
       ▼       ▼               ▼                     ▼
 ┌──────────┐ ┌──────────┐ ┌──────────────┐   (l'app web est servie
 │ on-sort  │ │papa-tribu│ │ (open data)  │    par papa-parfait-web)
 │ SORTIES  │ │ TRIBU    │ │ OpenAgenda   │
 │ + votes  │ │ + D1     │ │ Open-Meteo   │
 └──────────┘ └──────────┘ └──────────────┘
```

## Les 4 composants

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

## Déploiement (automatique)

Chaque worker a un workflow dans `.github/workflows/deploy-*.yml`. Un `git push`
sur la branche de travail redéploie automatiquement ce qui a changé. Aucune
manipulation manuelle sur Cloudflare n'est nécessaire (namespaces KV et base D1
créés par les workflows).

**Secrets nécessaires** (déjà configurés dans le repo GitHub) :
`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Le token doit avoir la
permission **D1 Edit** pour activer la Tribu (c'est le point en attente).

## Ce qui est stocké où

| Donnée | Où | Remarque |
|---|---|---|
| Profil (ville, âge) | téléphone de l'utilisateur | jamais envoyé au serveur |
| Check-ins bien-être | téléphone | 100 % local |
| Votes des piliers | KV du worker on-sort | 1 par appareil |
| Posts / commentaires Tribu | base D1 du worker papa-tribu | pseudo, pas d'identité civile |
| Événements affichés | open data public | pas de donnée perso dans ces requêtes |
