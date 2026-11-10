# -*- coding: utf-8 -*-
"""Lit les sites qui ne s'affichent qu'en JavaScript (Wix, Squarespace, SPA).

curl recoit une coquille vide de ces sites : l'email existe pour un visiteur
mais pas pour le scraper. Un Chromium sans tete (Playwright) rend la page
comme un navigateur, puis on lit :
- les liens mailto: et tel:,
- le texte rendu,
- les emails masques par Cloudflare (attribut data-cfemail, chiffrement XOR
  documente).
On suit au plus trois liens contact / mentions legales / a propos du meme
domaine.

Seuls les sites deja attribues a la fiche (site_web en base, valide par les
regles de site_propre) sont visites. Un email n'est garde que s'il passe les
controles de prospect.fiabiliser : pas factice, et domaine en rapport avec
l'entreprise ou webmail.

    python -m prospect.rendu [--max N]
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
TEL = re.compile(r"(?<!\d)0[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
LIEN = re.compile(r"contact|mention|legal|a-propos|apropos|qui-sommes|about|equipe|agence|"
                  r"coordonn|nous-trouver|infos", re.I)


def _cf(code):
    """Decode un email protege par Cloudflare (data-cfemail)."""
    try:
        k = int(code[:2], 16)
        return "".join(chr(int(code[i:i + 2], 16) ^ k) for i in range(2, len(code), 2))
    except ValueError:
        return ""


def lire(page, url):
    """Emails et telephones d'une page rendue, plus ses liens utiles."""
    page.goto(url, timeout=25000, wait_until="domcontentloaded")
    try:
        page.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    html = page.content()
    texte = page.inner_text("body") if page.query_selector("body") else ""
    mails = set(m.lower() for m in EMAIL.findall(texte))
    mails |= set(h[7:].split("?")[0].lower() for h in re.findall(r'href="(mailto:[^"]+)"', html, re.I))
    mails |= set(_cf(c).lower() for c in re.findall(r'data-cfemail="([0-9a-f]+)"', html))
    tels = set(TEL.findall(texte))
    tels |= set(re.sub(r"^\+33", "0", t.replace("tel:", "").replace("%20", " ")).strip()
                for t in re.findall(r'href="(tel:[^"]+)"', html, re.I))
    hote = urlparse(url).netloc
    liens = []
    for a in page.query_selector_all("a[href]"):
        try:
            h = a.get_attribute("href") or ""
            t = (a.inner_text() or "")[:60]
        except Exception:
            continue
        u = urljoin(url, h)
        if urlparse(u).netloc == hote and (LIEN.search(h) or LIEN.search(t)) and u not in liens:
            liens.append(u.split("#")[0])
    return {m for m in mails if m and "@" in m}, tels, liens[:3]


def cibles(store):
    """Fiches des sections du Sheet qui ont un site mais pas d'email."""
    sirets = set()
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if (r.get("site_web") or "").strip() and "@" not in (r.get("email") or ""):
                    sirets.add(r.get("siret"))
    deja = {r["siret"] for r in store.cx.execute(
        "SELECT siret FROM valeur WHERE champ='rendu_tente'")}
    out = []
    for s in sirets - deja:
        e = store.cx.execute("SELECT * FROM etablissement WHERE siret=?", (s,)).fetchone()
        site = store.meilleure(s, "site_web")
        if e and site:
            out.append((dict(e), site["valeur"]))
    return out


def main(argv=None):
    from playwright.sync_api import sync_playwright
    p = argparse.ArgumentParser()
    p.add_argument("--max", type=int, default=None)
    a = p.parse_args(argv)
    store = Store()
    liste = cibles(store)[:a.max] if a.max else cibles(store)
    print("%d sites a rendre" % len(liste), flush=True)
    gains_m, gains_t = 0, 0
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        ctx = nav.new_context(locale="fr-FR", user_agent=(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"))
        for i, (e, site) in enumerate(liste, 1):
            page = ctx.new_page()
            mails, tels, vues = set(), set(), []
            try:
                url = site if site.startswith("http") else "https://" + site
                m, t, liens = lire(page, url)
                mails |= m; tels |= t; vues.append(url)
                for u in liens:
                    if mails:
                        break
                    try:
                        m, t, _ = lire(page, u)
                        mails |= m; tels |= t; vues.append(u)
                    except Exception:
                        continue
            except Exception as ex:
                vues.append("echec : %s" % str(ex)[:60])
            finally:
                page.close()
            ligne = {"nom": e["nom"], "enseigne": e["enseigne"], "dirigeants": e["dirigeants"],
                     "site_web": site}
            bons = []
            for m in sorted(mails):
                dom = m.split("@", 1)[1]
                if not FB.SYNTAXE.match(m) or FB.FACTICE.search(m):
                    continue
                if dom in FB.WEBMAILS or FB.DOMAINES_RESEAU.search(dom) or FB._lien_entreprise(dom, ligne):
                    bons.append(m)
            source = "page rendue (JS) %s" % (vues[-1] if vues else site)
            for m in bons[:2]:
                if store.poser_valeur(e["siret"], "email", m, source, "site_officiel"):
                    gains_m += 1
            if tels and not store.meilleure(e["siret"], "telephone"):
                store.poser_valeur(e["siret"], "telephone", sorted(tels)[0], source, "site_officiel")
                gains_t += 1
            store.poser_valeur(e["siret"], "rendu_tente", "oui", "rendu", "incertain",
                               "%d email(s) lus, %d gardes" % (len(mails), len(bons)))
            if i % 10 == 0:
                store.valider()
                print("  %d/%d  +%d emails  +%d tel" % (i, len(liste), gains_m, gains_t), flush=True)
        nav.close()
    store.valider()
    print("termine : +%d emails, +%d telephones" % (gains_m, gains_t))


if __name__ == "__main__":
    sys.exit(main())
