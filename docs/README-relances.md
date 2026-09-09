# Relances de prospection — Telegram + push web

Le cockpit sait déjà quand relancer (champ `Relance` de la base Notion « 🎯 Pilotage 26/27 »),
mais rien ne venait le rappeler. Ce module ajoute :

- un **digest chaque matin** (8 h Paris, du lundi au vendredi) sur Telegram et en notification téléphone ;
- des **boutons dans le message Telegram** qui écrivent directement dans Notion — relancé, +3 j, avancer d'étape, perdu ;
- dans le CRM du cockpit : une **pastille d'échéance** par carte, un tri du plus en retard au plus récent,
  un filtre « à relancer seulement », et un bouton `✓ 7j` sur chaque carte ;
- une **relance posée automatiquement** à chaque changement d'étape : un prospect qui bouge ne peut plus
  disparaître des radars.

Tout est porté par le Worker existant `pilotage-notion-worker`. Aucun service tiers payant.

## Ce qu'il faut faire une fois

### 1. Espace KV (abonnements push + anti-doublon du digest)

```bash
cd workers/pilotage-notion-worker
npx wrangler kv namespace create PILOT_KV
```

Recopier l'`id` renvoyé dans `wrangler.toml`, à la place de `REMPLACER_PAR_L_ID_KV`.

### 2. Bot Telegram

1. Dans Telegram, écrire à **@BotFather** → `/newbot` → nom et pseudo du bot → il renvoie un token.
2. Écrire un message au bot (n'importe lequel) pour ouvrir la conversation.
3. Récupérer l'identifiant du chat :

```bash
curl "https://api.telegram.org/bot<TOKEN>/getUpdates"
```

Le `chat.id` est dans la réponse.

4. Provisionner les secrets et brancher le webhook :

```bash
cd workers/pilotage-notion-worker
npx wrangler secret put TELEGRAM_TOKEN            # le token de @BotFather
npx wrangler secret put TELEGRAM_CHAT_ID          # le chat.id récupéré ci-dessus
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # une chaîne aléatoire, inventée ici

TELEGRAM_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... \
WORKER_URL=https://pilotage-notion-worker.loumiwassim.workers.dev \
node scripts/setup-telegram.mjs
```

`TELEGRAM_CHAT_ID` est un **verrou**, pas un réglage : le Worker ignore tout update venant d'un autre chat.
Le `TELEGRAM_WEBHOOK_SECRET` est vérifié à chaque appel (`X-Telegram-Bot-Api-Secret-Token`) : sans lui,
le corps de la requête n'est même pas lu.

### 3. Clés du push web

```bash
cd workers/pilotage-notion-worker
npm run vapid
```

Le script affiche deux valeurs :

- `VAPID_PUBLIC_KEY` → `npx wrangler secret put VAPID_PUBLIC_KEY`, **et** à recopier dans
  `cockpit.html` (constante `VAPID_PUBLIC_KEY`, en haut du script). Elle est publique par nature.
- `VAPID_PRIVATE_JWK` → `npx wrangler secret put VAPID_PRIVATE_JWK`. Ne jamais la committer.

Tant que la constante est vide dans `cockpit.html`, le bouton « Activer les rappels » reste masqué :
le reste du module (Telegram, pastilles, filtre) fonctionne sans.

### 4. Déployer

```bash
cd workers/pilotage-notion-worker
npm ci && npm test && npx wrangler deploy
```

Ou bien le workflow GitHub **Deploy pilotage-notion-worker** (`workflow_dispatch`), qui conserve les secrets.

### 5. Activer les notifications sur le téléphone

1. Ouvrir `cockpit.html` dans le navigateur du téléphone.
2. **iOS** : Partager → « Sur l'écran d'accueil », puis rouvrir depuis l'icône. iOS n'autorise le push web
   que pour une page installée. **Android** : pas nécessaire, mais l'installation reste conseillée.
3. Onglet CRM → **Activer les rappels**.

## Vérifier que ça marche

```bash
# Digest immédiat, sans attendre le cron (X-Pilot-Key = PILOT_WRITE_KEY)
curl -X POST https://pilotage-notion-worker.loumiwassim.workers.dev/digest \
  -H "X-Pilot-Key: <PILOT_WRITE_KEY>"

# État du pipeline vu par le Worker
curl https://pilotage-notion-worker.loumiwassim.workers.dev/relances
```

Dans Telegram : `/relances` renvoie l'état du pipeline à la demande.

## Détails qui comptent

**L'heure.** Cloudflare ne connaît que l'UTC. Le cron tourne à 6 h **et** 7 h UTC ; le Worker ne garde
que le passage qui tombe sur 8 h à Paris (`DIGEST_HEURE`), ce qui absorbe le changement d'heure sans
rien reconfigurer. Un marqueur KV daté garantit un seul digest par jour.

**Le push ne transporte aucune donnée.** La poussée part vide : le Service Worker rappelle
`/relances` pour composer le texte. Aucun nom de prospect ne transite par les serveurs d'Apple ou
de Google, et on évite le chiffrement `aes128gcm`.

**Les boutons Telegram.** `callback_data` est limité à 64 octets : on y met l'action sur un caractère
et l'id Notion sans tirets (34 octets). Le Worker relit la page ciblée avant d'écrire, donc un vieux
message reste valide même si le prospect a bougé entre-temps.

**Délais.** « Relancé » repousse de 7 jours, « +3j » de 3 jours (à partir de la date existante si elle
est encore devant). Constantes `DELAI_RELANCE` / `DELAI_SNOOZE`, à la fois dans
`workers/pilotage-notion-worker/src/telegram.js` et dans `cockpit.html`.

**Ce qui déclenche un digest.** Au moins une relance due, ou au moins un prospect dormant
(sans date de relance et sans mouvement depuis 14 jours). Sinon, silence — pas de notification vide.
