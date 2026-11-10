# -*- coding: utf-8 -*-
"""Second tour sur TOUT le lot 2 : coordonnees manquantes + verification du metier.

Les memes pages servent aux deux : celle qui donne un telephone dit aussi ce
que l'entreprise fait. Une seule visite, deux reponses.

On repasse sur les 266 fiches, pas seulement sur celles sans contact : une
fiche deja jointe par telephone peut livrer son email, et son metier reste
a confirmer.

    python -m prospect.tour2_lot2 [--max N] [--metier a,b] [--commune BRUZ,VERN]
                                  [--rapport nom.json]
"""
import argparse
import io
import json
import os
import sys
import time

from . import fouille as F
from . import pipeline as P
from .store import Store

LOT2 = ["plombier-chauffagiste", "electricien", "photographe", "videaste",
        "peintre-batiment", "opticien", "caviste", "fleuriste", "estheticienne",
        "coiffeur", "restaurateur", "traiteur", "concessionnaire-auto",
        "menage-proprete", "salle-sport", "coach-sportif"]

RACINE = os.path.dirname(os.path.abspath(__file__))
RAPPORT = os.path.join(RACINE, "cache", "tour2_lot2.json")

# Plusieurs formulations pour la meme fiche : le nom commercial seul, puis le
# nom avec le metier. La seconde ramene les annuaires quand la premiere ne
# donne rien, et confirme le metier quand elle donne quelque chose.
def _requetes(f, libelle):
    nom = f.get("enseigne") or f.get("nom", "")
    base = [("%s %s" % (nom, f.get("commune", ""))).strip()]
    if libelle:
        base.append(("%s %s %s" % (nom, libelle, f.get("commune", ""))).strip())
    if f.get("enseigne") and f.get("nom") and f["enseigne"] != f["nom"]:
        base.append(("%s %s" % (f["nom"], f.get("commune", ""))).strip())
    return base


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=None)
    p.add_argument("--metier", default=None)
    p.add_argument("--commune", default="BRUZ",
                   help="libelles en majuscules separes par des virgules, ou "
                        "TOUTES pour ne pas filtrer sur la commune")
    p.add_argument("--sirets", default=None,
                   help="fichier JSON (cache) listant les SIRET a enqueter, metier par metier : "
                        "pour un perimetre qu'aucune commune ne decrit (quartiers de Rennes)")
    p.add_argument("--rapport", default="tour2_lot2.json",
                   help="nom du fichier de rapport dans prospect/cache")
    a = p.parse_args(argv)
    rapport = os.path.join(RACINE, "cache", a.rapport)
    communes = {x.strip().upper() for x in a.commune.split(",") if x.strip()}
    # Un metier cherche dans un rayon s'etend sur 39 communes : les enumerer
    # a la main invite l'oubli. TOUTES laisse passer tout ce que la base porte
    # pour les metiers demandes, le perimetre ayant deja ete fixe a l'extraction.
    TOUTES = "TOUTES" in communes

    metiers = [x.strip() for x in a.metier.split(",")] if a.metier else LOT2
    voc = F.vocabulaire(P.REFERENTIEL)
    store = Store()

    liste = None
    if a.sirets:
        liste = {x["siret"] for x in json.load(io.open(os.path.join(RACINE, "cache", a.sirets), encoding="utf-8"))
                 if x.get("metier") in metiers}
    cibles, vus = [], set()
    for m in metiers:
        for f in store.fiches(metier=[m]):
            if liste is not None:
                if f["siret"] not in liste or f["siret"] in vus:
                    continue
            elif (not TOUTES and f["commune"].upper() not in communes) or f["siret"] in vus:
                continue
            vus.add(f["siret"])
            f["_metier"] = m
            cibles.append(f)
    if a.max:
        cibles = cibles[:a.max]

    deja = {}
    if os.path.exists(rapport):
        try:
            deja = {x["siret"]: x for x in json.load(io.open(rapport, encoding="utf-8"))}
        except ValueError:
            deja = {}

    out = list(deja.values())
    debut = time.time()
    for i, f in enumerate(cibles, 1):
        if f["siret"] in deja:
            continue
        libelle = (P.REFERENTIEL.get(f["_metier"], {}) or {}).get("libelle", "")
        pistes, vues = [], set()
        for requete in _requetes(f, libelle):
            try:
                for piste in F.enqueter(f, maximum=2, requete=requete,
                                        metier=f["_metier"], voc=voc):
                    if piste["url"] in vues:
                        continue
                    vues.add(piste["url"])
                    pistes.append(piste)
            except F.MoteurFerme as e:
                # On arrete tout : continuer produirait des "sans resultat"
                # qui n'en sont pas, et le rapport passerait pour un constat.
                print("\nARRET : %s" % e, file=sys.stderr)
                print("%d fiches traitees, les suivantes ne sont PAS enquetees."
                      % (i - 1), file=sys.stderr)
                json.dump(out, io.open(rapport, "w", encoding="utf-8"),
                          ensure_ascii=False, indent=1)
                return 2
            except Exception as e:
                print("  ERREUR %s : %s" % (f["nom"][:36], e), file=sys.stderr)
            if len(pistes) >= 4:
                break

        out.append({
            "siret": f["siret"], "metier": f["_metier"], "nom": f["nom"],
            "enseigne": f["enseigne"], "adresse": f["adresse"],
            "commune": f["commune"],
            "telephone_connu": f["telephone"] or "", "email_connu": f["email"] or "",
            "pistes": pistes,
        })
        json.dump(out, io.open(rapport, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        if i % 20 == 0:
            print("%d/%d, %.0f s" % (i, len(cibles), time.time() - debut), flush=True)

    print("\n%d fiches, %d avec au moins une piste" % (
        len(out), sum(1 for x in out if x["pistes"])))
    print("-> %s" % rapport)
    return 0


if __name__ == "__main__":
    sys.exit(main())
