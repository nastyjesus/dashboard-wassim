# -*- coding: utf-8 -*-
"""Construit une fiche a partir du site d'un professionnel.

Lit l'accueil puis les pages contact / mentions legales / a propos (rendues
par Chromium : beaucoup de petits sites sont en JavaScript). Releve :
- les emails publies et leur source exacte,
- le telephone,
- le SIREN/SIRET imprime dans les mentions legales (obligatoire, LCEN art. 6),
  qui rattache la fiche a SIRENE sans risque d'homonymie,
- toute mention de BNI (un membre d'un autre groupe BNI est a ecarter).

    from prospect.fiche_web import lire_site
"""
import json
import re
import time
import urllib.parse
import urllib.request
from urllib.parse import urljoin, urlparse

EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
TEL = re.compile(r"(?<!\d)0[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
SIREN = re.compile(r"(?:siren|siret|rcs|r\.c\.s\.?)[^0-9]{0,40}((?:\d[ . ]?){9}(?:(?:\d[ . ]?){5})?)", re.I)
LIEN = re.compile(r"contact|mention|legal|a-propos|apropos|qui-suis|qui-sommes|about|equipe|cabinet", re.I)
BNI = re.compile(r"\bBNI\b")


def _rendre(pg, url):
    pg.goto(url, timeout=30000, wait_until="domcontentloaded")
    try:
        pg.wait_for_load_state("networkidle", timeout=8000)
    except Exception:
        pass
    return pg.content(), pg.inner_text("body") if pg.query_selector("body") else ""


def _cf(code):
    try:
        k = int(code[:2], 16)
        return "".join(chr(int(code[i:i + 2], 16) ^ k) for i in range(2, len(code), 2))
    except ValueError:
        return ""


def lire_site(pg, url, maximum=4):
    url = url if url.startswith("http") else "https://" + url
    hote = urlparse(url).netloc
    vues, emails, tels, sirens, bni = [], {}, [], [], []
    a_voir = [url]
    while a_voir and len(vues) < maximum:
        u = a_voir.pop(0)
        if u in vues:
            continue
        try:
            h, t = _rendre(pg, u)
        except Exception:
            vues.append(u)
            continue
        vues.append(u)
        trouves = set(m.lower() for m in EMAIL.findall(t))
        trouves |= set(m[7:].split("?")[0].lower() for m in re.findall(r'href="(mailto:[^"]+)"', h, re.I))
        trouves |= set(_cf(c).lower() for c in re.findall(r'data-cfemail="([0-9a-f]+)"', h))
        for m in trouves:
            if "@" in m and not re.search(r"\.(png|jpe?g|gif|webp|svg)$", m):
                emails.setdefault(m, u)
        for x in TEL.findall(t):
            if x not in tels:
                tels.append(x)
        for s in SIREN.findall(t):
            d = re.sub(r"\D", "", s)
            if len(d) in (9, 14) and d not in sirens:
                sirens.append(d)
        if BNI.search(t):
            i = BNI.search(t).start()
            bni.append((u, re.sub(r"\s+", " ", t[max(0, i - 80):i + 80])))
        if u == url:
            for a in re.findall(r'href="([^"#]+)"', h):
                v = urljoin(url, a)
                if urlparse(v).netloc == hote and LIEN.search(a) and v not in a_voir and v not in vues:
                    a_voir.append(v)
    return {"url": url, "pages": vues, "emails": emails, "telephones": tels[:3],
            "sirens": sirens, "bni": bni[:2]}


def sirene(siren_ou_siret):
    """Etablissement SIRENE a partir d'un SIREN ou SIRET imprime sur le site."""
    q = siren_ou_siret[:9]
    u = "https://recherche-entreprises.api.gouv.fr/search?q=%s" % q
    for i in range(3):
        try:
            d = json.load(urllib.request.urlopen(urllib.request.Request(
                u, headers={"User-Agent": "Mozilla/5.0"}), timeout=30))
            time.sleep(0.2)
            break
        except Exception:
            time.sleep(2)
    else:
        return None
    for r in d.get("results", []):
        if r["siren"] != q:
            continue
        s = r["siege"]
        etab = s
        if len(siren_ou_siret) == 14:
            for e in r.get("matching_etablissements") or []:
                if e.get("siret") == siren_ou_siret:
                    etab = e
        dirig = "; ".join(" ".join(x for x in (p.get("prenoms"), p.get("nom")) if x) or p.get("denomination") or ""
                          for p in r.get("dirigeants", [])[:3])
        return {"siren": r["siren"], "siret": etab.get("siret") or s.get("siret"), "nom": r["nom_complet"],
                "naf": r.get("activite_principale"), "adresse": etab.get("adresse") or s.get("adresse"),
                "commune": etab.get("libelle_commune") or s.get("libelle_commune"),
                "date_creation": r.get("date_creation"), "tranche_effectif": r.get("tranche_effectif_salarie"),
                "etat": etab.get("etat_administratif") or r.get("etat_administratif"), "dirigeants": dirig}
    return None
