# -*- coding: utf-8 -*-
"""Pilotage TPE/PME : coachs de dirigeants, DAF/DG a temps partage,
consultants en strategie pour petites entreprises.

Aucun code NAF ne les isole : ils sont en 70.22Z (conseil), 70.10Z, 85.59A
ou 74.90B, melanges a des centaines de consultants d'autres specialites.
Le metier se lit donc sur le site : une fiche n'est retenue que si sa page
emploie une formule propre au pilotage d'entreprise. "Strategie" ou
"accompagnement" seuls ne suffisent pas (trop generiques).

    python -m prospect.pilotage
"""
import csv
import io
import json
import os
import re
import unicodedata

from . import fouille as F
from . import sources as S
from .prive_cfg import prive

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "pilotage.json")
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")

FORMULES = [
    r"daf (a|en) temps partag", r"directeur administratif et financier (a|en) temps partag",
    r"dg (a|en) temps partag", r"direction generale (a|en) temps partag",
    r"(daf|directeur financier|dg|direction financiere) externalis", r"temps partage",
    r"coach(ing)? (de|des|pour) dirigeant", r"accompagnement (de|des) dirigeant",
    r"accompagne(r|ment)? les dirigeants", r"business coach", r"coach(ing)? d.entreprise",
    r"pilotage (de|d.)(votre|l.)? ?entreprise", r"tableaux? de bord", r"strategie (de|d.)(votre )?(tpe|pme)",
    r"(tpe|pme)[ -]?(et|/)? ?(tpe|pme)?", r"entrepreneurs?", r"croissance de (votre|l.)entreprise",
]
FORTES = FORMULES[:12]          # une seule suffit
EXCLUS = re.compile(prive("pilotage", "exclus", r"(?!)"), re.I)    # exclusions de la mission (prospect/prive)
REQUETES = ["DAF temps partagé Rennes", "DAF à temps partagé Bruz", "DG temps partagé Rennes",
            "coach dirigeant Rennes", "coach de dirigeants Bruz", "accompagnement dirigeants TPE Rennes",
            "consultant stratégie TPE PME Rennes", "business coach Rennes", "direction financière externalisée Rennes",
            "coach entrepreneur Rennes sud", "accompagnement entrepreneurs Bruz", "pilotage PME Rennes consultant"]


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def qualifier(texte):
    t = _plat(texte)
    fortes = sorted({f for f in FORTES if re.search(f, t)})
    faibles = sorted({f for f in FORMULES[12:] if re.search(f, t)})
    return fortes, faibles


def main():
    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {"sites": {}, "web": {}}
    # 1. Les cabinets de conseil deja en base, lus sur leur site.
    p = os.path.join(DONNEES, "bruz_lot4.csv")
    for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
        if r["metier"] != "conseil-management" or not r["site_web"] or r["siret"] in cache["sites"]:
            continue
        html = S._curl(r["site_web"] if r["site_web"].startswith("http") else "https://" + r["site_web"], timeout=25) or ""
        fortes, faibles = qualifier(F._texte(html))
        cache["sites"][r["siret"]] = {"nom": r["nom"], "site": r["site_web"], "fortes": fortes, "faibles": faibles}
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(cache, ensure_ascii=False))
    # 2. Recherche web ciblee.
    for q in REQUETES:
        if q in cache["web"]:
            continue
        try:
            cache["web"][q] = F.chercher(q, 10, essais=2)
        except F.MoteurFerme:
            print("moteur ferme, arret de la recherche web")
            break
        io.open(CACHE, "w", encoding="utf-8").write(json.dumps(cache, ensure_ascii=False))
    n = sum(1 for v in cache["sites"].values() if v["fortes"])
    print("%d sites de conseil lus, %d avec une formule de pilotage" % (len(cache["sites"]), n))
    print("%d requetes web" % len(cache["web"]))


if __name__ == "__main__":
    main()
