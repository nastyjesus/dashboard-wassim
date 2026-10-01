# Backlink Radar — spécification

Outil interne de Wassim (consultant SEO) pour **trouver, qualifier et suivre des
opportunités de backlinks dofollow gratuits** pour ses clients, avec la
marketplace payante en option séparée.

> Règle absolue du dépôt : aucun chiffre inventé. Toute métrique d'autorité
> vient d'un export Semrush / Ahrefs importé. Une donnée absente reste absente
> (affichée « inconnue »), jamais estimée.

Statut : **V1 codée et testée** (worker, base, score, pipeline, vérification
des liens, page). **Il manque les parsers d'import**, en attente d'exports
réels (voir § Questions ouvertes). D'ici là, tout CSV est refusé avec la liste
de ses colonnes.

---

## 1. Besoin (cadrage du 2026-09-28)

| Sujet | Décision |
|---|---|
| Type de liens | Surtout **dofollow**, gratuits |
| Clients | Mix (local, e-commerce, B2B) → scoring paramétrable par client |
| Méthodes | Link gap concurrents · mentions sans lien · liens cassés / pages ressources · annuaires & partenaires |
| Marketplace | Complément **optionnel**, séparé du gratuit, prix affiché |
| Autonomie | Trouver + qualifier. La prise de contact reste manuelle |
| Forme | Dashboard web + worker Cloudflare, dans ce dépôt |
| Source data | **Import d'exports CSV** (pas d'API Semrush/Ahrefs) |
| Suivi | Pipeline complet + vérification auto du lien obtenu |
| Scoring | Autorité du domaine · pertinence thématique · facilité d'obtention |
| Accès | Wassim seul |

## 2. Découpage

| Version | Contenu |
|---|---|
| **V1** | Clients + concurrents · import CSV link gap · dédoublonnage · score (autorité + facilité) · pipeline · vérification des liens obtenus (cron) |
| V2 | Pertinence thématique via l'API Claude (lecture de la page) · détection page contact / e-mail |
| V3 | Mentions sans lien · liens cassés / pages ressources (imports CSV) · base annuaires & partenaires vérifiée à la main |
| V4 | Marketplace en option (service à identifier), étiquetée `rel="sponsored"` |

Cette spec détaille la **V1**. Les versions suivantes auront leur section au moment de les attaquer.

## 3. Architecture

```
backlinks.html  (GitHub Pages, comme automations.html)
   │  fetch + header X-Wassim-Auth
   ▼
workers/backlink-radar/  (Cloudflare Worker "backlink-radar-wassim")
   ├─ D1 "backlink-radar"   clients, opportunités, pipeline, contrôles
   └─ cron quotidien        vérification des liens obtenus (par lots)
```

- **Front** : page statique `backlinks.html` à la racine, même charte que
  `automations.html` (EB Garamond / Raleway, palette or). Aucune dépendance de
  build.
- **Auth** : même mécanisme que les autres pages. Le token `X-Wassim-Auth` est
  stocké en `localStorage` et le worker le compare au secret `WASSIM_AUTH_TOKEN`.
  *Correction du brainstorm :* Cloudflare Access ne protégerait pas la page,
  hébergée sur GitHub Pages et non sur Cloudflare. La page ne contient aucune
  donnée : tout passe par le worker authentifié.
- **Stockage : D1 plutôt que KV**, parce que le pipeline demande des requêtes
  (filtrer par statut, trier par score, relances dues). Le précédent existe
  déjà avec `workers/papa-tribu`.
- **Tests** : vitest, comme les autres workers (`npm test`). Le SQL réel est
  testé sur SQLite en mémoire (`node:sqlite`, Node ≥ 22) via une fine couche
  qui imite l'API D1.

## 4. Modèle de données (D1)

