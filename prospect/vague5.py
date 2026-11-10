# -*- coding: utf-8 -*-
"""Vague 5 (mission du 22/10/2026) : dix metiers, communes nouvelles.

Perimetre : seize communes autour de Rennes (Cesson-Sevigne, Chateaugiron,
Janze, Bain-de-Bretagne, Montfort-sur-Meu, Saint-Gilles, Pace, Montgermont,
Betton, Le Verger, Breteil, Iffendic, Bourg-des-Comptes, Plechatel,
Saint-Senoux, Guignen) et trois quartiers de Rennes, lus sur le decoupage
officiel de la Ville (data.rennesmetropole.fr) : 9 Cleunay / Arsenal-Redon /
La Courrouze, 12 Brequigny, 7 La Pommeraie (secteur Francisco Ferrer -
Landry - Poterie).

Regles de la mission appliquees ici :
- dedoublonnage par SIRET et par email contre toutes les feuilles existantes ;
- grandes enseignes : un etablissement d'une grande entreprise ou d'une ETI
  (categorie SIRENE GE/ETI) est une succursale, exclue ; un franchise ou un
  adherent local (PME) reste, avec une alerte qui nomme le reseau ;
- metier verifie sur le site, le BODACC ou un registre (RPPS pour les
  psychologues et audioprothesistes, sans conserver aucun numero).

    python -m prospect.vague5 selection
"""
import csv
import io
import json
import os
import re
import sys
import unicodedata

from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache")
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")
# Parametres de vague : vague6.py (et les suivantes) les redefinit avant
# d'appeler les memes fonctions.
PREFIXE = "v5"                 # fichiers de cache : v5_selection.json...
FICHIER = "vague5"             # data/prospection/vague5.csv, cache/vague5_*.json
LIBELLE = "vague 5"            # colonne Alerte fiche
ONGLET = "V5. "                # prefixe des onglets
SECTIONS_EXISTANTES = ["bruz_entreprises_actuelles.csv", "bruz_lot2.csv", "zone_sud.csv",
                       "bruz_lot4.csv", "demandes_membres.csv"]
SELECTION = os.path.join(CACHE, "v5_selection.json")

METIERS = ["plombier-chauffagiste", "electricien", "agence-interim", "cuisiniste", "imprimeur",
           "fournitures-bureau", "integrateur-av", "audioprothesiste", "psychologue", "opticien"]
COMMUNES = {"35051", "35069", "35136", "35012", "35188", "35275", "35210", "35189", "35024", "35351",
            "35040", "35133", "35033", "35221", "35312", "35127"}
RENNES = "35238"
PRIORITAIRES = set()      # communes (en majuscules) a placer en tete de chaque onglet
ETI_GARDEES = set()       # metiers ou une ETI (groupe regional) reste, avec alerte
NOTION = None             # fichier du cache {"emails": [...], "noms": [...]} : deja dans Notion
QUARTIERS = {7, 9, 12}

RESEAUX = re.compile(
    r"amplifon|audika|audition sant|krys|optic ?2000|afflelou|atol|lynx|optical center|grand ?optical|"
    r"generale d.optique|opticiens mutualistes|audilab|entendre|audio ?2000|acuitis|alain afflelou|"
    r"manpower|adecco|randstad|synergie|proman|crit\b|start ?people|supplay|leader interim|"
    r"schmidt|cuisinella|mobalpa|ixina|cuisine plus|arthur bonnet|lapeyre|darty cuisine|"
    r"spie\b|engie|eiffage|cegelec|vinci|bouygues|ineo|santerne|axians|"
    r"bureau vallee|office depot|lyreco|top office|copy ?top|"
    r"vision ?plus|optique lafayette|carglass", re.I)


# Reseaux par metier, en mots entiers ("Vinciane" n'est pas Vinci, un
# photograveur "Lynx" n'est pas l'opticien). Pour les metiers ou ces groupes
# n'ont pas de franchises (electricite, plomberie, audiovisuel, imprimerie),
# l'etablissement est une agence du groupe : toujours exclu.
GROUPES_SANS_FRANCHISE = re.compile(
    r"\b(eiffage|spie|engie|vinci|cegelec|bouygues|ineo|santerne|axians|snef|citeos|equans|dalkia|"
    r"idex|cofely|actemium|omexom|sogetrel|circet)\b", re.I)
