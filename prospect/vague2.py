# -*- coding: utf-8 -*-
"""Vague 2 d'invitations BNI (mission du 07/10/2026).

Sept metiers : notaire, assurance IARD, electricien, plombier-chauffagiste,
pilotage TPE, avocat fiscaliste, avocat droit de la famille. Chaque email
a une source d'autorite :
- notaires   : annuaire officiel notaires.fr (email nominatif du notaire) ;
- avocats    : annuaire de l'Ordre des avocats de Rennes (certificat de
               specialisation) et, a defaut, competence declaree au Conseil
               national des barreaux (consultation.avocat.fr) ;
- assureurs  : portails des compagnies (agence.axa.fr, agence.allianz.fr) ;
- pilotage   : le site du cabinet (accueil, contact, mentions legales) ;
- artisans   : annuaire RGE de l'ADEME, sites, enquete web (deja en base).

Les fiches nouvelles sont ecrites dans cache/vague2_lignes.json, que lit
demandes_membres.exporter ; les fiches existantes sont completees en base.

    python -m prospect.vague2
"""
import io
import json
import os
import re
import time
import unicodedata

from . import fiche_web as W
from .store import Store

from .prive_cfg import prive

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache")
SORTIE = os.path.join(CACHE, "vague2_lignes.json")
FORCE = os.path.join(CACHE, "statut_force.json")
EMAILS = os.path.join(CACHE, "vague2_emails.json")
DATE = "07/10/2026"

ZONE_CP = ("35170", "35131", "35136", "35890", "35230", "35770", "35580", "35650", "35310",
           "35132", "35135")
RENNES_CENTRE_SUD = re.compile(r"^(35000|35200|3504\d|35208|35207|35201|35202)\b")

EXCLUS_FISCAL = re.compile(prive("vague2", "exclus_fiscal", r"(?!)"), re.I)    # cabinets exclus par la mission
EXCLUS_FAMILLE = re.compile(prive("vague2", "exclus_famille", r"(?!)"), re.I)
SPE_EXCLUES = re.compile(r"immobilier|commercial, des affaires", re.I)
EXCLUS_PILOTAGE = re.compile(prive("vague2", "exclus_pilotage", r"(?!)"), re.I)


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _charger(p, d):
    try:
        return json.load(io.open(p, encoding="utf-8"))
    except (IOError, ValueError):
        return d


def _ligne(**kw):
    base = {"metier": "", "note": "", "nom": "", "enseigne": "", "dirigeants": "", "adresse": "",
            "commune": "", "telephone": "", "email": "", "site_web": "", "verif_metier": "",
            "date_creation": "", "tranche_effectif": "", "telephone_source": "", "email_source": "",
            "email_note": "", "alerte": "", "siret": "", "fiche": ""}
    base.update(kw)
    return base


# --------------------------------------------------------------------- notaires
def notaires(deja):
    d = _charger(os.path.join(CACHE, "notaires_fr.json"), {"offices": {}, "notaires": {}})
    lignes, vus = [], set()
    for chemin, n in sorted(d["notaires"].items()):
        o = d["offices"].get(n.get("office"), {})
        if re.search(prive("demandes_membres", "notaires_ecartes", r"(?!)"), o.get("office", "") + chemin, re.I):
            continue
        e = (n.get("email") or "").lower()
        if not e or e in deja or e in vus:
            continue
        vus.add(e)
        titre = o.get("nom_office", "")
        m = re.search(r".*à\s+(.+?)\s*\((\d{5})\)\s*\|\s*(.+)$", titre)
        commune, cp, rue = (m.group(1).strip(), m.group(2), m.group(3).strip()) if m else ("", "", "")
        nom = re.sub(r"^Notaire\s+|\s+à\s+.*$", "", n.get("titre", ""))
        # Un notaire salarie affiche souvent l'adresse de son titulaire : la
        # ligne prend alors le nom du titulaire, a qui l'adresse appartient.
        local = _plat(e.split("@")[0])
        if not any(len(t) >= 4 and t in local for t in re.split(r"[^a-z]+", _plat(nom))):
            for autre in o.get("notaires", []):
                tn = d["notaires"].get(autre, {}).get("titre", "")
                na = re.sub(r"^Notaire\s+|\s+à\s+.*$", "", tn)
                if any(len(t) >= 4 and t in local for t in re.split(r"[^a-z]+", _plat(na))):
                    nom = na
                    break
        generique = re.match(r"^(contact|office|accueil|etude|secretariat|negociation)", e)
        lignes.append(_ligne(
            metier="notaire", nom="Me " + nom, enseigne=re.sub(r"\s*à\s+.*$", "", titre).replace("Office notarial ", ""),
            dirigeants=nom, adresse="%s %s %s" % (rue, cp, commune), commune=commune.upper(),
            telephone=" ".join(re.findall(r"\d{2}", re.sub(r"\D", "", n.get("telephone", ""))))[:14],
            email=e, site_web=o.get("site", ""),
            verif_metier="CONFIRME par un registre : annuaire officiel des notaires (notaires.fr)",
            telephone_source="notaires.fr (%s)" % DATE, email_source="%s (%s)" % (n.get("fiche"), DATE),
            email_note="" if not generique else "adresse de l'office, pas nominative",
            alerte="vague 2", fiche=n.get("fiche")))
    return lignes


