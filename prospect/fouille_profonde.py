# -*- coding: utf-8 -*-
"""Deuxieme passage, plus profond, sur les sites connus des fiches sans email.

Le premier passage (prospect.rendu) lisait l'accueil et trois pages. Celui-ci
suit jusqu'a huit pages du meme site (contact, devis, mentions legales,
a propos, equipe, agences, pied de page) et lit aussi les adresses
camouflees contre les robots : "contact [at] domaine.fr", "contact(arobase)
domaine.fr", "contact @ domaine . fr". Ces formes sont publiees par
l'entreprise elle-meme : les reconstituer n'est pas deviner.

Memes garde-fous que le reste du pipeline : adresse non factice, domaine en
rapport avec l'entreprise ou webmail (prospect.fiabiliser).

    python -m prospect.fouille_profonde [--max N]
"""
import argparse
import csv
import io
import os
import re
import sys
from urllib.parse import urljoin, urlparse

from . import fiabiliser as FB
from .store import Store

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
CAMOUFLE = re.compile(
    r"([A-Za-z0-9._%+-]{2,})\s*(?:\[\s*(?:at|arobase|@)\s*\]|\(\s*(?:at|arobase|@)\s*\)|\s(?:at|arobase)\s|\s@\s)\s*"
    r"([A-Za-z0-9-]{2,}(?:\s*(?:\[\s*(?:dot|point)\s*\]|\(\s*(?:dot|point)\s*\)|\.|\s\.\s)\s*[A-Za-z0-9-]{2,})+)", re.I)
TEL = re.compile(r"(?<!\d)0[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
LIEN = re.compile(r"contact|mention|legal|devis|a-propos|apropos|qui-sommes|qui-suis|about|equipe|agence|"
                  r"coordonn|nous-trouver|infos|rendez-vous|rdv|plan-d-acces|acces", re.I)


def _decamoufler(texte):
    out = set()
    for local, dom in CAMOUFLE.findall(texte):
        d = re.sub(r"\s*(?:\[\s*(?:dot|point)\s*\]|\(\s*(?:dot|point)\s*\)|\s\.\s)\s*", ".", dom, flags=re.I)
        d = re.sub(r"\s+", "", d)
        if "." in d:
            out.add(("%s@%s" % (local, d)).lower())
    return out


def _lire(pg, url):
    pg.goto(url, timeout=25000, wait_until="domcontentloaded")
    try:
        pg.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    h = pg.content()
    t = pg.inner_text("body") if pg.query_selector("body") else ""
    mails = set(m.lower() for m in EMAIL.findall(t))
    mails |= set(x[7:].split("?")[0].lower() for x in re.findall(r'href="(mailto:[^"]+)"', h, re.I))
    mails |= _decamoufler(t)
    return h, mails, set(TEL.findall(t))


def cibles(store):
    sirets = {}
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if (r.get("site_web") or "").strip() and "@" not in (r.get("email") or ""):
                    sirets[r["siret"]] = r["site_web"].strip()
    deja = {r["siret"] for r in store.cx.execute("SELECT siret FROM valeur WHERE champ='profond_tente'")}
    return [(s, u) for s, u in sirets.items() if s and s not in deja]


def main(argv=None):
    from playwright.sync_api import sync_playwright
    a = argparse.ArgumentParser()
    a.add_argument("--max", type=int, default=None)
    o = a.parse_args(argv)
    store = Store()
    liste = cibles(store)[:o.max] if o.max else cibles(store)
    print("%d sites a fouiller en profondeur" % len(liste), flush=True)
    gains = 0
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        ctx = nav.new_context(locale="fr-FR")
        for i, (siret, site) in enumerate(liste, 1):
            e = store.cx.execute("SELECT * FROM etablissement WHERE siret=?", (siret,)).fetchone()
            url = site if site.startswith("http") else "https://" + site
            hote = urlparse(url).netloc
            pg = ctx.new_page()
            vues, a_voir, mails, source = [], [url], set(), url
            try:
                while a_voir and len(vues) < 8:
                    u = a_voir.pop(0)
                    if u in vues:
                        continue
                    vues.append(u)
                    try:
                        h, m, _ = _lire(pg, u)
                    except Exception:
                        continue
                    if m and not mails:
                        source = u
                    mails |= m
                    for lien in re.findall(r'href="([^"#]+)"', h):
                        v = urljoin(u, lien).split("#")[0]
                        if urlparse(v).netloc == hote and LIEN.search(lien) and v not in vues and v not in a_voir:
                            a_voir.append(v)
            finally:
                pg.close()
            ligne = {"nom": e["nom"] if e else "", "enseigne": e["enseigne"] if e else "",
                     "dirigeants": e["dirigeants"] if e else "", "site_web": site}
            bons = [m for m in sorted(mails) if FB.SYNTAXE.match(m) and not FB.FACTICE.search(m)
                    and (m.split("@")[1] in FB.WEBMAILS or FB.DOMAINES_RESEAU.search(m.split("@")[1])
                         or FB._lien_entreprise(m.split("@")[1], ligne))]
            for m in bons[:2]:
                if store.poser_valeur(siret, "email", m, "site, lecture approfondie %s" % source, "site_officiel"):
                    gains += 1
            store.poser_valeur(siret, "profond_tente", "oui", "fouille profonde", "incertain",
                               "%d pages, %d emails lus, %d gardes" % (len(vues), len(mails), len(bons)))
            if i % 10 == 0:
                store.valider()
                print("  %d/%d  +%d emails" % (i, len(liste), gains), flush=True)
        nav.close()
    store.valider()
    print("termine : +%d emails" % gains)


if __name__ == "__main__":
    sys.exit(main())
