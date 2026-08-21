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