```sql
CREATE TABLE clients (
  id            TEXT PRIMARY KEY,          -- slug, ex. "cabinet-dupont"
  name          TEXT NOT NULL,
  domain        TEXT NOT NULL,             -- domaine racine normalisé, sans www
  sector        TEXT,                      -- libre, sert à la pertinence (V2)
  is_local      INTEGER NOT NULL DEFAULT 0,
  weights_json  TEXT,                      -- pondération du score, null = défaut
  created_at    TEXT NOT NULL
);

CREATE TABLE competitors (
  client_id  TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain     TEXT NOT NULL,
  PRIMARY KEY (client_id, domain)
);

CREATE TABLE imports (
  id          TEXT PRIMARY KEY,
  client_id   TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  source      TEXT NOT NULL,               -- 'semrush_backlink_gap' | 'ahrefs_link_intersect' | ...
  filename    TEXT,
  row_count   INTEGER NOT NULL,
  imported_at TEXT NOT NULL
);

CREATE TABLE opportunities (
  id                 TEXT PRIMARY KEY,
  client_id          TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  domain             TEXT NOT NULL,        -- domaine référent normalisé
  method             TEXT NOT NULL,        -- 'link_gap' (V1) | 'unlinked_mention' | 'broken_link' | 'directory' | 'marketplace'
  sample_url         TEXT,                 -- page d'exemple issue de l'export
  -- Métriques brutes, par source : jamais converties d'une échelle à l'autre
  semrush_as         INTEGER,              -- Authority Score (null si absent de l'export)
  ahrefs_dr          REAL,                 -- Domain Rating (null si absent)
  competitors_linked INTEGER,              -- nb de concurrents liés par ce domaine (d'après l'export)
  competitors_total  INTEGER,              -- nb de concurrents dans l'analyse
  score              REAL,                 -- 0–100, recalculé ; null si aucune composante connue
  score_detail_json  TEXT,                 -- composantes + poids utilisés, pour l'explicabilité
  status             TEXT NOT NULL DEFAULT 'a_contacter',
  contact_note       TEXT,
  next_followup_at   TEXT,
  link_url           TEXT,                 -- URL de la page où le lien a été posé
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL,
  UNIQUE (client_id, domain, method)
);

CREATE TABLE link_checks (
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  checked_at      TEXT NOT NULL,
  http_status     INTEGER,
  result          TEXT NOT NULL,           -- voir § 7
  rel             TEXT,                    -- valeur brute de l'attribut rel trouvé
  detail          TEXT
);

CREATE TABLE events (                      -- historique du pipeline
  id              TEXT PRIMARY KEY,
  opportunity_id  TEXT NOT NULL REFERENCES opportunities(id) ON DELETE CASCADE,
  at              TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  note            TEXT
);
```

**Normalisation des domaines** : minuscules, sans protocole, sans `www.`, sans
port ni chemin. Les sous-domaines restent distincts (`blog.x.fr` ≠ `x.fr`) :
c'est ainsi que les exports les présentent. À confirmer sur les exports réels.

## 5. Import CSV

### Principe
1. Wassim glisse un fichier sur la fiche client.
2. Le worker **détecte la source d'après l'en-tête** (jeu de colonnes
   caractéristique) et refuse un fichier non reconnu, avec la liste des
   colonnes lues. Aucune devinette.
3. Mapping colonne → champ, puis normalisation des domaines.
4. **Upsert** sur `(client_id, domain, method)` : un réimport met à jour les
   métriques sans perdre le statut ni les notes du pipeline.
5. Les domaines du client et de ses concurrents sont exclus.
6. Le worker renvoie un rapport : lignes lues, créées, mises à jour, ignorées
   (avec raison).

### Formats — à confirmer

Les noms exacts des colonnes **ne sont pas encore connus** : ils dépendent de
l'outil, de la langue de l'interface et de l'offre. Chaque parser est écrit à
partir d'un **export réel fourni par Wassim**, conservé anonymisé en fixture de
test sous `workers/backlink-radar/tests/fixtures/`.

| Source | Écran d'origine | Champs attendus (à vérifier sur fichier) |
|---|---|---|
| `semrush_backlink_gap` | Semrush › Backlink Gap | domaine référent, Authority Score, présence par concurrent |
| `ahrefs_link_intersect` | Ahrefs › Link Intersect | domaine référent, DR, présence par concurrent |

Détails à valider sur les fichiers : séparateur (`,` ou `;`), encodage (BOM
UTF-8 ?), décimales, colonnes par concurrent.

## 6. Score (V1)

Score sur 0–100, **explicable** : le détail des composantes est stocké et
affiché au survol.

