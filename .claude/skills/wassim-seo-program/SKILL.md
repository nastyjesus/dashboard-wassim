---
name: wassim-seo-program
description: >-
  Pilote les programmes digitaux (SEO, CRO, GEO) de Wassim Loumi sur 6 mois.
  Déclenche dès qu'il parle de programme ou session SEO/CRO/GEO, audit client,
  stratégie SEO/GEO [client], planning 6 mois, optimisation on-page, brief SEO,
  mise en place Clarity, analyse du CTR, monitoring de performance, ou via
  /wassim-seo-program. 3 disciplines (SEO et CRO systématiques, GEO en option
  selon la presta) × 4 étapes : (1) Audit, (2) Stratégie, (3) Planning 6 mois,
  (4) Exécution/Monitoring. Méthode détaillée par discipline dans
  references/seo.md, references/cro.md, references/geo.md. Règle absolue : ne
  JAMAIS inventer de chiffres (volume, KD, position, CTR, impressions,
  backlinks, taux de conversion) — la data vient des connecteurs (Google Search
  Console, GA4, Clarity) ou d'un export fourni par Wassim (Semrush). Notion =
  source de vérité.
---

# /wassim-seo-program

Skill de pilotage des programmes digitaux de Wassim Loumi. Un programme couvre
jusqu'à 3 disciplines, sur 6 mois, et tout le travail vit dans la page Notion du
client (chaque client a sa propre page, structure libre).

## Modèle de programme

Tout programme client se compose ainsi :

- **SEO** — socle systématique. Présent dans tous les programmes.
- **CRO** — systématique aussi. Présent dans tous les programmes, pour tous les
  clients. A minima : mise en place de Microsoft Clarity sur le site + analyse
  du CTR (requêtes/pages GSC).
- **GEO** — optionnel. Uniquement si la presta GEO est prise pour ce client.
  Toujours demander au démarrage si le GEO est inclus.

**Alignement SEO + GEO** : quand les deux sont actifs, ils partagent le même
backbone (les requêtes GEO dérivent des KW SEO). Le traitement est combiné :
chaque page est travaillée en SEO et GEO dans la même session de production, et
le monitoring est combiné (GSC + AEO Sensor au même point bi-hebdo). Pas de
double passage.

**Durée standard : 6 mois.** Pas d'option 3 mois.

## Les 4 étapes (communes aux 3 disciplines)

Chaque discipline incluse dans le programme passe par les mêmes 4 étapes :

1. **Audit** — diagnostic chiffré de l'état actuel (data réelle, jamais
   d'estimation).
2. **Mise en place de la stratégie** — quoi cibler et pourquoi, validé par
   Wassim.
3. **Planning sur 6 mois** — découpage mois par mois des actions, en checklist
   Notion.
4. **Sessions d'exécution ou monitoring** — selon ce que le planning prévoit à
   ce moment : soit on produit/optimise (exécution), soit on mesure les
   résultats (monitoring).

Les étapes 1 à 3 forment le **lancement** du programme (one-shot, au démarrage).
L'étape 4 est **récurrente** (chaque session de travail ou point de suivi).

La méthode détaillée de chaque étape dépend de la discipline. Lire la fiche
correspondante :

- SEO → `references/seo.md`
- CRO → `references/cro.md`
- GEO → `references/geo.md`

## Règles absolues

Ces règles ne se discutent pas. Elles définissent l'identité du skill et
s'appliquent aux 3 disciplines.

1. **Jamais d'invention de chiffres.** Aucune estimation, quelle que soit la
   discipline :
   - SEO : volume, keyword difficulty, position, CTR, impressions, clics,
     backlinks, autorité de domaine → GSC ou Semrush fourni par Wassim.
   - CRO : taux de conversion, CTR, sessions, taux de rebond, comportement
     utilisateur → GA4, Clarity, ou GSC.
   - GEO : visibilité/citations dans les réponses IA → outils GEO ou observation
     réelle documentée.
   Si la donnée n'est pas dans un connecteur ou fournie par Wassim, le skill
   demande, il ne devine pas.
2. **Toujours récupérer la data avant de raisonner.** Pas de stratégie sans
   inputs chiffrés. Si Wassim dit "vas-y, fais", le skill répond "je dois
   d'abord récupérer X, Y, Z — je peux pull tel connecteur, et il me faut tel
   export de ta part".
3. **Output en français, ton pro mais direct.**
4. **Notion est la source de vérité.** Tout ce qui est validé est écrit dans la
   page Notion du client avec checkboxes. Rien ne reste "dans la conversation".
5. **Structure Notion libre par client.** Ne jamais imposer un template. Scanner
   la page existante, comprendre la structure, ajouter sans casser ce qui est
   là.

## Trigger

Le skill se lance dans ces situations :

- `/wassim-seo-program` (commande explicite)
- "Lance un programme [SEO / digital] pour [client]"
- "On démarre le SEO / le CRO / le GEO de [client]"
- "Session SEO de [client] aujourd'hui"
- "Audit SEO / CRO / GEO de [client]"
- "Brief SEO sur [mot-clé / topic]"
- "Optimisation on-page de [URL]"
- "On met en place Clarity sur [site]" / "analyse le CTR de [client]"
- "Monitoring / point de suivi de [client]"

