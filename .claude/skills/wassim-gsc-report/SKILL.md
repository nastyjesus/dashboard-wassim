---
name: wassim-gsc-report
description: >-
  Skill pour générer un rapport Google Search Console esthétique et comparatif
  pour Wassim Loumi. Utilise ce skill dès que Wassim parle de rapport GSC,
  chiffres GSC, performance SEO du mois, comparatif Search Console, données GSC,
  évolution du trafic SEO, bilan mensuel client, point SEO mensuel, screenshot
  pour client, ou via la commande /wassim-gsc-report. Le skill demande
  systématiquement le site cible, la période d'analyse et la période de
  comparaison, pull les données via le connecteur Google Search Console (déjà
  connecté), produit un artefact HTML interactif avec KPIs, deltas vs période
  précédente et insights en langage naturel, puis propose optionnellement de
  logger le rapport dans Notion. Règle absolue — le skill ne génère JAMAIS de
  chiffres SEO de lui-même (clics, impressions, CTR, position). Toutes les
  données viennent obligatoirement du connecteur GSC ; si la pull échoue, le
  skill demande à Wassim un export manuel plutôt que d'estimer.
---

# /wassim-gsc-report

Skill de reporting GSC rapide pour Wassim Loumi. Sortie unique : un artefact HTML
interactif que Wassim peut consulter à froid ou envoyer à un client via le lien.

## Règles absolues

Ces règles ne se discutent pas. Si l'une d'elles ne peut être respectée, le skill
s'arrête et explique pourquoi à Wassim.

1. **Jamais d'invention de chiffres.** Clics, impressions, CTR, position moyenne
   — aucune estimation. Si le connecteur GSC ne répond pas, demander à Wassim un
   export CSV manuel. Pas d'arrondi de tête, pas de "à peu près".
2. **Toujours demander le site avant de pull.** Le skill ne devine pas la
   propriété GSC, même si un seul site a été utilisé récemment. Demande explicite
   à chaque session.
3. **Toujours demander la période et la comparaison avant de pull.** Le skill
   propose les options usuelles mais Wassim choisit à chaque session — pas de
   défaut implicite.
4. **L'artefact HTML est la sortie de référence.** Pas de tableau Markdown long
   en chat. Le rapport vit dans l'artefact, le chat sert juste à confirmer et
   donner le lien.
5. **Output en français, ton pro mais sobre.** Le rapport peut être lu
   directement par un client (PME, dirigeant non-technique) — vocabulaire SEO
   expliqué quand utile, pas de jargon gratuit.

## Trigger

Le skill se lance dans ces situations :

- `/wassim-gsc-report` (commande explicite)
- "Fais-moi le rapport GSC de [client/site]"
- "Je veux les chiffres GSC du mois pour [client]"
- "Comparatif Search Console [client]"
- "Bilan SEO mensuel [client]"
- "Évolution du trafic SEO [client]"
- "Un point GSC à envoyer à [client]"
- Toute demande qui mêle "GSC", "Search Console", "trafic SEO", "clics
  impressions" avec une logique de comparaison ou de reporting

## Workflow en 5 étapes

### Étape 1 — Cadrer la demande

Avant de toucher à la moindre data, le skill récupère trois infos auprès de
Wassim. Si l'une manque, il demande explicitement, il ne devine pas.

**1.1 Site cible**

Question type : "Sur quel site je tire le rapport ? Donne-moi l'URL ou le nom de
la propriété GSC (ex: `https://exemple.fr/` ou `sc-domain:exemple.fr`)."

Si le nom du client est mentionné mais pas la propriété GSC exacte, demander
confirmation : "Pour [client], la propriété GSC c'est bien [X] ? Confirme-moi
avant que je tape."

**1.2 Période d'analyse**

Proposer ces options à Wassim et le laisser choisir (toujours, pas de défaut
implicite) :

- 28 derniers jours (par défaut GSC, le plus rolling)
- Mois calendaire en cours
- Mois calendaire précédent (utile pour un bilan client envoyé en début de mois)
- Trimestre en cours
- Trimestre précédent
- Période custom (Wassim donne deux dates)

