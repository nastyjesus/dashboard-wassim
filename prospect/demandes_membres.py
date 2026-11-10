# -*- coding: utf-8 -*-
"""Demandes des membres du 05/10/2026.

Trois metiers nouveaux, deux elargissements, deux recherches nominatives.
Ce module fait ce que l'extraction SIRENE seule ne sait pas faire :

1. Negociateur fonds de commerce. 68.31Z melange agences residentielles et
   specialistes. La formule "transactions sur immeubles et fonds de
   commerce" ne prouve rien : c'est le libelle de la carte T (loi Hoguet),
   repris par presque toutes les agences. On garde une agence seulement si
   son NOM ou son activite declaree parle d'entreprise, de commerce, de
   cession ou d'emplacements commerciaux. Les autres perdent la candidature
   "negociateur" mais restent agents immobiliers : une exclusion serait
   globale au SIRET et les sortirait aussi de l'onglet agent immobilier.

2. Notaires a Rennes et en deuxieme couronne. Le filtre par mot-cle dans le
   nom rate les etudes au nom du notaire. L'autorite est l'annuaire de la
   Chambre des notaires de l'Ouest (cache/notaires_annuaire_rennes.tsv,
   releve le 05/10/2026) : il donne l'email et le telephone de l'etude.

    python -m prospect.demandes_membres
"""
import csv
import io
import json
import os
import re
import unicodedata

from . import sources as S
from .store import Store

from .prive_cfg import prive

RACINE = os.path.dirname(os.path.abspath(__file__))
ANNUAIRE = os.path.join(RACINE, "cache", "notaires_annuaire_rennes.tsv")
SOURCE_ANNUAIRE = "annuaire Chambre des notaires de l'Ouest (05/10/2026)"

# Offices ecartes a la demande des membres : deja en relation avec le groupe.
NOTAIRES_ECARTES = re.compile(prive("demandes_membres", "notaires_ecartes", r"(?!)"), re.I)    # offices exclus par la demande

# Specialistes repérés a Rennes : le nom suffit a les qualifier.
NOM_SPECIALISTE = re.compile(
    r"COMMERC|ENTREPRISE|CESSION|FONDS|BUSINESS|EMPLACEMENT|SIMOND|ARTHUR LOYD|"
    r"CBRE|BNP PARIBAS REAL|CUSHMAN|LINOVIM")
# Faux amis : "transaction" dans le nom d'une agence residentielle, ou
# un expert (JLL Expertises) qui n'est pas negociateur.
NOM_FAUX_AMI = re.compile(r"FONCIA|SQUARE HABITAT|CABHT|QUADRAL|GIBOIRE TRANSACTION|"
                          r"EXPERTISE|TRANSACTION 21|"
                          # Filiales nationales : le responsable local n'est pas
                          # dirigeant, meme regle que RESEAUX_NATIONAUX. Les
                          # franchises (Arthur Loyd, Cushman via Dauphin, Michel
                          # Simond) ont un dirigeant local et restent.
                          r"BNP PARIBAS REAL|CBRE")
# Activite declaree au BODACC qui distingue un specialiste.
ACTIVITE_SPECIALISTE = re.compile(
    r"immobilier d.entreprise|emplacements? commerciau|cession d.entreprise|"
    r"transactions? sur fonds de commerce|locaux commerciaux|bureaux et commerces")

RENNES = "35238"


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().upper()


def negociateurs(store, activites):
    """Ne garde la candidature "negociateur" que pour les specialistes."""
    metier = "negociateur-fonds-commerce"
    gardes, retires = [], 0

    # Rennes : extraction ciblee par le nom (400 agences, la plupart residentielles).
    for e in S.sirene("68.31Z", [RENNES]):
        nom = _plat("%s %s" % (e["nom"], e["enseigne"]))
        if NOM_SPECIALISTE.search(nom) and not NOM_FAUX_AMI.search(nom):
            store.poser_etablissement(dict(e, metier=metier))
            store.poser_candidature(e["siret"], metier)
            store.poser_valeur(e["siret"], "metier_reel", "Negociateur fonds de commerce",
                               "nom de l'etablissement", "deduit")

    for r in store.cx.execute(
            "SELECT e.siret, e.nom, e.enseigne, e.code_commune FROM etablissement e"
            " JOIN candidature c ON c.siret = e.siret WHERE c.metier = ?", (metier,)).fetchall():
        nom = _plat("%s %s" % (r["nom"], r["enseigne"]))
        act = " ".join(x["texte"] for x in activites.get(r["siret"], []))
        act = unicodedata.normalize("NFKD", act).encode("ascii", "ignore").decode().lower()
        if NOM_FAUX_AMI.search(nom):
            ok = False
        elif NOM_SPECIALISTE.search(nom):
            ok = True
        else:
            ok = bool(ACTIVITE_SPECIALISTE.search(act))
        if ok:
            gardes.append(r["siret"])
        else:
            store.cx.execute("DELETE FROM candidature WHERE siret=? AND metier=?",
                             (r["siret"], metier))
            retires += 1
    store.valider()
    return gardes, retires


