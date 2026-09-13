# 💻 Démarrer le projet sur ton PC (VS Code)

Guide pas-à-pas pour récupérer Papa Parfait sur ta machine et travailler dessus.

## 1. Ce qu'il te faut installer une fois

- **Git** — https://git-scm.com
- **Node.js** version 22 (LTS) — https://nodejs.org
- **VS Code** — https://code.visualstudio.com
- Sur ton téléphone : l'app **Expo Go** (App Store / Play Store) pour tester l'app en direct

## 2. Récupérer le projet

Ouvre un terminal (dans VS Code : menu *Terminal → Nouveau terminal*) et lance :

```bash
git clone https://github.com/nastyjesus/dashboard-wassim.git
cd dashboard-wassim
git checkout claude/side-hustle-brainstorm-ykikf8
code .
```

> La 3e ligne est **importante** : tout Papa Parfait est sur cette branche,
> pas sur `main`.

## 3. Lancer l'app mobile (le plus important)

```bash
cd apps/on-sort
npm install          # à faire une seule fois (installe les dépendances)
npx expo start       # lance l'app
```

Un **QR code** s'affiche dans le terminal :
- **Sur téléphone** : ouvre Expo Go et scanne le QR code → l'app tourne en direct,
  et chaque modif de code se recharge automatiquement.
- **Dans le navigateur** : appuie sur `w` dans le terminal (ou `npm run web`).

L'app est déjà branchée sur les vrais backends en ligne : tu vois de vraies
sorties, la vraie météo, sans rien configurer.

## 4. Où toucher quoi (les fichiers clés)

```
apps/on-sort/
├── App.js                    → point d'entrée, gère les 4 onglets
├── src/
│   ├── config.js             → réglages : villes, âges, URL de l'app, piliers actifs
│   ├── theme.js              → couleurs, polices, espacements (le style)
│   ├── screens/              → un fichier par écran
│   │   ├── Onboarding.js      →   l'accueil (ville + âge)
│   │   ├── Sorties.js / Accueil.js / Detail.js  → le top 5 et la fiche
│   │   ├── Couple.js / Moi.js / Tribu.js          → les piliers complets (codés)
│   │   ├── Teaser.js          →   l'écran « Bientôt » + vote
│   │   └── Commentaires.js    →   le fil de commentaires de la Tribu
│   ├── components/           → briques réutilisables (cartes, chips, onglets)
│   ├── api.js                → parle au backend « sorties »
│   ├── tribu-api.js          → parle au backend « Tribu »
│   └── votes.js              → envoie les votes des piliers
└── assets/                   → icônes de l'app
```

Pour **réactiver un pilier en teaser** (Couple, Moi ou Tribu) : dans
`src/config.js`, passe la valeur à `true` dans `PILIERS_ACTIFS`. L'écran complet
(déjà codé) remplace le teaser.

## 5. Modifier les backends (optionnel, plus avancé)

Les 3 workers sont dans `workers/on-sort`, `workers/papa-tribu`,
`workers/papa-parfait-web`. Chacun a ses tests :

```bash
cd workers/on-sort
npm install
npm test              # vérifie que tout marche
```

Tu n'as **pas besoin de déployer à la main** : voir le point 6.

## 6. Publier tes changements (déploiement automatique)

Quand tu es content d'une modif :

```bash
git add -A
git commit -m "Décris ce que tu as changé"
git push
```

Le push déclenche automatiquement le redéploiement en ligne (via GitHub
Actions) : l'app web et les backends se mettent à jour tout seuls en ~1-2 min.
Tu peux suivre ça dans l'onglet **Actions** du repo sur GitHub.

## 7. Reprendre le travail avec Claude

Ce dossier `docs/papa-parfait/` est fait pour que Claude (ou n'importe quel
dev) reprenne le fil instantanément. Au début d'une nouvelle session, dis
simplement : « lis `docs/papa-parfait/` pour reprendre le projet Papa Parfait ».

## Problèmes courants

- **`npx expo start` ne trouve rien** → tu n'es pas dans `apps/on-sort`. Fais `cd apps/on-sort`.
- **Le QR code ne se connecte pas** → le téléphone et le PC doivent être sur le même Wi-Fi.
- **Erreur de dépendances** → supprime `node_modules` et refais `npm install`.
- **Je ne vois pas mon code** → vérifie que tu es sur la bonne branche : `git branch --show-current` doit afficher `claude/side-hustle-brainstorm-ykikf8`.
