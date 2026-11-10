# -*- coding: utf-8 -*-
"""Donne au lot 1 la colonne de verification que les autres lots ont deja.

Le lot 1 a ete verifie a la main, mais le resultat est reste enfoui dans les
colonnes `telephone_source`, `email_source` et `alerte`. Une information qui
ne se lit pas ne sert a rien : on la remonte en clair.

Trois temoins, par ordre de force :
  1. un registre metier (RPPS, Ameli, Chambre des notaires) - le plus fort,
     c'est lui qui avait demasque les cinq faux osteopathes ;
  2. l'activite declaree au BODACC ;
  3. le nom lui-meme, quand il porte le metier.

    python -m prospect.verif_lot1
"""
import csv
import io
import os
import re
import sys

from . import activite_bodacc as A
from . import fouille as F
from . import pipeline as P

CSV = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "data", "prospection", "bruz_entreprises_actuelles.csv")
REGISTRE = re.compile(r"RPPS|Ameli|notaires\.fr|Chambre des notaires", re.I)
CREUX = ("mise en activite", "mise en activité", "modification du pr")


def main(argv=None):
    voc = F.vocabulaire(P.REFERENTIEL)
    with io.open(CSV, encoding="utf-8-sig", newline="") as fh:
        lecteur = csv.DictReader(fh, delimiter=";")
        cols = list(lecteur.fieldnames)
        lignes = list(lecteur)
    if "verif_metier" not in cols:
        cols.insert(cols.index("site_web") + 1, "verif_metier")

    compte = {}
    for i, x in enumerate(lignes, 1):
        src = "%s %s" % (x.get("telephone_source", ""), x.get("email_source", ""))
        verdict = ""
        if x.get("alerte"):
            verdict = "ALERTE : %s" % x["alerte"][:70]
        elif REGISTRE.search(src):
            quel = re.search(r"RPPS|Ameli|Chambre des notaires|notaires\.fr", src, re.I)
            verdict = "CONFIRME par un registre metier (%s)" % quel.group(0)
        else:
            try:
                textes = A.enonces(x["siret"][:9])
            except Exception as e:
                print("  ERREUR %s : %s" % (x["nom"][:34], e), file=sys.stderr)
                textes = []
            att = set()
            for _, t in textes:
                att |= set(F.indices(t, x["metier"], voc)["mots_attendus"])
            if att:
                verdict = ("CONFIRME par l activite declaree au BODACC : %s"
                           % ", ".join(sorted(att)[:3]))
            elif textes and not any(c in textes[0][1].lower() for c in CREUX):
                verdict = "A VERIFIER : declare « %s »" % textes[0][1].replace("\n", " ")[:62]
            else:
                # Dernier recours : le nom porte-t-il le metier ?
                nom = "%s %s" % (x["nom"], x.get("enseigne", ""))
                if F.indices(nom, x["metier"], voc)["mots_attendus"]:
                    verdict = "le nom commercial porte le metier"
                else:
                    verdict = "aucune attestation : seul le code NAF"
        x["verif_metier"] = verdict
        compte[verdict.split(" :")[0].split(" (")[0]] = \
            compte.get(verdict.split(" :")[0].split(" (")[0], 0) + 1
        if i % 20 == 0:
            print("%d/%d" % (i, len(lignes)), flush=True)

    with io.open(CSV, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols, delimiter=";")
        w.writeheader()
        w.writerows(lignes)

    print("\n%d fiches" % len(lignes))
    for k, n in sorted(compte.items(), key=lambda x: -x[1]):
        print("  %3d  %s" % (n, k))
    return 0


if __name__ == "__main__":
    sys.exit(main())
