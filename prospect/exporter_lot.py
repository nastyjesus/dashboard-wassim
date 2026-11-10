# -*- coding: utf-8 -*-
"""Exporte un lot de metiers vers le CSV lu par le generateur de classeur.

La colonne `verif_metier` croise tous les rapports disponibles : pages
d'etablissement (rapports *_metiers.json de l'enquete web) puis activite
declaree au BODACC (rapports activite_*.json). Le plus fort l'emporte.

    python -m prospect.exporter_lot --metier a,b --vers data/prospection/x.csv
"""
import argparse
import csv
import glob
import io
import json
import os
import sys

from . import pipeline as P
from . import sources as S
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
CREUX = ("mise en activite", "mise en activité", "modification du pr")
COLS = ["metier", "note", "nom", "enseigne", "dirigeants", "adresse", "commune",
        "telephone", "email", "site_web", "verif_metier", "date_creation",
        "tranche_effectif", "telephone_source", "email_source", "email_note",
        "alerte", "siret", "fiche"]


def _charger_verdicts():
    pages, bod = {}, {}
    for p in glob.glob(os.path.join(RACINE, "cache", "*_metiers.json")):
        try:
            for k, v in json.load(io.open(p, encoding="utf-8")).items():
                if isinstance(v, dict) and (v.get("confirme") or v.get("autres")):
                    # Une confirmation l'emporte sur un simple doute venu
                    # d'un autre rapport (l'ordre des fichiers est arbitraire).
                    if k not in pages or (v.get("confirme") and not pages[k].get("confirme")):
                        pages[k] = v
        except (ValueError, AttributeError):
            continue
    for p in glob.glob(os.path.join(RACINE, "cache", "activite_*.json")):
        try:
            for x in json.load(io.open(p, encoding="utf-8")):
                if x.get("enonces"):
                    bod.setdefault(x["siret"], x)
        except (ValueError, TypeError):
            continue
    return pages, bod


def _verdict(siret, metier, pages, bod, voc, store):
    # Une source registre (RPPS, Chambre des notaires, liste des organismes de
    # formation) prime sur tout : elle est posee comme metier_reel en base.
    for v in store.concurrentes(siret, "metier_reel"):
        if v["confiance"] == "registre":
            return "CONFIRME par un registre : %s" % v["valeur"]
    # Verdict propre au couple (etablissement, metier) d'abord : une meme
    # entreprise peut figurer sous deux metiers (verifier_mailing).
    p = pages.get("%s|%s" % (siret, metier)) or pages.get(siret)
    if p and p.get("confirme"):
        s = "CONFIRME sur sa page : %s" % ", ".join(p["confirme"][:3])
        if p.get("autres"):
            s += " ; activite secondaire : %s" % ", ".join(p["autres"])
        return s
    if p and p.get("autres"):
        return "A VERIFIER : sa page parle de %s" % ", ".join(p["autres"])
    b = bod.get(siret)
    if b:
        att, autres = set(), set()
        for e in b["enonces"]:
            ind = __import__("prospect.fouille", fromlist=["indices"]).indices(
                e["texte"], metier, voc)
            att |= set(ind["mots_attendus"])
            autres |= set(ind["autres_metiers"])
        if att:
            return "CONFIRME par l activite declaree au BODACC : %s" % ", ".join(sorted(att)[:3])
        if autres:
            return "A RECLASSER : activite declaree = %s" % ", ".join(sorted(autres))
        t = b["enonces"][0]["texte"].replace("\n", " ").strip()
        if not any(c in t.lower() for c in CREUX):
            return "A VERIFIER : declare « %s »" % t[:64]
    return "aucune attestation : seul le code NAF"


def exporter(metiers, vers, hors_communes=None, seulement=None):
    from . import fouille as F
    voc = F.vocabulaire(P.REFERENTIEL)
    pages, bod = _charger_verdicts()
    ref = S.commune("35047")
    pt = (ref.get("mairie") or ref.get("centre") or {}).get("coordinates")
    lon, lat = pt if pt else (None, None)
    store = Store()
    res = P.qualifier(store, par_metier=9999, ref_lat=lat, ref_lon=lon)
    notes = {(f["siret"], m): f["note"] for m in metiers for f in res.get(m, {}).get("top", [])}

    lignes, vus = [], set()
    for m in metiers:
        for f in store.fiches(metier=[m]):
            if (f["siret"], m) in vus:
                continue
            if hors_communes and f["commune"].upper() in hors_communes:
                continue
            if seulement and f["commune"].upper() not in seulement:
                continue
            vus.add((f["siret"], m))
            lignes.append({
                "metier": m, "note": notes.get((f["siret"], m), ""), "nom": f["nom"],
                "enseigne": f["enseigne"], "dirigeants": f["dirigeants"] or "",
                "adresse": f["adresse"], "commune": f["commune"],
                "telephone": f["telephone"] or "", "email": f["email"] or "",
                "site_web": f["site_web"] or "",
                "verif_metier": _verdict(f["siret"], m, pages, bod, voc, store),
                "date_creation": f["date_creation"], "tranche_effectif": f["tranche_effectif"],
                "telephone_source": f.get("telephone_source") or "",
                "email_source": f.get("email_source") or "",
                "email_note": f.get("email_note") or "", "alerte": "",
                "siret": f["siret"],
                "fiche": "https://annuaire-entreprises.data.gouv.fr/entreprise/%s" % f["siren"],
            })
    lignes.sort(key=lambda r: (r["metier"], -float(r["note"] or 0), r["commune"], r["nom"]))
    with io.open(vers, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=COLS, delimiter=";")
        w.writeheader()
        w.writerows(lignes)
    return lignes


def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--metier", required=True)
    p.add_argument("--vers", required=True)
    p.add_argument("--hors-commune", default=None,
                   help="communes a exclure, en majuscules, separees par des virgules")
    p.add_argument("--seulement", default=None,
                   help="ne garder que ces communes, en majuscules, separees par des virgules")
    a = p.parse_args(argv)
    metiers = [x.strip() for x in a.metier.split(",") if x.strip()]
    hors = ({x.strip().upper() for x in a.hors_commune.split(",")}
            if a.hors_commune else None)
    seul = ({x.strip().upper() for x in a.seulement.split(",")}
            if a.seulement else None)
    lignes = exporter(metiers, a.vers, hors, seul)
    print("%-26s %6s %6s %6s" % ("metier", "fiches", "tel", "email"))
    tot = [0, 0, 0]
    for m in metiers:
        s = [r for r in lignes if r["metier"] == m]
        t = sum(1 for r in s if r["telephone"]); e = sum(1 for r in s if r["email"])
        tot[0] += len(s); tot[1] += t; tot[2] += e
        print("%-26s %6d %6d %6d" % (m, len(s), t, e))
    print("%-26s %6d %6d %6d" % ("TOTAL", *tot))
    return 0


if __name__ == "__main__":
    sys.exit(main())
