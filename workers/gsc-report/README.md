# gsc-report-wassim

Worker Cloudflare qui industrialise le rapport GSC mensuel du skill
`wassim-gsc-report` : le 3 de chaque mois, il tire les données Search Console du
mois précédent pour chaque client, génère le rapport HTML (même charte que le
template du skill), le stocke en KV derrière un lien non-devinable, et logge un
récap dans la page Notion du client.

## Fonctionnement

- **Cron** : le 3 du mois à 6h UTC (les données GSC ont ~2 jours de latence, le
  mois précédent est donc complet).
- **Par client** : un seul pull quotidien couvrant 7 mois (mois analysé + 6 mois
  d'historique), agrégé par mois côté worker (CTR et position pondérés par les
  impressions), puis calcul des deltas (seuil de stabilité ±2 %, couleur
  inversée pour la position moyenne), insights factuels en français, rendu HTML
  autonome (Chart.js).
- **Comparaisons sur trois horizons** : chaque KPI affiche son delta vs 1 mois,
  3 mois et 6 mois — le court terme et la trajectoire d'un programme complet.
  Le rapport inclut aussi une carte « Tendance 6 mois » (totaux mensuels).
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
    "notionPageId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
]
```

- `property` : propriété GSC exacte (`sc-domain:…` ou `https://…/`).
- `notionPageId` : optionnel — page Notion du client où logger le récap.

## Mise en service (une fois les clés prêtes)

> Le workflow GitHub `deploy-gsc-report-worker.yml` fait presque tout : il crée
> le namespace KV s'il n'existe pas, injecte son id, pousse les secrets GitHub
> vers le worker et déploie (MOCK_MODE désactivé par défaut, réactivable via
> l'input `mock-mode`). Il ne reste qu'à préparer le service account et les
> secrets GitHub ci-dessous.

1. **KV** : rien à faire — créé automatiquement au premier deploy par le
   workflow (en local : `npx wrangler kv namespace create REPORTS` + id dans
   `wrangler.toml`).
2. **Service account Google** :
   - Google Cloud Console → créer un projet (ou réutiliser) → activer l'API
     « Google Search Console API ».
   - Créer un service account, générer une clé JSON.
   - Dans **chaque propriété GSC** (Search Console → Paramètres → Utilisateurs
     et autorisations), ajouter l'email du service account en accès complet
     restreint (« Full » n'est pas requis, « Restricted » suffit pour la lecture).
3. **Secrets GitHub** (Settings → Secrets → Actions ; `NOTION_TOKEN`,
   `WASSIM_AUTH_TOKEN`, `CLOUDFLARE_*` existent déjà pour bridge-proxy) :
   - `GOOGLE_SA_EMAIL` — email du service account
   - `GOOGLE_SA_PRIVATE_KEY` — champ `private_key` du JSON (avec les `\n`)
4. Lancer le workflow `Deploy gsc-report worker` (Actions). Après le premier
   deploy, reporter l'URL réelle du worker dans `PUBLIC_BASE_URL`
   (`wrangler.toml`) — elle sert au cron à construire les liens des rapports.
5. Charger la config clients via `PUT /clients`, puis tester un
   `POST /run {"client": "...", "period": "2026-07"}`.

## Tests

```bash
npm install
npm test
```
