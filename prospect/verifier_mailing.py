# -*- coding: utf-8 -*-
"""Verifie le metier des fiches qui ont un email mais pas de metier confirme.

Avant un mailing, une fiche "seul le code NAF" est un risque : on ecrirait
a un electricien pour lui parler de son metier de plombier. Pour chacune :

1. Le site de l'entreprise : site_web, ou a defaut le domaine de son email
   quand ce n'est pas un webmail. Lu par curl, et par un Chromium sans tete
   si curl ne recoit qu'une coquille JavaScript.
2. A defaut de site, l'activite declaree au BODACC.

Les verdicts sont ecrits aux formats que lit exporter_lot :
cache/verif_mailing_metiers.json (pages) et cache/activite_mailing.json
(BODACC). Rien n'est decide ici : exporter_lot en tire la colonne
verif_metier.

    python -m prospect.verifier_mailing
"""
import csv
import io
import json
import os
import re

from . import activite_bodacc as AB
from . import fiabiliser as FB
from . import fouille as F
from . import pipeline as P
from . import sources as S

RACINE = os.path.dirname(os.path.abspath(__file__))
PAGES = os.path.join(RACINE, "cache", "verif_mailing_metiers.json")
BODACC = os.path.join(RACINE, "cache", "activite_mailing.json")


def _a_verifier():
    vus, out = set(), []
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        if not os.path.exists(p):
            continue
        for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
            if "@" not in (r.get("email") or "") or not r.get("siret"):
                continue
            if (r.get("verif_metier") or "").upper().startswith("CONFIRME"):
                continue
            cle = (r["siret"], r["metier"])
            if cle not in vus and r["metier"] != "nominatif":
                vus.add(cle)
                out.append(r)
    return out


def _url(r):
    site = (r.get("site_web") or "").strip()
    if site:
        return site if site.startswith("http") else "https://" + site
    dom = r["email"].split("@", 1)[1].lower()
    if dom in FB.WEBMAILS or FB.DOMAINES_RESEAU.search(dom):
        return ""
    return "https://" + dom


def main():
    voc = F.vocabulaire(P.REFERENTIEL)
    pages = FB._charger(PAGES, {})
    bod = {x["siret"]: x for x in FB._charger(BODACC, [])}
    liste = _a_verifier()
    print("%d fiches avec email a verifier" % len(liste), flush=True)
    nav = ctx = pw = None
    bilan = {"site": 0, "bodacc": 0, "rien": 0}
    for i, r in enumerate(liste, 1):
        s, m = r["siret"], r["metier"]
        cle = "%s|%s" % (s, m)
        if cle in pages or s in bod:
            continue
        url, texte = _url(r), ""
        if url:
            html = S._curl(url, timeout=25) or ""
            texte = F._texte(html)
            if len(texte) < 400:
                # Coquille JavaScript : rendu par un vrai navigateur.
                try:
                    if nav is None:
                        from playwright.sync_api import sync_playwright
                        pw = sync_playwright().start()
                        nav = pw.chromium.launch(headless=True)
                        ctx = nav.new_context(locale="fr-FR")
                    pg = ctx.new_page()
                    pg.goto(url, timeout=25000, wait_until="domcontentloaded")
                    try:
                        pg.wait_for_load_state("networkidle", timeout=8000)
                    except Exception:
                        pass
                    texte = pg.inner_text("body")
                    pg.close()
                except Exception:
                    pass
        if len(texte) >= 200:
            ind = F.indices(texte, m, voc)
            pages[cle] = {"confirme": ind["mots_attendus"][:5],
                          "autres": sorted(ind["autres_metiers"]), "url": url}
            bilan["site"] += 1
        else:
            en = AB.enonces(s[:9])
            bod[s] = {"siret": s, "enonces": [{"date": d, "texte": t} for d, t in en]}
            bilan["bodacc" if en else "rien"] += 1
        if i % 25 == 0:
            FB._sauver(PAGES, pages)
            FB._sauver(BODACC, list(bod.values()))
            print("  %d/%d  %s" % (i, len(liste), bilan), flush=True)
    FB._sauver(PAGES, pages)
    FB._sauver(BODACC, list(bod.values()))
    if nav:
        nav.close()
        pw.stop()
    print("termine : %s" % bilan)


if __name__ == "__main__":
    main()
