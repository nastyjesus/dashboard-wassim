# Fiche méthode — CRO

Discipline **systématique** — présente dans tous les programmes, pour tous les clients. Objectif : **transformer le trafic en CA** (réduire la friction, augmenter le taux de conversion). Couplée au SEO/GEO : elle roule avec les mêmes sessions et les mêmes pages.

**Moteur** : ne pas inventer de chiffre. CR, CTR, comportement = **GA4 / Clarity / GSC**, jamais d'estimation.

Les 4 étapes : Audit → Stratégie → Planning 6 mois → Exécution/Monitoring.

> **Couplage SEO/GEO ↔ CRO** : la **checklist de validation page** (cf. étape 4) s'applique avant **toute** publication, y compris les pages produites en session SEO. Le template **StoryBrand SB7** recoupe les refontes SEO. Sur un programme combiné, le CRO valide et mesure ce que le SEO/GEO produit.

### Bases de réflexion (audit & stratégie)

S'appuyer sur **deux sources combinées** :
1. Des **connaissances CRO de spécialiste** — Krug (clarté), Cialdini (persuasion), StoryBrand SB7 (récit), réduction de friction, hiérarchie d'information, mesure sans A/B.
2. La **Boîte à outils CRO de Wassim sur Notion** (`notion-fetch` à chaque fois) : checklist de validation page, template SB7, grille de diagnostic, tableau effort × impact, méthode de mesure before/after.

> ⚠️ Ces sources nourrissent la **méthode et les frameworks** — **jamais les chiffres**, qui se mesurent (GA4/Clarity/GSC).

### Stack d'outils CRO

- **Microsoft Clarity** — heatmaps, session recordings, smart events (clics CTA). *Anti-pattern : jamais en parallèle de Hotjar (double tracking).*
- **GA4** (via GTM) — events **macro** (`generate_lead`, `book_appointment`, `contact_phone`, `contact_email`, marqués comme conversions) + **micro** (`scroll_75`, `cta_click`, `session_long`, `video_play`).
- **GSC** — CTR organique (passerelle déjà repérée côté SEO : impressions fortes / CTR faible).
- **Repère** : trafic < 5 000 visiteurs/mois → **pas de test A/B** (échantillon insuffisant) → méthode **before/after**.

---

## Étape 1 — Audit CRO

**Objectif** : diagnostic chiffré de la performance de conversion. Particularité : **gated par la data** — pas de diagnostic instantané, il faut d'abord collecter.

### Les deux niveaux de CRO

