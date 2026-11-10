# -*- coding: utf-8 -*-
"""BODACC : le journal officiel de la vie des entreprises.

SIRENE decrit un ETAT, souvent en retard. Le BODACC publie les EVENEMENTS,
au jour le jour. C'est la difference qui compte pour prospecter :

  - Une entreprise liquidee reste "active" dans SIRENE pendant des mois.
    Trois cas sur 178 a Bruz, trouves un par un a la main. Le BODACC les
    detecte tous les trois automatiquement.
  - Une entreprise qui vient de se creer n'est nulle part ailleurs. C'est
    pourtant le meilleur moment pour l'approcher.

API Opendatasoft de la DILA, gratuite et sans cle.
"""
import json
import re
import urllib.parse
import unicodedata

from . import sources as S

API = ("https://bodacc-datadila.opendatasoft.com/api/explore/v2.0"
       "/catalog/datasets/annonces-commerciales/records")

# Familles d'avis, table ac_mapping_famille_avis du portail.
MORTELLES = {"collective", "radiation"}
NAISSANTES = {"creation", "immatriculation"}
REPRISES = {"vente"}


def _pages(params, maximum=9000):
    """Parcourt les resultats, 100 par appel (plafond de l'API)."""
    out, offset = [], 0
    while offset < maximum:
        p = dict(params, limit=100, offset=offset)
        d = S._json(API + "?" + urllib.parse.urlencode(p))
        lot = d.get("records") or []
        out += [r["record"]["fields"] for r in lot]
        if len(lot) < 100:
            break
        offset += 100
    return out


def detailler(annonce):
    """Extrait les champs utiles d'une annonce : activite, dirigeant, adresse.

    Le BODACC imbrique tout dans des blobs JSON qui arrivent tantot en objet,
    tantot en chaine.
    """
    def lire(v):
        if not v:
            return {}
        if isinstance(v, dict):
            return v
        try:
            return json.loads(v)
        except ValueError:
            return {}

    def texte(v):
        """Un champ BODACC peut arriver en chaine, en liste ou en objet :
        une annonce a plusieurs personnes rend `prenom` sous forme de liste."""
        if v is None:
            return ""
        if isinstance(v, (list, tuple)):
            return " ".join(texte(x) for x in v if x)
        if isinstance(v, dict):
            return " ".join(texte(x) for x in v.values() if x)
        return str(v)

    etab = lire(annonce.get("listeetablissements")).get("etablissement") or {}
    if isinstance(etab, list):
        etab = etab[0] if etab else {}
    pers = lire(annonce.get("listepersonnes")).get("personne") or {}
    if isinstance(pers, list):
        pers = pers[0] if pers else {}
    adr = etab.get("adresse") or {}
    if isinstance(adr, list):
        adr = adr[0] if adr else {}
    return {
        "date": annonce.get("dateparution"),
        "id": annonce.get("id"),
        "famille": annonce.get("familleavis"),
        "nom": texte(pers.get("denomination")) or texte(annonce.get("commercant")),
        "forme": texte(pers.get("formeJuridique")) or "personne physique",
        "dirigeant": (texte(pers.get("administration"))
                      or " ".join(x for x in (texte(pers.get("prenom")),
                                              texte(pers.get("nom"))) if x)),
        "activite": texte(etab.get("activite")),
        "adresse": " ".join(texte(x) for x in (adr.get("numeroVoie"), adr.get("typeVoie"),
                                               adr.get("nomVoie"), adr.get("codePostal"),
                                               adr.get("ville")) if x),
        "siren": texte((pers.get("numeroImmatriculation") or {})
                       .get("numeroIdentification")).replace(" ", ""),
        "url": annonce.get("url_complete") or "",
    }


def _sirens(champ_registre):
    """Le champ registre contient le SIREN sous deux formes, espacee et non."""
    if isinstance(champ_registre, str):
        try:
            champ_registre = json.loads(champ_registre)
        except ValueError:
            champ_registre = [champ_registre]
    return {str(x).replace(" ", "") for x in (champ_registre or [])}


def annonces_commune(ville, familles=None, depuis=None):
    """Annonces BODACC d'une commune, eventuellement filtrees par famille."""
    clauses = ['ville LIKE "%s"' % ville]
    if familles:
        clauses.append("(%s)" % " or ".join('familleavis = "%s"' % f for f in familles))
    if depuis:
        # Guillemets simples apres `date`, ou pas de mot-cle `date` du tout :
        # la variante date"..." avec des doubles guillemets rend zero resultat
        # sans lever d'erreur, ce qui se remarque tard.
        clauses.append('dateparution >= "%s"' % depuis)
    return _pages({"where": " and ".join(clauses),
                   "order_by": "dateparution desc"})


def evenements_par_siren(ville, familles=None, depuis=None):
    """SIREN -> liste d'evenements, pour croiser avec la base."""
    par_siren = {}
    for a in annonces_commune(ville, familles, depuis):
        for siren in _sirens(a.get("registre")):
            par_siren.setdefault(siren, []).append({
                "date": a.get("dateparution"),
                "famille": a.get("familleavis"),
                "libelle": a.get("familleavis_lib"),
                "nom": a.get("commercant"),
                "url": a.get("url_complete"),
            })
    for ev in par_siren.values():
        ev.sort(key=lambda e: e["date"] or "", reverse=True)
    return par_siren


# --------------------------------------------------------- filtre metier

def _sa(txt):
    txt = unicodedata.normalize("NFD", txt or "")
    return "".join(c for c in txt if unicodedata.category(c) != "Mn").lower()


def filtrer_metiers(annonces, referentiel, metiers=None):
    """Ne garde que les annonces correspondant aux metiers vises.

    Le BODACC ne porte aucun code NAF : l'activite y est du texte libre. On
    matche sur les racines `mots_activite` du referentiel, invalidees par
    `mots_exclus_activite`.

    Les societes civiles sont ecartees d'office : elles detiennent du
    patrimoine, elles n'exercent pas un metier. Sans cette regle, 11 des 18
    "creations" retenues a Bruz etaient des SCI.
    """
    regles = {}
    for cle, r in referentiel.items():
        if cle.startswith("_") or not r.get("mots_activite"):
            continue
        if metiers and cle not in metiers:
            continue
        regles[cle] = ([_sa(x) for x in r["mots_activite"]],
                       [_sa(x) for x in r.get("mots_exclus_activite", [])])

    out = []
    for a in annonces:
        d = detailler(a)
        if "civile" in _sa(d["forme"]) or re.match(r"sci", _sa(d["nom"])):
            continue
        texte = _sa(d["activite"] + " " + d["nom"])
        hits = [cle for cle, (oui, non) in regles.items()
                if any(m in texte for m in oui) and not any(m in texte for m in non)]
        if not hits:
            continue
        d["metiers"] = ", ".join(sorted(hits))
        out.append(d)
    out.sort(key=lambda x: x["date"] or "", reverse=True)
    return out
