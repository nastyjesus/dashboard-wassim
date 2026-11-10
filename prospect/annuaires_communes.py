# -*- coding: utf-8 -*-
"""Lit les annuaires d'entreprises publies par les mairies et associations de
commercants de la zone, et rapproche leurs fiches des notres sans email.

Sources (pages publiques, une fiche par entreprise, coordonnees fournies par
l'entreprise a sa commune ou a son association) :
- Guichen Pont-Rean : guichenpontrean.fr/categories/les-professionnels-et-entreprises-du-territoire/
- Goven : goven.fr/listes/entreprises/ et /listes/commerces-2/
- Laille : laille-entreprises.fr (association des artisans et commercants)

Rapprochement strict, sans jamais deviner :
- meme commune, ET
- meme numero de telephone, OU tous les mots significatifs du nom de
  l'annuaire presents dans le nom ou l'enseigne de la fiche (ou l'inverse).
L'email garde reste soumis aux filtres de prospect.fiabiliser (adresse non
factice, domaine en rapport avec l'entreprise ou webmail).

    python -m prospect.annuaires_communes [lire|rapprocher]
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata

from . import fiabiliser as FB
from .fouille_profonde import _lire
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache", "annuaires_communes.json")

ANNUAIRES = [
    {"commune": "GUICHEN", "hote": "guichenpontrean.fr",
     "listes": ["https://www.guichenpontrean.fr/categories/les-professionnels-et-entreprises-du-territoire/?&pages=%d" % i
                for i in range(1, 58)],
     "fiche": r"guichenpontrean\.fr/contacts/[^/]+/?$"},
    {"commune": "GOVEN", "hote": "goven.fr",
     "listes": ["https://www.goven.fr/listes/entreprises/", "https://www.goven.fr/listes/commerces-2/"],
     "fiche": r"goven\.fr/(?!listes/|systeme/|services-publics/|wp-|categories/|feed)[a-z0-9-]+/?$"},
    {"commune": "LAILLE", "hote": "laille-entreprises.fr",
     "listes": ["https://laille-entreprises.fr/index.php/entreprises/"] +
               ["https://laille-entreprises.fr/index.php/entreprises/page/%d/" % i for i in range(2, 15)],
     "fiche": r"laille-entreprises\.fr/index\.php/entreprises/(?!page/|wpbdp_category/)[a-z0-9-]+/?$"},
]


def _creasit(commune, base, hote):
    """Sites de communes faits par Creasit : liste paginee ?&pages=N, fiches /contacts/<nom>/."""
    return {"commune": commune, "hote": hote, "listes": [base + "?&pages=%d" % i for i in range(1, 80)],
            "fiche": re.escape(hote) + r"/contacts/[^/]+/?$"}


ANNUAIRES += [
    _creasit("CHAVAGNE", "https://www.chavagne.fr/categories/annuaire-des-entreprises-et-des-commercants/", "chavagne.fr"),
    _creasit("ORGERES", "https://www.orgeres.fr/categories/professionnels/", "orgeres.fr"),
    _creasit("VEZIN", "https://www.ville-vezinlecoquet.fr/categories/professionnels/", "ville-vezinlecoquet.fr"),
    {"commune": "PACE", "hote": "ville-pace.bzh",
     "listes": ["https://www.ville-pace.bzh/ma-ville/annuaire/?utf8=%E2%9C%93&f=1&categorie=entreprise&sous-categorie=&recherche="],
     "fiche": r"ville-pace\.bzh/fiche-annuaire/[^/]+/?$"},
]
VIDES = {"sarl", "sas", "eurl", "sasu", "sa", "ste", "societe", "entreprise", "les", "des", "et", "de", "du",
         "la", "le", "l", "d", "et", "fils", "page", "votre", "en", "ets", "groupe", "sci"}


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _mots(s):
    return {t for t in re.split(r"[^a-z0-9]+", _plat(s).replace(".", "")) if len(t) >= 3 and t not in VIDES}


GENERIQUES = {"photographe", "immobilier", "informatique", "couverture", "plomberie", "electricite", "menuiserie",
              "batiment", "services", "service", "conseil", "garage", "coiffure", "boulangerie", "restaurant",
              "renovation", "construction", "transport", "taxi", "paysage", "paysagiste", "maconnerie",
              "creation", "creations", "ravalement", "plafonds", "automobiles", "paysages", "nettoyage"}


def _distinctif(mots):
    """Un nom sert de preuve s'il a deux mots ou un mot rare d'au moins 6 lettres."""
    utiles = mots - GENERIQUES
    return len(utiles) >= 2 or (len(utiles) == 1 and len(next(iter(utiles))) >= 6 and len(mots) == 1)


def _tel(s):
    return re.sub(r"\D", "", s or "")[-9:]


def lire():
    from playwright.sync_api import sync_playwright
    res = json.load(io.open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True)
        pg = nav.new_context(locale="fr-FR").new_page()
        for a in ANNUAIRES:
            fiches, vides = {}, 0
            for u in a["listes"]:
                try:
                    pg.goto(u, timeout=30000, wait_until="domcontentloaded")
                except Exception:
                    continue
                liens = pg.eval_on_selector_all("a", "els=>els.map(e=>[e.href,(e.innerText||'').trim()])")
                neufs = 0
                for href, txt in liens:
                    href = href.split("#")[0].split("?")[0]
                    if re.search(a["fiche"], href) and href not in fiches and href not in res:
                        fiches[href] = txt
                        neufs += 1
                vides = vides + 1 if not neufs else 0
                if vides >= 2:
                    break
            print("%s : %d fiches a lire" % (a["commune"], len(fiches)), flush=True)
            for href, txt in fiches.items():
                try:
                    _, mails, tels = _lire(pg, href)
                    titre = pg.inner_text("h1") if pg.query_selector("h1") else txt
                except Exception:
                    continue
                res[href] = {"commune": a["commune"], "nom": (titre or txt).strip(),
                             "emails": sorted(m for m in mails if m), "tels": sorted(tels)}
            io.open(CACHE, "w", encoding="utf-8").write(json.dumps(res, ensure_ascii=False, indent=0))
        nav.close()
    print("%d fiches d'annuaire, %d avec email" % (len(res), sum(1 for v in res.values() if v["emails"])))


def rapprocher():
    res = json.load(io.open(CACHE, encoding="utf-8"))
    store = Store()
    lignes = {}
    for f in FB.SECTIONS:
        p = os.path.join(FB.DONNEES, f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if r.get("siret") and "@" not in (r.get("email") or ""):
                    lignes[r["siret"]] = r
    gains, vus = 0, []
    # Numeros presents sur beaucoup de fiches = standard de la mairie, pas l'entreprise.
    freq = {}
    for d in res.values():
        for t in d["tels"]:
            freq[_tel(t)] = freq.get(_tel(t), 0) + 1
    for url, d in res.items():
        if not d["emails"]:
            continue
        tels = {_tel(t) for t in d["tels"] if freq[_tel(t)] <= 3}
        # Le titre de page est celui du site de la mairie : le nom est dans l'adresse.
        d["nom"] = url.rstrip("/").rsplit("/", 1)[1].replace("-", " ")
        mots_a = _mots(d["nom"])
        for siret, r in lignes.items():
            if _plat(d["commune"]) not in _plat(r.get("commune")).replace("-", " ").replace(" ", "") \
                    and _plat(d["commune"]) not in _plat(r.get("commune")):
                continue
            mots_f = _mots(r.get("nom", "") + " " + r.get("enseigne", ""))
            par_tel = _tel(r.get("telephone")) and _tel(r.get("telephone")) in tels
            mn = _mots(r.get("nom"))
            # Deux mots utiles inclus d'un cote ou de l'autre ; un seul mot : noms identiques.
            sens1 = _distinctif(mots_a) and mots_a <= mots_f and (len(mots_a - GENERIQUES) >= 2 or mots_a in (mn, _mots(r.get("enseigne")), _mots(" ".join(re.findall(r"\((.*?)\)", r.get("nom", ""))))))
            sens2 = _distinctif(mn) and mn <= mots_a and (len(mn - GENERIQUES) >= 2 or mots_a == mn)
            # Prenom + nom d'un dirigeant dans le nom de la fiche d'annuaire.
            dirs = [_mots(re.sub(r"\(.*?\)", "", x)) for x in (r.get("dirigeants") or "").split(";")]
            par_dir = any(len(x) >= 2 and x <= mots_a for x in dirs)
            par_nom = sens1 or sens2 or par_dir
            if not (par_tel or par_nom):
                continue
            bons = [m for m in d["emails"] if FB.SYNTAXE.match(m) and not FB.FACTICE.search(m)
                    and not m.endswith("@" + url.split("/")[2].replace("www.", ""))
                    and (m.split("@")[1] in FB.WEBMAILS or FB._lien_entreprise(m.split("@")[1], r))]
            for m in bons[:1]:
                if store.poser_valeur(siret, "email", m, "annuaire de la commune %s" % url, "annuaire",
                                      "rapproche par %s" % ("telephone" if par_tel else "nom")):
                    gains += 1
                    vus.append((r["nom"], d["nom"], m, "tel" if par_tel else "nom"))
    store.valider()
    for v in vus:
        print("  %s  <=  %s  : %s (%s)" % v)
    print("termine : +%d emails" % gains)


if __name__ == "__main__":
    {"lire": lire, "rapprocher": rapprocher}[sys.argv[1] if len(sys.argv) > 1 else "lire"]()
