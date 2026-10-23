# Copilote papa — plan d'implémentation

**Spec :** `docs/superpowers/specs/2026-10-23-copilote-papa-design.md`
**Date :** 23 octobre 2026
**Règle de travail :** chaque lot se termine par des tests verts et un commit.
Un push sur `claude/side-hustle-brainstorm-ykikf8` déploie la prod : on ne
pousse un lot qu'avec l'accord de Wassim.

---

## Lot 0 — Prérequis côté Wassim (en parallèle du lot 1)

Rien ne se code ici, mais les lots 4 et 5 en dépendent.

| # | Action | Pour quel lot | Détail |
|---|---|---|---|
| 0.1 | Clé API Anthropic dédiée au copilote | 2 | console Anthropic → nouvelle clé « copilote-papa ». Elle sera posée en secret `ANTHROPIC_API_KEY` du worker, jamais dans le repo |
| 0.2 | Clé `service_role` Supabase | 1 | Supabase → Settings → API. Secret `SUPABASE_SERVICE_KEY` du worker |
| 0.3 | Compte Meta Business + app WhatsApp | 5 | developers.facebook.com → app « Business » → produit WhatsApp. Récupérer : `WHATSAPP_TOKEN` (jeton système permanent), `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`. Un numéro dédié (pas ton perso) |
| 0.4 | Modèle de message « plan du vendredi » soumis à Meta | 6 | WhatsApp interdit d'écrire en premier hors de la fenêtre de 24 h sans modèle validé. Texte proposé au lot 6 |
| 0.5 | Approche de l'expert | 3 (SOS) | Profil et message rédigés au lot 3.6, envoi par toi |
| 0.6 | Liste des 10 à 30 papas testeurs | 8 | Prénom + numéro WhatsApp, avec leur accord |

---

## Lot 1 — Socle : worker, base, identité, danger, quotas

**But :** un worker `copilote` déployable qui reçoit un message texte, sait qui
parle, bloque les messages à risque et compte l'usage. Pas encore d'IA.

### 1.1 Squelette du worker
- Créer `workers/copilote/` sur le modèle de `workers/papa-tribu/` :
  `package.json` (type module, scripts `dev`/`deploy`/`test`, vitest +
  wrangler en devDependencies, `@anthropic-ai/sdk` en dependency),
  `wrangler.toml` (name `copilote-papa`, `nodejs_compat`, observability,
  binding `[ai] binding = "AI"` pour Whisper), `src/index.js`, `src/cors.js`
  (copie de papa-tribu).
- Route `GET /health` → `{ ok: true }`.
- Test : `tests/worker.test.js` — `/health` répond 200.

