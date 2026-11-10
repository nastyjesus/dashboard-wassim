# -*- coding: utf-8 -*-
"""Vague 6, complement du 10/11/2026 : cinq metiers de plus, memes zone,
colonnes et regles que la vague 6 (prospect.vague6), onglets "V6. ".

- Geometre-expert : NAF 71.12A, propre aux geometres.
- Bureau d'etude thermique : NAF 71.12B (ingenierie) ; preuve thermique
  exigee ; diagnostiqueurs immobiliers purs exclus.
- Terrassement / assainissement : 43.12A, 43.12B, 42.21Z, 37.00Z.
- Architecte / decoratrice d'interieur : 74.10Z et 71.11Z avec preuve
  "interieur/decoration" ; architectes DPLG exclus (trop proches du maitre
  d'oeuvre du groupe).
- Conciergerie / locations courte duree : preuve exigee ; plateformes
  nationales sans gerant local exclues.

Fiches deja connues du CRM ou a ne pas contacter (liste du brief, dans
prospect/prive/donnees.json, hors git) : signalees dans "Alerte fiche" et
mises en EXCLURE pour le mailing.

    python -m prospect.vague6b selection|verifier|exporter|classeur|codes
"""
import re
import sys

from . import vague5 as V
from . import vague6 as V6   # zone, quartiers et prioritaires de la vague 6
from .prive_cfg import prive

V.PREFIXE = "v6b"
V.FICHIER = "vague6b"
V.LIBELLE = "vague 6"
V.ONGLET = "V6. "
V.SECTIONS_EXISTANTES = V.SECTIONS_EXISTANTES + ["vague6.csv"]
V.METIERS = ["geometre-expert", "bureau-etude-thermique", "terrassement-assainissement",
             "architecte-interieur-v6", "conciergerie"]

V.GROUPES_SANS_FRANCHISE = re.compile(
    r"\b(hostnfly|welkeys|luckey|guestready|houst|sweet inn|yourhostlemon|bnb lord|"
    r"veolia|saur|suez|eiffage|vinci|colas|eurovia|spie|bouygues|socotec|bureau veritas|apave|dekra)\b", re.I)
V.RESEAUX_METIER = {
    "conciergerie": r"\b(bnbsitter|bnb sitter|conciergerie prestige|my conciergerie|la conciergerie de .*france)\b",
    "geometre-expert": r"\b(geofit|axis conseils|quarta)\b",
    "bureau-etude-thermique": r"\b(ingerop|egis|artelia|setec|tribu energie)\b",
}
V.PREUVES = {
    "geometre-expert": r"geometr|topograph|bornage|cadastr|foncier",
    "bureau-etude-thermique": r"thermi|re ?2020|rt ?2012|energeti|fluides|cvc|genie climatique|audit energ",
    "terrassement-assainissement": r"terrass|assainiss|vrd|raccord|canalis|micro.?station|fosses? septique|"
                                   r"travaux publics|\btp\b|reseaux humides",
    "architecte-interieur-v6": r"interieur|decorat|home ?staging|amenagement interieur|design d.?espace",
    # Un service rendu a des proprietaires, pas la location de son propre gite.
    "conciergerie": r"concierg|pour le compte (de |des )?(proprietaires|tiers|clients)|accueil (des )?voyageurs|"
                    r"check.?in|remise des cles|gestion (locative )?(saisonniere|de locations? (saisonni|de courte|touristi))|"
                    r"gestion de (biens|logements) (en |de )?(location )?(courte|saisonni)|\bbnb\b|\bhost(s)?\b",
}
V.CONTRE = {
    # Diagnostiqueur "pur" : il parle de diagnostics sans jamais d'etude thermique.
    "bureau-etude-thermique": r"^(?!.*(etude|thermi|re ?2020|rt ?2012|fluides|cvc)).*(diagnost|\bdpe\b|amiante|termite)",
    "architecte-interieur-v6": r"graphi|web|site internet|logo|communication|textile|packaging|dplg|hmonp",
    "conciergerie": r"syndic|transaction|agence immobiliere|conciergerie d.entreprise|conciergerie (de |pour )?(voitures?|automobiles?|vehicules?)|^l.acquisition, la construction",
}
V.NAF_FIABLE = {"geometre-expert", "terrassement-assainissement"}
V.RPPS_PROF = {}
V.NOTION = "notion_v6b.json"
V.ETI_GARDEES = set()
V.ONGLETS = {"geometre-expert": "V6. Géomètre", "bureau-etude-thermique": "V6. Bureau étude thermique",
             "terrassement-assainissement": "V6. Terrassement-assainissement",
             "architecte-interieur-v6": "V6. Architecte d'intérieur", "conciergerie": "V6. Conciergerie"}

# Deja connus : a signaler, jamais a relancer par mailing.
CONNUS = [tuple(x) for x in prive("vague6b", "connus", [])]    # (motif, texte d'alerte)



def signaler():
    """Apres l'export : alerte sur les fiches deja connues, EXCLURE au mailing."""
    import csv, io, json, os, unicodedata
    plat = lambda s: unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    p = os.path.join(V.DONNEES, V.FICHIER + ".csv")
    rd = csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";")
    champs, lignes = rd.fieldnames, list(rd)
    fp = os.path.join(V.CACHE, "statut_force.json")
    force = json.load(io.open(fp, encoding="utf-8"))
    n = 0
    from collections import Counter
    adresses = Counter(r["adresse"] for r in lignes)
    for r in lignes:
        if adresses[r["adresse"]] >= 5:
            r["alerte"] = (r.get("alerte", "") + " ; adresse de domiciliation partagee par %d entreprises : "
                           "activite locale non prouvee" % adresses[r["adresse"]]).strip(" ;")
        if "dplg" in plat(r.get("email", "") + " " + r.get("site_web", "") + " " + r.get("nom", "")):
            r["alerte"] = (r.get("alerte", "") + " ; architecte DPLG : exclu par le brief").strip(" ;")
    for r in lignes:
        ident = plat(" ".join(r.get(k, "") for k in ("nom", "enseigne", "dirigeants", "email", "site_web")))
        for motif, texte in CONNUS:
            if re.search(motif, ident):
                r["alerte"] = (r.get("alerte", "") + " ; " + texte).strip(" ;")
                if r.get("email"):
                    force[r["email"].lower()] = ["EXCLURE", texte]
                n += 1
                print("  connu :", r["nom"], "->", texte)
    w = io.open(p, "w", encoding="utf-8-sig", newline="")
    cw = csv.DictWriter(w, fieldnames=champs, delimiter=";"); cw.writeheader(); cw.writerows(lignes); w.close()
    io.open(fp, "w", encoding="utf-8").write(json.dumps(force, ensure_ascii=False, indent=1))
    print("%d fiche(s) connue(s) signalee(s)" % n)


if __name__ == "__main__":
    {"selection": V.selection, "verifier": V.verifier, "exporter": V.exporter,
     "classeur": V.classeur, "signaler": signaler, "codes": lambda: print(",".join(V6.CODES))}[sys.argv[1]]()
