# -*- coding: utf-8 -*-
"""Bilan de la vague 2 pour l'onglet Synthese.

Compare les CSV de section, apres fiabilisation, a la photographie prise
avant la vague 2 (cache/vague2_base.json) :
- nouvelles fiches : SIRET (ou email, pour un notaire ou un avocat sans
  SIRET) absent de la photographie, pour ce metier ;
- fiches completees : fiche deja presente, sans email avant, avec un email
  maintenant ;
- emails OK : emails au statut OK qui n'etaient pas dans la photographie.

    python -m prospect.synthese_vague2
"""
import csv
import io
import json
import os

RACINE = os.path.dirname(os.path.abspath(__file__))
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")
SECTIONS = ["bruz_entreprises_actuelles.csv", "bruz_lot2.csv", "zone_sud.csv", "bruz_lot4.csv",
            "demandes_membres.csv"]
METIERS = [("notaire", "Notaire"), ("assureur-iard", "Assurance IARD"), ("electricien", "Électricien"),
           ("plombier-chauffagiste", "Plombier-chauffagiste"), ("pilotage-tpe", "Pilotage TPE"),
           ("avocat-fiscaliste", "Avocat fiscaliste"), ("avocat-famille", "Avocat famille")]


def main():
    base = json.load(io.open(os.path.join(RACINE, "cache", "vague2_base.json"), encoding="utf-8"))
    emails_avant = set(base["emails"])
    avant = {}
    for m, rows in base["par_metier"].items():
        for siret, email, _ in rows:
            cle = siret or email
            avant.setdefault(m, {})[cle] = email
    bilan = []
    for cle_m, lib in METIERS:
        nouvelles, completees, ok, vus = 0, 0, 0, set()
        for f in SECTIONS:
            p = os.path.join(DONNEES, f)
            if not os.path.exists(p):
                continue
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if r["metier"] != cle_m:
                    continue
                cle = r.get("siret") or (r.get("email") or "").lower()
                if not cle or cle in vus:
                    continue
                vus.add(cle)
                e = (r.get("email") or "").lower()
                if cle not in avant.get(cle_m, {}):
                    nouvelles += 1
                elif e and not avant[cle_m][cle]:
                    completees += 1
                if e and e not in emails_avant and r.get("statut_mailing") == "OK":
                    ok += 1
        bilan.append({"metier": lib, "nouvelles": nouvelles, "completees": completees, "emails_ok": ok})
    io.open(os.path.join(RACINE, "cache", "vague2_synthese.json"), "w", encoding="utf-8").write(
        json.dumps(bilan, ensure_ascii=False, indent=1))
    for b in bilan:
        print("  %-22s nouvelles %3d   completees %3d   emails OK %3d" % (
            b["metier"], b["nouvelles"], b["completees"], b["emails_ok"]))


if __name__ == "__main__":
    main()
