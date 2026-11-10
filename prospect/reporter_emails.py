# -*- coding: utf-8 -*-
"""Reporte dans les CSV de section les emails trouves au tour global du
07/11/2026 (lecture approfondie des sites, annuaires des communes, pistes des
enquetes web). Ne touche qu'aux lignes sans email.

Entre plusieurs adresses d'une meme fiche, celle qui nomme la commune passe
devant (l'adresse "seiche@" pour une fiche de Noyal-Chatillon-sur-Seiche), puis l'ordre
de decouverte.

    python -m prospect.reporter_emails
"""
import csv
import io
import os
import re
import sqlite3
import unicodedata

from . import fiabiliser as FB

SOURCES = ("site, lecture approfondie%", "annuaire de la commune%", "site de l'entreprise (enquete web)%")


def _plat(s):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower())


def main():
    cx = sqlite3.connect(os.path.join(os.path.dirname(os.path.abspath(__file__)), "prospection.db"))
    neufs = {}
    for pat in SOURCES:
        for s, v, src, note in cx.execute("SELECT siret, valeur, source, note FROM valeur WHERE champ='email' "
                                          "AND source LIKE ? ORDER BY rowid", (pat,)):
            neufs.setdefault(s, []).append((v, src, note or ""))
    total = 0
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        rd = csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";")
        champs, lignes = rd.fieldnames, list(rd)
        n = 0
        for r in lignes:
            if "@" in (r.get("email") or "") or r.get("siret") not in neufs:
                continue
            commune = _plat(r.get("commune"))
            choix = sorted(neufs[r["siret"]], key=lambda x: not (commune and commune[-8:] in _plat(x[0].split("@")[0])
                                                                 or commune[:8] in _plat(x[0].split("@")[0])))
            v, src, note = choix[0]
            r["email"], r["email_source"] = v, src
            r["email_note"] = ("global 07/11/2026 ; " + note).strip(" ;")
            n += 1
        w = io.open(p, "w", encoding="utf-8-sig", newline="")
        cw = csv.DictWriter(w, fieldnames=champs, delimiter=";")
        cw.writeheader()
        cw.writerows(lignes)
        w.close()
        print("%-32s +%d" % (f, n))
        total += n
    print("total : %d lignes completees, %d fiches avec un nouvel email" % (total, len(neufs)))


if __name__ == "__main__":
    main()