| Composante | Calcul | Source |
|---|---|---|
| Autorité | Semrush AS ÷ 100 ou Ahrefs DR ÷ 100, selon la source choisie pour le client. Les deux sont toujours affichés. **Pas de repli** sur l'autre source : si la source choisie manque, la composante est inconnue | Export |
| Facilité | `competitors_linked / competitors_total` : un domaine qui fait des liens vers plusieurs concurrents accepte probablement le secteur | Export |
| Pertinence | V2 (API Claude) | — |

- **Pondération** : réglable globalement et par client (`weights_json`). Au
  départ, poids égaux entre les composantes disponibles. C'est un choix
  neutre, pas une recommandation chiffrée.
- **Donnée manquante** : la composante est **exclue** et les poids restants sont
  renormalisés. L'opportunité porte alors le badge « autorité inconnue ». Pas de
  zéro implicite. Si aucune composante n'est connue, `score = null`.
- AS et DR sont deux échelles propriétaires différentes : **jamais convertis**
  l'un en l'autre.

## 7. Pipeline et vérification des liens

### Statuts
```
a_contacter → contacte → relance → obtenu
                    ↘        ↘
                     refuse   refuse
(tout statut) → ignore
obtenu → perdu   (posé automatiquement par la vérification)
```
- Passer en `contacte` ou `relance` demande une date de prochaine relance.
  Défaut : J+7, modifiable.
- Passer en `obtenu` demande `link_url` et déclenche un contrôle immédiat.
- Chaque transition écrit une ligne dans `events`.

### Vérification (cron quotidien par lots + à la demande)
Pour chaque opportunité `obtenu` :
1. `GET link_url`, redirections suivies par le runtime, User-Agent identifiable
   `BacklinkRadar/0.1 (+site de Wassim)`, délai max 15 s.
2. Lecture du HTML par expressions régulières sur les balises `<a>` et `<meta>`.
   Commentaires, `<script>` et `<style>` sont retirés avant. On garde tous les
   `<a href>` dont le domaine est celui du client ou l'un de ses sous-domaines.
   *Implémentation :* pas d'HTMLRewriter. On ne lit que des attributs, et ce
   code reste testable hors du runtime Workers.
3. Résultat :

| `result` | Condition |
|---|---|
| `live_dofollow` | Lien trouvé ; `rel` sans `nofollow` / `sponsored` / `ugc` ; pas de `nofollow` dans la meta robots ni dans l'en-tête `X-Robots-Tag` |
| `live_nofollow` | Lien trouvé mais marqué nofollow / sponsored / ugc (au niveau du lien ou de la page) |
| `missing` | Page en 200 mais aucun lien vers le client |
| `http_error` | Statut ≥ 400 ou erreur réseau |
| `unverifiable` | Réponse de blocage anti-bot, ou page rendue en JavaScript sans lien dans le HTML initial |

- Deux `missing` ou `http_error` consécutifs → statut `perdu`, alerte sur le
  dashboard. Un seul échec ne suffit pas : on ne confond pas une panne passagère
  et un lien retiré.
- **Limite connue** : un lien injecté en JavaScript n'est pas visible sans
  navigateur headless. Il est classé `unverifiable`, jamais `missing`.
- Un lien `perdu` qui réapparaît lors d'une vérification manuelle repasse
  automatiquement en `obtenu`.
- **Sous-requêtes** : un contrôle coûte une sous-requête, et la limite est de
  50 par invocation. Le cron tourne chaque jour à 5 h UTC et traite au plus
  `CHECK_BATCH` (40) liens, en commençant par les plus anciennement vérifiés.
  Un lien n'est revérifié qu'après `CHECK_EVERY_DAYS` (7) jours. Cela donne un
  contrôle hebdomadaire de chaque lien jusqu'à 280 liens obtenus. Au-delà, il
  faudra le patron du binding `SELF` de `geo-tracker`.

## 8. API du worker

