# 🗺️ Roadmap & état d'avancement

## Les 3 phases (à ne pas confondre)

| Phase | La question | État |
|---|---|---|
| **1. Construire** | Avec quoi je fabrique l'app ? | ✅ **Fait** (Expo / React Native) |
| **2. Publier** | Où les gens la trouvent / installent ? | 🟡 En cours (PWA web faite, Play Store à venir) |
| **3. Monétiser** | Comment ça rapporte de l'argent ? | ⬜ À définir puis brancher |

## ✅ Ce qui est fait

- App complète, 4 onglets (Sorties actif, 3 piliers en teaser).
- Backend Sorties déployé : top 5 réel, météo, scoring affiné.
- Backend Tribu **codé et testé** (pas encore activé en ligne).
- Votes des piliers en teaser (pour prioriser ce qu'on construit ensuite).
- Partage viral sur les fiches sorties.
- **Version web publique en ligne** (PWA installable) — testable / partageable
  maintenant : https://papa-parfait-web.loumiwassim.workers.dev
- Préparé pour la beta Google Play : icônes, config de build (`eas.json`),
  identifiant `com.papaparfait.app`, politique de confidentialité
  (`apps/on-sort/docs/politique-confidentialite.md`).
- Déploiement automatique de tout via GitHub Actions.

## 🔜 Prochaines étapes

### Court terme — tester en vrai
1. **Tester la PWA** soi-même sur téléphone, puis la **partager** aux premiers
   papas (BNI de Bruz, parents d'école). Voir si les gens reviennent.
2. **Lire les votes** des piliers après quelques jours :
   https://on-sort-poc.loumiwassim.workers.dev/votes

### Pour monétiser (le but) — phase Play Store
3. **Trancher le modèle de monétisation** (voir `decisions.md` — dépend de la
   réponse sur comment myefarm monétise).
4. **Créer le compte développeur Google Play** (25 $, une fois ; vérification
   d'identité qui prend quelques jours — à lancer tôt).
5. **Builder l'app** avec EAS (`eas build --platform android`) sur le PC de
   Wassim → fichier `.aab`.
6. **Publier en test interne** sur le Play Store (jusqu'à 100 testeurs, sans
   validation Google, immédiat).
7. **Brancher la monétisation** (pub et/ou abonnement) une fois le modèle choisi.

## ⏳ Points en attente / blocages connus

| Point | Impact | Action |
|---|---|---|
| **Token Cloudflare sans permission D1** | La Tribu ne peut pas s'activer en ligne | Ajouter la permission « D1 Edit » au token Cloudflare, puis relancer le déploiement de `papa-tribu`. Non bloquant tant que la Tribu est en teaser. |
| **Endpoint DATAtourisme non confirmé** | Une source de sorties en moins (OpenAgenda suffit pour l'instant) | Ouvrir https://api.datatourisme.fr/v1/docs, trouver l'URL de l'endpoint événements, la mettre dans `workers/on-sort/wrangler.toml` (`DATATOURISME_ENDPOINTS`). |
| **Modèle de monétisation à définir** | C'est le but du projet | Question ouverte : comment myefarm monétise. Voir `decisions.md`. |
| **Compte Google Play pas encore créé** | Pas de publication store possible | Wassim doit le créer (délai de vérification). |
| **Bouton « bloquer un utilisateur » manquant** | Exigé par Google pour publier du contenu communautaire | À ajouter dans la Tribu avant une sortie publique (pas avant). |
| **Open-Meteo en usage non commercial** | À régulariser avant de monétiser | Passer sur l'offre payante Open-Meteo ou Météo-France open data. |

## Historique des sessions

- **POC + app + rebrand Papa Parfait + Tribu + PWA web** : voir l'historique Git
  (`git log`) sur la branche `claude/side-hustle-brainstorm-ykikf8`. Chaque commit
  décrit une étape.

> Pour reprendre avec Claude : « lis `docs/papa-parfait/` et continue Papa Parfait ».