def _cle_adresse(adresse):
    """Numero + premier mot significatif de la voie : assez pour apparier."""
    a = _plat(adresse)
    m = re.search(r"(\d+)\s*(?:B|BIS|TER|A)?\s+(?:RUE|BD|BOULEVARD|AVENUE|AV|PLACE|QUAI|MAIL|"
                  r"SQUARE|ALLEE|IMPASSE|COURS)?\s*(?:DE LA |DU |DES |DE L |DE |D )?([A-Z]+)", a)
    return (m.group(1), m.group(2)) if m else None


def notaires(store):
    """Pose les etudes de l'annuaire en base, appariees a SIRENE par l'adresse."""
    metier = "notaire"
    lignes = list(csv.DictReader(io.open(ANNUAIRE, encoding="utf-8"), delimiter="\t"))
    communes = {"RENNES": RENNES, "VEZIN-LE-COQUET": "35353", "CHANTEPIE": "35055",
                "CHAVAGNE": "35076", "MORDELLES": "35196", "L'HERMITAGE": "35131"}
    sirene = {}
    for code in set(communes.values()):
        for e in S.sirene("69.10Z", [code]):
            k = _cle_adresse(e["adresse"])
            if k:
                sirene.setdefault((code, k), []).append(e)

    poses, sans_siret = 0, []
    for l in lignes:
        if NOTAIRES_ECARTES.search(l["nom"] + " " + l["notaires"]):
            continue
        code = communes[l["commune"]]
        cands = sirene.get((code, _cle_adresse(l["adresse"])), [])
        # Plusieurs etablissements a la meme adresse (avocats, notaires) : on
        # prefere celui dont le nom cite l'etude ou un de ses notaires.
        noms = [_plat(x.split()[0]) for x in l["notaires"].split(",") if x.strip()]
        choix = [e for e in cands if any(n and n in _plat(e["nom"] + " " + (e["enseigne"] or ""))
                                         for n in noms + [_plat(l["nom"]).split()[-1]])]
        # Sans nom commun, l'adresse seule ne suffit pas : au 2 rue de Rohan,
        # l'etablissement SIRENE est celui d'une autre personne que l'etude
        # en cours d'installation. On n'apparie pas plutot que de se tromper.
        e = (choix or [None])[0]
        if not e:
            sans_siret.append(l["nom"])
            continue
        store.poser_etablissement(dict(e, metier=metier))
        store.repecher(e["siret"])
        store.poser_candidature(e["siret"], metier)
        store.poser_valeur(e["siret"], "metier_reel", "Notaire (%s)" % l["nom"],
                           SOURCE_ANNUAIRE, "registre")
        if l["email"]:
            store.poser_valeur(e["siret"], "email", l["email"], SOURCE_ANNUAIRE, "registre")
        if l["telephone"]:
            store.poser_valeur(e["siret"], "telephone", l["telephone"], SOURCE_ANNUAIRE, "registre")
        if l["site"]:
            store.poser_valeur(e["siret"], "site_web", l["site"], SOURCE_ANNUAIRE, "registre")
        poses += 1
    store.valider()
    return poses, sans_siret


COURONNE2 = {"35076", "35037", "35353", "35196", "35149", "35033", "35054",
             "35131", "35090", "35055"}
VERS = os.path.join(os.path.dirname(RACINE), "data", "prospection", "demandes_membres.csv")