- **Niveau 1 — CTR (SERP)** : une page **bien positionnée / à fortes impressions** mais qui ne récupère **pas assez de clics**. Levier : title / meta. Mesure : **CTR GSC**. (C'est la passerelle déjà repérée côté SEO.)
- **Niveau 2 — Conversion on-site** : du trafic (voire **en hausse**) mais **pas assez de transformation**. Levier : page / funnel. Mesure : l'**objectif de transformation défini pour le client** (GA4).

L'audit diagnostique les **deux** niveaux.

### Phase 1a — Setup tracking (au démarrage)

C'est le **« minimum CRO »** présent dans tout programme.

1. **Définir l'objectif de transformation du client** (avec Wassim) — c'est LA conversion de référence, à fixer **par client** : e-commerce → **commande / achat** ; service → **soumission de formulaire de contact** ; consulting → **prise de RDV** ; ou appel / email. Tout se mesure contre cet objectif.
2. **Installer Microsoft Clarity** (tuto KB) : créer le projet → récupérer le tracking code → l'injecter dans le `<head>` (plugin headers/footers ou `header.php` du thème **enfant**) → vérifier l'install (« Verify installation ») → activer Heatmaps + Session recordings + Smart events.
3. **Configurer les events GA4** (via GTM) en cohérence avec l'objectif défini : la **macro-conversion** du client (`generate_lead` pour un formulaire, `book_appointment` pour un RDV, `purchase` pour e-commerce, `contact_phone`/`contact_email`…) **marquée comme conversion** + micro-conversions (`scroll_75`, `cta_click`, `session_long`, `video_play`).
4. **Baseline immédiate** : relever le **CTR organique** (GSC, par requête/page → niveau 1) + le **CR baseline** sur l'objectif de transformation (GA4, 30 jours précédents → niveau 2) si la data existe déjà.

→ Laisser tourner **~3 semaines** pour accumuler de la data Clarity + GA4 avant le diagnostic.

### Phase 1b — Diagnostic (après ~3 semaines de data)

1. **Comportement (Clarity)** : heatmaps (clics/scroll), session recordings (friction, rage clicks, dead clicks), smart events. → repérer les points de friction **réels**.
2. **Conversion (GA4) — niveau 2** : CR sur l'objectif de transformation, par page et par source ; parcours, abandons de formulaire, taux par event. Repérer le cas « trafic en hausse mais transformation insuffisante ».
3. **CTR (GSC) — niveau 1** : pages à fortes impressions / bonne position mais **CTR faible**.
4. **Grille de diagnostic (KB)** sur les pages clés :
   - **Krug** — évidence en 5 s : qui parle / à qui / ce qui est proposé / quoi faire ?
   - **Cialdini** — 7 leviers présents/absents (réciprocité, engagement, preuve sociale, sympathie, autorité, rareté, unité).
   - **StoryBrand SB7** — les 7 sections présentes et dans le bon ordre ?
   - **Friction formulaire** — ≤ 5 champs, justifiés, ordre logique, erreurs claires, mobile-friendly, pas de captcha visible.

### Livrable Notion — diagnostic CRO détaillé

```
## Audit CRO — [client] — [date]

### Setup
- Objectif de transformation du client : [commande / formulaire / RDV / appel…]
- Clarity installé + vérifié : [statut, project ID]
- Events GA4 configurés : [macro = objectif marqué conversion, + micro]

### Baseline
- Niveau 1 — CTR (GSC) : [pages bonne position / CTR faible]
- Niveau 2 — CR sur l'objectif (GA4) : [valeurs, 30j, par page/source]
- Comportement clé (Clarity) : [friction observée]

### Diagnostic par page (Krug / Cialdini / SB7 / Friction)
- [page] : forces / faiblesses

### Friction & opportunités repérées
[matière première pour les hypothèses — étape 2]

### Synthèse — Forces / Faiblesses / Opportunités / Risques

### Data de référence
[CR + CTR baseline datés, pour comparer aux mesures before/after]
```

Écrire dans Notion après **validation de Wassim**. Conserver le CR/CTR baseline daté.

---

## Étape 2 — Mise en place de la stratégie CRO

**Objectif** : transformer les frictions et faiblesses du diagnostic en un **backlog d'hypothèses priorisées**, prêt à dérouler en test-and-learn. Alimente le planning 6 mois.

**Input** : section « Friction & opportunités » de l'audit (gaps Krug/Cialdini/SB7/friction + observations Clarity/GA4).

### a) Formuler les hypothèses

Chaque faiblesse du diagnostic → une **hypothèse testable** reliée à un levier (Krug / Cialdini / SB7 / Friction). Formulation type :
> « Si [changement], alors [effet attendu sur la conversion], parce que [levier]. »
> Ex. : « Si on réduit le formulaire de 8 à 4 champs, alors le taux de soumission monte, parce que la friction baisse. »

### b) Prioriser — tableau effort × impact (KB)

`# | Hypothèse | Levier | Effort (1-5) | Impact (1-5) | Score | Statut`
- **Impact** estimé en tenant compte de la **valeur business de la page** (potentiel CA, volume de trafic, proximité de la conversion) — une page service à fort trafic pèse plus qu'une page secondaire.
- **Quick wins = fort impact / faible effort** → **top 3** à traiter en premier.

### Livrable — à valider puis Notion

Le tableau effort × impact priorisé. Validation Wassim (il ajuste effort/impact avec sa connaissance du client) → écriture section `## Stratégie CRO — [date]`. C'est le backlog qui pilote le planning 6 mois.

> **Test-and-learn** : on traite les hypothèses **dans l'ordre de priorité**, une (ou peu) à la fois, chacune mesurée before/after avant de passer à la suivante (cf. étape 4).

## Étape 3 — Planning sur 6 mois

**Objectif** : séquencer le backlog d'hypothèses en **test-and-learn** sur 6 mois, chaque changement avec sa fenêtre de mesure.

**Input** : backlog effort × impact priorisé (étape 2).

### Principe — test-and-learn gaté par la mesure

- On déroule le backlog **par ordre de priorité** (quick wins d'abord).
- **Un seul changement à la fois par page** : sinon impossible d'attribuer l'effet. On peut **paralléliser sur des pages différentes**.
- Chaque changement = une fenêtre **before/after ~30 j** (min 14 j si volume très bas) avant de conclure et de passer au suivant.
- Pas de test A/B (trafic < 5 000) → before/after avec **contexte saisonnier**.

### Trame indicative (à adapter)

- **Mois 1** : setup tracking → ~3 sem de collecte → diagnostic → backlog (étapes 1-2). Premier(s) quick win(s) lancé(s) en fin de mois.
- **Mois 2-5** : dérouler le backlog — quick wins puis hypothèses plus lourdes (réécriture SB7…). Chaque changement publié → fenêtre before/after 30 j → verdict → suivant.
- **Mois 6** : **bilan CRO** (évolution vs baseline : niveau 1 CTR + niveau 2 conversion sur l'objectif) + backlog restant pour la suite.

### Coordination SEO/GEO

Quand une page est refondue en session SEO/GEO, la **checklist de validation page** s'applique avant publication, et cette publication **ouvre une fenêtre de mesure CRO**. Le planning CRO se cale sur ces publications.

### Livrable Notion

Section `## Planning CRO 6 mois — démarré le [date]` : backlog séquencé (blocks to_do par hypothèse, dans l'ordre de priorité) + calendrier des relevés before/after (calés sur les points bi-hebdo). Validation Wassim avant écriture.

## Étape 4 — Sessions d'exécution ou monitoring

Comme en SEO/GEO, deux modes — mais en **test-and-learn** : on implémente une hypothèse, puis on la **mesure avant la suivante**.

### Mode A — Exécution (implémenter une hypothèse)

Pour chaque hypothèse du backlog, par ordre de priorité :

1. **Concevoir le changement** selon son levier :
   - Réécriture de page → **StoryBrand SB7** (héros / problème 3 niveaux / guide / plan / CTA / succès / échec).
   - Friction formulaire → ≤ 5 champs justifiés, ordre logique, erreurs claires, mobile, captcha invisible.
   - Persuasion → preuve sociale, CTA above fold orienté action, FAQ qui lève les 3 objections, garanties.
   Livrable **prêt-à-coller Elementor**, dans le **profil éditorial du client** (cf. `seo.md`).
2. **Checklist de validation page (Phase 4, KB)** AVANT publication : CTA above fold, preuve sociale, FAQ objections, garanties, friction ≤ 5 champs, mobile (CTA + formulaire au pouce), Krug 5 s, testé sur 3 devices. Un point applicable manquant → on ne valide pas, on complète.
3. **Noter le « before »** : CR baseline de la page sur 30 j (GA4) + contexte saisonnier + sources de trafic dominantes. Publier un **jour de trafic moyen** (pas un férié, pas un lundi de pont).

### Mode B — Monitoring (mesure before/after, aux points bi-hebdo)

Pour chaque changement publié :
1. **After** : observer sur **30 j** (min 14 si volume très bas), **même contexte saisonnier** (comparer mai vs avril, pas mai vs janvier).
2. **Lire le bon indicateur** : niveau 1 → **CTR (GSC)** pour les changements title/meta ; niveau 2 → **CR sur l'objectif de transformation (GA4)**.
3. **Verdict** : delta + contexte + interprétation. **+20 % à contexte stable = signal positif** ; **< 10 % = bruit**, on ne conclut pas.
4. **Décision** : garder (→ hypothèse suivante) / ajuster / rollback si négatif.
5. **Loguer** dans Notion : page, modification, CR (ou CTR) avant/après, période, contexte, verdict.
