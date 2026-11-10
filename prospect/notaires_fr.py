# -*- coding: utf-8 -*-
"""Annuaire officiel des notaires (notaires.fr, Conseil superieur du notariat).

Trois niveaux : la commune liste les offices, l'office liste ses notaires,
la fiche du notaire publie son email NOMINATIF (mailto:prenom.nom@xxxxx.
notaires.fr) et son telephone. C'est l'email que la mission demande en
priorite sur l'adresse generique de l'office.

    python -m prospect.notaires_fr
"""
import html
import io
import json
import os
import re
import time
import urllib.request

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "notaires_fr.json")
BASE = "https://www.notaires.fr"
SOURCE = "annuaire officiel notaires.fr"

COMMUNES = ["bruz", "chartres-de-bretagne", "saint-jacques-de-la-lande", "pont-pean", "laille",
            "orgeres", "noyal-chatillon-sur-seiche", "vern-sur-seiche", "guichen", "goven",
            "le-rheu", "bourgbarre", "saint-erblon", "rennes"]


def _get(url, essais=4):
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0",
                                                       "Accept-Language": "fr"})
            return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
        except Exception:
            time.sleep(3 * (i + 1))
    return ""


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def offices(commune):
    vus, page = [], 0
    while page < 20:
        t = _get("%s/fr/annuaire/bretagne/ille-et-vilaine/%s%s" % (
            BASE, commune, "?page=%d" % page if page else ""))
        trouves = [o for o in dict.fromkeys(re.findall(r'href="(/fr/office/[^"?#]+)"', t)) if o not in vus]
        if not trouves:
            break
        vus += trouves
        page += 1
    return vus


def office(chemin):
    t = _get(BASE + chemin)
    titre = re.search(r"<h1[^>]*>(.*?)</h1>", t, re.S)
    adresse = re.search(r"\|\s*([^<|]{5,120}?)</", t)
    return {"office": chemin, "nom_office": _txt(titre.group(1)) if titre else "",
            "notaires": list(dict.fromkeys(re.findall(r'href="(/fr/notaire/[^"?#]+)"', t))),
            "mails_office": sorted(set(m.lower() for m in re.findall(r'mailto:([^"?]+)', t))),
            "site": next(iter(re.findall(r'href="(https?://[^"]*notaires\.fr[^"]*)"', t)), "")}


def notaire(chemin):
    t = _get(BASE + chemin)
    titre = re.search(r"<title>\s*(.*?)\s*\|", t, re.S)
    m = re.search(r"Notaire\s+(.*?)\s+à\s+([A-Z' \-ÉÈ]+)\s+(\d{5})\s*\|\s*([^<]+?)\s*<", _txt(t) + "<")
    tel = re.search(r"T[ée]l[ée]phone\s*</[^>]+>\s*(?:<[^>]+>\s*)*([0-9 .+]{10,})", t)
    return {"notaire": chemin, "titre": _txt(titre.group(1)) if titre else "",
            "email": next(iter(m2.lower() for m2 in re.findall(r'mailto:([^"?]+)', t)), ""),
            "telephone": tel.group(1).strip() if tel else "",
            "salarie": bool(re.search(r"Notaire salari", _txt(t)[:4000])),
            "fiche": BASE + chemin}


def relever(pause=0.3):
    cache = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {"offices": {}, "notaires": {}}
    for c in COMMUNES:
        for o in offices(c):
            if o not in cache["offices"]:
                d = office(o)
                d["commune_annuaire"] = c
                cache["offices"][o] = d
                time.sleep(pause)
            for n in cache["offices"][o]["notaires"]:
                if n not in cache["notaires"]:
                    d = notaire(n)
                    d["office"] = o
                    cache["notaires"][n] = d
                    time.sleep(pause)
        io.open(CACHE, "w", encoding="utf-8").write(json.dumps(cache, ensure_ascii=False))
        print("  %-28s offices %3d  notaires %3d" % (c, len(cache["offices"]), len(cache["notaires"])), flush=True)
    return cache


if __name__ == "__main__":
    relever()
