# -*- coding: utf-8 -*-
"""Portails d'agences des compagnies : ou les agents generaux publient leur email.

AXA (agence.axa.fr) et Allianz (agence.allianz.fr) publient pour chaque
agence l'adresse de sa boite aux lettres sur le domaine de la compagnie
(agence.xxx@axa.fr, 1234567@agents.allianz.fr). C'est la boite que l'agent
releve : pour la mission, un email du domaine, statut OK.
Generali et MMA n'ont qu'un formulaire : rien a recuperer, on le dit.

    python -m prospect.assureurs_portails
"""
import io
import json
import os
import re
import unicodedata

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "assureurs_portails.json")

COMMUNES = {"bruz": "35170", "chartres-de-bretagne": "35131", "saint-jacques-de-la-lande": "35136",
            "pont-pean": "35131", "laille": "35890", "orgeres": "35230",
            "noyal-chatillon-sur-seiche": "35230", "vern-sur-seiche": "35770", "guichen": "35580",
            "goven": "35580", "le-rheu": "35650", "bourgbarre": "35230", "saint-erblon": "35230"}
EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
TEL = re.compile(r"(?<!\d)0[1-9](?:[ .]?\d{2}){4}(?!\d)")


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _rendre(pg, url):
    pg.goto(url, timeout=40000, wait_until="domcontentloaded")
    try:
        pg.wait_for_load_state("networkidle", timeout=10000)
    except Exception:
        pass
    return pg.content(), pg.inner_text("body")


def _fiche(pg, url, compagnie):
    h, t = _rendre(pg, url)
    mails = sorted(set(m.lower() for m in EMAIL.findall(t)) |
                   set(m.lower() for m in re.findall(r'mailto:([^"?]+)', h)))
    mails = [m for m in mails if compagnie in m.split("@")[1]]
    titre = re.search(r"<h1[^>]*>(.*?)</h1>", h, re.S)
    titre = re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", titre.group(1))).strip() if titre else ""
    adr = re.search(r"(\d{1,4}[^\n]{3,80}\n?\s*\d{5}\s+[A-ZÉÈa-zé' \-]+)", t)
    return {"url": url, "compagnie": compagnie, "titre": titre, "emails": mails,
            "telephones": sorted(set(TEL.findall(t)))[:3],
            "adresse": re.sub(r"\s+", " ", adr.group(1)).strip() if adr else "",
            "texte": re.sub(r"\s+", " ", t)[:1500]}


def relever():
    from playwright.sync_api import sync_playwright
    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        pg = nav.new_context(locale="fr-FR").new_page()
        # AXA : une page par commune, qui liste ses agences (/distributeur/<id>).
        for c, cp in COMMUNES.items():
            try:
                h, _ = _rendre(pg, "https://agence.axa.fr/bretagne/ille-et-vilaine/%s-%s" % (c, cp))
            except Exception:
                continue
            for d in dict.fromkeys(re.findall(r'(/distributeur/\d+)', h)):
                u = "https://agence.axa.fr" + d
                if u not in cache:
                    try:
                        cache[u] = dict(_fiche(pg, u, "axa"), commune_portail=c)
                    except Exception:
                        pass
            print("  axa %-28s %d fiches" % (c, len(cache)), flush=True)
        # Allianz : la page departement liste toutes les agences.
        try:
            h, _ = _rendre(pg, "https://agences.allianz.fr/assurances/ille-et-vilaine-35")
            liens = set(re.findall(r'href="(https://agence\.allianz\.fr/[^"]+)"', h))
        except Exception:
            liens = set()
        for u in sorted(liens):
            slug = _plat(u.rsplit("/", 1)[1])
            if not any(c in slug for c in COMMUNES) and "rennes-st-jacques" not in slug:
                continue
            if u not in cache:
                try:
                    cache[u] = dict(_fiche(pg, u, "allianz"), commune_portail=slug)
                except Exception:
                    pass
        print("  allianz : %d liens, %d fiches au total" % (len(liens), len(cache)), flush=True)
        nav.close()
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(cache, ensure_ascii=False))
    return cache


if __name__ == "__main__":
    c = relever()
    for u, f in c.items():
        print(f["compagnie"], "|", f["titre"][:50], "|", f["emails"], "|", f["telephones"][:1], "|", f["commune_portail"])