RESEAUX_METIER = {
    "opticien": r"\b(krys|optic ?2000|afflelou|atol|lynx|optical center|grand ?optical|generale? d.optique|"
                r"opticiens mutualistes|acuitis|vision ?plus|collectif des lunetiers|nos lunettes)\b",
    "audioprothesiste": r"\b(amplifon|audika|audition sante|afflelou|audilab|entendre|audio ?2000|"
                        r"krys audition|optical center|acuitis|audition conseil)\b",
    "agence-interim": r"\b(manpower|adecco|randstad|synergie|proman|crit|start ?people|supplay|"
                      r"leader interim|temporis|partnaire|actual|samsic|triangle|interaction|lip)\b",
    "cuisiniste": r"\b(schmidt|cuisinella|mobalpa|ixina|cuisine plus|arthur bonnet|lapeyre|"
                  r"darty|socooc|aviva|sagne)\b",
    "fournitures-bureau": r"\b(bureau vallee|office depot|lyreco|top office|jpg|calipage)\b",
    "imprimeur": r"\b(copy ?top|exaprint|helloprint|vistaprint)\b",
}


DOMAINES_RESEAUX = re.compile(
    r"afflelou|optical-center|generale-?optique|audio2000|startpeople|vision-plus|krys|optic2000|atol\.|"
    r"amplifon|audika|audilab|acuitis|lynx-optique|grandoptical|manpower|adecco|randstad|schmidt|cuisinella")


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _dans(pt, poly):
    """Point dans un polygone (lancer de rayon)."""
    x, y = pt
    dedans = False
    for anneau in poly:
        j = len(anneau) - 1
        for i in range(len(anneau)):
            xi, yi = anneau[i][:2]
            xj, yj = anneau[j][:2]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / ((yj - yi) or 1e-12) + xi:
                dedans = not dedans
            j = i
    return dedans


def quartiers():
    d = json.load(io.open(os.path.join(CACHE, "quartiers_rennes.geojson"), encoding="utf-8"))
    out = {}
    for f in d["features"]:
        p = f["properties"]
        if p["code_insee"] == 35238 and p["nuquart"] in QUARTIERS:
            g = f["geometry"]
            polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
            out[p["nuquart"]] = (p["nom"], polys)
    return out


def deja_presents():
    sirets, emails = set(), set()
    for f in SECTIONS_EXISTANTES:
        p = os.path.join(DONNEES, f)
        if os.path.exists(p):
            for r in csv.DictReader(io.open(p, encoding="utf-8-sig"), delimiter=";"):
                if r.get("siret"):
                    sirets.add(r["siret"])
                if r.get("email"):
                    emails.add(r["email"].strip().lower())
    return sirets, emails


def selection():
    store = Store()
    qs = quartiers()
    sirets, _ = deja_presents()
    out, bilan = [], {}
    for m in METIERS:
        n = {"brut": 0, "hors_zone": 0, "deja": 0, "groupe": 0, "retenu": 0}
        for f in store.fiches(metier=[m]):
            n["brut"] += 1
            quartier = ""
            if f["code_commune"] == RENNES:
                lat, lon = f.get("latitude"), f.get("longitude")
                if lat is None or lon is None:
                    n["hors_zone"] += 1
                    continue
                for num, (nom, polys) in qs.items():
                    if any(_dans((lon, lat), poly) for poly in polys):
                        quartier = "%d - %s" % (num, nom)
                if not quartier:
                    n["hors_zone"] += 1
                    continue
            elif f["code_commune"] not in COMMUNES:
                n["hors_zone"] += 1
                continue
            if f["siret"] in sirets:
                n["deja"] += 1
                continue
            texte = _plat("%s %s" % (f["nom"], f["enseigne"] or ""))
            if GROUPES_SANS_FRANCHISE.search(texte):
                n["groupe"] += 1
                continue
            reseau = re.search(RESEAUX_METIER[m], texte) if m in RESEAUX_METIER else None
            if reseau and (f.get("categorie") or "") in ("GE", "ETI"):
                n["groupe"] += 1
                continue
            n["retenu"] += 1
            out.append({"siret": f["siret"], "siren": f["siren"], "metier": m, "quartier": quartier,
                        "reseau": reseau.group(0) if reseau else ""})
        bilan[m] = n
    io.open(os.path.join(CACHE, PREFIXE + "_selection.json"), "w", encoding="utf-8").write(json.dumps(out, ensure_ascii=False))
    for m, n in bilan.items():
        print("  %-22s brut %4d  hors zone %4d  deja %3d  grand groupe %3d  retenus %4d" % (
            m, n["brut"], n["hors_zone"], n["deja"], n["groupe"], n["retenu"]))
    return out


