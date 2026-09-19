# Contexte pour l'agent IA — dépôt de Wassim Loumi

Ce dépôt contient plusieurs projets de Wassim. Le **projet actif** est
**Papa Parfait** (une app mobile). Avant de travailler dessus, **lis le dossier
`docs/papa-parfait/`** — c'est le cerveau du projet (architecture, décisions,
roadmap). Commence par `docs/papa-parfait/README.md`.

## Règle absolue (non négociable)

**Ne JAMAIS inventer de chiffres ni de faits.** Cela vaut pour les données SEO,
les revenus, les statistiques de marché, les tarifs, les performances. Si une
donnée n'est pas vérifiée (source réelle, fichier fourni, ou API), le dire
clairement au lieu de l'estimer. Ne rien supposer sur des faits (ex. « telle app
utilise telle techno ») sans preuve — demander plutôt.

## Papa Parfait — l'essentiel

- **Ce que c'est** : « Le QG des papas » — sorties pour enfants (météo comprise),
  + 3 piliers en teaser (couple, bien-être, communauté). Ton complice, tutoiement.
  Zone : Bretagne. Cible : les papas (public 18+).
- **But du projet** : une app **monétisable**.
- **Où est le code** :
  - `apps/on-sort/` → l'app (Expo / React Native). NB : le dossier s'appelle
    `on-sort` pour raisons historiques, mais c'est bien Papa Parfait.
  - `workers/on-sort/` → backend sorties (top 5, météo, votes)
  - `workers/papa-tribu/` → backend communauté (Tribu)
  - `workers/papa-parfait-web/` → héberge la version web (PWA)
- **Détails complets** : `docs/papa-parfait/architecture.md`,
  `decisions.md`, `roadmap.md`.

## Façon de travailler sur ce dépôt

- **Branche de travail** : `claude/side-hustle-brainstorm-ykikf8` (pas `main`).
- **Déploiement automatique** : un `git push` sur la branche redéploie les
  workers concernés via GitHub Actions. Ne pas déployer à la main.
- **Vérifier avant de pousser** : lancer les tests des workers touchés
  (`npm test` dans le dossier du worker) et s'assurer que l'app compile
  (`npx expo export --platform web` dans `apps/on-sort`).
- **Langue** : répondre à Wassim en français.

## Reprendre le fil rapidement

Au début d'une session : « lis `docs/papa-parfait/` et continue Papa Parfait ».
