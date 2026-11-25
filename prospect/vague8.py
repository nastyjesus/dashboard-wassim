# -*- coding: utf-8 -*-
"""Vague 8 (brief du 24/11/2026) : trente metiers, commerce local, BTP
second oeuvre et complements des vagues 6 et 7, sourcing seulement.

Meme chaine que les vagues 5 et 6 (prospect.vague5) avec ses parametres :
- zone : 25 km autour de Bruz, Rennes entiere comprise ; communes du brief
  en tete de chaque onglet ;
- metier prouve par le nom, le BODACC ou le site ; codes NAF fourre-tout
  sans preuve ecartes ; avocats en droit du travail : certificat de
  specialisation publie par l'Ordre des avocats de Rennes ;
- dedoublonnage par SIRET contre toutes les sections (vagues 2 a 6) ; contre
  les onglets V7 (sans SIRET) et le CRM Notion par email, telephone et nom :
  la fiche reste visible en EXCLURE avec la raison ;
- volume : 25 fiches au plus par metier (1 a 15), 15 pour les complements.

Exclusions nominatives du brief (personnes a ne pas contacter, conflits) :
prospect/prive/donnees.json, hors git.

    python -m prospect.vague8 selection|verifier|reduire|exporter|signaler|plafonner|classeur|livrables|codes
"""
import csv
import io
import json
import math
import os
import re
import sys
import unicodedata

from . import vague5 as V
from .prive_cfg import prive

# Regles des vagues precedentes, relevees avant que chaque module ne les remplace.
P5, C5, R5 = dict(V.PREUVES), dict(V.CONTRE), dict(V.RESEAUX_METIER)
G5, D5 = V.GROUPES_SANS_FRANCHISE.pattern, V.DOMAINES_RESEAUX.pattern
from . import vague6 as V6  # noqa: E402
P6, C6, R6 = dict(V.PREUVES), dict(V.CONTRE), dict(V.RESEAUX_METIER)
G6, D6, ETI6 = V.GROUPES_SANS_FRANCHISE.pattern, V.DOMAINES_RESEAUX.pattern, set(V.ETI_GARDEES)
from . import vague6b as V6B  # noqa: E402,F401
P6B, C6B, R6B = dict(V.PREUVES), dict(V.CONTRE), dict(V.RESEAUX_METIER)
G6B = V.GROUPES_SANS_FRANCHISE.pattern

V.PREFIXE = "v8"
V.FICHIER = "vague8"
V.LIBELLE = "vague 8"
V.ONGLET = "V8. "
V.SECTIONS_EXISTANTES = list(dict.fromkeys(V.SECTIONS_EXISTANTES + ["vague5.csv", "vague6.csv", "vague6b.csv"]))

V.METIERS = ["cuisiniste", "caviste", "fleuriste", "traiteur", "imprimeur", "audioprothesiste", "opticien",
             "agence-voyages", "laveur-vitres", "couvreur", "pac-climatisation", "carreleur",
             "serrurier-metallier", "terrassement-assainissement", "cheminees-poeles",
             "veterinaire", "pompes-funebres", "joaillerie", "piscine-spa", "carrosserie", "concession-vl",
             "concession-vu", "macon", "menuiserie-exterieure", "bureau-etude-thermique",
             "immobilier-commercial", "constructeur-maisons", "diagnostiqueur-immobilier",
             "avocat-droit-travail", "paie-rh"]
PREMIERS = V.METIERS[:15]          # 10 a 25 fiches ; les complements : 5 a 15
PLAFOND = {m: (25 if m in PREMIERS else 15) for m in V.METIERS}

# 25 km autour de Bruz (python -m prospect communes --autour 35047 --rayon 25).
V.COMMUNES = set(
    "35047,35363,35066,35076,35281,35139,35123,35206,35266,35208,35126,35037,35032,35353,35196,35352,"
    "35149,35033,35054,35131,35090,35055,35312,35250,35127,35351,35016,35080,35088,35065,35231,35210,"
    "35218,35319,35204,35189,35331,35278,35051,35099,35275,35057,35221,35041,35212,35059,35321,35322,"
    "35035,35040,35289,35187,35334,35024,35002,35081,35216,35340,35188,35207,35155,35227,35069,35175,"
    "35136,35120,35177,35039,35030,35169,35001,35012,35343,35173,35176,35168,35203,35089,35023,35079,"
    "35151,35305,35197,35327,35193,35245,35315,35133,35223,35144".split(","))