**1.3 Période de comparaison**

Proposer ces options et laisser Wassim choisir :

- vs période précédente de même longueur (ex: si analyse = mois en cours, compare
  au mois d'avant)
- vs même période N-1 (ex: mai 2026 vs mai 2025 — utile pour neutraliser la
  saisonnalité)
- vs aucune comparaison (rapport snapshot brut)

**Output attendu de l'étape 1** : un récap en une phrase que Wassim valide avant
de pull. Exemple :

> Ok, je pars sur `sc-domain:wassimloumicorporate.fr`, période 1er → 30 avril
> 2026, comparaison mars 2026 (mois précédent). Je pull, dis-moi si OK.

Si Wassim valide → étape 2. Sinon, ajuster.

### Étape 2 — Récupérer les données GSC

Utiliser le connecteur Google Search Console (déjà connecté chez Wassim) pour
pull, pour les deux périodes (analyse + comparaison) :

- **KPIs globaux** : total clics, total impressions, CTR moyen, position moyenne
- **Série temporelle quotidienne** : clics + impressions par jour (pour tracer la
  courbe dans l'artefact)

Calculer ensuite côté skill :

- Delta absolu et delta % de chaque KPI entre période d'analyse et comparaison
- Direction (hausse / baisse / stable — seuil de stabilité : ±2%)

Si le connecteur GSC échoue ou si la propriété n'est pas accessible :

- Ne pas inventer les chiffres.
- Demander à Wassim un export CSV manuel depuis l'interface GSC (Performance →
  Export → CSV) pour les deux périodes.
- Parser le CSV fourni.

Si Wassim n'a pas demandé de comparaison (option "aucune") : pull uniquement la
période d'analyse, sauter les deltas, et générer un artefact mode snapshot (KPIs
simples + courbe).

### Étape 3 — Construire l'artefact HTML

Utiliser `mcp__cowork__create_artifact` pour générer un artefact interactif.

**Structure obligatoire de l'artefact** (cf. template complet dans
`assets/template.html`) :

1. **Header** — Nom du site, période d'analyse, période de comparaison (ou
   "snapshot" si aucune).
2. **4 KPI cards** (clics, impressions, CTR, position moyenne) — gros chiffre
   actuel, delta % vs comparaison, mini-flèche colorée (vert hausse, rouge
   baisse, gris stable). **Important** : pour la position moyenne, une **baisse**
   du chiffre = une **amélioration** (ex: 12.3 → 8.5 = bon) — colorer en **vert**
   dans ce cas. Le skill doit penser à inverser la logique de couleur pour ce
   KPI.
3. **Graphique d'évolution** — courbe Chart.js superposant clics période
   d'analyse + clics période de comparaison (axe x normalisé en jours depuis le
   début de chaque période pour comparer visuellement). Toggle pour basculer
   clics / impressions.
4. **Section insights** — 3 à 5 phrases d'analyse en langage naturel, générées
   via `window.cowork.askClaude(prompt, data)` à l'ouverture de l'artefact pour
   rester fraîches. Le prompt doit demander : tendance générale, point fort,
   point d'attention, recommandation actionnable.
5. **Footer** — Date de génération, mention "Données : Google Search Console",
   logo / nom du site client.

**Charte visuelle** (cohérente avec wassimloumicorporate.fr) :

- Fond clair, typographie sans serif (system font stack), espace généreux
- Accent : bleu profond `#1e3a5f` pour les positifs / titres, orange `#e85a4f`
  pour les négatifs
