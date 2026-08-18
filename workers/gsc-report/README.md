# gsc-report-wassim

Worker Cloudflare qui industrialise le rapport GSC mensuel du skill
`wassim-gsc-report` : le 3 de chaque mois, il tire les données Search Console du
mois précédent pour chaque client, génère le rapport HTML (même charte que le
template du skill), le stocke en KV derrière un lien non-devinable, et logge un
récap dans la page Notion du client.

## Fonctionnement

- **Cron** : le 3 du mois à 6h UTC (les données GSC ont ~2 jours de latence, le
  mois précédent est donc complet).
- **Par client** : pull des deux périodes (mois M-1 + comparaison), calcul des
  deltas (seuil de stabilité ±2 %, couleur inversée pour la position moyenne),
  insights factuels en français, rendu HTML autonome (Chart.js).
- **Comparaison** : `prev` (mois précédent, défaut) ou `yoy` (même mois N-1,
  pour les secteurs saisonniers) — réglable par client.
- **Lien client** : `GET /r/:slug` est public mais le slug est aléatoire
  (32 hex) et la page est `noindex` — c'est le lien qu'on envoie au client.
  Un re-run du même mois remplace le contenu mais les anciens liens restent valides.
- **Mode mock** : tant que `MOCK_MODE=true` (défaut) ou sans credentials Google,
  le worker sert des données de démonstration flaguées comme telles (bandeau
  dans le rapport + `mock: true` partout). Aucun risque de confondre avec de la
  vraie data.

## Endpoints

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| GET | `/health` | non | uptime check |
| GET | `/r/:slug` | non (slug secret) | rapport HTML client |
| GET | `/clients` | X-Wassim-Auth | config clients |
| PUT | `/clients` | X-Wassim-Auth | remplace la config clients |
| POST | `/run` | X-Wassim-Auth | run manuel `{client?, period? "YYYY-MM", notion? bool}` |
| GET | `/reports?client=` | X-Wassim-Auth | index des rapports générés |
| GET | `/latest` | X-Wassim-Auth | dernier rapport par client (pour le dashboard) |

### Config clients (`PUT /clients`)

```json
[
  {
    "id": "acme",
    "name": "ACME",
    "property": "sc-domain:acme.fr",
    "notionPageId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "compare": "prev"
  }
]
```

- `property` : propriété GSC exacte (`sc-domain:…` ou `https://…/`).
- `notionPageId` : optionnel — page Notion du client où logger le récap.
- `compare` : `prev` (défaut) ou `yoy`.

## Mise en service (une fois les clés prêtes)

1. **KV** : `npx wrangler kv namespace create REPORTS` → reporter l'id dans
   `wrangler.toml`.
2. **Service account Google** :
   - Google Cloud Console → créer un projet (ou réutiliser) → activer l'API
     « Google Search Console API ».
   - Créer un service account, générer une clé JSON.
   - Dans **chaque propriété GSC** (Search Console → Paramètres → Utilisateurs
     et autorisations), ajouter l'email du service account en accès complet
     restreint (« Full » n'est pas requis, « Restricted » suffit pour la lecture).
3. **Secrets** (`npx wrangler secret put …`) :
   - `GOOGLE_SA_EMAIL` — email du service account
   - `GOOGLE_SA_PRIVATE_KEY` — champ `private_key` du JSON (avec les `\n`)
   - `NOTION_TOKEN` — intégration Notion (partagée avec les pages clients)
   - `WASSIM_AUTH_TOKEN` — même token partagé que bridge-proxy
4. Passer `MOCK_MODE` à `"false"` dans `wrangler.toml`, définir
   `PUBLIC_BASE_URL` (URL publique du worker, utilisée par le cron pour les
   liens), puis `npm run deploy` (ou le workflow GitHub
   `deploy-gsc-report-worker.yml`).
5. Charger la config clients via `PUT /clients`, puis tester un
   `POST /run {"client": "...", "period": "2026-07"}`.

## Tests

```bash
npm install
npm test
```