# ---------------------------------------------------------------------- avocats
def avocats(deja):
    bar = _charger(os.path.join(CACHE, "barreau_rennes.json"), {})
    cnb = _charger(os.path.join(CACHE, "cnb_rennes.json"), {})
    par_nom = {_plat(f["nom"]): f for f in bar.values()}
    lignes = []
    for cle, mot, exclus in (("avocat-fiscaliste", "fiscal", EXCLUS_FISCAL),
                             ("avocat-famille", "famille", EXCLUS_FAMILLE)):
        retenus = {}
        for f in bar.values():
            if any(mot in s.lower() for s in f["specialites"]):
                retenus[f["fiche"]] = (f, "CONFIRME par un registre : certificat de specialisation « %s » "
                                          "(annuaire de l'Ordre des avocats de Rennes)" %
                                       next(s for s in f["specialites"] if mot in s.lower()))
        for url in cnb.get("famille" if mot == "famille" else "fiscal", []):
            slug = re.sub(r"-\d+\.html$", "", url.rsplit("/", 1)[1])
            f = par_nom.get(_plat(slug.replace("-", " ")))
            if not f:
                # "benjamin-auguste" contre "Benjamin AUGUSTE" : comparer sans accents ni casse.
                f = next((x for k, x in par_nom.items() if k.replace("-", " ") == slug.replace("-", " ")), None)
            if f and f["fiche"] not in retenus:
                retenus[f["fiche"]] = (f, "A VERIFIER : competence en droit %s declaree au Conseil national des "
                                          "barreaux (consultation.avocat.fr), sans certificat de specialisation"
                                       % ("de la famille" if mot == "famille" else "fiscal"))
        for f, verif in retenus.values():
            if exclus.search(f["nom"] + " " + f["cabinet"]):
                continue
            if any(SPE_EXCLUES.search(s) for s in f["specialites"]):
                continue
            cp = f["cp_ville"][:5]
            if not (RENNES_CENTRE_SUD.match(f["cp_ville"]) or cp in ZONE_CP):
                continue
            e = f["email"].lower()
            if not e or e in deja:
                continue
            lignes.append(_ligne(
                metier=cle, nom="Me " + f["nom"], enseigne=f["cabinet"], dirigeants=f["nom"],
                adresse="%s %s" % (f["adresse"], f["cp_ville"]),
                commune=re.sub(r"^\d{5}\s*", "", f["cp_ville"]).split(" CEDEX")[0],
                telephone=f["telephone"], email=e, verif_metier=verif,
                date_creation=f.get("inscription", ""),
                telephone_source="%s (%s)" % (f["fiche"], DATE), email_source="%s (%s)" % (f["fiche"], DATE),
                alerte=("vague 2 ; inscrit au barreau le %s" % f.get("inscription", "?")) + (
                    " ; cabinet national (associe ou collaborateur, pas dirigeant local)"
                    if re.search(r"fidal|ey-avocats|ernst", (f["cabinet"] + " " + e).lower()) else ""),
                fiche=f["fiche"]))
    return lignes


# --------------------------------------------------------------------- pilotage
# (site, siren, email, libelle) : lus a la main sur les sites, voir prospect/prive/donnees.json
PILOTAGE = [tuple(x) for x in prive("vague2", "pilotage", [])]