Toutes les routes exigent `X-Wassim-Auth`.

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/clients` | liste + compteurs par statut |
| POST | `/clients` | créer (nom, domaine, secteur, local, concurrents) |
| PATCH | `/clients/:id` | modifier (dont poids du score) |
| POST | `/clients/:id/imports` | upload CSV (`multipart/form-data`) → rapport d'import |
| GET | `/clients/:id/opportunities?status=&method=&sort=score` | liste filtrée |
| PATCH | `/opportunities/:id` | changer statut / note / relance / `link_url` |
| POST | `/opportunities/:id/check` | vérification immédiate |
| GET | `/opportunities/:id` | détail + historique du pipeline + 20 derniers contrôles |
| GET | `/followups` | relances dues aujourd'hui + liens perdus, tous clients |
| GET | `/health` | état (sans auth) |

## 9. Front `backlinks.html` (V1)

- Sélecteur de client + création rapide.
- Zone de dépôt CSV → rapport d'import.
- Tableau des opportunités : domaine, AS / DR, concurrents liés, score (détail
  au survol), statut. Tri et filtres.
- Pipeline : filtres par statut avec compteurs, et changement de statut dans
  la ligne (seules les transitions autorisées sont proposées). Plutôt qu'un
  kanban : il reste lisible avec des centaines de lignes, et sur mobile.
- Historique par opportunité : transitions et vérifications.
- Bandeau « relances du jour » et « liens perdus ».
- En local (`localhost`), la page parle à `wrangler dev` (port 8787). Ailleurs,
  elle parle au worker de prod. L'URL d'API n'est jamais un paramètre, pour
  que le token ne parte que vers ces deux hôtes.

## 10. Déploiement

- Branche : `feat/backlink-radar`.
- Workflow `.github/workflows/deploy-backlink-radar-worker.yml`, calqué sur
  `deploy-papa-tribu-worker.yml`. Il se déclenche sur un push vers
  `feat/backlink-radar` qui touche `workers/backlink-radar/**`. Étapes :
  1. `npm ci` puis `npm test` ;
  2. création de la base D1 si elle n'existe pas, et injection de son id ;
  3. `schema.sql` rejoué (idempotent) ;
  4. secret `WASSIM_AUTH_TOKEN` copié depuis les secrets GitHub ;
  5. `wrangler deploy` ;
  6. smoke test en lecture seule : santé, 401 sans token, `GET /clients` avec
     token. Aucune donnée de test n'est écrite en prod.
- Rien à faire à la main, à condition que les secrets GitHub
  `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` et `WASSIM_AUTH_TOKEN` soient
  présents, comme pour les autres workers.
- Dev local : `.dev.vars` (ignoré par git) avec `WASSIM_AUTH_TOKEN=…`, puis
  `npx wrangler d1 execute backlink-radar --local --file=schema.sql` et
  `npx wrangler dev --local`.

## 11. Conformité SEO

- Les consignes de Google classent les **liens achetés en dofollow** comme
  une manipulation de liens et demandent `rel="sponsored"`. En V4, toute
  opportunité marketplace sera étiquetée ainsi dans le dashboard.
- L'outil **ne poste rien automatiquement** : pas de soumission de formulaire,
  pas d'envoi d'e-mail. Il trouve, qualifie et vérifie.

## 12. Tests (V1)

- Parsers : une fixture réelle anonymisée par source, plus des cas limites
  (BOM, `;`, lignes vides, fichier non reconnu).
- Normalisation des domaines.
- Score : composantes manquantes, renormalisation, `score = null`.
- Upsert : un réimport conserve statut et notes.
- Vérification : HTML de test pour chaque `result`, dont meta robots et
  `X-Robots-Tag`.
- Transitions de pipeline interdites → erreur 400.

## 13. Questions ouvertes

1. **Exports réels** : un export Semrush Backlink Gap et un export Ahrefs Link
   Intersect sur un vrai client. Ils bloquent l'écriture des parsers.
2. **Source d'autorité par défaut** dans le score : Semrush AS ou Ahrefs DR ?
3. **Marketplace (V4)** : quel service se cache derrière le connecteur de la
   session (`search_sites` / `create_order`), et a-t-il une API appelable
   depuis un worker ?
4. **Liens `unverifiable`** : acceptes-tu une vérification manuelle, ou
   faut-il prévoir plus tard un navigateur headless (Cloudflare Browser
   Rendering, coût à vérifier) ?