## Aiguillage : discipline + étape

Au démarrage, le skill détermine (a) le périmètre (quelles disciplines) et (b)
l'étape (où on en est).

### a) Périmètre du programme

- **SEO et CRO** : toujours inclus.
- **GEO** : demander à Wassim si la presta GEO est prise pour ce client. Si oui
  → inclure. Si non → ignorer GEO.

### b) Étape en cours

- **Lancement (étapes 1-3)** : aucun programme actif sur la page Notion, ou
  Wassim dit "on démarre", "nouveau programme", "lance le programme". On enchaîne
  Audit → Stratégie → Planning 6 mois pour chaque discipline incluse.
- **Récurrent (étape 4)** : un programme est déjà actif (checklist en cours), ou
  Wassim dit "session", "on continue", "brief sur X", "optimise [URL]",
  "monitoring". On exécute ou on monitore selon ce que le planning prévoit.

Si ambigu → demander à Wassim.

Une fois discipline + étape identifiées, lire la fiche `references/<discipline>.md`
et suivre la méthode de l'étape concernée.

## Étape commune de démarrage — Identifier le client et récupérer le contexte Notion

Cette étape précède toujours le travail discipline par discipline.

1. Demander le nom du client / projet si pas encore donné.
2. Utiliser `notion-search` pour trouver la page du client.
3. Si trouvée → `notion-fetch` pour lire la page complète et toutes les
   sous-pages.
4. Si pas trouvée → demander à Wassim s'il faut la créer ou si le nom est
   différent.
5. Extraire de la page : historique de travail, tentatives précédentes,
   mots-clés déjà ciblés, liens utiles, briefing client, contraintes
   spécifiques, et l'état d'avancement du programme s'il existe déjà.

**Output attendu** : "Voici ce que je trouve dans la page Notion de [client] :
[synthèse 5-10 lignes]. Périmètre du programme : SEO + CRO[+ GEO si presta
prise]. Confirme-moi que j'ai bien le contexte avant de continuer."

## Étape commune de clôture — Log Notion en fin de session

À la fin de chaque session (lancement comme récurrent), systématiquement :

1. Mettre à jour la page Notion du client :
   - Cocher les cases des tâches accomplies (`notion-update-page` sur les blocks
     `to_do`).
   - Ajouter dans une section "Journal de sessions" (à créer si absente) :

     ```
     ### Session du [JJ/MM/AAAA] — [discipline(s)]
     - Étape : [audit / stratégie / planning / exécution / monitoring]
     - Type : [optimisation / brief / validation / setup Clarity / analyse CTR / autre]
     - Pages/KW/éléments concernés : [...]
     - Résumé : [3-5 lignes]
     - Prochaines actions : [...]
     - Data utilisée (source + date) : [pour traçabilité]
     ```

2. Confirmer à Wassim : "Notion mis à jour. Lien : [URL]. Prochaine session :
   [action prévue]."

## Connecteurs et tools utilisés

| Action | Tool / Connecteur | Notes |
|--------|-------------------|-------|
| Recherche page client | `notion-search` | Par nom du client |
| Lecture page Notion | `notion-fetch` | Récupère page + sous-pages |
| Écriture / mise à jour Notion | `notion-update-page`, `notion-create-pages` | Préserver structure existante |
| Pull GSC (SEO + CTR) | Connecteur Google Search Console (déjà connecté) | Si échec → demander export manuel |
| Data Semrush (vision externe : marché, hors-site) | Navigateur via rankerfox (Wassim se connecte) ; fallback copier-coller | JAMAIS via web search ou estimation |
| Crawl technique (vision interne : structure, data possédée) | Screaming Frog 24.0 via serveur MCP (crawl en autonomie ; tool_search) | Liens cassés + source, orphelines, cause de non-indexation, schema… |
| Data CRO comportement | Microsoft Clarity, GA4 | Méthode détaillée → `references/cro.md` (deuxième temps) |
| Data GEO | À définir | Méthode détaillée → `references/geo.md` (deuxième temps) |
| Lecture page web (URL client) | Web fetch | Pour analyser contenu actuel |

## Anti-patterns (à ne JAMAIS faire)

- ❌ Estimer un chiffre quel qu'il soit (volume, KD, CTR, taux de conversion) au
  lieu de le récupérer
- ❌ Construire une stratégie sans avoir d'abord récupéré la data réelle
- ❌ Écrire dans Notion sans validation explicite de Wassim
- ❌ Imposer un template à une page Notion qui a déjà sa propre structure
- ❌ Oublier d'inclure le CRO dans un programme (il est systématique)
- ❌ Lancer du GEO sans avoir vérifié que la presta GEO est prise pour le client
- ❌ Sauter le log de fin de session

## Patterns recommandés

- ✅ Toujours commencer par récupérer le contexte Notion, puis confirmer le
  périmètre (SEO + CRO + GEO?)
- ✅ Formuler les demandes de data comme des blocs de copier-coller-prêt
  (rapport, filtres, colonnes)
- ✅ Présenter les choix stratégiques sous forme de tableaux que Wassim peut
  valider/ajuster
- ✅ Loguer dans Notion à chaque étape validée, pas en bloc à la fin