V.QUARTIERS = set(range(1, 13))       # Rennes entiere
BRUZ = (48.0247, -1.7458)


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _cle_commune(s):
    return re.sub(r"[^a-z]", "", _plat(s).replace("saint", "st"))


PRIORITAIRES = ["Bruz", "Chartres-de-Bretagne", "Pont-Péan", "Saint-Jacques-de-la-Lande", "Laillé", "Guichen",
                "Goven", "Orgères", "Noyal-Châtillon-sur-Seiche", "Vern-sur-Seiche", "Chantepie", "Le Rheu",
                "Vezin-le-Coquet", "Mordelles", "Bréal-sous-Montfort", "Rennes"]
SECONDES = ["Cesson-Sévigné", "Châteaugiron", "Janzé", "Bain-de-Bretagne", "Montfort-sur-Meu", "Saint-Gilles",
            "Pacé", "Betton"]
RANG = {_cle_commune(c): i for i, c in enumerate(PRIORITAIRES + SECONDES)}
V.PRIORITAIRES = {c.upper() for c in PRIORITAIRES} | {_plat(c).upper() for c in PRIORITAIRES}

# ------------------------------------------------------------------ regles
V.GROUPES_SANS_FRANCHISE = re.compile("%s|%s|%s" % (G5, G6, G6B), re.I)
V.DOMAINES_RESEAUX = re.compile(
    "%s|%s|nicolas\\.com|vandb\\.fr|cavavin|monceaufleurs|rapid-flore|interflora|aquarelle|selectour|"
    "havas-voyages|tui\\.fr|leclercvoyages|salaun|marietton|optic2000|krys|afflelou|atol|audika|amplifon" % (D5, D6))
V.RESEAUX_METIER = {}
for d in (R5, R6, R6B):
    V.RESEAUX_METIER.update(d)
V.RESEAUX_METIER.update({
    "caviste": r"\b(nicolas|v and b|v ?& ?b|cavavin|repaire de bacchus|la grande cave|cellier|intercaves)\b",
    "fleuriste": r"\b(monceau fleurs|rapid.?flore|au nom de la rose|interflora|aquarelle|happy|bergamotte|"
                 r"le jardin des fleurs|emova)\b",
    "agence-voyages": r"\b(selectour|havas|tui|leclerc voyages|marietton|salaun|fram|carrefour voyages|"
                      r"thomas cook|voyages auchan|cediv)\b",
    "pac-climatisation": r"\b(engie home services|proxiserve|dalkia|idex)\b",
    "constructeur-maisons": r"\b(maisons france confort|maisons pierre|trecobat|maisons d.en france|"
                            r"mikit|maisons phenix|maisons babeau|alliance construction|la maison bois)\b",
    "diagnostiqueur-immobilier": r"\b(ac environnement|agenda diagnostics|diagamter|ex.?im|allo diagnostic|"
                                 r"defim|diagnostic immobilier france)\b",
})

V.PREUVES = {}
for d in (P5, P6, P6B):
    V.PREUVES.update(d)
