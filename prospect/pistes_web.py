# -*- coding: utf-8 -*-
"""Reprend les emails lus pendant les enquetes web (cache/tour*.json) qui
n'ont jamais ete poses en base.

Les enquetes visitaient les premiers resultats de recherche et notaient les
emails de chaque page. Beaucoup de ces pages sont des annuaires (Mappy,
Kompass) qui affichent aussi les commerces voisins : leurs emails ne prouvent
rien. On ne garde donc qu'un email lu sur le SITE MEME de l'entreprise :

- la page confirme l'entreprise (deux mots du nom, ou la rue, ou un mot du
  nom et la commune : champ "corrobore" de l'enquete) ;
- le domaine de la page porte un mot distinctif du nom, de l'enseigne ou du
  nom de famille du dirigeant (pas un mot de metier : "electricite",
  "renovation"... designent n'importe qui) ;
- l'email est du domaine de cette page, ou un webmail affiche sur elle.

Les adresses de reseau (Foncia, Square Habitat...) restent soumises aux
regles de prospect.fiabiliser au moment de l'export.

    python -m prospect.pistes_web [--essai]
"""
import csv
import glob
import io
import json
import os
import re
import sys
import unicodedata
from urllib.parse import urlparse

from . import fiabiliser as FB
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
GENERIQUES = {
    "electricite", "electric", "elec", "renovation", "batiment", "construction", "constructions", "plomberie",
    "chauffage", "menuiserie", "maconnerie", "peinture", "services", "service", "conseil", "conseils",
    "immobilier", "immo", "transaction", "france", "bretagne", "rennes", "ouest", "groupe", "habitat",
    "energie", "energetique", "industrie", "industrielle", "maintenance", "installation", "etudes", "societe",
    "entreprise", "artisan", "garage", "automobiles", "auto", "coiffure", "boulangerie", "restaurant",
    "pizza", "traiteur", "agence", "cabinet", "expertise", "paysage", "paysages", "jardin", "nettoyage",
    "proprete", "transport", "taxi", "photo", "creation", "design", "studio", "atelier", "maison", "home",
    "assurance", "assurances", "finance", "patrimoine", "courtage", "travaux", "bruz", "sarl", "eurl", "sas",
    "tertiaire", "sante", "beaute", "institut", "bois", "metal", "alu", "fenetre", "fenetres", "toiture",
    "couverture", "isolation", "sols", "carrelage", "piscine", "piscines", "concept", "solutions", "pro",
    "ravalement", "cuisine", "cuisines", "bains", "fermetures", "plombier", "couvreur", "peintre", "macon",
    "nails", "beauty", "yoga", "vert", "decor", "interieurs", "reno", "renov",
    "conciergerie", "concierge", "thermique", "ingenierie", "terrassement", "assainissement", "geometre",
}
# Annuaires, plateformes et portails de reseau : leurs emails ne sont pas ceux de la fiche.
HOTES_EXCLUS = re.compile(
    r"annuaire|drmilou|yogapurelife|gref-bretagne|womenleadersinpharma|localoria|setmore|"
    r"coiffandco|compagnons-du-devoir|esup\.fr|groupeactual|temporis|interaction-interim|g-truck|"
    r"\.free\.fr$|mappy|kompass|pagesjaunes|societe\.com|pappers|facebook|linkedin|instagram")
# Boites de service : ni le dirigeant ni l'accueil.
LOCAL_EXCLU = re.compile(r"^(factur|compta|archives?|rgpd|dpo|recrut|rh|jobs?|candidat|emploi|"
                         r"webmaster|noreply|no-reply|sav|support|abuse|privacy)", re.I)
VIDES = {"les", "des", "et", "de", "du", "la", "le", "l", "d", "fils", "freres", "ets", "sci"}


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _distinctifs(r):
    """Mots qui designent CETTE entreprise : nom, enseigne, noms de famille."""
    txt = "%s %s" % (r.get("nom"), r.get("enseigne"))
    mots = {m for m in re.split(r"[^a-z0-9]+", _plat(txt).replace(".", "")) if len(m) >= 4}
    for d in (r.get("dirigeants") or "").split(";"):
        d = re.sub(r"\(.*?\)", "", d).split()
        if len(d) >= 2:
            mots.add(_plat(d[-1]))           # nom de famille (SIRENE : prenoms puis nom)
    # Un mot tronque ("RAVAL" pour ravalement) reste un mot de metier.
    return {m for m in mots if m not in VIDES and len(m) >= 4 and not any(g.startswith(m) for g in GENERIQUES)}


