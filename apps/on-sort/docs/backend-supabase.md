# Backend — Supabase (Auth + PostgreSQL)

Auth email/mot de passe + Google, base PostgreSQL, back-office admin. Le code est
déjà branché : dès que les clés sont posées, l'inscription email/mot de passe et
les demandes de ville fonctionnent. Google demande une étape de config en plus.

## Ce que je (Wassim) dois faire une fois

### 1. Créer le projet (2 min)
1. https://supabase.com → **New project**.
2. **Region : West EU (Paris/Frankfurt)** — RGPD, plus proche des papas bretons.
3. Choisir un mot de passe de base de données (le noter).

### 2. Récupérer les clés
Projet → **Settings → API** :
- `Project URL`
- clé `anon public`

Dans `apps/on-sort`, copier `.env.example` en **`.env.local`** et coller les deux
valeurs. Relancer `npx expo start` (les variables sont lues au démarrage).

### 3. Créer les tables
Projet → **SQL Editor** → coller le contenu de [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
Crée `profils`, `demandes_ville` et la vue `demandes_ville_frequence`, avec RLS.

### 4. Réglage inscription (MVP)
Projet → **Authentication → Providers → Email** :
- Pour un onboarding sans friction au lancement, **désactiver « Confirm email »**.
  (Le profil s'écrit alors immédiatement après l'inscription.)
- Plus tard, on pourra réactiver la confirmation + écrire le profil à la
  première connexion confirmée.

### 5. Google (optionnel, quand tu veux le bouton actif)
URL de callback à autoriser dans Google Cloud (Authorized redirect URI) :
```
https://uprtfgltjmmblyqjfmpl.supabase.co/auth/v1/callback
```
1. Google Cloud Console → créer un OAuth client (type « Web »), coller cette URL
   en redirect URI, récupérer Client ID + Secret.
2. **Authentication → Providers → Google** → activer, coller Client ID / Secret.
3. L'URL de redirection interne à l'app (schéma `Linking.createURL('/')`) sera
   ajoutée dans **Authentication → URL Configuration** au moment du test tel.

## Où je vois les données

- **Table Editor → profils** : les comptes papas.
- **Table Editor → demandes_ville** : chaque demande de ville.
- **SQL Editor** → `select * from demandes_ville_frequence;` : les villes les
  plus demandées, triées par fréquence (pour décider lesquelles ouvrir).

## Ce qui est déjà codé côté app

| Fichier | Rôle |
|---------|------|
| `src/supabase.js` | Client Supabase (null si non configuré → fallback local). |
| `src/compte-api.js` | `creerCompte` (signUp + profil), `connexionGoogle` (OAuth), `demanderVille` (insert table). |
| `supabase/schema.sql` | Tables + RLS + vue fréquence. |
| `.env.example` | Gabarit des variables. |

Tant que `.env.local` est vide, l'app tourne en **mode local** (démo jouable,
aucun compte réel créé).
