# -*- coding: utf-8 -*-
"""Enquete les fiches du lot 2 sans contact, et ecrit un rapport relisable.

Rien n'est pose en base ici. Le script produit un JSON de pistes, chacune
avec sa page et ses preuves, pour qu'un humain valide avant d'ecrire. C'est
la lecon des faux positifs OSM du lot 1 : une coordonnee non corroboree
pollue la liste plus qu'une case vide.

    python -m prospect.enqueter_lot2 [--max N] [--metier a,b]
"""
import argparse
import io
import json
import os
import sys
import time

from . import fouille as F
from .store import Store

LOT2 = ["plombier-chauffagiste", "electricien", "photographe", "videaste",
        "peintre-batiment", "opticien", "caviste", "fleuriste", "estheticienne",
        "coiffeur", "restaurateur", "traiteur", "concessionnaire-auto",
        "menage-proprete", "salle-sport", "coach-sportif"]

RACINE = os.path.dirname(os.path.abspath(__file__))
RAPPORT = os.path.join(RACINE, "cache", "enquete_lot2.json")


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=None)
    p.add_argument("--metier", default=None)
    a = p.parse_args(argv)

    metiers = [x.strip() for x in a.metier.split(",")] if a.metier else LOT2
    store = Store()

    cibles = []
    for m in metiers:
        for f in store.fiches(metier=[m]):
            if f["commune"] != "BRUZ":
                continue
            if f["telephone"] or f["email"]:
                continue
            f["_metier"] = m
            cibles.append(f)
    # Une fiche candidate a deux metiers ne s'enquete qu'une fois.
    vus, uniques = set(), []
    for f in cibles:
        if f["siret"] in vus:
            continue
        vus.add(f["siret"])
        uniques.append(f)
    if a.max:
        uniques = uniques[:a.max]

    deja = {}
    if os.path.exists(RAPPORT):
        try:
            deja = {x["siret"]: x for x in json.load(io.open(RAPPORT, encoding="utf-8"))}
        except ValueError:
            deja = {}

    out = list(deja.values())
    debut = time.time()
    for i, f in enumerate(uniques, 1):
        if f["siret"] in deja:
            continue
        try:
            pistes = F.enqueter(f, maximum=3)
        except Exception as e:                     # une fiche ne fait pas tomber le lot
            pistes = []
            print("  ERREUR %s : %s" % (f["nom"][:40], e), file=sys.stderr)
        out.append({
            "siret": f["siret"], "metier": f["_metier"], "nom": f["nom"],
            "enseigne": f["enseigne"], "adresse": f["adresse"],
            "dirigeants": f["dirigeants"], "pistes": pistes,
        })
        json.dump(out, io.open(RAPPORT, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        if i % 10 == 0:
            ecoule = time.time() - debut
            print("%d/%d fiches, %.0f s, %d avec piste"
                  % (i, len(uniques), ecoule,
                     sum(1 for x in out if x["pistes"])), flush=True)

    trouves = sum(1 for x in out if any(p["corrobore"] for p in x["pistes"]))
    print("\n%d fiches enquetees, %d avec au moins une piste corroboree"
          % (len(out), trouves))
    print("-> %s" % RAPPORT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
