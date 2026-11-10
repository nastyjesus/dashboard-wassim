# -*- coding: utf-8 -*-
"""Annuaire de l'Ordre des avocats de Rennes : l'autorite sur un avocat.

Chaque fiche publie le cabinet, l'adresse, le telephone, l'email (souvent
nominatif) et les certificats de specialisation. Ces certificats sont
delivres par le Conseil national des barreaux : c'est la seule preuve
opposable d'une specialite. Un avocat peut pratiquer le droit de la famille
sans certificat ; il ne peut pas se dire specialiste sans lui.

    python -m prospect.barreau            # releve tout l'annuaire (cache)
"""
import html
import io
import json
import os
import re
import time
import urllib.request

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "barreau_rennes.json")
BASE = "https://www.ordre-avocats-rennes.fr"
SOURCE = "annuaire de l'Ordre des avocats de Rennes"


def _get(url, essais=4):
    for i in range(essais):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            return urllib.request.urlopen(req, timeout=60).read().decode("utf-8", "ignore")
        except Exception:
            time.sleep(3 * (i + 1))
    return ""


def _txt(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s or ""))).strip()


def _bloc(t, classe):
    m = re.search(r'class="%s"[^>]*>(.*?)</div>\s*</div>' % re.escape(classe), t, re.S)
    return m.group(1) if m else ""


def lire_fiche(chemin):
    t = _get(BASE + chemin)
    if not t:
        return None
    nom = _txt(re.search(r'avocatDetails_info_name[^>]*>(.*?)</div>', t, re.S).group(1)) \
        if re.search(r'avocatDetails_info_name', t) else ""
    if not nom:
        m = re.search(r"<title>\s*Me ([^,<]+)", t)
        nom = m.group(1).strip() if m else ""
    m = re.search(r"inscription [^<]*:\s*<div>(.*?)</div>", t, re.S)
    inscription = _txt(m.group(1)) if m else ""
    m = re.search(r"<b>Cabinet :</b>\s*<div>(.*?)</div>", t, re.S)
    cabinet = _txt(m.group(1)) if m else ""
    adr = re.search(r'avocatDetails_info_adr">(.*?)</div>\s*</div>', t, re.S)
    lignes = [_txt(x) for x in re.findall(r"<div>(.*?)</div>", adr.group(1), re.S)] if adr else []
    lignes = [x for x in lignes if x]
    cp_ville = next((x for x in lignes if re.match(r"^\d{5}\b", x)), "")
    tel = re.search(r"<strong>T[ée]l :</strong>.*?<a href=\"tel:[^\"]*\">([^<]+)</a>", t, re.S)
    mail = re.search(r"<strong>E-mail :</strong>\s*<div>([^<]+)</div>", t, re.S)
    spe = re.search(r"Sp[ée]cialit[ée]s :</[^>]+>(.*?)</div>\s*</div>", t, re.S)
    specialites = [x for x in (_txt(s) for s in re.findall(r"<div[^>]*>(.*?)</div>", spe.group(1), re.S))
                   if x] if spe else []
    if not specialites and spe:
        specialites = [x.strip() for x in _txt(spe.group(1)).split("  ") if x.strip()]
    tel = tel.group(1).strip() if tel else ""
    if tel.startswith("+33"):
        d = "0" + tel[3:]
        tel = " ".join(d[i:i + 2] for i in range(0, 10, 2)) if len(d) == 10 else d
    return {"fiche": BASE + chemin, "nom": nom, "inscription": inscription, "cabinet": cabinet,
            "adresse": " ".join(x for x in lignes if x != cp_ville), "cp_ville": cp_ville,
            "telephone": tel, "email": (mail.group(1).strip().lower() if mail else ""),
            "specialites": specialites}


def relever(pause=0.25):
    fiches = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    chemins, page = [], 0
    while True:
        t = _get("%s/annuaire?items_per_page=120&page=%d" % (BASE, page))
        trouves = sorted(set(re.findall(r'href="(/avocat-[^"]+)"', t)))
        nouveaux = [c for c in trouves if c not in chemins]
        if not nouveaux:
            break
        chemins += nouveaux
        page += 1
    print("%d fiches listees" % len(chemins), flush=True)
    for i, c in enumerate(chemins, 1):
        if c in fiches:
            continue
        f = lire_fiche(c)
        if f:
            fiches[c] = f
        time.sleep(pause)
        if i % 50 == 0:
            io.open(CACHE, "w", encoding="utf-8").write(json.dumps(fiches, ensure_ascii=False))
            print("  %d/%d" % (i, len(chemins)), flush=True)
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(fiches, ensure_ascii=False))
    return fiches


if __name__ == "__main__":
    f = relever()
    print("%d fiches en cache" % len(f))
