# sync-banks — woob scraper Fortuneo

Lit les comptes et transactions Fortuneo via [woob](https://woob.tech/) et les
pousse au worker Cloudflare qui les stocke en KV pour consommation par le
dashboard.

> **Pourquoi pas GitHub Actions cron ?** Fortuneo a un WAF qui rejette les IP
> datacenter (Azure, AWS) avec un 403 systématique. La SCA est aussi liée à
> l'IP qui l'a déclenchée. Conclusion : le sync doit tourner depuis une IP
> résidentielle française — c'est-à-dire **chez toi**, pas dans le cloud.
> On utilise donc `launchd` sur ton Mac (équivalent macOS de cron).

## Setup initial (à faire une fois)

### 1. Pré-requis local

```bash
# Python venv + woob
python3 -m venv ~/woob-env
~/woob-env/bin/pip install -r requirements.txt

# Config interactive du backend Fortuneo (déclenche la SCA)
~/woob-env/bin/woob config add fortuneo
~/woob-env/bin/woob bank list   # vérifier que ça marche
```

### 2. Récupérer le repo localement

Si pas déjà fait :
```bash
cd ~/
git clone https://github.com/nastyjesus/dashboard-wassim.git
cd dashboard-wassim/scripts/sync-banks
```

### 3. Renseigner le `.env`

```bash
cp .env.example .env
nano .env
```

Remplis :
- `WORKER_URL` = URL du worker Cloudflare (probablement déjà bon)
- `WASSIM_AUTH_TOKEN` = le token X-Wassim-Auth qui marche avec Qonto/Stripe

### 4. Installer le launchd agent

```bash
./install-mac.sh
```

Le script va :
1. Faire un smoke test (un sync manuel)
2. Si OK, installer `~/Library/LaunchAgents/com.wassim.dashboard.sync-banks.plist`
3. L'activer pour qu'il tourne **chaque jour à 7h** (ou au réveil si Mac endormi)

## Commandes utiles

```bash
# Forcer un run manuel maintenant
launchctl start com.wassim.dashboard.sync-banks

# Voir les logs
tail -f sync.log sync.error.log

# Désactiver temporairement
launchctl unload ~/Library/LaunchAgents/com.wassim.dashboard.sync-banks.plist

# Réactiver
launchctl load ~/Library/LaunchAgents/com.wassim.dashboard.sync-banks.plist

# Test direct sans passer par launchd
./run-sync.sh
```

## Rotation SCA tous les ~90 jours

DSP2 impose une re-authentification forte tous les 3 mois. Quand le sync
commencera à planter avec une AuthError ou un challenge SCA :

```bash
~/woob-env/bin/woob config remove fortuneo
~/woob-env/bin/woob config add fortuneo
# (refais la SCA via SMS ou app Fortuneo Sécurité-Pass)
~/woob-env/bin/woob bank list   # verify
```

Pas besoin de retoucher launchd ni le `.env` — le backend est lu depuis
`~/.config/woob/backends` à chaque run.

## Comment ça pousse au dashboard

```
launchd 7h
  → run-sync.sh
    → sync-banks.py (lit woob → /scraped/ingest sur worker)
      → KV Cloudflare bucket "bank:fortuneo"
        → dashboard fetch /scraped/fortuneo
          → renderImportedBank affiche les data ‹fraîches›
```

## Variables d'environnement

| Var                   | Description                                  |
|-----------------------|----------------------------------------------|
| `WORKER_URL`          | URL du worker (env via .env)                 |
| `WASSIM_AUTH_TOKEN`   | header `X-Wassim-Auth` (env via .env)        |
| `WOOB_DATA_DIR`       | optionnel — surcharge le workdir woob (usage CI uniquement) |
| `FORTUNEO_BACKEND_NAME` | nom du backend woob (défaut: `fortuneo`)   |
| `BPGO_BACKEND_NAME`   | nom du backend woob BPGO (défaut: `bpgo`, non utilisé pour l'instant) |
