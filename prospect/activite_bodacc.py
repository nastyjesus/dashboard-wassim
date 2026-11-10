# -*- coding: utf-8 -*-
"""Cherche l'activite DECLAREE au BODACC pour les fiches attestees par le seul NAF.

Le code NAF est attribue a l'immatriculation et ne bouge plus ; il ment
souvent (les ostheopathes de Bruz, PIL CREATION). Le BODACC, lui, publie
l'activite en texte libre telle que l'entreprise l'a declaree. C'est une
source independante du NAF - la seule accessible pour une micro-entreprise
sans site web.

Sa couverture est faible : sur trente fiches testees, une dizaine portent un
texte et trois seulement un enonce exploitable. Le reste se contente de
"Modification de l'activite.", qui ne dit rien. On le constate plutot que de
le supposer.

    python -m prospect.activite_bodacc [--max N]
    python -m prospect.activite_bodacc --metier electricien --commune VERN-SUR-SEICHE                                        --rapport activite_couronne.json
"""
import argparse
import io
import json
import os
import re
import sys
import time
import urllib.parse

from . import bodacc as B
from . import fouille as F
from . import pipeline as P
from . import sources as S
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
RAPPORT = os.path.join(RACINE, "cache", "activite_bodacc.json")

# Descriptifs qui annoncent un changement sans dire lequel.
CREUX = re.compile(
    r"^\s*(modification|transfert|changement|cessation|radiation|nomination|"
    r"fin de|poursuite|dissolution|cloture|depot|renouvellement)[^:]*\.?\s*$", re.I)


def enonces(siren, pause=0.15):
    """Textes d'activite publies pour ce SIREN, les creux ecartes."""
    p = {"where": 'registre LIKE "%s"' % siren, "limit": 30}
    d = S._json(B.API + "?" + urllib.parse.urlencode(p))
    time.sleep(pause)
    out = []
    for rec in (d.get("records") or []):
        f = rec.get("record", {}).get("fields", rec)
        det = B.detailler(f)
        if det["activite"] and not CREUX.match(det["activite"]):
            out.append((det["date"], det["activite"]))
        mg = f.get("modificationsgenerales")
        if not mg:
            continue
        try:
            desc = (json.loads(mg) if isinstance(mg, str) else mg).get("descriptif") or ""
        except ValueError:
            desc = str(mg)
        if desc and not CREUX.match(desc) and len(desc) > 25:
            out.append((det["date"], desc))
    # Le plus recent d'abord : une activite peut avoir change.
    out.sort(key=lambda x: x[0] or "", reverse=True)
    return out


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=None)
    p.add_argument("--metier", default=None,
                   help="cles separees par des virgules ; sinon, on reprend les "
                        "fiches du dernier tour restees au seul code NAF")
    p.add_argument("--commune", default=None,
                   help="libelles en majuscules, separes par des virgules")
    p.add_argument("--rapport", default="activite_bodacc.json")
    a = p.parse_args(argv)
    rapport = os.path.join(RACINE, "cache", a.rapport)

    store = Store()
    fiches = {f["siret"]: f for f in store.fiches()}
    voc = F.vocabulaire(P.REFERENTIEL)

    if a.metier:
        communes = ({x.strip().upper() for x in a.commune.split(",")}
                    if a.commune else None)
        cibles = []
        for m in [x.strip() for x in a.metier.split(",")]:
            for f in store.fiches(metier=[m]):
                if communes and f["commune"].upper() not in communes:
                    continue
                cibles.append((f["siret"], {"nom": f["nom"], "metier": m}))
    else:
        verdicts = json.load(io.open(os.path.join(RACINE, "cache", "tour2_metiers.json"),
                                     encoding="utf-8"))
        cibles = [(k, d) for k, d in verdicts.items()
                  if d["verdict"] == "pas de page dediee : code NAF seul"]
    vus = set()
    cibles = [(k, d) for k, d in cibles if not (k in vus or vus.add(k))]
    if a.max:
        cibles = cibles[:a.max]

    out = []
    if os.path.exists(rapport):
        try:
            out = json.load(io.open(rapport, encoding="utf-8"))
        except ValueError:
            out = []
    deja = {x["siret"] for x in out}

    for i, (siret, d) in enumerate(cibles, 1):
        if siret in deja:
            continue
        siren = fiches.get(siret, {}).get("siren") or siret[:9]
        try:
            textes = enonces(siren)
        except Exception as e:
            print("  ERREUR %s : %s" % (d["nom"][:36], e), file=sys.stderr)
            textes = []
        lus = []
        for date, t in textes:
            lus.append({"date": date, "texte": t,
                        "indices": F.indices(t, d["metier"], voc)})
        out.append({"siret": siret, "nom": d["nom"], "metier": d["metier"],
                    "enonces": lus})
        json.dump(out, io.open(rapport, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        if i % 25 == 0:
            print("%d/%d" % (i, len(cibles)), flush=True)

    avec = [x for x in out if x["enonces"]]
    print("\n%d fiches, %d avec au moins un enonce d activite" % (len(out), len(avec)))
    print("-> %s" % rapport)
    return 0


if __name__ == "__main__":
    sys.exit(main())
