# geo-tracker-wassim

Tracker GEO maison : Worker Cloudflare qui, les **1er et 15 du mois** (la
cadence bi-mensuelle du monitoring GEO du skill `wassim-seo-program`),
interroge les moteurs IA sur les **prompts cibles** de chaque client, détecte
si le client est **mentionné** (dans le texte) et **cité** (dans les sources),
stocke l'historique daté en KV et logge un récap dans la page Notion du client.

C'est l'automatisation du volet « re-prompts directs » du monitoring GEO —
l'historique de citations daté qu'aucun concurrent n'apporte en rendez-vous.

## Ce que ça mesure (et ce que ça ne mesure pas)

- **Moteurs interrogés** : Perplexity (citations natives — le plus proche d'un
  moteur de réponse réel), Claude (web search), ChatGPT (web search), Gemini
  (grounding Google Search). Les prompts sont envoyés **bruts**, comme un
  utilisateur les taperait — aucun biais du type « connais-tu X ? ».
- **Limite assumée** : les réponses API ≠ produits grand public (ChatGPT
  Search, AI Overviews n'ont pas d'API). C'est une **tendance de citation
  mesurée et datée**, en complément d'AEO Sensor — pas un substitut. Cette
  mention figure dans chaque log Notion.
- **Indicateurs** : taux de citation (sources) et taux de mention (texte),
  global + par moteur, avec delta vs relevé précédent et top des sources
  concurrentes citées.

## Endpoints

| Méthode | Chemin | Auth | Rôle |
|---|---|---|---|
| GET | `/health` | non | uptime + moteurs actifs |
| GET | `/clients` | X-Wassim-Auth | config clients |
| PUT | `/clients` | X-Wassim-Auth | remplace la config clients |
| POST | `/run` | X-Wassim-Auth | relevé manuel `{client?, notion? bool}` |
| GET | `/runs?client=id` | X-Wassim-Auth | historique (résumés) ; `&date=YYYY-MM-DD` pour le détail complet |
| GET | `/latest` | X-Wassim-Auth | dernier relevé par client (pour le dashboard) |

### Config clients (`PUT /clients`)

```json
[
  {
    "id": "acme",
    "name": "ACME",
    "domain": "acme.fr",
    "aliases": ["ACME Conseil"],
    "notionPageId": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "prompts": [
      "Quel prestataire recommandes-tu pour … ?",
      "Comment choisir … ?"
    ]
  }
]
```

- `domain` : domaine du client — détection des citations (sources) et mentions.
- `aliases` : optionnel — noms de marque pour la détection de mention dans le texte.
- `prompts` : max 20 — à dériver du tableau « requêtes IA cibles » de la
  stratégie GEO du client (les KW SEO reformulés en questions).
- `notionPageId` : optionnel — page Notion du client où logger les relevés.

## Mode mock

Tant que `MOCK_MODE=true` (défaut), aucun appel API : réponses de démonstration
déterministes, flaguées `mock: true` partout. Un moteur sans clé API est
simplement sauté en production (le run continue avec les autres).

## Mise en service (une fois les clés prêtes)

> Le workflow GitHub `deploy-geo-tracker-worker.yml` fait presque tout : il
> crée le namespace KV s'il n'existe pas, injecte son id, pousse les secrets
> GitHub vers le worker et déploie (MOCK_MODE désactivé par défaut,
> réactivable via l'input `mock-mode`).

1. **KV** : rien à faire — créé automatiquement au premier deploy par le
   workflow (en local : `npx wrangler kv namespace create RUNS` + id dans
   `wrangler.toml`).
2. **Clés API** (au moins une) : Perplexity, Anthropic, OpenAI, Gemini.
3. **Secrets GitHub** (Settings → Secrets → Actions ; `NOTION_TOKEN`,
   `WASSIM_AUTH_TOKEN`, `CLOUDFLARE_*` existent déjà pour bridge-proxy) :
   `PERPLEXITY_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
   `GEMINI_API_KEY` — un moteur sans clé est simplement sauté.
4. Lancer le workflow `Deploy geo-tracker worker` (Actions) ; ajuster les
   modèles dans `[vars]` si besoin.
5. Charger la config clients via `PUT /clients`, puis tester un
   `POST /run {"client": "..."}` et vérifier le log Notion.

**Coût / quotas** : ~4 appels API par prompt et par relevé (1 par moteur).
Avec 10 prompts par client, un relevé = ~40 appels courts (max 1024 tokens de
sortie) — quelques centimes par client et par mois. La limite Workers de 1000
sous-requêtes par exécution cron laisse de la marge jusqu'à ~10 clients ; au-delà,
découper le cron par lots.

## Tests

```bash
npm install
npm test
```
