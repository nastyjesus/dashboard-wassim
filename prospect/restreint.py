# -*- coding: utf-8 -*-
"""Lance une commande du CLI sur une liste de fiches seulement.

La file d'enrichissement (`enrich`) prend toutes les fiches de la base sans
coordonnees. Apres une extraction large (vague 8 : 14 000 etablissements a
25 km), on n'enrichit que les candidats gardes : la liste des SIRET est lue
dans un fichier du cache ([{"siret": ...}, ...]).

    python -m prospect.restreint v8_enquete.json enrich --source domaine --max 300
"""
import io
import json
import os
import sys

from . import store as S

RACINE = os.path.dirname(os.path.abspath(__file__))


def main():
    fichier, reste = sys.argv[1], sys.argv[2:]
    p = fichier if os.path.isabs(fichier) else os.path.join(RACINE, "cache", fichier)
    garde = {x["siret"] if isinstance(x, dict) else x for x in json.load(io.open(p, encoding="utf-8"))}
    origine = S.Store.fiches

    def fiches(self, *a, **k):
        return [f for f in origine(self, *a, **k) if f["siret"] in garde]

    S.Store.fiches = fiches
    if reste[0] == "module":                 # python -m prospect.restreint f.json module prospect.rge [args]
        import runpy
        sys.argv = [reste[1]] + reste[2:]
        runpy.run_module(reste[1], run_name="__main__")
        return 0
    from . import cli
    sys.argv = ["prospect"] + reste
    return cli.main()


if __name__ == "__main__":
    sys.exit(main())
