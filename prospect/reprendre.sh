#!/usr/bin/env bash
# Reprend une enquete web interrompue par un blocage DuckDuckGo, autant de
# fois qu'il faut.
#
# On ne contourne pas le blocage : on l'attend. Quand le moteur refuse, on
# patiente 15 minutes et on reteste. Le runner ecrit son rapport fiche par
# fiche et saute celles deja faites : chaque reprise repart exactement la ou
# la precedente s'est arretee.
#
#   bash prospect/reprendre.sh <rapport.json> <metiers> <communes> [<metiers> <communes> ...]
set -u
cd "$(dirname "$0")/.."
RAPPORT="$1"; shift
export PYTHONIOENCODING=utf-8

moteur_ouvert() {
  python -c "
from prospect import fouille as F
try:
    F.chercher('artisan bruz', 1, essais=1)
except F.MoteurFerme:
    raise SystemExit(1)
" 2>/dev/null
}

tour=0
while :; do
  tour=$((tour + 1))
  until moteur_ouvert; do
    echo "[$(date +%H:%M)] moteur ferme, nouvel essai dans 15 min"
    sleep 900
  done
  echo "[$(date +%H:%M)] tour $tour : moteur ouvert, reprise"
  arret=0
  set -- "$@"
  i=1
  args=("$@")
  while [ $i -lt ${#args[@]} ]; do
    metiers="${args[$((i-1))]}"; communes="${args[$i]}"
    # SIRETS (optionnel) : fichier du cache listant les fiches a enqueter.
    sortie=$(python -m prospect.tour2_lot2 --metier "$metiers" --commune "$communes" ${SIRETS:+--sirets "$SIRETS"} \
             --rapport "$RAPPORT" 2>&1 | tail -3)
    echo "$sortie" | sed 's/^/    /'
    if echo "$sortie" | grep -q "ARRET"; then arret=1; break; fi
    i=$((i + 2))
  done
  if [ $arret -eq 0 ]; then
    echo "[$(date +%H:%M)] enquete complete apres $tour tour(s)"
    exit 0
  fi
done