# Perimetre de chaque demande, en codes INSEE. None = tout ce qui est en base.
PERIMETRE = {
    "negociateur-fonds-commerce": None,
    "gestionnaire-biens": None,
    "agence-evenementielle": None,
    "notaire": {RENNES} | COURONNE2,       # elargissement : Bruz et zone sud deja faits
    "electricien": COURONNE2,              # vague 2 (07/10/2026) : zone sud deja en Z. Electricien
    "plombier-chauffagiste": COURONNE2 | {RENNES},  # Bruz et zone sud deja faits ; Rennes ajoute le 05/10/2026
}

# Recherches nominatives demandees par des membres du chapitre : fiches
# completees a la main (SIRENE, BODACC, mentions legales des sites).
# Contenu nominatif : prospect/prive/donnees.json, hors git.
NOMINATIFS = prive("demandes_membres", "nominatifs", [])


def exporter():
    import tempfile
    from . import exporter_lot as X
    store = Store()
    codes = {r["siret"]: r["code_commune"] for r in store.cx.execute(
        "SELECT siret, code_commune FROM etablissement")}
    lignes = []
    for metier, perimetre in PERIMETRE.items():
        tmp = os.path.join(tempfile.gettempdir(), "membres_%s.csv" % metier)
        for r in X.exporter([metier], tmp):
            if perimetre is None or codes.get(r["siret"]) in perimetre:
                lignes.append(r)
    # Etudes de l'annuaire sans etablissement SIRENE apparie : elles existent
    # (l'annuaire fait foi) et ont des coordonnees, on les montre quand meme.
    deja = {l["nom"] for l in lignes}
    poses = {r["valeur"] for r in store.cx.execute(
        "SELECT valeur FROM valeur WHERE champ='metier_reel' AND source=?", (SOURCE_ANNUAIRE,))}
    for l in csv.DictReader(io.open(ANNUAIRE, encoding="utf-8"), delimiter="	"):
        if NOTAIRES_ECARTES.search(l["nom"]) or "Notaire (%s)" % l["nom"] in poses:
            continue
        if l["nom"] in deja:
            continue
        lignes.append({
            "metier": "notaire", "nom": l["nom"], "dirigeants": l["notaires"],
            "adresse": "%s %s %s" % (l["adresse"], l["cp"], l["commune"]), "commune": l["commune"],
            "telephone": l["telephone"], "email": l["email"], "site_web": l["site"],
            "verif_metier": "CONFIRME par un registre : annuaire de la Chambre des notaires",
            "telephone_source": SOURCE_ANNUAIRE if l["telephone"] else "",
            "email_source": SOURCE_ANNUAIRE if l["email"] else "",
            "alerte": "etablissement SIRENE non apparie (office recent ou adresse differente)",
            "fiche": "https://chambredesnotairesdelouest.fr/etudes/%s/" % l["fiche"]})
    lignes += NOMINATIFS
    # Vague 2 (07/10/2026) : fiches construites depuis les annuaires
    # d'autorite (notaires.fr, barreau, portails des compagnies, sites).
    p2 = os.path.join(RACINE, "cache", "vague2_lignes.json")
    if os.path.exists(p2):
        lignes += json.load(io.open(p2, encoding="utf-8"))
    for l in lignes:
        for c in X.COLS:
            l.setdefault(c, "")
    with io.open(VERS, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=X.COLS, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    return lignes


def main():
    import json
    import sys
    if "--exporter" in sys.argv:
        lignes = exporter()
        print("%-28s %6s %6s %6s" % ("metier", "fiches", "tel", "email"))
        for m in list(PERIMETRE) + ["nominatif"]:
            s = [l for l in lignes if l["metier"] == m]
            print("%-28s %6d %6d %6d" % (m, len(s), sum(1 for l in s if l["telephone"]),
                                         sum(1 for l in s if l["email"])))
        print("-> %s" % VERS)
        return
    store = Store()
    act = {}
    p = os.path.join(RACINE, "cache", "activite_fonds.json")
    if os.path.exists(p):
        for x in json.load(io.open(p, encoding="utf-8")):
            act[x["siret"]] = x.get("enonces", [])
    gardes, retires = negociateurs(store, act)
    print("negociateurs fonds de commerce : %d gardes, %d agences residentielles retirees"
          % (len(gardes), retires))
    poses, sans = notaires(store)
    print("notaires de l'annuaire : %d poses en base" % poses)
    for n in sans:
        print("  sans SIRET apparie : %s" % n)


if __name__ == "__main__":
    main()