# ------------------------------------------------------------- verification
PREUVES = {
    "plombier-chauffagiste": r"plomb|chauffag|sanitaire|thermi|pompes? a chaleur|climatis|genie climatique",
    "electricien": r"electri|electrotech|courants? (fort|faible)|domotique",
    "agence-interim": r"interim|travail temporaire|mise a disposition de personnel|recrutement",
    "cuisiniste": r"cuisine",
    "imprimeur": r"imprim|impression|reprograph|serigraph|offset|signaletique",
    "fournitures-bureau": r"fournitures? (de bureau|scolaires|administratives)|papeterie|consommables (informatiques|bureautiques)|mobilier de bureau",
    "integrateur-av": r"audiovisuel|audio-visuel|sonorisation|sono\b|visio|video ?projection|affichage dynamique|ecrans? interactif|son et lumiere|integrat(eur|ion) (audio|av)|multimedia|regie",
    "audioprothesiste": r"audioprothes|audition|auditi|acousticien|correction auditive",
    "psychologue": r"psycholog|psychotherap|neuropsy",
    "opticien": r"optique|opticien|lunett|optic",
}
CONTRE = {
    "psychologue": r"sophrolog|naturopath|hypno|reflexolog|energeti|magnetis|kinesiolog|reiki",
    "fournitures-bureau": r"tabac|presse|journaux|loto|librairie",
    "audioprothesiste": r"orthoped|podo|materiel medical|pharmac",
}
NAF_FIABLE = {"plombier-chauffagiste", "electricien", "agence-interim", "imprimeur", "opticien"}
RPPS_PROF = {"psychologue": "psycholog", "audioprothesiste": "audioproth"}
CP_V5 = ["35510", "35410", "35150", "35470", "35160", "35590", "35740", "35760", "35830", "35750",
         "35890", "35580", "35000", "35200"]


def _rpps_noms(motif):
    """Noms (normalises) des praticiens de cette profession dans les codes postaux V5.

    On ne garde que le nom : ni numero RPPS/ADELI, ni autre donnee."""
    noms = set()
    for cp in CP_V5:
        p = os.path.join(CACHE, "rpps_%s.txt" % cp)
        if not os.path.exists(p):
            continue
        for l in io.open(p, encoding="utf-8", errors="replace"):
            ch = l.split("|")
            if len(ch) > 10 and re.search(motif, _plat(ch[10])):
                noms.add(_plat("%s %s" % (ch[8], ch[7])).strip())
    return noms


def verifier():
    store = Store()
    sel = json.load(io.open(os.path.join(CACHE, PREFIXE + "_selection.json"), encoding="utf-8"))
    bod = json.load(io.open(os.path.join(CACHE, PREFIXE + "_bodacc.json"), encoding="utf-8"))
    rpps = {m: _rpps_noms(mo) for m, mo in RPPS_PROF.items()}
    gardes, bilan = [], {}
    for c in sel:
        m = c["metier"]
        e = store.cx.execute("SELECT * FROM etablissement WHERE siret=?", (c["siret"],)).fetchone()
        nom = _plat("%s %s" % (e["nom"], e["enseigne"] or ""))
        act = _plat(" ".join(bod.get(c["siren"], [])))
        preuve, contre = PREUVES[m], CONTRE.get(m)
        verdict, source = "", ""
        if m in rpps and any(n and n in nom for n in rpps[m]):
            verdict, source = "CONFIRME", "registre RPPS (profession seule, aucun numero conserve)"
        elif re.search(preuve, nom) and not (contre and re.search(contre, nom)):
            verdict, source = "CONFIRME", "le nom de l'etablissement"
        elif act and re.search(preuve, act) and not (contre and re.search(contre, act)):
            verdict, source = "CONFIRME", "l'activite declaree au BODACC"
        elif m in NAF_FIABLE:
            verdict, source = "A VERIFIER", "code NAF seul (%s)" % e["naf"]
        b = bilan.setdefault(m, {"gardes": 0, "ecartes": 0})
        if not verdict:
            b["ecartes"] += 1
            continue
        b["gardes"] += 1
        c.update({"verdict": verdict, "source_verdict": source})
        gardes.append(c)
    io.open(os.path.join(CACHE, PREFIXE + "_verifies.json"), "w", encoding="utf-8").write(
        json.dumps(gardes, ensure_ascii=False))
    for m, b in bilan.items():
        print("  %-22s gardes %4d   ecartes (metier non prouve) %4d" % (m, b["gardes"], b["ecartes"]))