def pilotage(deja):
    sites = _charger(os.path.join(CACHE, "pilotage_sites.json"), {})
    lignes = []
    for url, siren, email, verif in PILOTAGE:
        f = sites.get(url, {})
        if email in deja or EXCLUS_PILOTAGE.search(url + email):
            continue
        s = W.sirene(siren or (f.get("sirens") or [""])[0]) if (siren or f.get("sirens")) else None
        if not s:
            q = re.sub(r"^https?://(www\.)?|\..*$", "", url)
            s = _sirene_nom(q)
        if not s and "innovatis" in url:
            # SIRENE ne trouve pas ce nom ; l'adresse est celle du site.
            s = {"nom": "INNOVATIS CONSEIL", "adresse": "106A rue Eugene Pottier CS 51129 35011 RENNES",
                 "commune": "RENNES"}
        lignes.append(_ligne(
            metier="pilotage-tpe", nom=(s or {}).get("nom", q if not s else ""), dirigeants=(s or {}).get("dirigeants", ""),
            adresse=(s or {}).get("adresse", ""), commune=((s or {}).get("commune") or "").upper(),
            telephone=(f.get("telephones") or [""])[0], email=email, site_web=url,
            verif_metier="CONFIRME sur son site : " + verif,
            date_creation=(s or {}).get("date_creation", ""), tranche_effectif=(s or {}).get("tranche_effectif", ""),
            telephone_source="%s (%s)" % (url, DATE) if f.get("telephones") else "",
            email_source="%s (%s)" % (f.get("emails", {}).get(email, url), DATE),
            alerte="vague 2", siret=(s or {}).get("siret", ""),
            fiche=("https://annuaire-entreprises.data.gouv.fr/entreprise/%s" % s["siren"]) if s and s.get("siren") else url))
    return lignes


def _sirene_nom(q):
    import urllib.parse
    import urllib.request
    u = "https://recherche-entreprises.api.gouv.fr/search?q=%s&departement=35&per_page=1" % urllib.parse.quote(q)
    try:
        r = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "Mozilla/5.0"}),
                                             timeout=30))["results"]
        time.sleep(0.2)
    except Exception:
        return None
    return W.sirene(r[0]["siege"]["siret"]) if r else None


# -------------------------------------------------------------------- assureurs
# Agents generaux IARD lus sur les portails, rattaches aux fiches SIRENE.
# nom en base -> (email, url source, statut force eventuel) : prospect/prive/donnees.json
ASSUREURS_EXISTANTS = {k: tuple(v) for k, v in prive("vague2", "assureurs_existants", {}).items()}
# (siren, email, url, commune, adresse, telephone, libelle) : prospect/prive/donnees.json
ASSUREURS_NOUVEAUX = [tuple(x) for x in prive("vague2", "assureurs_nouveaux", [])]


def assureurs(store, deja, force):
    poses = 0
    for nom, (email, url, f) in ASSUREURS_EXISTANTS.items():
        for r in store.cx.execute(
                "SELECT e.siret FROM etablissement e JOIN candidature c ON c.siret=e.siret "
                "WHERE c.metier='assureur-iard' AND e.nom LIKE ?", (nom + "%",)).fetchall():
            if store.poser_valeur(r["siret"], "email", email, "portail compagnie %s (%s)" % (url, DATE),
                                  "site_officiel"):
                poses += 1
        if f:
            force[email] = f
    lignes = []
    for siren, email, url, commune, adr, tel, libelle in ASSUREURS_NOUVEAUX:
        if email in deja:
            continue
        s = (W.sirene(siren) if siren else None) or {}
        lignes.append(_ligne(
            metier="assureur-iard", nom=libelle, dirigeants=s.get("dirigeants", ""),
            adresse=s.get("adresse", ""), commune=commune, telephone=tel, email=email,
            verif_metier="CONFIRME par la compagnie : agent general IARD liste sur %s ; NAF %s" % (
                url.split(" ")[0], s.get("naf", "")),
            date_creation=s.get("date_creation", ""), tranche_effectif=s.get("tranche_effectif", ""),
            telephone_source="%s (%s)" % (url, DATE) if tel else "", email_source="%s (%s)" % (url, DATE),
            alerte="vague 2 ; agence de %s, siege de l'entreprise : %s" % (commune.title(), s.get("commune", "?")),
            siret=s.get("siret", ""),
            fiche=("https://annuaire-entreprises.data.gouv.fr/entreprise/%s" % siren) if siren else url))
    return poses, lignes


NOTION_NOMS = re.compile(prive("vague2", "notion_noms", r"(?!)"), re.I)    # deja dans Notion


