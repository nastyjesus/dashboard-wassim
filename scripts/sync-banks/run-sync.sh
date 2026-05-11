#!/bin/bash
# run-sync.sh — wrapper appelé par launchd qui charge l'env et lance sync-banks.py
#
# Usage manuel pour test :
#   ./run-sync.sh

set -e
cd "$(dirname "$0")"

# Charge les credentials depuis .env (WORKER_URL + WASSIM_AUTH_TOKEN)
if [ -f .env ]; then
  set -a
  source .env
  set +a
else
  echo "❌ .env manquant dans $(pwd). Copie .env.example en .env et remplis-le." >&2
  exit 2
fi

# Garde-fou
if [ -z "$WORKER_URL" ] || [ -z "$WASSIM_AUTH_TOKEN" ]; then
  echo "❌ WORKER_URL ou WASSIM_AUTH_TOKEN manquant dans .env" >&2
  exit 2
fi

# Lance via le venv woob installé par l'utilisateur
PY="$HOME/woob-env/bin/python"
if [ ! -x "$PY" ]; then
  echo "❌ Python venv woob introuvable : $PY" >&2
  echo "   Installe-le avec : python3 -m venv ~/woob-env && ~/woob-env/bin/pip install -r requirements.txt" >&2
  exit 2
fi

echo "── sync-banks $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
"$PY" sync-banks.py
echo "── done $(date -u +%Y-%m-%dT%H:%M:%SZ) ──"
