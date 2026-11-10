# -*- coding: utf-8 -*-
"""Consolide un rapport d'enquete web : contacts retenus et verdicts metier.

Ce bloc a ete recopie a la main a chaque lot. Cinq copies, c'est cinq
occasions de diverger : on le fige ici.

Regles appliquees, chacune nee d'un faux positif reel :
  - hote sterile ecarte (annuaires qui affichent LEUR numero, revendeurs de
    fichiers : app.dataprospects.fr revenait 47 fois) ;
  - la page doit situer l'entreprise - sa rue, sa commune, ou etre son propre
    domaine (sinon un homonyme des Cotes-d'Armor donnait son 02 96) ;
  - deux mots du nom, ou la rue, ou le domaine propre (un seul mot attribuait
    l'adresse d'une boutique a une entreprise homonyme) ;
  - le domaine d'un email doit partager un mot avec l'entreprise, sauf
    messagerie grand public (l'adresse d'un annuaire pour un electricien) ;
  - une coordonnee revendiquee par plusieurs entreprises n'appartient a
    aucune (09 72 20 06 77 etait donne a trois societes).

Le metier ne se lit que sur une page de l'etablissement : TripAdvisor
classait dix-huit restaurants en agences de voyages.

    python -m prospect.consolider --rapport tour_lot5.json --etiquette "lot 5"
"""
import argparse
import collections
import io
import json
import os
import re
import sys

from . import fouille as F
from . import matching as M
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))

EXCLUS = re.compile(
    r"dataprospects|compao\.fr|autour-de|travaux\.com|\.e-pro\.fr|mappy|planity|"
    r"118000|118712|kompass|yelp|pagesjaunes|northdata|habitatpresto|guide-|"
    r"kreamondo|starofservice|meilleur-artisan|lagazette|unboncoiffeur|"
    r"mafleuriste|obteniruncontact|trouver-ouvert|youtube\.com", re.I)
GRATUITES = re.compile(r"@(gmail|orange|wanadoo|free|hotmail|outlook|yahoo|"
                       r"laposte|sfr|bbox|icloud|live)\.", re.I)


def _mots(t):
    return {m for m in re.split(r"[^A-Za-z0-9]+", M.sans_accents(t or "").upper())
            if len(m) > 3 and m not in M.VIDES}


def consolider(rapport, etiquette, metiers=None):
    d = json.load(io.open(os.path.join(RACINE, "cache", rapport), encoding="utf-8"))
    if metiers:
        d = [x for x in d if x["metier"] in metiers]

    retenus, verdicts = {}, {}
    for x in d:
        attendus = _mots(x["nom"]) | _mots(x["enseigne"])
        mails, tels, src = set(), set(), []
        conf, autres = set(), {}
        for p in x["pistes"]:
            propre = F.site_propre(p["url"], x["nom"], x["enseigne"])
            if F.page_de_l_etablissement(p["url"], x["nom"], x["enseigne"],
                                         x.get("commune", "")):
                mi = p.get("metier") or {}
                conf |= set(mi.get("mots_attendus") or [])
                for a, mm in (mi.get("autres_metiers") or {}).items():
                    autres.setdefault(a, set()).update(mm)
            if EXCLUS.search(p["url"]) or not (p.get("ancre") or propre):
                continue
            pr = p["preuves"]
            if not (len(pr["mots_du_nom"]) >= 2 or pr["rue"] or propre):
                continue
            for e in p["emails"]:
                dom = _mots(e.split("@")[-1].rsplit(".", 1)[0])
                if GRATUITES.search(e) or (dom & attendus) or propre:
                    mails.add(e)
            tels |= set(p["telephones"])
            src.append(p["url"])
        if mails or tels:
            retenus[x["siret"]] = dict(x, emails=sorted(mails),
                                       telephones=sorted(tels), sources=src)
        verdicts[x["siret"]] = {
            "nom": x["nom"], "metier": x["metier"], "confirme": sorted(conf),
            "autres": {k: sorted(v) for k, v in sorted(autres.items())},
        }

    cm = collections.Counter(e for v in retenus.values() for e in v["emails"])
    ct = collections.Counter(y for v in retenus.values() for y in v["telephones"])
    partages = {k for k, n in list(cm.items()) + list(ct.items()) if n > 1}

    store = Store()
    connu = {f["siret"]: f for f in store.fiches()}
    chemin = os.path.join(RACINE, "apports.json")
    ap = json.load(io.open(chemin, encoding="utf-8"))
    vus = {x.get("siret") for x in ap["apports"] if x.get("siret")}
    ecrits = 0
    for siret, v in retenus.items():
        mm = [e for e in v["emails"] if e not in partages]
        tt = [y for y in v["telephones"] if y not in partages]
        f = connu.get(siret, {})
        tel = tt[0] if tt and not f.get("telephone") else ""
        mail = mm[0] if mm and not f.get("email") else ""
        if not (tel or mail) or siret in vus:
            continue
        ap["apports"].append({
            "siret": siret, "nom": v["nom"], "telephone": tel, "email": mail,
            "site_web": "", "metier_reel": "", "confiance": "web",
            "source": "enquete %s : %s" % (etiquette, v["sources"][0] if v["sources"] else "?"),
            "note": ("autres numeros : %s" % ", ".join(tt[1:])) if len(tt) > 1 else "",
        })
        ecrits += 1
    json.dump(ap, io.open(chemin, "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    sortie = os.path.join(RACINE, "cache", rapport.replace(".json", "_metiers.json"))
    json.dump(verdicts, io.open(sortie, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    return {"enquetees": len(d), "avec_contact": len(retenus),
            "apports": ecrits, "partages": len(partages)}


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--rapport", required=True)
    p.add_argument("--etiquette", required=True)
    p.add_argument("--metier", default=None)
    a = p.parse_args(argv)
    metiers = {x.strip() for x in a.metier.split(",")} if a.metier else None
    r = consolider(a.rapport, a.etiquette, metiers)
    print("%(enquetees)d enquetees, %(avec_contact)d avec contact, "
          "%(apports)d apports ecrits, %(partages)d coordonnees partagees ecartees" % r)
    return 0


if __name__ == "__main__":
    sys.exit(main())
