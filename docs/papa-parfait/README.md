# 🧡 Papa Parfait — le dossier maître du projet

**Le QG des papas** : sorties pour les enfants, idées couple, bien-être du papa,
et la tribu. Ton complice, « entre papas, on se comprend ». Zone de lancement :
Bretagne (4 départements).

Ce dossier est le **cerveau du projet** : tout ce qu'il faut savoir pour
reprendre le travail sans rien reperdre, même après une longue pause ou sur une
nouvelle machine.

## 📁 Les documents de ce dossier

| Fichier | Ce qu'il contient |
|---|---|
| **[demarrage-vscode.md](./demarrage-vscode.md)** | Comment installer et lancer le projet sur ton PC depuis VS Code (à lire en premier) |
| **[architecture.md](./architecture.md)** | Les 4 composants techniques, leurs URLs, comment ils communiquent |
| **[decisions.md](./decisions.md)** | Toutes les décisions produit et business déjà prises (nom, ton, cible, piliers, monétisation) |
| **[roadmap.md](./roadmap.md)** | Les 3 phases (construire / publier / monétiser), où on en est, et ce qui reste à faire |

## 🗺️ Où vit le code dans ce repo

Le projet est réparti dans le repo `dashboard-wassim` (qui contient aussi
d'autres outils de Wassim). Les morceaux de Papa Parfait :

```
apps/on-sort/              → l'app mobile (Expo / React Native), les 4 onglets
workers/on-sort/           → backend « sorties » : top 5, météo, votes
workers/papa-tribu/        → backend communautaire (la Tribu) : posts, fil, modération
workers/papa-parfait-web/  → héberge la version web (PWA) de l'app
docs/papa-parfait/         → CE dossier : les connaissances du projet
```

> Le dossier de l'app s'appelle encore `on-sort` (le nom du POC de départeur,
> « On sort ? ») — c'est devenu Papa Parfait en cours de route, mais on n'a pas
> renommé les dossiers pour ne pas casser les déploiements. `on-sort` = Papa
> Parfait, c'est le même projet.

## 🌿 Sur quelle branche est le projet

Tout le travail Papa Parfait est sur la branche **`claude/side-hustle-brainstorm-ykikf8`**
(pas sur `main`, qui contient l'ancien dashboard). Voir `demarrage-vscode.md`
pour savoir comment la récupérer.

## 🔗 Les liens qui comptent

- **App web en ligne (à tester / partager)** : https://papa-parfait-web.loumiwassim.workers.dev
- **Backend sorties** : https://on-sort-poc.loumiwassim.workers.dev (essaie `/top` ou `/diagnostic`)
- **Votes des piliers en teaser** : https://on-sort-poc.loumiwassim.workers.dev/votes
- **Backend Tribu** : https://papa-tribu.loumiwassim.workers.dev *(en attente d'activation, voir roadmap)*