### 1.2 Schéma Supabase
- Fichier `apps/on-sort/supabase/copilote.sql` (appliqué à la main dans
  l'éditeur SQL Supabase, comme `schema.sql`) :
  - `papas` (id uuid, `auth_id` uuid nullable → `auth.users`, `wa_hash` text
    unique nullable, `ton` text check in ('pote','coach') default 'pote',
    `ville_id` text, `plan_vendredi` bool default false, `cree_le`).
  - `enfants` (id, `papa` → papas on delete cascade, `prenom`, `naissance`
    date (1er du mois), `gouts` text, `cree_le`).
  - `souvenirs` (id, `enfant` → enfants on delete cascade, `le` date, `type`
    text check in ('histoire','sortie','activite','journee'), `texte` text
    ≤ 500 car.).
  - `usage` (id, `papa` → papas on delete cascade, `brique` text, `le`
    timestamptz, `retour` smallint nullable (-1/1)).
  - RLS activée, **aucune politique publique** : seul le worker (service
    role) lit et écrit.
- `wa_hash` = SHA-256 du numéro + sel `WA_SEL` (secret) : on ne stocke pas le
  numéro en clair. Le numéro sert seulement à répondre, il vient du webhook.

### 1.3 `src/supabase.js`
- Petites fonctions REST (fetch PostgREST avec la clé service) :
  `trouverPapa({ waHash | authId })`, `creerPapa`, `enfantsDe`,
  `ajouterEnfant`, `souvenirsRecents(enfantId, jours)`, `ajouterSouvenir`,
  `compterUsage(papaId, brique, depuis)`, `noterUsage`, `noterRetour`,
  `effacerPapa(papaId)`.
- Tests avec `fetch` simulé (`vi.stubGlobal`) comme `on-sort/tests/alerte.test.js`.

### 1.4 `src/danger.js`
- `detecterDanger(texte)` → `null` ou `{ type: 'medical'|'enfance'|'suicide', reponse }`.
- Mots-clés normalisés (minuscules, sans accents) : « respire plus »,
  « convulse », « inconscient », « avale », « brule », « envie de le
  frapper », « je vais le frapper », « en finir », « me tuer »…
- Réponses fixes : 15 / 112 (urgence médicale), 119 (enfance en danger, aussi
  pour le papa à bout), 3114 (prévention du suicide).
- **Test sur deux listes** : `tests/danger.test.js` avec ~30 phrases à risque
  (toutes détectées) et ~30 phrases de crise ordinaire (« il refuse de
  dormir », « il tape sa sœur ») qui ne doivent pas déclencher. Les cas
  ordinaires partent en SOS, pas en urgence.
- Le lot 2 ajoute un second filet côté IA (champ `danger` du routeur).

### 1.5 `src/quotas.js`
- Constantes de la spec : SOS 5, activité 5, histoire 5, plan 2 par mois.
- `verifierQuota(papa, brique, maintenant)` → `{ ok, restant }`. Mois
  calendaire. Un papa marqué `abonne` (colonne ajoutée plus tard) passe.
- Tests : sous le quota, pile au quota, changement de mois.

### 1.6 `src/accueil.js` — mise en route
- Un papa inconnu → « Salut ! Je suis le copilote de Papa Parfait. Comment
  s'appelle ton enfant, et quel âge a-t-il ? »
- Extraction prénom + âge : regex simple d'abord (« Léo 4 ans »), l'IA du
  lot 2 en repli.
- Tests : « Léo, 4 ans », « ma fille Jade a 2 ans et demi », réponse floue.

**Fin du lot 1 :** `npm test` vert, commit. Déploiement possible mais inutile
seul.

---

## Lot 2 — Client Claude et routeur

### 2.1 `src/claude.js`
- SDK officiel `@anthropic-ai/sdk` (fonctionne sur Workers), un client créé
  par requête avec `env.ANTHROPIC_API_KEY`, `timeout` en millisecondes,
  `maxRetries: 1` (on préfère la réponse de secours à une longue attente).
- Modèles :
  - `MODELE_RAPIDE = 'claude-haiku-5-5'` (routeur, SOS) — 0,10 $ / 0,50 $
    par million de tokens en entrée / sortie, `output_config.effort: 'low'`.
  - `MODELE_CREATIF = 'claude-sonnet-5-5'` (histoire, activité avec photo,
    plan) — 2 $ / 10 $ par million, `output_config.effort: 'low'` puis
    ajusté sur les retours de la bêta.
- Sorties structurées via `output_config.format` (schéma JSON) pour tout ce
  qui est routé ou mis en forme : on lit un objet, pas du texte libre.
- Toujours tester `stop_reason === 'refusal'` avant de lire le contenu → la
  réponse de secours de la brique.
- Erreurs : classes typées du SDK (`Anthropic.RateLimitError`,
  `Anthropic.APIError`…), jamais de comparaison de texte d'erreur.
- Tests : client simulé (on injecte une fonction `appeler` dans les briques
  pour ne jamais appeler l'API en test).

### 2.2 `src/routeur.js`
- Entrée : texte (ou transcription), présence d'une image, profil.
- Règles avant IA : image → `activite` ; « histoire » / « raconte » →
  `histoire` ; « plan » / « week-end » → `plan`.
- Sinon Haiku avec schéma `{ brique: 'sos'|'activite'|'histoire'|'plan'|'autre', danger: boolean, confiance: number }`.
- `danger: true` → réponse fixe de `danger.js` (second filet).
- `confiance < 0.6` ou `autre` → question à choix (« Tu veux : 🆘 un coup de
  main tout de suite, 🏠 une activité, 🌙 une histoire, 🗓️ un plan ? »).
- Tests : 20 messages types → brique attendue (avec appel simulé).

**Fin du lot 2 :** tests verts, commit.

---

## Lot 3 — Les quatre briques

Chaque brique exporte `async function repondre({ papa, enfant, message, image, appeler, env })`
et renvoie `{ texte, souvenir? }`. Le texte est prêt à envoyer (WhatsApp
accepte `*gras*` et les emojis ; la PWA l'affiche tel quel).

### 3.1 Ton
- `src/ton.js` : deux paragraphes de consigne système, « pote » et « coach »,
  conformes à `decisions.md` (tutoiement, entre papas, jamais donneur de
  leçons, jamais « performance »).

### 3.2 SOS crise — `src/briques/sos.js`
- `src/bibliotheque/situations.json` : ~30 situations
  `{ id, titre, ages, signes, phrase, geste, eviter, pourquoi }`.
  **Brouillon rédigé par Claude Code, marqué `"valide": false`** jusqu'à la
  relecture de l'expert.
- Appel Haiku. Système = ton + bibliothèque complète, avec
  `cache_control: { type: 'ephemeral' }` sur le bloc bibliothèque (préfixe
  stable : rien de variable avant lui). Vérifier
  `usage.cache_read_input_tokens > 0` dès le 2e appel ; si le préfixe est
  sous le minimum de cache du modèle, pas de cache, et ce n'est pas grave à
  ce prix.
- Schéma de sortie `{ situation_id: string|null, phrase, geste, eviter }`.
  `situation_id: null` → réponse prudente + ligne ajoutée à une table
  `a_relire` (ou KV) pour l'expert.
- Rendu : 3 lignes `🗣️ Dis :` / `🤲 Fais :` / `🚫 Évite :`, puis
  « Ça a marché ? Réponds 👍 ou 👎 ».
- **Interrupteur** `SOS_OUVERT` (var wrangler, `false` par défaut) : tant
  qu'il est faux, SOS répond seulement à Wassim (liste blanche `ADMINS`).
- Secours (IA en panne) : la situation de la bibliothèque la plus proche par
  mots-clés.
- Tests : rendu, secours, interrupteur, situation hors bibliothèque.

### 3.3 Activité maison — `src/briques/activite.js`
- Photo : base64 (`{ type: 'image', source: { type: 'base64', media_type, data } }`)
  + texte, appel Sonnet. Liste tapée : même appel sans image.
- Schéma `{ lisible: boolean, activites: [{ titre, duree_min, materiel: string[], etapes: string[3] }] }`
  (3 activités).
- Consigne sécurité par âge dans le système (pas de petites pièces < 3 ans,
  rien de coupant, pas de flamme, pas de produit ménager, adulte présent).
- `lisible: false` → « Je ne distingue pas bien. Tu peux me lister ce que tu
  as ? »
- L'image n'est ni stockée ni journalisée.
- Tests : rendu, photo illisible, taille d'image (WhatsApp envoie jusqu'à
  5 Mo : redimensionnement inutile, mais refuser au-delà de 5 Mo).

### 3.4 Histoire du soir — `src/briques/histoire.js`
- Entrée : demande + éventuel résumé de la journée + 3 derniers souvenirs.
- Sonnet, texte de ~600 à 750 mots (5 min à voix haute), héros = enfant +
  papa, morale douce liée à la journée, fin apaisante (c'est l'heure du
  coucher).
- Schéma `{ titre, histoire, resume_journee }`. Souvenirs enregistrés :
  `journee` (si fournie) et `histoire` (titre seul).
- Tests : rendu, longueur bornée, enregistrement des souvenirs.

### 3.5 Plan du week-end — `src/briques/plan.js`
- Appelle `GET https://on-sort-poc.loumiwassim.workers.dev/top` pour samedi
  et dimanche (ville du papa, âge de l'enfant) — en série, pas en parallèle
  (limite CPU du plan gratuit côté on-sort).
- Sonnet compose : samedi / dimanche × matin / après-midi, une sortie du top
  par jour, un repli pluie (idée d'activité maison), un repas simple,
  l'histoire du soir en option.
- Exclut les sorties présentes dans les `souvenirs` des 4 dernières semaines.
- Si `/top` est vide ou en panne : plan 100 % maison, dit honnêtement.
- Tests : top simulé, top vide, exclusion des souvenirs.

### 3.6 Expert — livrable de préparation
- `docs/papa-parfait/expert-sos.md` : profil cible (psychologue de
  l'enfant, EJE, puéricultrice, Rennes et alentour), ce qu'on lui demande
  (relire ~30 fiches, le texte des garde-fous, la file « à relire » une fois
  par semaine pendant la bêta), contrepartie à proposer, message d'approche
  (e-mail + version LinkedIn), et 5 pistes de recherche (annuaires, réseau
  BNI, maisons de la parentalité, PMI).

**Fin du lot 3 :** tests verts, commit.

---

## Lot 4 — Canal PWA

### 4.1 Worker : `POST /message`
- Authentification : jeton de session Supabase (`Authorization: Bearer`),
  vérifié via `GET {SUPABASE_URL}/auth/v1/user`. Pas de compte → 401, la
  PWA propose de créer un compte (Google existe déjà).
- Corps : `{ texte?, image? (base64), enfantId? }`. Réponse : `{ texte }`.
- `POST /retour` `{ usageId, retour }` pour 👍 / 👎.
- `POST /efface` : supprime tout pour ce papa.
- Tests : auth absente, auth valide simulée, enchaînement complet avec
  briques simulées.

### 4.2 App : onglet « Copilote »
- `apps/on-sort/src/screens/Copilote.js` : un fil de messages, un champ
  texte, un bouton photo (`expo-image-picker`, à installer avec
  `npx expo install`, doc SDK 57 lue avant), 4 raccourcis (🆘 🏠 🌙 🗓️) qui
  préremplissent le champ.
- `apps/on-sort/src/copilote-api.js` : appels au worker avec le jeton
  Supabase.
- `BarreOnglets` : « Copilote » remplace « Couple » ; « Moi » reste en teaser.
- Charte : `docs/charte-graphique.md` (panneaux cadrés encre 2px, ambre
  réservé à l'envoi). Pas de bulle « chat » molle.
- Réglages : ton (pote / coach), prénom et âge de l'enfant, « Efface tout ».
- Test : build web (`npx expo export --platform web`) + parcours Playwright
  avec le worker simulé, comme la géolocalisation.

**Fin du lot 4 :** commit. Push = PWA en prod (copilote visible seulement aux
comptes ; prévoir un drapeau `COPILOTE_ACTIF` dans `config.js`, à `false`
jusqu'à la bêta).

---

## Lot 5 — Canal WhatsApp

### 5.1 Webhook
- `GET /whatsapp` : vérification Meta (`hub.mode`, `hub.verify_token` =
  secret `WHATSAPP_VERIFY`, renvoyer `hub.challenge`).
- `POST /whatsapp` : vérifier `X-Hub-Signature-256` (HMAC SHA-256 du corps
  brut avec `WHATSAPP_APP_SECRET`, comparaison à temps constant) → 401 sinon.
- Répondre **200 tout de suite** et traiter dans `ctx.waitUntil` (Meta
  renvoie le message si on tarde).
- Dédoublonner par `message.id` (KV, 24 h) : Meta peut livrer deux fois.

### 5.2 Types de messages
- `text` → routeur.
- `audio` (vocal) → télécharger le média (Graph API, `WHATSAPP_TOKEN`),
  transcrire avec Workers AI (`env.AI.run('@cf/openai/whisper-large-v3-turbo', …)`),
  supprimer. **À vérifier en premier** : que le modèle accepte l'OGG/Opus
  des vocaux WhatsApp ; sinon essayer `@cf/openai/whisper`, et en dernier
  recours répondre « écris-moi plutôt ».
- `image` → télécharger, brique activité.
- `interactive` / réactions 👍 👎 → `noterRetour`.
- Commande `EFFACE` → confirmation (« Réponds OUI pour tout effacer »), puis
  `effacerPapa`.

### 5.3 Envoi
- `POST https://graph.facebook.com/<version>/<WHATSAPP_PHONE_ID>/messages`
  (version de l'API Graph vérifiée sur la doc Meta au moment du lot).
- Si la réponse IA dépasse 4 s : envoyer d'abord « je réfléchis… ».
- Messages de plus de 4 096 caractères (limite WhatsApp) : couper en deux
  sur un saut de ligne.

### 5.4 Tests
- Signature valide / invalide, challenge, dédoublonnage, découpage,
  enchaînement texte → réponse avec Graph API simulée.

**Fin du lot 5 :** commit. Brancher le webhook dans la console Meta après le
déploiement.

---

## Lot 6 — Plan du vendredi (envoi programmé)

- Cron du worker : vendredi 15:00 UTC (17 h en hiver, 16 h en été — à
  ajuster ou doubler l'entrée cron selon l'heure légale).
- Pour chaque papa `plan_vendredi = true` : si sa dernière conversation date
  de moins de 24 h, envoi libre ; sinon **modèle WhatsApp validé** (0.4) :
  « Salut {{1}} ! C'est vendredi : tu veux ton plan du week-end avec
  {{2}} ? Réponds PLAN. » La réponse « PLAN » ouvre la fenêtre et déclenche
  la brique.
- PWA : le plan est simplement disponible ; pas de notification push en V1.
- En série, un papa à la fois (limite CPU).
- Tests : sélection des papas, choix modèle / message libre.

---

## Lot 7 — Vie privée et documents

- Mettre à jour `apps/on-sort/docs/politique-confidentialite.md` : données
  du copilote, sous-traitants (Anthropic, Cloudflare, Meta, Supabase), durée
  de conservation (souvenirs : jusqu'à effacement ; usage : 13 mois),
  effacement.
- Mentions dans les réponses SOS : « Conseil entre papas, validé par {expert}.
  Pas un avis médical. »
- Purge mensuelle : `usage` de plus de 13 mois (cron existant du worker).

---

## Lot 8 — Déploiement et bêta

### 8.1 Déploiement
- `.github/workflows/deploy-copilote-worker.yml` sur le modèle de
  `deploy-papa-tribu-worker.yml` : déclenché seulement par
  `workers/copilote/**`, `npm ci`, `npm test`, `wrangler deploy`.
- Secrets Cloudflare posés une fois par `wrangler secret put` :
  `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `WA_SEL`,
  `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`,
  `WHATSAPP_VERIFY`, `ADMINS`.

### 8.2 Recette avant bêta (Wassim seul, 2 à 3 jours)
- Les 4 briques sur WhatsApp et dans la PWA, ton pote et coach.
- 10 phrases à risque réelles → réponse d'urgence à chaque fois.
- Coût réel lu dans la console Anthropic après la recette.

### 8.3 Bêta fermée (2 semaines)
- Invitation des testeurs (0.6) : un message WhatsApp perso de Wassim avec le
  numéro du copilote.
- SOS ouvert seulement si l'expert a validé (`SOS_OUVERT = true`).
- Tableau de bord : route admin `GET /admin/stats` (jeton) → papas actifs par
  semaine, usage par brique, taux de 👍, situations à relire.
- **Décision à J+14** : critère de réussite de la spec (≥ 40 % des testeurs
  actifs en semaine 2). Au-dessus : prix de l'abonnement et paiement. En
  dessous : on regarde quelle brique a tenu et on recentre.

---

## Ordre et dépendances

```
Lot 0 (Wassim, en continu)
Lot 1 → Lot 2 → Lot 3 ─┬→ Lot 4 (PWA)
                        └→ Lot 5 (WhatsApp) → Lot 6 (vendredi)
Lot 7 avant la bêta ; Lot 8 en dernier
```

Estimation : lots 1 à 3 en premier, sans dépendance externe autre que la clé
Anthropic. Les lots 4 et 5 peuvent avancer en parallèle une fois le lot 3
fini.