# ------------------------------------------------------------------ export
ONGLETS = {"plombier-chauffagiste": "V5. Plombier-chauffagiste", "electricien": "V5. Électricien",
           "agence-interim": "V5. Agence d'intérim", "cuisiniste": "V5. Cuisiniste",
           "imprimeur": "V5. Imprimeur", "fournitures-bureau": "V5. Fournitures de bureau",
           "integrateur-av": "V5. Intégrateur audiovisuel", "audioprothesiste": "V5. Audioprothésiste",
           "psychologue": "V5. Psychologue", "opticien": "V5. Opticien"}
VERS = os.path.join(DONNEES, FICHIER + ".csv")


def exporter():
    from . import exporter_lot as X
    from . import fouille as F
    from . import pipeline as P
    store = Store()
    ver = json.load(io.open(os.path.join(CACHE, PREFIXE + "_verifies.json"), encoding="utf-8"))
    pages, _ = X._charger_verdicts()
    # Controle BNI (regle : exclure membres et anciens membres) : une trace
    # trouvee sur le web garde la fiche visible, marquee EXCLURE avec le lien.
    pb = os.path.join(CACHE, PREFIXE + "_bni.json")
    bni = json.load(io.open(pb, encoding="utf-8")) if os.path.exists(pb) else {}
    lignes, emails = [], set()
    ecartes = {"grand groupe": 0, "non diffusible": 0, "deja dans Notion": 0}
    notion = {"emails": [], "noms": []}
    if NOTION and os.path.exists(os.path.join(CACHE, NOTION)):
        notion = json.load(io.open(os.path.join(CACHE, NOTION), encoding="utf-8"))
    for c in ver:
        f = next(iter(x for x in store.fiches(metier=[c["metier"]]) if x["siret"] == c["siret"]), None)
        if not f:
            continue
        m = c["metier"]
        e = store.cx.execute("SELECT categorie FROM etablissement WHERE siret=?", (f["siret"],)).fetchone()
        # Regle 2 : un etablissement de grande entreprise ou d'ETI est une
        # agence d'un groupe (Actual, Partnaire, Snef...), meme sans le nom
        # du reseau. Le responsable local n'est pas dirigeant.
        cat = (e["categorie"] or "") if e else ""
        if cat == "GE" or (cat == "ETI" and m not in ETI_GARDEES):
            ecartes["grand groupe"] += 1
            continue
        # Personne ayant refuse la diffusion de ses donnees dans SIRENE.
        if "NON-DIFFUSIBLE" in (f["nom"] + " " + (f["enseigne"] or "")).upper():
            ecartes["non diffusible"] += 1
            continue
        ident = _plat("%s %s %s" % (f["nom"], f["enseigne"] or "", f["dirigeants"] or ""))
        if (f["email"] or "").lower() in notion["emails"] or any(n in ident for n in notion["noms"]):
            ecartes["deja dans Notion"] += 1
            continue
        pg = pages.get("%s|%s" % (f["siret"], m)) or pages.get(f["siret"])
        if pg and pg.get("confirme"):
            verif = "CONFIRME sur son site : %s" % ", ".join(pg["confirme"][:3])
        elif c["verdict"] == "CONFIRME":
            verif = "CONFIRME par %s" % c["source_verdict"]
        elif pg and pg.get("autres"):
            verif = "A VERIFIER : sa page parle de %s" % ", ".join(pg["autres"])
        else:
            verif = "A VERIFIER : %s" % c["source_verdict"]
        alerte = [LIBELLE]
        if cat == "ETI":
            alerte.append("groupe regional (ETI) : verifier le dirigeant de la concession ou du site")
        if c.get("quartier"):
            alerte.append("Rennes, quartier %s" % c["quartier"])
        if bni.get(f["siret"]):
            alerte.append("EXCLURE : trace BNI trouvee (%s) - membre ou ancien membre ?" % bni[f["siret"]][0])
        if c.get("reseau"):
            alerte.append("franchise ou adherent du reseau %s : verifier le dirigeant local" % c["reseau"].title())
        if f["email"]:
            emails.add(f["email"].lower())
        lignes.append({
            "metier": m, "note": "", "nom": f["nom"], "enseigne": f["enseigne"] or "",
            "dirigeants": f["dirigeants"] or "", "adresse": f["adresse"], "commune": f["commune"],
            "telephone": f["telephone"] or "", "email": f["email"] or "", "site_web": f["site_web"] or "",
            "verif_metier": verif, "date_creation": f["date_creation"], "tranche_effectif": f["tranche_effectif"],
            "telephone_source": f.get("telephone_source") or "", "email_source": f.get("email_source") or "",
            "email_note": f.get("email_note") or "", "alerte": " ; ".join(alerte), "siret": f["siret"],
            "fiche": "https://annuaire-entreprises.data.gouv.fr/entreprise/%s" % f["siren"]})
    lignes.sort(key=lambda r: (r["metier"], 0 if r["commune"].upper() in PRIORITAIRES else 1,
                               0 if r["verif_metier"].startswith("CONFIRME") else 1,
                               0 if r["email"] else 1, r["commune"], r["nom"]))
    with io.open(os.path.join(DONNEES, FICHIER + ".csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=X.COLS, delimiter=";", extrasaction="ignore")
        w.writeheader()
        w.writerows(lignes)
    io.open(os.path.join(CACHE, FICHIER + "_emails.json"), "w", encoding="utf-8").write(
        json.dumps(sorted(emails), ensure_ascii=False))
    # Emails pris sur le domaine d'un reseau national : l'adresse generique
    # (service clients, contact, DPO) est celle du siege, pas du franchise ;
    # une boite propre au magasin reste a confirmer.
    pf = os.path.join(CACHE, "statut_force.json")
    force = json.load(io.open(pf, encoding="utf-8")) if os.path.exists(pf) else {}
    for r in lignes:
        e = (r["email"] or "").lower()
        if e and "trace BNI" in r["alerte"]:
            force[e] = ["EXCLURE", "trace BNI sur le web : membre ou ancien membre a verifier"]
            continue
        if not e or not DOMAINES_RESEAUX.search(e.split("@")[1]):
            continue
        if re.match(r"^(service.?clients?|contact|infos?|dpo|delegue|rgpd|sav|accueil|bonjour|24h|assistance|relation)", e):
            force[e] = ["EXCLURE", "adresse du reseau national (siege), pas celle du franchise local"]
        else:
            force[e] = ["A VERIFIER", "boite sur le domaine du reseau : confirmer qu'elle est celle du magasin"]
    io.open(pf, "w", encoding="utf-8").write(json.dumps(force, ensure_ascii=False, indent=1))
    print("%d fiches -> %s ; ecartes : %s" % (len(lignes), FICHIER + ".csv", ecartes))


def classeur():
    """Classeur ne contenant que les onglets V5, a importer en "inserer de nouvelles feuilles"."""
    sys.path.insert(0, DONNEES)
    import gen_classeur as G
    from openpyxl import Workbook
    lignes = list(csv.DictReader(io.open(os.path.join(DONNEES, FICHIER + ".csv"), encoding="utf-8-sig"), delimiter=";"))
    wb = Workbook()
    wb.remove(wb.active)
    bilan = []
    for cle, onglet in ONGLETS.items():
        ws = wb.create_sheet(onglet)
        G.entete(ws, G.MEMBRES, G.COLONNES)
        rows = [r for r in lignes if r["metier"] == cle]
        for r in rows:
            ws.append([r.get(c, "") for c, _, _ in G.COLONNES])
        if rows:
            ws.auto_filter.ref = ws.dimensions
        else:
            ws["A2"] = "aucune fiche"
        ok = sum(1 for r in rows if r.get("statut_mailing") == "OK")
        tel_seul = sum(1 for r in rows if r["telephone"] and not r["email"])
        bilan.append([onglet.replace(ONGLET, ""), len(rows), ok, tel_seul])
    dest = os.path.join(DONNEES, FICHIER + "_onglets.xlsx")
    wb.save(dest)
    io.open(os.path.join(CACHE, FICHIER + "_synthese.json"), "w", encoding="utf-8").write(
        json.dumps(bilan, ensure_ascii=False))
    for b in bilan:
        print("  %-26s fiches %4d   emails OK %4d   telephone seul %4d" % tuple(b))
    print("-> %s" % dest)


if __name__ == "__main__":
    {"selection": selection, "verifier": verifier, "exporter": exporter, "classeur": classeur}[sys.argv[1] if len(sys.argv) > 1 else "selection"]()
