# Fiche méthode — GEO

Discipline **optionnelle** — activée uniquement si la presta GEO est prise pour le client. Objectif : **être cité dans les réponses des moteurs génératifs** (les IA ne classent pas des pages, elles citent des passages).

**Moteurs ciblés** : AI Overviews / AI Mode (Google), ChatGPT Search, Perplexity, Gemini, Claude (+ Bing au radar).

Les 4 étapes : Audit → Stratégie → Planning 6 mois → Exécution/Monitoring.

> ⚠️ GEO et SEO sont couplés : quand le GEO est dans le programme, le travail on-page SEO applique aussi les facteurs de citabilité, et l'audit HTML sémantique recoupe le crawl Screaming Frog (cf. `seo.md`).

### Bases de réflexion (audit & stratégie)

Pour l'audit (étape 1) et la stratégie (étape 2), s'appuyer sur **deux sources combinées** :

1. Des **connaissances GEO de spécialiste** — citabilité, chunking LLM, entités nommées, E-E-A-T, structure réponse-d'abord, données structurées.
2. La **knowledge base GEO de Wassim sur Notion** — page « 🤖 GEO » (`notion-fetch` **à chaque fois**, c'est sa veille vivante). Elle contient : guide officiel Google AI (**source primaire à citer**), checklist AI Overviews, playbook GEO, les 10 facteurs de citabilité, méthode chunks, templates schema/llms.txt.

> ⚠️ Ces sources nourrissent la **méthode et les angles** — **jamais les chiffres** : la citabilité se **mesure** (AEO Sensor + prompting direct), elle ne s'estime pas.

### Stack d'outils GEO

**Principe** : la **citabilité réelle se mesure** dans les moteurs (AEO Sensor + prompting direct = observation externe) ; **Screaming Frog prépare la citabilité** (interne, technique, à l'échelle).

- **HubSpot AEO Sensor** (gratuit, sans inscription) — volatilité de visibilité IA (ChatGPT, Claude, Gemini). C'est l'**indicateur de référence**, équivalent GEO de la « position moyenne » SEO. Baseline + suivi.
- **Prompting direct** des moteurs (navigateur via Claude in Chrome si besoin) — observer si/comment le client est cité.
- **Screaming Frog** (via MCP, en autonomie — cf. `seo.md`) — volet **interne / technique / à l'échelle** : agent-readability HTML, génération `llms.txt`, validation JSON-LD sur tout le site, clustering sémantique (embeddings) & cohérence d'entités, maillage de cluster (All Inlinks), **answer-readiness via AI Integration** (1 prompt LLM par URL).
- **Chrome Lighthouse** — audite désormais le fichier `llms.txt`.
- **Google Rich Results Test** — validation ponctuelle du schema / JSON-LD.
- **Repère de calibrage** : 1ère citation IA ≈ **J+7** après publication (médiane Profound) — sert à caler les attentes client.

---

## Étape 1 — Audit GEO

**Objectif** : diagnostic chiffré de la **citabilité IA actuelle** — l'équivalent GEO de l'audit SEO. Devient une référence permanente dans Notion. On **mesure**, on ne devine pas.

### Bloc A — Baseline de citabilité (mesure)

1. **HubSpot AEO Sensor** sur le domaine : relever le score / la volatilité de visibilité IA (ChatGPT, Claude, Gemini) → **baseline de référence** datée.
2. **Prompting direct** sur les requêtes / sujets clés du client : interroger ChatGPT, Perplexity, Gemini, Claude + observer les AI Overviews. Le client est-il **cité** ? Avec quelles **sources concurrentes** ? Documenter l'état des citations actuelles (qui est cité, sur quoi).

### Bloc B — Citabilité du contenu (par page clé)

1. **Score de citabilité** (prompt KB) : « Analyse cette page du point de vue d'un moteur génératif — clarté des réponses, structure sémantique, données vérifiables/sources, facilité d'extraction. Score /10 + 5 améliorations. »
2. **Audit des chunks** : prompt direct « Quelles parties de [URL] tu citerais ? » → repérer les passages **citables** vs **invisibles**.
3. Évaluer chaque page vs les **10 facteurs de citabilité** (KB) : densité d'entités nommées, citations sourcées (avec lien), structure de réponse explicite, longueur de chunks (40-60 mots), réponse-d'abord, claims vérifiables, autorité de domaine, fraîcheur, structure interrogative des sous-titres.
4. **Answer-readiness à l'échelle (Screaming Frog — AI Integration)** : 1 prompt LLM par URL (« cette page est-elle citable, qu'est-ce qui manque ? ») sur tout le site. ⚠️ **Réserve** : un score LLM en passe unique est **peu stable** → à prendre comme **signal directionnel** pour **prioriser les pages**, pas comme une note fiable (les benchmarks moyennent plusieurs générations). Le scoring fin reste les points 1-2.
5. **Couverture sémantique & entités (Screaming Frog)** : content clusters + similarité par **embeddings** → vérifier qu'on couvre bien l'**espace sémantique du sujet** (ce que les LLM explorent) et la **cohérence des entités** sur le cluster.

### Bloc C — Technique GEO (Screaming Frog + Google)

1. **`llms.txt`** : présence à la racine (fetch `[domaine]/llms.txt`) + audit **Chrome Lighthouse**. *(SF servira à le générer — cf. étape 4.)*
2. **Données structurées / JSON-LD (Screaming Frog, à l'échelle)** : valider la présence et la **cohérence sur tout le site** des types clés — Organization/Person, Article, BreadcrumbList, FAQPage — avec des **identifiants d'entités constants entre templates**. Validation ponctuelle complémentaire au **Rich Results Test**.
3. **HTML sémantique « agent-readable » (Screaming Frog)** : opérationnaliser la consigne KB « structure agent-readable » + le guide IA Google — vérifier balises `header`/`main`/`article`/`nav` correctes, boutons/formulaires standardisés, ARIA présents, HTML propre et parseable par les bots IA.
4. **Maillage de cluster — « citation confidence » (Screaming Frog, All Inlinks)** : s'assurer que chaque page *spoke* pointe vers le *pillar* avec des **ancres riches en entités** ; corriger les **mismatches de canonical**, normaliser les **H1 dupliqués**, raccourcir les **chaînes de redirection** internes vers le cluster.
5. **Entités** : présence **Wikidata + Knowledge Panel** Google (pour les marques) + cohérence d'entités issue du clustering SF (Bloc B.5).

### Bloc D — Synthèse / diagnostic de citabilité (livrable Notion)

```
## Audit GEO — [client] — [date]

### Baseline de citabilité
- Score AEO Sensor (ChatGPT/Claude/Gemini) : [valeur, date]
- Citations actuelles sur les requêtes cibles : [client cité ? sources concurrentes citées]

### Citabilité du contenu (pages clés)
- Score /10 par page + passages citables / invisibles
- Answer-readiness SF (signal directionnel) : pages prioritaires
- Couverture sémantique & cohérence d'entités (clusters SF)
- Écarts vs les 10 facteurs de citabilité

### Technique GEO (Screaming Frog + Google)
- llms.txt : [présent / absent — Lighthouse]
- Schema / JSON-LD : [types présents, cohérence cross-templates, validité Rich Results]
- HTML sémantique agent-readable : [OK / à corriger]
- Maillage de cluster : [spokes → pillar, ancres entités, canonicals, H1, redirections]
- Entités : [Wikidata + Knowledge Panel présents ?]

### Opportunités GEO
[requêtes où viser la citation, pages à restructurer en chunks, entités à renforcer]

### Synthèse — Forces / Faiblesses / Opportunités / Risques

### Data de référence
[Baseline AEO datée + captures des citations actuelles, pour comparer aux audits suivants]
```

Écrire dans Notion après **validation de Wassim**. Conserver la baseline AEO datée comme référence.

---

## Étape 2 — Mise en place de la stratégie GEO

**Objectif** : transformer les « Opportunités GEO » de l'audit en un **plan de citabilité validé** — sur quelles requêtes IA être cité, quel espace sémantique couvrir, quelles pages et entités travailler. Alimente le planning 6 mois.

**Input** : section « Opportunités GEO » de l'audit + clusters SF (Bloc B.5) + baseline AEO.

### a) Requêtes / prompts IA cibles

Définir les **questions conversationnelles** sur lesquelles viser la citation (l'équivalent GEO des mots-clés).

**Base de référence = les KW cibles SEO du même programme, reformulés en questions** (logique réponse-d'abord). SEO et GEO restent alignés sur un même backbone : une page travaillée en SEO sur un KW est travaillée en GEO sur la question correspondante.

Enrichir ensuite avec : les **questions / PAA** (Semrush), les prompts réels du secteur, et ce que révèle le **prompting direct** de l'audit (sur quoi les concurrents sont cités).

Pour chacune : `requête | intention | moteur(s) où elle compte | KW SEO lié | action`.

### b) Architecture de cluster (espace sémantique)

À partir des **clusters sémantiques SF** : définir le(s) **pillar(s)** + **spokes** qui couvrent l'espace sémantique du sujet (ce que les LLM explorent), et **l'entité** à ancrer (avec des identifiants constants entre templates).

### c) Plan de citabilité à deux vitesses

- **Court terme — citabilité rapide** : pages existantes à **restructurer en chunks citables** (réponse-d'abord, entités nommées, claims sourcés) + schema + `llms.txt` → premières citations attendues ~**J+7**.
- **Moyen / long terme — autorité d'entité** : renforcer **Wikidata / Knowledge Panel**, mentions, fraîcheur, et **compléter la couverture sémantique** du cluster (contenus manquants). Plus lent, structurel.

### Livrable — à valider puis Notion

Trois tableaux : (1) **requêtes IA cibles**, (2) **cluster** (pillar / spokes + entité), (3) **plan deux vitesses** (`élément | vitesse | action`). Validation Wassim → écriture section `## Stratégie GEO — [date]`. C'est figé : le planning 6 mois s'appuie dessus.

> Rappel KB : **pas de cheat code GEO**. La citabilité se gagne par la structure et l'autorité réelle — les manipulations se paient plus cher qu'en SEO.

## Étape 3 — Planning sur 6 mois

**Objectif** : comme en SEO — **une session de production** + un **suivi bi-hebdomadaire**, adaptés aux livrables GEO. Le planning produit un batch de production, un track entité, et un calendrier de monitoring.

**Input** : plan deux vitesses + architecture de cluster + requêtes cibles (étape 2).

> **Alignement SEO + GEO** : quand les deux disciplines sont actives sur le client, le traitement est **combiné** — chaque page est travaillée en SEO *et* GEO dans la **même session de production**, et le **monitoring est combiné** (GSC + AEO Sensor au même point bi-hebdo). Pas de double passage sur les mêmes pages.

### Modèle de cadence

- **Production en une seule session** : tout le **batch de citabilité rapide** — restructuration en chunks citables, JSON-LD cohérent, `llms.txt`, correctifs HTML agent-readable, maillage de cluster — + **rédaction des contenus manquants** du cluster. → premières citations attendues ~**J+7**.
- **Track autorité d'entité (progressif sur 6 mois)** : les actions qui ne se font pas en un coup et mettent du temps à s'enregistrer — **Wikidata, Knowledge Panel, mentions, fraîcheur**. Planifiées dans la durée.
- **Monitoring toutes les 2 semaines** : AEO Sensor + re-prompts directs + re-check answer-readiness SF.

### Ce que produit le planning

1. **Batch de production** — pages à restructurer/créer (issu du plan deux vitesses) : `page | requête / KW SEO lié | type (restructuration citabilité / création cluster) | livrables GEO (chunks, schema, llms.txt, maillage)`.
2. **Track entité** — actions d'autorité datées sur les 6 mois (Wikidata, Knowledge Panel, mentions).
3. **Calendrier de monitoring** — points tous les **14 jours** (AEO Sensor + re-prompts), calés sur le repère J+7.

### Livrable Notion

Section `## Planning GEO 6 mois — démarré le [date]` : checklist du batch (blocks to_do) + track entité (to_do datés) + calendrier de monitoring. Validation Wassim avant écriture.

## Étape 4 — Sessions d'exécution ou monitoring

Deux modes, comme en SEO. **Quand SEO + GEO sont actifs, l'exécution et le monitoring se font dans la même session / le même point** (cf. règle d'alignement) — chaque page reçoit son traitement SEO *et* GEO d'un coup.

### Mode A — Session de production (exécution)

**Nature du livrable — prêt-à-poser** (Wassim implémente lui-même, cf. `seo.md`) :
- **Corps / chunks** → prêt-à-coller dans Elementor.
- **Artefacts techniques** (JSON-LD, `llms.txt`) → livrés prêts à poser : JSON-LD dans le `<head>` (plugin/Elementor), `llms.txt` poussé à la racine via FTP.
- **Profil éditorial client** : la réécriture et les contenus créés respectent la voix du client (cf. `seo.md` — profil stocké en Notion).

Pour **chaque page** du batch :
1. **Restructuration en chunks citables** : réécrire en **réponse-d'abord**, chunks ~40-60 mots, **entités nommées**, **claims vérifiables et sourcés** (avec lien). Texte fini, prêt à coller.
2. **JSON-LD** : générer le balisage **cohérent** (Organization/Person, Article, BreadcrumbList, FAQPage) avec **identifiants d'entités constants** entre templates. Prêt à poser.
3. **Maillage de cluster** : liens *spokes → pillar* avec **ancres riches en entités** (tableau `source → ancre → cible`), cohérent avec le maillage SEO.
4. **HTML agent-readable** : correctifs `header`/`main`/`article`/`nav` + ARIA (souvent au niveau template) — signalés à Wassim.
5. **Contenus manquants du cluster** : Claude **rédige le contenu complet** (comme une création SEO), en chunks citables.

Puis, à l'échelle du site :
6. **Génération `llms.txt`** : crawl Screaming Frog → export `internal_html` → produire le fichier (manifeste des pages clés) → Wassim le pousse à la racine.

**Vérification de citabilité (avant livraison)** :
- **Prompt direct** sur le contenu rédigé (« quelles parties tu citerais ? » / score /10) → **boucle** jusqu'à ce que les chunks soient citables.
- (option) **SF AI Integration** comme signal directionnel à l'échelle.
- ⚠️ La vérif pré-publication porte sur la **citabilité structurelle** ; la **citation réelle** ne se mesure qu'après mise en ligne (~J+7).

**QA après mise en ligne (Screaming Frog)** : re-crawl pour confirmer JSON-LD en place, HTML agent-readable, maillage cluster, et `llms.txt` accessible. Corriger les écarts. Log Notion.

### Mode B — Point de monitoring (toutes les 2 semaines)

Pages suivies = **pages du batch GEO** (= mêmes pages que le SEO si combiné). À chaque point :
1. **AEO Sensor** : score de visibilité IA (ChatGPT/Claude/Gemini) + évolution depuis le dernier point.
2. **Re-prompts directs** : sur les requêtes cibles, le client est-il **cité** maintenant (vs concurrents) ? Et « quelles parties de [URL] tu citerais ? » pour voir si les chunks restructurés sont repris.
3. **Answer-readiness SF** (signal directionnel) : re-check des pages.
4. **Track entité** : avancement Wikidata / Knowledge Panel / mentions.
5. **Décision par page** :
   - *Maintenir* — citations qui montent, laisser tourner.
   - *Modifier* — chunks pas repris / stagnation → réécrire les passages → revérifier par prompt.
   - *Alerter* — perte de citation, régression technique → signaler à Wassim.
6. **Loguer** dans le journal de sessions Notion.

> Calibrage **J+7** : ne pas conclure trop tôt — la première citation arrive en moyenne une semaine après publication. Sur le 1er point, distinguer les signaux précoces des résultats consolidés.