- Cards avec ombre légère, coins arrondis (12px), padding confortable (24px)
- Mobile-friendly (l'artefact peut être ouvert sur téléphone par un client)

**Connecteur MCP** à passer dans le payload `mcp_tools` : la liste des tools GSC
utilisés, pour permettre le bouton Reload de retirer les données fraîches sans
relancer le skill.

**Caching** : localStorage pour mémoriser le dernier site consulté et les options
de période (UX si Wassim re-ouvre l'artefact).

### Étape 4 — Proposer le log Notion (optionnel)

Une fois l'artefact créé, demander à Wassim :

> Artefact prêt : [lien]. Je log le rapport dans Notion ? (oui / non)

Si oui :

- Demander le nom du client si pas déjà clair.
- `notion-search` la page client.
- Créer une sous-section dans la page : `### Rapport GSC — [période d'analyse]`
  avec :
  - Lien vers l'artefact (URL persistante)
  - Tableau récap des 4 KPIs avec delta
  - 3-5 lignes d'insights (les mêmes que dans l'artefact)
- Confirmer à Wassim avec le lien Notion.

Si non : ne rien écrire, juste donner le lien de l'artefact.

### Étape 5 — Livrer

Message final à Wassim, court et factuel :

> Rapport prêt 👉 [lien artefact]
> Site : [X] · Période : [Y] vs [Z]
> Tendance : [1 phrase de synthèse]
> [Si Notion logué] Page client : [lien Notion]

Pas de paragraphe de récap, pas de tableau Markdown — tout est dans l'artefact.

## Template de l'artefact HTML

Le template complet est dans `assets/template.html`. Le skill lit ce template,
remplit les placeholders avec les données GSC, et passe le résultat à
`mcp__cowork__create_artifact`.

**Placeholders à remplir** :

- `__SITE_NAME__` — URL du site
- `__PERIOD_LABEL__` — label lisible de la période d'analyse
- `__COMPARE_LABEL__` — label de la période de comparaison (ou vide)
- `__CLICKS__`, `__IMPRESSIONS__`, `__CTR__`, `__POSITION__` — valeurs actuelles
- `__CLICKS_DELTA__`, `__IMPRESSIONS_DELTA__`, `__CTR_DELTA__`,
  `__POSITION_DELTA__` — deltas en % avec signe
- `__SERIES_CURRENT__`, `__SERIES_COMPARE__` — JSON arrays pour Chart.js
- `__GENERATED_AT__` — date de génération

Si aucune comparaison demandée, masquer les éléments delta via une classe CSS
`.no-compare` (déjà dans le template).

## Connecteurs et tools utilisés

| Action | Tool / Connecteur | Notes |
|--------|-------------------|-------|
| Pull data GSC | Connecteur Google Search Console | Si échec → demander export CSV manuel |
| Création artefact | `mcp__cowork__create_artifact` | Sortie principale du skill |
| Log Notion (optionnel) | `notion-search`, `notion-update-page` | Préserver structure existante de la page client |
| Insights langage naturel | `window.cowork.askClaude` (côté artefact) | Génération à l'ouverture pour rester frais |

## Anti-patterns (à ne JAMAIS faire)

- ❌ Inventer un chiffre parce que le connecteur GSC est lent — toujours demander
  un export ou attendre.
- ❌ Choisir la période ou la comparaison à la place de Wassim sans lui demander.
- ❌ Sortir un long tableau Markdown en chat au lieu de l'artefact (le chat n'est
  pas le livrable).
- ❌ Colorer une baisse de position moyenne en rouge — c'est une amélioration,
  donc vert. Penser à inverser.
- ❌ Logger dans Notion sans validation explicite de Wassim.
- ❌ Mettre du jargon SEO sans explication dans la section insights — le client
  final peut être un dirigeant non-technique.
- ❌ Rendre l'artefact illisible sur mobile (un client ouvrira souvent depuis son
  téléphone).

## Patterns recommandés

- ✅ Toujours formuler le récap de cadrage en une phrase pour validation avant de
  pull.
- ✅ Pour la position moyenne, inverser systématiquement la sémantique de couleur
  (baisse = vert).
- ✅ Préférer les comparaisons N-1 quand le secteur du client est saisonnier
  (e-commerce, tourisme, événementiel).
- ✅ Insights : viser 3-5 phrases, factuelles, avec une recommandation
  actionnable à la fin (pas juste du constat).
- ✅ Si delta < ±2%, parler de "stabilité" plutôt que de hausse/baisse — éviter
  le bruit.
- ✅ Quand un KPI bouge fort (>20% en valeur absolue), le mentionner
  explicitement dans l'insight.
- ✅ Garder le chat ultra-court : un récap, le lien artefact, et c'est tout.