def _hote(url):
    h = _plat(urlparse(url).netloc).split(":")[0]
    return h[4:] if h.startswith("www.") else h


def _domaine_de(r, hote):
    label = re.sub(r"[^a-z0-9]", "", ".".join(hote.split(".")[:-1]))
    # Nom compacte = domaine ("BAINS & SOLUTIONS" -> bainsetsolutions) : preuve meme en mots de metier.
    for n in (r.get("nom"), r.get("enseigne")) + tuple(re.findall(r"\((.*?)\)", r.get("nom") or "")):
        c = re.sub(r"[^a-z0-9]", "", _plat(re.sub(r"\(.*?\)", "", n or "")).replace("&", "et"))
        if len(c) >= 6 and (c == label or label in (c, "sarl" + c, "sas" + c)):
            return True
    return any(m in label for m in _distinctifs(r))


def candidats():
    rows = {}
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if r.get("siret") and "@" not in (r.get("email") or ""):
                    rows[r["siret"]] = r
    out = {}
    for p in sorted(glob.glob(os.path.join(RACINE, "cache", "tour*.json"))):
        if "metiers" in p or "contacts" in p:
            continue
        for v in json.load(io.open(p, encoding="utf-8")):
            r = rows.get(v.get("siret"))
            if not r:
                continue
            for pi in v.get("pistes", []):
                if not pi.get("corrobore") or not pi.get("emails"):
                    continue
                hote = _hote(pi["url"])
                if HOTES_EXCLUS.search(hote) or "/annuaire" in pi["url"].lower() or not _domaine_de(r, hote):
                    continue
                # Page de reseau qui liste plusieurs agences : seule l'adresse qui
                # nomme la commune ou l'entreprise est la sienne.
                par_dom = {}
                for m in pi["emails"]:
                    par_dom.setdefault(m.lower().split("@")[-1], []).append(m.lower())
                commune = re.sub(r"[^a-z]", "", _plat(r.get("commune")))
                for m in pi["emails"]:
                    m = m.lower().strip()
                    if len(par_dom.get(m.split("@")[-1], [])) >= 3:
                        loc = re.sub(r"[^a-z0-9]", "", m.split("@")[0])
                        if not (commune and commune[:8] in loc) and not any(t in loc for t in _distinctifs(r)):
                            continue
                    dom = m.split("@")[-1]
                    if not FB.SYNTAXE.match(m) or FB.FACTICE.search(m) or LOCAL_EXCLU.search(m):
                        continue
                    if not (dom == hote or hote.endswith("." + dom) or dom.endswith("." + hote)
                            or dom in FB.WEBMAILS or _domaine_de(r, dom)):
                        continue
                    out.setdefault(r["siret"], {"ligne": r, "emails": {}})["emails"].setdefault(m, pi["url"])
    return out


def main(argv=None):
    essai = "--essai" in (argv or sys.argv[1:])
    c = candidats()
    store = None if essai else Store()
    gains = 0
    for siret, d in c.items():
        r = d["ligne"]
        # Domaine de l'entreprise d'abord, puis webmail ; deux adresses au plus.
        tri = sorted(d["emails"].items(), key=lambda kv: kv[0].split("@")[1] in FB.WEBMAILS)
        for m, url in tri[:2]:
            print("  %-45s %-22s %-40s %s" % (r["nom"][:45], r.get("commune", "")[:22], m, url[:70]))
            if store and store.poser_valeur(siret, "email", m, "site de l'entreprise (enquete web) %s" % url,
                                            "site_officiel"):
                gains += 1
    if store:
        store.valider()
    print("%d fiches, +%d emails" % (len(c), gains))


if __name__ == "__main__":
    sys.exit(main())
