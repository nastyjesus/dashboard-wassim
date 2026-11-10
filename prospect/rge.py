# -*- coding: utf-8 -*-
"""Annuaire RGE de l'ADEME : coordonnees officielles des artisans certifies.

Jeu de donnees public "Liste des entreprises RGE" (data.ademe.fr), alimente
par les organismes de qualification (Qualibat, Qualit'EnR, Qualifelec, CNOA...).
Chaque ligne porte le SIRET, le telephone, l'email et le site declares par
l'entreprise a son organisme. Rattachement exact par SIRET : pas d'homonymie.

Confiance "registre" : l'entreprise a elle-meme declare ces coordonnees pour
etre trouvee par les particuliers.

    python -m prospect.rge
"""
import io
import json
import os
import time
import urllib.parse
import urllib.request

from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "rge_35.json")
API = "https://data.ademe.fr/data-fair/api/v1/datasets/liste-des-entreprises-rge-2/lines"
CHAMPS = "siret,nom_entreprise,adresse,code_postal,commune,telephone,email,site_internet,domaine,organisme"


def telecharger():
    """Toutes les lignes RGE d'Ille-et-Vilaine (codes postaux 35xxx)."""
    lignes, url = [], "%s?%s" % (API, urllib.parse.urlencode(
        {"qs": "code_postal:35*", "size": 1000, "select": CHAMPS}))
    while url:
        for essai in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                d = json.load(urllib.request.urlopen(req, timeout=90))
                break
            except Exception:
                time.sleep(5 * (essai + 1))
        else:
            raise RuntimeError("API RGE injoignable")
        lignes += d.get("results", [])
        url = d.get("next")
        print("  %d lignes RGE" % len(lignes), flush=True)
    io.open(CACHE, "w", encoding="utf-8").write(json.dumps(lignes, ensure_ascii=False))
    return lignes


def main():
    lignes = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else telecharger()
    par_siret = {}
    for l in lignes:
        s = (l.get("siret") or "").replace(" ", "")
        if s:
            par_siret.setdefault(s, []).append(l)
    store = Store()
    connus = {r["siret"] for r in store.cx.execute("SELECT siret FROM etablissement")}
    poses = {"email": 0, "telephone": 0, "site_web": 0, "fiches": 0}
    for s in connus & set(par_siret):
        ls = par_siret[s]
        domaines = sorted({l.get("domaine") for l in ls if l.get("domaine")})
        org = sorted({l.get("organisme") for l in ls if l.get("organisme")})
        src = "annuaire RGE ADEME (%s)" % ", ".join(org)
        l = ls[0]
        poses["fiches"] += 1
        if l.get("email") and store.poser_valeur(s, "email", l["email"].strip().lower(), src, "registre"):
            poses["email"] += 1
        if l.get("telephone") and store.poser_valeur(s, "telephone", l["telephone"].strip(), src, "registre"):
            poses["telephone"] += 1
        if l.get("site_internet") and store.poser_valeur(s, "site_web", l["site_internet"].strip(), src, "registre"):
            poses["site_web"] += 1
        store.poser_valeur(s, "rge", "; ".join(domaines)[:400], src, "registre")
    store.valider()
    print("%d lignes RGE, %d SIRET distincts ; rattaches a nos fiches : %d" % (
        len(lignes), len(par_siret), poses["fiches"]))
    print("poses : %d emails, %d telephones, %d sites" % (poses["email"], poses["telephone"], poses["site_web"]))


if __name__ == "__main__":
    main()