V.PREUVES.update({
    "caviste": r"\bcaves?\b|caviste|\bvins?\b|spiritueux|oenolog|whisk|bieres?|champagne|vignob",
    "fleuriste": r"fleur|floral|florist|bouquet|\bflore\b",
    "traiteur": r"traiteur|reception|evenement|cocktail|buffet|mariage|seminaire|banquet",
    "agence-voyages": r"voyage|travel|tourisme|sejour|croisiere|tour.?operat|circuit",
    "laveur-vitres": r"vitr|laveur|lavage de vitres|nettoyage de vitres",
    "couvreur": r"couvr|couverture|zingu|\bzinc|toiture|charpent|ardois",
    "pac-climatisation": r"pompes? a chaleur|\bpac\b|climatis|\bclim\b|frigori|aerotherm|geotherm|\bfroid\b|"
                         r"\bcvc\b|genie climatique|energies? renouvelables|thermodynam",
    "carreleur": r"carrel|faience|mosaiqu",
    "serrurier-metallier": r"serrur|metall|ferronn|soudure|chaudronn|portail",
    "constructeur-maisons": r"maisons?|constructeur|\bccmi\b|pavillon",
    "diagnostiqueur-immobilier": r"diagnost|\bdpe\b|amiante|termite|carrez",
    "avocat-droit-travail": r"droit (du travail|social)|travailliste|relations sociales",
    "paie-rh": r"\bpaie\b|payroll|gestion sociale|administration du personnel|externalis|temps partage",
    "imprimeur": r"imprim|impression|reprograph|serigraph|offset|signaletique|copie",
})
V.CONTRE = {}
for d in (C5, C6, C6B):
    V.CONTRE.update(d)
V.CONTRE.update({
    "traiteur": r"pizz|kebab|food.?truck|burger|sushi|tacos|snack|friterie|crepe|^(?!.*(traiteur|reception|"
                r"evenement|cocktail|buffet|mariage)).*plats? (a emporter|prepares|cuisines)",
    "imprimeur": r"^(?!.*(imprim|impression|serigraph|offset|reprograph)).*(graphis|infograph|\bpao\b|web)",
    "constructeur-maisons": r"maitr(e|ise) d.?oeuvre|\bmoe\b",
    "fleuriste": r"animal|croquette|toilett",
    "paie-rh": r"^(?!.*\bpaie\b).*(recrut|chasse de tete|coaching|bilan de competences)",
    "caviste": r"tabac|epicerie fine(?!.*\bvin)",
})
V.NAF_FIABLE = {"opticien", "macon", "joaillerie", "pompes-funebres", "veterinaire", "terrassement-assainissement",
                "caviste", "fleuriste", "traiteur", "agence-voyages", "couvreur", "serrurier-metallier"}
V.ETI_GARDEES = ETI6
V.NOTION = None                 # CRM traite par signaler() : la fiche reste visible en EXCLURE
# Registre RPPS : tous les codes postaux deja releves.
V.RPPS_PROF = {"audioprothesiste": "audioproth"}
V.CP_V5 = sorted(re.sub(r"\D", "", f) for f in os.listdir(V.CACHE) if re.match(r"rpps_\d{5}\.txt$", f))

V.ONGLETS = {
    "cuisiniste": "V8. Cuisiniste", "caviste": "V8. Caviste", "fleuriste": "V8. Fleuriste",
    "traiteur": "V8. Traiteur", "imprimeur": "V8. Imprimeur", "audioprothesiste": "V8. Audioprothésiste",
    "opticien": "V8. Opticien", "agence-voyages": "V8. Agence de voyages", "laveur-vitres": "V8. Laveur de vitres",
    "couvreur": "V8. Couvreur", "pac-climatisation": "V8. PAC-climatisation", "carreleur": "V8. Carreleur",
    "serrurier-metallier": "V8. Serrurier-métallier", "terrassement-assainissement": "V8. Terrassement",
    "cheminees-poeles": "V8. Cheminées-poêles", "veterinaire": "V8. Vétérinaire",
    "pompes-funebres": "V8. Pompes funèbres", "joaillerie": "V8. Joaillerie", "piscine-spa": "V8. Piscine-spa",
    "carrosserie": "V8. Carrosserie", "concession-vl": "V8. Concession VL", "concession-vu": "V8. Concession VU",
    "macon": "V8. Maçon", "menuiserie-exterieure": "V8. Menuiserie extérieure",
    "bureau-etude-thermique": "V8. Bureau étude thermique", "immobilier-commercial": "V8. Immobilier commercial",
    "constructeur-maisons": "V8. Constructeur maisons", "diagnostiqueur-immobilier": "V8. Diagnostiqueur",
    "avocat-droit-travail": "V8. Avocat droit du travail", "paie-rh": "V8. Paie-RH"}

