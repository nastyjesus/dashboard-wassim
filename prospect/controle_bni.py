# -*- coding: utf-8 -*-
"""Cherche une trace d'appartenance a BNI pour chaque fiche joignable d'une vague.

Les listes de membres des chapitres ne sont pas publiques (bni.bzh redirige
vers l'accueil). On cherche donc "<nom> BNI" sur le web : un resultat dont le
titre ou l'adresse contient BNI et tous les mots du nom est une trace a
verifier. Ce n'est pas une preuve, c'est un signal : la fiche reste visible,
marquee EXCLURE avec le lien (prospect.vague5.exporter).

Reprend ou il s'est arrete : les fiches deja controlees sont en cache.

    python -m prospect.controle_bni vague6        # sort 2 si le moteur ferme
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata

from . import fouille as F

RACINE = os.path.dirname(os.path.abspath(__file__))
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")
VIDES = {"sarl", "sas", "eurl", "sasu", "ste", "societe", "entreprise", "les", "des", "et"}


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def main(vague):
    prefixe = "v" + re.sub(r"^vague", "", vague)   # vague6 -> v6, vague6b -> v6b
    p = os.path.join(RACINE, "cache", prefixe + "_bni.json")
    res = json.load(io.open(p, encoding="utf-8")) if os.path.exists(p) else {}
    lignes = [r for r in csv.DictReader(io.open(os.path.join(DONNEES, vague + ".csv"), encoding="utf-8-sig"),
                                        delimiter=";") if r["email"] or r["telephone"]]
    code = 0
    for i, r in enumerate(lignes, 1):
        if r["siret"] in res:
            continue
        nom = re.sub(r"\s*\(.*?\)", "", r["nom"]).strip()
        try:
            out = F.chercher('"%s" BNI' % nom, 8, essais=2)
        except F.MoteurFerme:
            print("ARRET : moteur ferme apres %d fiches" % i, flush=True)
            code = 2
            break
        mots = [t for t in re.split(r"[^a-z0-9]+", _plat(nom)) if len(t) >= 3 and t not in VIDES]
        traces = [x.get("url", "") for x in out
                  if "bni" in _plat((x.get("titre") or "") + " " + x.get("url", ""))
                  and mots and all(m in _plat((x.get("titre") or "") + " " + x.get("url", "")) for m in mots)]
        res[r["siret"]] = traces
        if traces:
            print("  trace : %s %s" % (nom, traces[0]), flush=True)
        if i % 25 == 0:
            io.open(p, "w", encoding="utf-8").write(json.dumps(res, ensure_ascii=False))
    io.open(p, "w", encoding="utf-8").write(json.dumps(res, ensure_ascii=False))
    print("%d/%d fiches controlees, %d traces" % (len(res), len(lignes), sum(1 for v in res.values() if v)))
    return code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
