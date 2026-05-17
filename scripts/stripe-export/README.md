# stripe-export — extract + analyse MyeFarm

Extrait toutes les données Stripe (charges, customers, payouts, balance txs,
refunds, subscriptions) en local et produit un résumé compact pour analyse.

## Setup (1ʳᵉ fois)

```bash
cd ~/dashboard-wassim/scripts/stripe-export

# Active le venv woob (déjà créé pour sync-banks), il a déjà `requests`
~/woob-env/bin/pip install -r requirements.txt   # idempotent

cp .env.example .env
nano .env
```

Dans `.env`, colle ta `STRIPE_KEY` (la même `rk_live_…` que dans GH Secrets).

## Run

```bash
~/woob-env/bin/python export-stripe.py
```

Le script :
1. Paginé toutes les ressources Stripe (1-2 min selon volume)
2. Sauvegarde le JSON brut dans `./data/{charges,customers,…}.json`
3. Imprime un résumé compact sur stdout

**Colle tout le résumé dans le chat → analyse en profondeur derrière.**

## Re-runs

Le script écrase `./data/*.json` à chaque run. Si tu veux garder un snapshot
historique, copie le dossier avant : `cp -r data data.$(date +%Y-%m-%d)`.

## Pour zoomer sur un slice spécifique

Une fois que t'as les JSON locaux, tu peux les ouvrir dans Python / jq /
Numbers / etc. pour des questions spécifiques. Ou dis-moi ce qui t'intéresse,
je te génère une commande d'analyse ad-hoc qui lit le JSON local sans ré-appeler
l'API Stripe.