# Groupe nominal pour « Le Groupe cherche {{Metier}} pour rejoindre ses membres ».
ARTICLE = {
    "cuisiniste": "un cuisiniste", "caviste": "un caviste", "fleuriste": "un fleuriste", "traiteur": "un traiteur",
    "imprimeur": "un imprimeur", "audioprothesiste": "un audioprothésiste", "opticien": "un opticien",
    "agence-voyages": "une agence de voyages", "laveur-vitres": "un laveur de vitres", "couvreur": "un couvreur",
    "pac-climatisation": "un chauffagiste spécialiste pompe à chaleur et climatisation", "carreleur": "un carreleur",
    "serrurier-metallier": "un serrurier-métallier", "terrassement-assainissement": "une entreprise de terrassement",
    "cheminees-poeles": "un spécialiste cheminées et poêles", "veterinaire": "un vétérinaire",
    "pompes-funebres": "une entreprise de pompes funèbres", "joaillerie": "un joaillier",
    "piscine-spa": "un spécialiste piscines et spas", "carrosserie": "un carrossier",
    "concession-vl": "une concession automobile", "concession-vu": "une concession de véhicules utilitaires",
    "macon": "un maçon", "menuiserie-exterieure": "un menuisier en fenêtres, portes et volets",
    "bureau-etude-thermique": "un bureau d'étude thermique", "immobilier-commercial": "un spécialiste de l'immobilier d'entreprise",
    "constructeur-maisons": "un constructeur de maisons individuelles", "diagnostiqueur-immobilier": "un diagnostiqueur immobilier",
    "avocat-droit-travail": "un avocat en droit du travail", "paie-rh": "un spécialiste de la paie et des RH externalisées"}

CONNUS = [tuple(x) for x in prive("vague8", "connus", [])] + [tuple(x) for x in prive("vague6b", "connus", [])]
EXTERNE = os.path.join(V.CACHE, "v8_externe.json")    # onglets V7 et CRM Notion (releve du 24/11/2026)
CSV = os.path.join(V.DONNEES, "vague8.csv")


