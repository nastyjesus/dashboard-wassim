# on-sort-poc — POC « On sort ? » (week-end 1)

Pipeline de données du side hustle **« On sort ? »** : l'app mobile qui répond
à « qu'est-ce qu'on fait avec les enfants ce week-end ? ». Ce worker valide
la brique la plus risquée AVANT de builder l'app : **y a-t-il assez
d'événements famille exploitables en open data autour de Rennes ?**

## Ce que fait le worker

1. Agrège les événements de deux sources ouvertes (sans clé) :
   - **OpenAgenda** via le miroir OpenDataSoft `evenements-publics-openagenda`
     (source principale : médiathèques, mairies, MJC) ;
   - **DATAtourisme** via l'API ouverte de mars 2026 — endpoint encore à
     confirmer : l'adaptateur sonde les candidats listés dans
     `DATATOURISME_ENDPOINTS` et `/diagnostic` dit lequel répond.
2. Croise avec la météo du jour demandé (Open-Meteo — passer sur une licence
   commerciale avant monétisation).
3. Filtre et score chaque événement : adapté aux enfants (heuristiques
   mots-clés), tranche d'âge détectée dans le texte, intérieur/extérieur vs
   pluie, distance (exclusion au-delà du rayon), gratuité.
4. Sort un top 5 avec une « préférée » et des raisons lisibles (« À l'abri
   s'il pleut », « Dès 3 ans », « À 12 km », « Gratuit »).

## Endpoints

| Endpoint | Rôle |
|---|---|
| `GET /health` | état du worker |
| `GET /top?date=YYYY-MM-DD&lat=&lon=&age=&rayon=&dept=&code=` | le produit : top 5 scoré (défauts : samedi prochain, Rennes, 3 ans, 40 km, Ille-et-Vilaine) |
| `GET /diagnostic?date=...` | **le go/no-go** : comptages réels par source, part « famille », échantillons, verdict |
| `POST /votes` · `GET /votes` | « Ça m'intéresse » des piliers en teaser |
| `POST /ville-demande` · `GET /ville-demande` | villes réclamées hors zone (filet si Supabase KO) |
| `POST /mesure` `{evt}` | +1 sur un compteur d'usage du jour |
| `GET /mesures?jours=14` | les compteurs par jour, les totaux et les taux |
| `GET /desabonnement?jeton=` | coupe l'alerte du week-end, sans compte ni mot de passe |

## L'alerte du week-end (cron du vendredi)

`[triggers] crons = ["0 15 * * 5"]` — vendredi 15 h UTC, soit 17 h en heure
d'été, 16 h en hiver. Le worker prend les papas qui ont coché l'alerte, demande
son top du samedi à `/top` (un appel par couple ville + âge, pas par personne),
et envoie l'e-mail via Resend.

Trois règles tenues dans `src/alerte.js` :

1. **opt-in strict** — la colonne `alerte_weekend` vaut `false` par défaut ;
2. **silence si rien** — top vide, ville fermée, adresse introuvable : aucun
   e-mail. Un message « rien près de chez toi » fait désabonner ;
3. **désabonnement en un clic** — un jeton aléatoire par papa dans le lien, pas
   l'identifiant du compte.

Secrets à poser (Cloudflare → Worker → Settings → Variables, chiffrés) :
`SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (clé service_role), `RESEND_KEY`.
**Sans eux, le cron ne fait rien et l'écrit dans les logs** — il n'échoue pas.
Côté app, la case d'inscription reste cachée tant que `ALERTE_ACTIVE` vaut
`false` dans `apps/on-sort/src/config.js` : on ne propose pas un service qui ne
partirait pas.

Vérifier un vendredi : `npx wrangler tail` puis lire la ligne
`alerte week-end : {"destinataires":…,"envoyes":…,"silences":…}`.

⚠️ `src/villes.js` duplique la liste de villes de l'app. Les deux doivent bouger
ensemble à chaque ouverture de zone — un test compte les villes pour qu'un oubli
se voie.

## Lire les compteurs d'usage

`GET /mesures?jours=14` → l'entonnoir, jour par jour :

| Étape | Ce qu'elle dit |
|---|---|
| `ouverture` | l'app a démarré |
| `arrivee-lien` | elle a démarré avec ville/âge dans l'URL — **c'est le trafic venu du site** |
| `top` / `top-vide` | une liste a été affichée, avec ou sans résultat |
| `garde` | une sortie a été mise de côté |
| `compte` | un compte a été créé |

Et trois taux calculés : `gardeParTop` (combien de listes affichées finissent en
sortie gardée), `compteParGarde` (combien de gardes finissent en compte),
`topVide` (part de listes sans résultat — la santé des zones ouvertes).

Ce sont des **compteurs agrégés** : un nom d'étape, une clé KV par jour, aucun
identifiant d'appareil, aucun profil. Impossible de reconstituer un parcours
individuel — c'est voulu, et c'est ce que dit la politique de confidentialité.

⚠️ KV n'a pas d'incrément atomique : le compteur est lu puis réécrit, donc deux
écritures simultanées peuvent en perdre une. Assumé tant qu'on cherche une
tendance. Si le volume rend l'écart gênant, passer sur Analytics Engine.

## Lire le go/no-go

Après déploiement (`https://on-sort-poc.loumiwassim.workers.dev/diagnostic`) :

- `openagenda.count` — volume brut d'événements du département ce jour-là ;
- `openagenda.familleExplicite` / `familleCompatible` — densité famille ;
- `datatourisme.ok` + `erreursSondees` — si `false`, l'endpoint de la nouvelle
  API reste à confirmer (voir la doc `api.datatourisme.fr/v1/docs`) puis à
  figer dans `wrangler.toml` ;
- `retenusApresScoring` + `verdict` — GO / LIMITE / NO-GO **sur cette date** :
  tester plusieurs samedis avant de conclure.

Critère de passage au week-end 2 (l'app Expo) : un top 5 pertinent sur au
moins 3 samedis différents, sans doublons absurdes ni hors-sujet.

## Dev local

```bash
npm install
npm test          # 30 tests (heuristiques famille, scoring, worker)
npm run dev       # wrangler dev — MOCK_MODE=true dans wrangler.toml pour
                  # travailler sans réseau (données fictives marquées mock)
```

Déploiement : automatique via `.github/workflows/deploy-on-sort-worker.yml`
(push sur la branche de travail, path `workers/on-sort/**`). Aucun secret
Cloudflare supplémentaire : uniquement les données ouvertes.