def _rows_sheet(metiers):
    import csv
    out = []
    for f in ("bruz_entreprises_actuelles.csv", "zone_sud.csv", "demandes_membres.csv", "bruz_lot2.csv",
              "bruz_lot4.csv"):
        p = os.path.join(os.path.dirname(RACINE), "data", "prospection", f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                # Les fiches de la vague 2 elle-meme ne sont pas des doublons.
                if r["metier"] in metiers and "vague 2" not in (r.get("alerte") or ""):
                    out.append(r)
    return out


def rapprocher(store, lignes, metiers):
    """Une personne deja dans le Sheet ou dans Notion n'est pas une nouvelle fiche.

    Present avec un email : ecarte. Present sans email : on complete la fiche
    existante (meme source d'autorite) au lieu de creer un doublon."""
    rows = _rows_sheet(metiers)
    gardees, completees, ecartees = [], 0, []
    for l in lignes:
        if l["metier"] not in metiers:
            gardees.append(l)
            continue
        nom = _plat(l["dirigeants"] or l["nom"])
        mots = [m for m in re.split(r"[^a-z]+", nom) if len(m) >= 3 and m not in ("selarl", "sarl")]
        nom_famille = mots[-1] if mots else ""
        famille = "notaire" if l["metier"] == "notaire" else ("avocat" if "avocat" in l["metier"] else l["metier"])
        if l["metier"] == "notaire" and NOTION_NOMS.search(nom + " " + _plat(l["enseigne"]) + " " + l["email"]):
            ecartees.append((l["nom"], "deja dans Notion"))
            continue
        # Meme famille de metier, et prenom ET nom presents : "Michel" prenom
        # ne doit pas rappeler Me Rozenn Michel, ni un assureur une avocate.
        cibles = [r for r in rows if mots and r["metier"].startswith(famille)
                  and all(re.search(r"\b%s\b" % m, _plat(r["nom"] + " " + r["dirigeants"])) for m in mots)]
        if not cibles:
            gardees.append(l)
            continue
        if any(r["email"] for r in cibles):
            ecartees.append((l["nom"], "deja dans le Sheet avec email : %s" % cibles[0]["nom"]))
            continue
        for r in cibles:
            if r["siret"]:
                store.poser_valeur(r["siret"], "email", l["email"], l["email_source"], "registre")
                if l["telephone"]:
                    store.poser_valeur(r["siret"], "telephone", l["telephone"], l["telephone_source"], "registre")
                completees += 1
        ecartees.append((l["nom"], "fiche existante completee : %s" % cibles[0]["nom"]))
    return gardees, completees, ecartees


def main():
    base = _charger(os.path.join(CACHE, "vague2_base.json"), {"emails": []})
    notion = set(_charger(os.path.join(CACHE, "notion_emails.json"), []))
    deja = set(base["emails"]) | notion
    force = _charger(FORCE, {})
    store = Store()
    poses, l_ass = assureurs(store, deja, force)
    store.valider()
    lignes = notaires(deja) + avocats(deja) + pilotage(deja) + l_ass
    lignes, completees, ecartees = rapprocher(store, lignes, {"notaire", "avocat-fiscaliste", "avocat-famille",
                                                             "avocat", "assureur-iard"})
    store.valider()
    print("fiches existantes completees : %d" % completees)
    for n, r in ecartees:
        print("  ecarte %-45s %s" % (n[:45], r))
    # Doublons internes (un meme email sur deux metiers) : on garde le premier.
    vus, uniques = set(), []
    for l in lignes:
        if l["email"] in vus:
            continue
        vus.add(l["email"])
        uniques.append(l)
    io.open(SORTIE, "w", encoding="utf-8").write(json.dumps(uniques, ensure_ascii=False, indent=1))
    # Un email publie par l'annuaire du barreau est nominatif et verifie :
    # OK meme si le domaine est celui d'un cabinet au nom different.
    from .fiabiliser import WEBMAILS
    for l in uniques:
        if "avocat" in l["metier"] and l["email"].split("@")[1] not in WEBMAILS:
            force[l["email"]] = ["OK", "email nominatif publie par l'annuaire de l'Ordre des avocats de Rennes"]
    io.open(FORCE, "w", encoding="utf-8").write(json.dumps(force, ensure_ascii=False, indent=1))
    io.open(EMAILS, "w", encoding="utf-8").write(json.dumps(sorted(vus), ensure_ascii=False))
    from collections import Counter
    print("assureurs existants completes : %d valeurs" % poses)
    for m, n in Counter(l["metier"] for l in uniques).items():
        print("  %-20s %d nouvelles fiches" % (m, n))


if __name__ == "__main__":
    main()