def _km(lat, lon):
    if lat is None or lon is None:
        return 99.0
    a, b = math.radians(BRUZ[0]), math.radians(lat)
    d = math.sin((b - a) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(math.radians(lon - BRUZ[1]) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(d))


def _rang(commune):
    return RANG.get(_cle_commune(commune), 99)


# ------------------------------------------------------------- avocats
def _barreau_travail():
    """Avocats titulaires d'un certificat droit du travail / protection sociale (Ordre de Rennes)."""
    d = json.load(io.open(os.path.join(V.CACHE, "barreau_rennes.json"), encoding="utf-8"))
    return [x for x in d.values() if any(re.search(r"travail|sociale", _plat(s)) for s in x.get("specialites", []))]


def verifier():
    """Verification commune, puis les avocats : le certificat de l'Ordre fait foi."""
    V.verifier()
    from .store import Store
    store = Store()
    sel = json.load(io.open(os.path.join(V.CACHE, "v8_selection.json"), encoding="utf-8"))
    p = os.path.join(V.CACHE, "v8_verifies.json")
    ver = json.load(io.open(p, encoding="utf-8"))
    deja = {(c["siret"], c["metier"]) for c in ver}
    avocats = _barreau_travail()
    n = 0
    for c in sel:
        if c["metier"] != "avocat-droit-travail" or (c["siret"], c["metier"]) in deja:
            continue
        e = store.cx.execute("SELECT nom, enseigne, dirigeants FROM etablissement WHERE siret=?", (c["siret"],)).fetchone()
        ident = _plat("%s %s %s" % (e["nom"], e["enseigne"] or "", e["dirigeants"] or ""))
        for a in avocats:
            mots = [m for m in re.split(r"[^a-z]+", _plat(a["nom"])) if len(m) >= 3]
            cab = [m for m in re.split(r"[^a-z]+", _plat(a["cabinet"])) if len(m) >= 4 and m not in
                   ("cabinet", "individuel", "avocats", "associes", "avocat")]
            if (mots and all(m in ident for m in mots)) or (cab and all(m in ident for m in cab)):
                c.update({"verdict": "CONFIRME", "source_verdict": "certificat de specialisation %s (annuaire de "
                          "l'Ordre des avocats de Rennes, %s)" % (", ".join(a["specialites"]), a["nom"]),
                          "barreau": a["fiche"]})
                ver.append(c)
                n += 1
                break
    # Concessions VL : le nom porte rarement la marque. Un commerce de voitures
    # (45.11Z) de 10 salaries ou plus est une concession probable, a verifier.
    deja = {(c["siret"], c["metier"]) for c in ver}
    nc = 0
    for c in sel:
        if c["metier"] != "concession-vl" or (c["siret"], c["metier"]) in deja:
            continue
        e = store.cx.execute("SELECT naf, tranche_effectif FROM etablissement WHERE siret=?", (c["siret"],)).fetchone()
        if e["naf"] == "45.11Z" and (e["tranche_effectif"] or "00") >= "11" and e["tranche_effectif"] != "NN":
            c.update({"verdict": "A VERIFIER", "source_verdict": "commerce de voitures (45.11Z) de 10 salaries ou plus"})
            ver.append(c)
            nc += 1
    io.open(p, "w", encoding="utf-8").write(json.dumps(ver, ensure_ascii=False))
    print("avocats confirmes par l'Ordre : %d ; concessions probables : %d" % (n, nc))


def reduire():
    """Avant l'enrichissement : garde les meilleurs candidats de chaque metier
    (communes du brief d'abord, metier confirme, distance), deux fois le
    plafond, pour ne pas enqueter sur 600 couvreurs."""
    from .store import Store
    store = Store()
    p = os.path.join(V.CACHE, "v8_verifies.json")
    ver = json.load(io.open(p, encoding="utf-8"))
    io.open(os.path.join(V.CACHE, "v8_verifies_complet.json"), "w", encoding="utf-8").write(json.dumps(ver, ensure_ascii=False))
    par = {}
    for c in ver:
        e = store.cx.execute("SELECT commune, latitude, longitude FROM etablissement WHERE siret=?", (c["siret"],)).fetchone()
        c["_cle"] = (_rang(e["commune"]), 0 if c["verdict"] == "CONFIRME" else 1, _km(e["latitude"], e["longitude"]))
        par.setdefault(c["metier"], []).append(c)
    garde = []
    for m, L in par.items():
        L.sort(key=lambda c: c["_cle"])
        garde += L[:3 * PLAFOND[m]]
        print("  %-28s %4d candidats -> %3d" % (m, len(L), min(len(L), 3 * PLAFOND[m])))
    for c in garde:
        c.pop("_cle", None)
    io.open(p, "w", encoding="utf-8").write(json.dumps(garde, ensure_ascii=False))
    print("%d candidats gardes" % len(garde))


# ------------------------------------------------------------- dedoublonnage
def _tel(s):
    return re.sub(r"\D", "", s or "")[-9:]


def _nom(s):
    s = re.sub(r"\(.*?\)", " ", _plat(s))
    s = re.sub(r"\b(sarl|sas|sasu|eurl|sa|scp|selarl|ets|societe|entreprise|et fils|ste)\b", " ", s)
    return re.sub(r"[^a-z0-9]", "", s)


def signaler():
    """Apres l'export : doublons V7 / CRM / brief en EXCLURE avec la raison."""
    lignes, champs = _lire()
    ext = json.load(io.open(EXTERNE, encoding="utf-8")) if os.path.exists(EXTERNE) else {"v7": [], "crm": []}
    fp = os.path.join(V.CACHE, "statut_force.json")
    force = json.load(io.open(fp, encoding="utf-8"))
    n = {"v7": 0, "crm": 0, "brief": 0}
    for r in lignes:
        raisons = []
        ident = _plat(" ".join(r.get(k, "") for k in ("nom", "enseigne", "dirigeants", "email", "site_web")))
        for motif, texte in CONNUS:
            if re.search(motif, ident):
                raisons.append(texte)
                n["brief"] += 1
        # Relecture humaine : activite reelle differente du metier (cache v8_externe.json).
        for motif, texte in ext.get("hors_metier", []):
            if re.search(motif, ident):
                raisons.append("hors métier : " + texte)
                n["brief"] += 1
        # Un nom de reseau (Cuisinella, Selectour...) designe plusieurs magasins :
        # seuls le telephone et l'email prouvent alors le doublon.
        chaine = V.RESEAUX.search(ident) or (r["metier"] in V.RESEAUX_METIER
                                             and re.search(V.RESEAUX_METIER[r["metier"]], ident))
        noms = set() if chaine else {x for x in (_nom(r["nom"]), _nom(r["enseigne"])) if len(x) >= 5}
        for src in ("v7", "crm"):
            for x in ext.get(src, []):
                if (r["email"] and r["email"].lower() == (x.get("email") or "").lower()) or \
                        (_tel(r["telephone"]) and _tel(r["telephone"]) == _tel(x.get("telephone"))) or \
                        (noms & {y for y in (_nom(x.get("nom")), _nom(x.get("enseigne"))) if len(y) >= 5}):
                    raisons.append("déjà sourcé (%s)" % x["onglet"] if src == "v7"
                                   else "déjà au CRM (%s)" % (x.get("statut") or "statut non renseigné"))
                    n[src] += 1
                    break
        if raisons:
            r["alerte"] = (r.get("alerte", "") + " ; EXCLURE : " + " ; ".join(raisons)).strip(" ;")
            if r.get("email"):
                force[r["email"].lower()] = ["EXCLURE", " ; ".join(raisons)]
            r["_exclure"] = " ; ".join(raisons)
    _ecrire(lignes, champs)
    # Lignes sans email : le statut EXCLURE est pose par plafonner() (colonne raison).
    io.open(os.path.join(V.CACHE, "v8_exclure.json"), "w", encoding="utf-8").write(json.dumps(
        {(r["siret"] or r["nom"]) + "|" + r["metier"]: r["_exclure"] for r in lignes if r.get("_exclure")}, ensure_ascii=False))
    io.open(fp, "w", encoding="utf-8").write(json.dumps(force, ensure_ascii=False, indent=1))
    print("signales : %s" % n)


def _lire():
    rd = csv.DictReader(io.open(CSV, encoding="utf-8-sig"), delimiter=";")
    return list(rd), rd.fieldnames


def _ecrire(lignes, champs):
    with io.open(CSV, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=champs, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)


def plafonner():
    """Apres fiabiliser : statut EXCLURE des doublons, puis plafond par metier.

    Ordre : communes du brief, metier confirme, email OK, telephone, distance.
    Les EXCLURE (doublons V7 / CRM) restent visibles en fin d'onglet, hors plafond."""
    lignes, champs = _lire()
    exc = json.load(io.open(os.path.join(V.CACHE, "v8_exclure.json"), encoding="utf-8")) \
        if os.path.exists(os.path.join(V.CACHE, "v8_exclure.json")) else {}
    for r in lignes:
        x = exc.get((r["siret"] or r["nom"]) + "|" + r["metier"])
        if x:
            r["statut_mailing"], r["raison_mailing"] = "EXCLURE", x
        # Regle 4 du brief : OK = domaine de l'entreprise ET adresse lue sur son site.
        src = _plat(r.get("email_source"))
        if r.get("statut_mailing") == "OK" and (not re.search(r"site|enquete", src) or re.search(r"annuaire", src)):
            r["statut_mailing"] = "A VERIFIER"
            r["raison_mailing"] = "email du domaine de l'entreprise mais lu hors de son site (%s)" % (
                r.get("email_source") or "source inconnue")[:60]
    rang_statut = {"OK": 0, "A VERIFIER": 1, "": 2, "EXCLURE": 3}
    out = []
    for m in V.METIERS:
        L = [r for r in lignes if r["metier"] == m]
        bons = [r for r in L if r.get("statut_mailing") != "EXCLURE" and (r["email"] or r["telephone"])]
        bons.sort(key=lambda r: (_rang(r["commune"]), 0 if r["verif_metier"].startswith("CONFIRME") else 1,
                                 rang_statut.get(r.get("statut_mailing", ""), 2), 0 if r["telephone"] else 1))
        exclus = [r for r in L if r.get("statut_mailing") == "EXCLURE" and (r["email"] or r["telephone"])]
        out += bons[:PLAFOND[m]] + exclus
        print("  %-28s joignables %3d -> %2d ; exclure %d ; sans coordonnees %d" % (
            m, len(bons), min(len(bons), PLAFOND[m]), len(exclus), sum(1 for r in L if not (r["email"] or r["telephone"]))))
    _ecrire(out, champs)
    print("%d lignes gardees" % len(out))


def livrables():
    """CSV d'invitations (fiches OK), JSON CRM, CSV telephone."""
    lignes, _ = _lire()
    dest = os.path.join(V.DONNEES, "vague8")
    os.makedirs(dest, exist_ok=True)

    PETITS = {"de", "du", "des", "la", "le", "les", "et", "a", "au", "aux", "en", "sur", "d", "l"}
    SIGLES = {"rh", "tp", "sos", "cm", "bhc", "ad", "jr", "be", "ag", "mgl", "abc", "ads", "pf"}
    # Raison sociale sans rapport avec le nom commercial lu dans SIRENE (entre parentheses).
    RENOMMER = {"BEAJ VAT": "Le Tour d'y Voir", "CMSERVICE": "CM Service"}

    def _casse(e):
        if not e.isupper():
            return e
        mots = re.split(r"(\s+|-)", e.lower())
        out = []
        for i, m in enumerate(mots):
            if m in SIGLES:
                out.append(m.upper())
            elif i and m in PETITS:
                out.append(m)
            else:
                out.append(m[:1].upper() + m[1:])
        e = "".join(out)
        return re.sub(r"(?<=[A-Za-z]')([a-z])", lambda x: x.group(1).upper(), e)

    def enseigne(r):
        # Nom commercial : l'enseigne, sinon le nom entre parentheses, sinon la raison sociale.
        brut = re.sub(r"\s*\(.*?\)", "", r["nom"]).strip()
        if brut in RENOMMER:
            return RENOMMER[brut]
        par = [x for x in re.findall(r"\(([^()]*)\)", r["nom"]) if "," not in x]
        # Le nom entre parentheses n'est pris que si la raison sociale est le nom
        # du dirigeant (entreprise individuelle) ou un sigle court.
        dirs = _plat(r["dirigeants"])
        personne = bool(brut) and all(m in dirs for m in _plat(brut).split())
        e = r["enseigne"] or (par[-1] if par and (personne or len(brut) <= 4) else "") or brut
        e = re.sub(r"\b(SARL|SAS|SASU|EURL|SA|SCP|SELARL|SELAS|SNC|EIRL|EI)\b\.?", "", e, flags=re.I)
        e = re.sub(r"\s{2,}", " ", e).strip(" -,.")
        mots = e.split()
        if len(mots) % 2 == 0 and mots[:len(mots) // 2] == mots[len(mots) // 2:]:
            e = " ".join(mots[:len(mots) // 2])      # "BAD CANTINE BAD CANTINE"
        return _casse(e)

    def dirigeant(r):
        d = r["dirigeants"].split(";")[0].strip() if r["dirigeants"] else ""
        return _casse(re.sub(r"\s*\(.*?\)", "", d).strip())

    vus, inv, crm = set(), [], []
    for r in lignes:
        if r.get("statut_mailing") != "OK" or not r["email"] or r["email"].lower() in vus:
            continue
        vus.add(r["email"].lower())
        inv.append({"Email": r["email"].lower(), "Metier": ARTICLE[r["metier"]], "Enseigne": enseigne(r)})
        crm.append({"Email": r["email"].lower(), "Enseigne": enseigne(r), "Onglet": V.ONGLETS[r["metier"]],
                    "Metier": ARTICLE[r["metier"]], "Commune": r["commune"].title(), "Téléphone": r["telephone"],
                    "Dirigeant": dirigeant(r)})
    with io.open(os.path.join(dest, "BNI_vague8_invitations.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["Email", "Metier", "Enseigne"], delimiter=";")
        w.writeheader()
        w.writerows(inv)
    io.open(os.path.join(dest, "crm_lot8.json"), "w", encoding="utf-8").write(json.dumps(crm, ensure_ascii=False, indent=1))
    tel = [{"Enseigne": enseigne(r), "Dirigeant": dirigeant(r),
            "Commune": r["commune"].title(), "Téléphone": r["telephone"], "Métier": ARTICLE[r["metier"]]}
           for r in lignes if r["telephone"] and not r["email"] and r.get("statut_mailing") != "EXCLURE"]
    with io.open(os.path.join(dest, "BNI_vague8_telephone.csv"), "w", encoding="utf-8", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=["Enseigne", "Dirigeant", "Commune", "Téléphone", "Métier"], delimiter=";")
        w.writeheader()
        w.writerows(tel)
    print("invitations %d ; crm %d ; telephone %d -> %s" % (len(inv), len(crm), len(tel), dest))


def avocats():
    """Apres l'export : avocats certifies de l'Ordre absents de SIRENE ou non
    rapproches (exercice en societe d'avocats). Un seul par cabinet."""
    lignes, champs = _lire()
    cabinets = {_nom(r["enseigne"] or r["nom"]) for r in lignes if r["metier"] == "avocat-droit-travail"}
    noms = " ".join(_plat(r["nom"] + " " + r["dirigeants"]) for r in lignes if r["metier"] == "avocat-droit-travail")
    n = 0
    for a in sorted(_barreau_travail(), key=lambda a: (a["cabinet"], a["nom"])):
        cab = _nom(a["cabinet"])
        mots = [m for m in re.split(r"[^a-z]+", _plat(a["nom"])) if len(m) >= 3]
        if cab in cabinets or all(m in noms for m in mots):
            continue
        cabinets.add(cab)
        cp, _, ville = a["cp_ville"].partition(" ")
        ville = re.sub(r"\s+CEDEX.*$", "", ville).replace("ST ", "SAINT-")
        lignes.append({
            "metier": "avocat-droit-travail", "nom": "%s (%s)" % (a["nom"], a["cabinet"]), "enseigne": a["cabinet"],
            "dirigeants": a["nom"], "adresse": "%s %s" % (a["adresse"], a["cp_ville"]), "commune": ville,
            "telephone": a.get("telephone") or "", "email": (a.get("email") or "").lower(), "site_web": "",
            "verif_metier": "CONFIRME : certificat de specialisation %s (annuaire de l'Ordre des avocats de Rennes)"
                            % ", ".join(a["specialites"]),
            "date_creation": "", "tranche_effectif": "",
            "telephone_source": "annuaire de l'Ordre des avocats de Rennes %s" % a["fiche"] if a.get("telephone") else "",
            "email_source": "annuaire de l'Ordre des avocats de Rennes %s" % a["fiche"] if a.get("email") else "",
            "email_note": "", "alerte": "vague 8 ; avocat inscrit a l'Ordre (inscription %s), cabinet non rapproche "
                                        "de SIRENE" % a.get("inscription", "?"),
            "siret": "", "fiche": a["fiche"]})
        n += 1
    _ecrire(lignes, champs)
    print("avocats ajoutes depuis l'Ordre : %d" % n)


CODES = sorted(V.COMMUNES | {V.RENNES})

if __name__ == "__main__":
    {"selection": V.selection, "verifier": verifier, "reduire": reduire, "exporter": V.exporter,
     "signaler": signaler, "avocats": avocats, "plafonner": plafonner, "classeur": V.classeur, "livrables": livrables,
     "codes": lambda: print(",".join(CODES))}[sys.argv[1]]()
