# sync-banks — woob scraper Fortuneo + BPGO

Lit les comptes et transactions via [woob](https://woob.tech/) et les pousse
au worker Cloudflare qui les stocke en KV pour consommation par le dashboard.

## Pré-requis local (1ʳᵉ fois)

```bash
python3 -m venv ~/woob-env
source ~/woob-env/bin/activate
pip install -r requirements.txt

# Setup interactif des backends (1× — déclenche la SCA)
woob config add fortuneo
woob config add banquepopulaire

# Test que les comptes remontent
woob bank list
```

Le dossier `~/.config/woob/` contient désormais ta config + sessions.

## Pousser en CI (GitHub Actions)

1. Tarball + base64 du dossier config :
   ```bash
   tar -czf woob-config.tar.gz -C ~/.config woob
   base64 woob-config.tar.gz > woob-config.b64
   ```
2. Copie le contenu de `woob-config.b64` dans le secret GitHub `WOOB_CONFIG_B64`.
3. Le workflow `sync-banks.yml` restaure ce dossier au début de chaque run.

## Rotation tous les ~90 jours (SCA expirée)

```bash
woob bank list
# → si AuthError ou SCA challenge :
woob config remove fortuneo
woob config add fortuneo
# (re-faire la SCA)

# Et regénère le tarball/base64 → update GH secret
tar -czf woob-config.tar.gz -C ~/.config woob
base64 woob-config.tar.gz | pbcopy   # macOS : copie dans le presse-papier
```

## Variables d'environnement

| Var                   | Description                                  |
|-----------------------|----------------------------------------------|
| `WORKER_URL`          | URL du worker, ex: https://bridge-proxy-wassim.…workers.dev |
| `WASSIM_AUTH_TOKEN`   | header `X-Wassim-Auth`                       |
| `WOOB_DATA_DIR`       | optionnel — répertoire config woob alternatif|
| `FORTUNEO_BACKEND_NAME` | nom du backend woob (défaut: `fortuneo`)   |
| `BPGO_BACKEND_NAME`   | nom du backend woob BPGO (défaut: `bpgo`)    |
