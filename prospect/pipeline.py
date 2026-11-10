# -*- coding: utf-8 -*-
"""Les trois etapes : extraire, enrichir, qualifier. Plus l'export."""
import csv
import io
import json
import os
import re
from datetime import date

from . import bodacc as B
from . import domaines as D
from . import matching as M
from . import sources as S
from .store import Store

RACINE = os.path.dirname(os.path.abspath(__file__))
REFERENTIEL = json.load(io.open(os.path.join(RACINE, "referentiel.json"),
                                encoding="utf-8"))


def metiers_connus():
    return sorted(k for k in REFERENTIEL if not k.startswith("_"))


def _regle(metier):
    r = REFERENTIEL.get(metier)
    if not r:
        raise SystemExit("metier inconnu : %s\nconnus : %s"
                         % (metier, ", ".join(metiers_connus())))
    return r


# =====================================================================
# 1. EXTRAIRE
# =====================================================================

def extraire(store, metiers, codes_commune, anciennete_min=None,
             avec_salaries=False, ref_lat=None, ref_lon=None, verbeux=True):
    """Remplit la base depuis SIRENE, en appliquant les regles du referentiel."""
    total, gardes = 0, 0
    for metier in metiers:
        avant = gardes
        regle = _regle(metier)
        raffiner = [(re.compile(rx, re.I), lib) for rx, lib in regle.get("raffiner", [])]
        obligatoire = regle.get("mot_cle_obligatoire", False)

        for naf in regle["naf"]:
            for e in S.sirene(naf, codes_commune):
                total += 1
                texte = "%s %s" % (e["nom"], e["enseigne"])

                # Le NAF seul ne suffit pas : on applique les regles metier.
                metier_deduit, exclu = regle["libelle"], False
                for rx, lib in raffiner:
                    if rx.search(texte):
                        if lib == "__exclure__":
                            exclu = True
                        else:
                            metier_deduit = lib
                        break
                else:
                    if obligatoire:
                        # Le mot-cle manque. Il ne suffit pas de jeter : le nom
                        # commercial ne dit pas toujours le metier. En 47.59A a
                        # Bruz, sur 4 etablissements, cette regle a garde
                        # CUISINES PATRICK DAGIER, ecarte a raison META SYSTEM
                        # (rayonnage industriel) et a tort PIL CREATION, un
                        # vrai cuisiniste immatricule au nom de son gerant.
                        # On enregistre et on marque : la fiche sort des
                        # resultats mais reste relisable par `arbitrer`.
                        store.poser_etablissement(dict(e, metier=metier))
                        store.poser_candidature(e["siret"], metier)
                        store.exclure(e["siret"],
                                      "mot-cle %s absent du nom : a verifier a la main"
                                      % "|".join(rx.pattern for rx, _ in raffiner),
                                      "regle")
                        continue
                if exclu:
                    continue

                if M.RESEAUX_NATIONAUX.search(texte):
                    store.poser_etablissement(dict(e, metier=metier))
                    store.poser_candidature(e["siret"], metier)
                    store.exclure(e["siret"], "reseau national : le correspondant "
                                              "local n'est pas dirigeant", "regle")
                    continue

                if anciennete_min and not _assez_ancien(e["date_creation"], anciennete_min):
                    continue
                if avec_salaries and e["tranche_effectif"] in ("NN", "00", ""):
                    continue

                e = dict(e, metier=metier)
                store.poser_etablissement(e)
                store.poser_candidature(e["siret"], metier)
                store.poser_valeur(e["siret"], "metier_reel", metier_deduit,
                                   "NAF %s" % naf, "deduit")
                gardes += 1
        if verbeux:
            print("  %-26s %d etablissements" % (metier, gardes - avant))
    store.valider()
    return {"vus": total, "gardes": gardes}


def _assez_ancien(iso, annees_min):
    try:
        a, m, j = (int(x) for x in iso.split("-"))
        return (date.today() - date(a, m, j)).days / 365.25 >= annees_min
    except Exception:
        return True      # date inconnue : on ne rejette pas sur une absence


# =====================================================================
# 2. ENRICHIR
# =====================================================================

def enrichir(store, sources, code_postal=None, code_insee=None,
             ville=None, maximum=None, verbeux=True):
    """Passe les fiches sans coordonnees dans la cascade de sources."""
    bilan = {}
    for nom_source in sources:
        fn = {"rpps": _rpps, "ameli": _ameli, "osm": _osm,
              "domaine": _domaine, "site": _site, "apports": _apports,
              "bodacc": _bodacc}.get(nom_source)
        if not fn:
            print("  source inconnue, ignoree : %s" % nom_source)
            continue
        n = fn(store, code_postal=code_postal, code_insee=code_insee,
               ville=ville, maximum=maximum)
        bilan[nom_source] = n
        if verbeux:
            print("  %-8s %+d valeurs" % (nom_source, n))
    store.valider()
    return bilan


def _rpps(store, code_postal=None, **kw):
    """Registre ANS : profession reelle + telephone + email.

    C'est la seule source autoritaire sur la profession d'un soignant, et la
    seule qui couvre les osteopathes.
    """
    if not code_postal:
        return 0
    lignes = S.rpps(code_postal)
    if not lignes:
        return 0

    # Le RPPS emet UNE LIGNE PAR PROFESSION : un praticien kine et osteopathe
    # y figure deux fois. Sans regroupement, l'appariement voit deux candidats
    # identiques, les juge ambigus et n'en retient aucun - c'est ce qui faisait
    # disparaitre 8 des 18 osteopathes de Bruz.
    roster = {}
    for l in lignes:
        p = roster.setdefault(M.cle(l["nom"]), {
            "nom": l["nom"], "adresse": l["adresse"],
            "professions": set(), "telephone": "", "email": ""})
        p["professions"].add(l["profession"])
        p["telephone"] = p["telephone"] or l["telephone"]
        p["email"] = p["email"] or l["email"]
        p["adresse"] = p["adresse"] or l["adresse"]
    praticiens = list(roster.values())

    # Seulement les metiers dont le RPPS fait autorite. Sur toutes les fiches,
    # l'appariement par nom et code postal collait a un consultant le
    # telephone et l'email d'un kine homonyme : 804 valeurs fausses, dont
    # "Pharmacien" comme metier verifie d'une agence immobiliere (05/10/2026).
    sante = sorted(k for k, v in REFERENTIEL.items()
                   if isinstance(v, dict) and v.get("autorite") == "rpps")
    fiches = store.fiches(metier=sante)
    rap = M.Rapprocheur(fiches, praticiens)
    n = 0
    for f in fiches:
        p, _raison = rap.apparier(f, adresse=f["adresse"])
        if not p:
            continue
        for profession in sorted(p["professions"]):
            n += store.poser_valeur(f["siret"], "metier_reel", profession,
                                    "RPPS (ANS)", "registre")
        n += store.poser_valeur(f["siret"], "telephone", p["telephone"],
                                "RPPS (ANS)", "registre")
        if p["email"]:
            conf, note = M.qualifier_email(p["email"], nom_personne=p["nom"])
            n += store.poser_valeur(f["siret"], "email", p["email"],
                                    "RPPS (ANS)", conf or "registre", note)
    return n


def _ameli(store, ville=None, **kw):
    if not ville:
        return 0
    praticiens = [{"nom": "%s %s" % (p.get("ps_activite_prenom", ""),
                                     p.get("ps_activite_nom", "")),
                   "profession": p.get("specialite_libelle", ""),
                   "adresse": p.get("coordonnees_voie", ""),
                   "telephone": M.tel_fr(p.get("coordonnees_num_tel"))}
                  for p in S.ameli(ville)]
    if not praticiens:
        return 0
    fiches = store.fiches(sans="telephone")
    rap = M.Rapprocheur(fiches, praticiens)
    n = 0
    for f in fiches:
        p, _ = rap.apparier(f, adresse=f["adresse"])
        if p:
            n += store.poser_valeur(f["siret"], "telephone", p["telephone"],
                                    "Annuaire sante Ameli", "registre")
            n += store.poser_valeur(f["siret"], "metier_reel", p["profession"],
                                    "Annuaire sante Ameli", "registre")
    return n


def _osm(store, code_insee=None, **kw):
    if not code_insee:
        return 0
    pois = S.osm(code_insee)
    if not pois:
        return 0
    fiches = store.fiches(sans="telephone")
    rap = M.Rapprocheur(fiches, pois,
                        cle_nom=lambda x: "%s %s" % (x.get("nom", ""),
                                                     x.get("enseigne", "")))
    n = 0
    for f in fiches:
        p, raison = rap.apparier(f, adresse=f["adresse"])
        if not p:
            continue
        conf = "annuaire" if raison in ("adresse+nom", "mot unique") else "incertain"
        n += store.poser_valeur(f["siret"], "telephone", p["telephone"],
                                "OpenStreetMap (%s)" % p["nom"], conf)
        n += store.poser_valeur(f["siret"], "site_web", p["site_web"],
                                "OpenStreetMap (%s)" % p["nom"], conf)
        if p["email"]:
            n += store.poser_valeur(f["siret"], "email", p["email"],
                                    "OpenStreetMap (%s)" % p["nom"], conf)
    return n


def _bodacc(store, ville=None, **kw):
    """Croise la base avec le journal officiel des entreprises.

    Detecte ce que SIRENE ne dit pas : liquidations, radiations, cessions.
    Une entreprise liquidee y reste "active" des mois - constate trois fois
    sur 178 fiches a Bruz.
    """
    if not ville:
        return 0
    par_siren = B.evenements_par_siren(ville, familles=B.MORTELLES | B.REPRISES)
    if not par_siren:
        return 0

    n = 0
    for f in store.fiches(avec_exclusions=True):
        ev = par_siren.get(f["siren"])
        if not ev:
            continue
        mortels = [e for e in ev if e["famille"] in B.MORTELLES]
        if mortels:
            dernier = mortels[0]
            store.exclure(f["siret"],
                          "%s au BODACC le %s" % (dernier["libelle"], dernier["date"]),
                          dernier["url"])
            n += store.poser_valeur(
                f["siret"], "metier_reel",
                "%s (BODACC %s) - ne pas prospecter" % (dernier["libelle"], dernier["date"]),
                "BODACC", "registre", dernier["url"])
            continue
        cessions = [e for e in ev if e["famille"] in B.REPRISES]
        if cessions:
            # Une cession recente change le dirigeant : le contact connu peut
            # etre perime, et l'entreprise n'est plus la meme interlocutrice.
            n += store.poser_valeur(
                f["siret"], "metier_reel",
                "Cession/vente publiee au BODACC le %s - dirigeant a reverifier"
                % cessions[0]["date"],
                "BODACC", "registre", cessions[0]["url"])
    return n


def _apports(store, **kw):
    """Applique les coordonnees trouvees a la main (apports.json).

    C'est le canal officiel du travail manuel : tout ce qui n'est pas
    automatisable passe par la, avec sa source. Les apports sont rejoues a
    chaque reconstruction de la base, donc jamais perdus - contrairement aux
    corrections faites directement dans un CSV.

    Un apport sans source est refuse : une coordonnee dont on ne peut pas
    dire d'ou elle vient n'a pas sa place dans un fichier de prospection.
    """
    chemin = os.path.join(RACINE, "apports.json")
    if not os.path.exists(chemin):
        return 0
    data = json.load(io.open(chemin, encoding="utf-8"))

    par_nom = {}
    for f in store.fiches(avec_exclusions=True):
        par_nom.setdefault(f["nom"], f["siret"])

    n, refuses = 0, []
    for a in data.get("apports", []):
        siret = (a.get("siret") or "").strip() or par_nom.get((a.get("nom") or "").strip())
        if not siret:
            if a.get("nom") and "EXEMPLE" not in a["nom"].upper():
                refuses.append("%s : introuvable en base" % a.get("nom"))
            continue
        if not (a.get("source") or "").strip():
            refuses.append("%s : source manquante" % (a.get("nom") or siret))
            continue
        conf = a.get("confiance") or "manuel"
        if a.get("repecher") and store.repecher(siret):
            n += 1
        for champ in ("telephone", "email", "site_web", "metier_reel"):
            valeur = (a.get(champ) or "").strip()
            if not valeur:
                continue
            if champ == "telephone":
                valeur = M.tel_fr(valeur) or valeur
            n += store.poser_valeur(siret, champ, valeur, a["source"], conf,
                                    a.get("note"))
    for r in refuses:
        print("    apport ignore - %s" % r)
    return n


def maintenant_court():
    import datetime
    return datetime.date.today().isoformat()


def _domaine(store, maximum=None, **kw):
    """Devine puis VERIFIE le domaine des fiches dont on ignore le site.

    C'est le verrou de l'enrichissement par email : sans site connu, il n'y a
    rien a scraper. On ne devine jamais une adresse email, seulement un
    domaine - parce qu'un domaine se verifie en lisant la page.
    """
    # Une fiche deja essayee sans succes n'est pas reessayee : les memes
    # noms donnent les memes domaines. Sans cette memoire, chaque lancement
    # rejouait des milliers de fiches deja epuisees, et le traitement etait
    # tue par la limite de temps avant d'atteindre les nouvelles.
    tentees = {r[0] for r in store.cx.execute(
        "SELECT siret FROM valeur WHERE champ='domaine_tente'")}
    fiches = [f for f in store.fiches()
              if not f["site_web"] and f["siret"] not in tentees]
    if maximum:
        fiches = fiches[:maximum]
    n = 0
    for f in fiches:
        url, conf, motif = D.chercher(f)
        if url:
            n += store.poser_valeur(f["siret"], "site_web", url,
                                    "domaine devine et verifie", conf, motif)
        else:
            store.poser_valeur(f["siret"], "domaine_tente", maintenant_court(),
                               "domaine", "incertain", motif)
    return n


def _site(store, maximum=None, **kw):
    """Cherche un email sur le site du prospect, quand on connait son site."""
    # Meme memoire que pour les domaines : un site lu sans resultat ne
    # change pas d'un jour a l'autre.
    tentes = {r[0] for r in store.cx.execute(
        "SELECT siret FROM valeur WHERE champ='site_tente'")}
    fiches = [f for f in store.fiches(sans="email")
              if f["site_web"] and f["siret"] not in tentes]
    if maximum:
        fiches = fiches[:maximum]
    n = 0
    for f in fiches:
        emails, page = S.emails_du_site(f["site_web"])
        if not emails:
            store.poser_valeur(f["siret"], "site_tente", maintenant_court(),
                               "site", "incertain", f["site_web"])
            continue
        conf, note = M.qualifier_email(emails[0], site=f["site_web"])
        n += store.poser_valeur(f["siret"], "email", emails[0],
                                "site %s" % page, conf or "site_officiel", note)
    return n


# =====================================================================
# 3. QUALIFIER
# =====================================================================

def qualifier(store, par_metier=5, ref_lat=None, ref_lon=None):
    """Note les fiches sur les 4 criteres et rend le meilleur lot par metier."""
    fiches = store.fiches()
    for f in fiches:
        f["note"], f["detail"] = _noter(f, ref_lat, ref_lon)

    def coherente(f):
        """La fiche appartient-elle vraiment a son metier ?

        Quand le referentiel declare une autorite (RPPS pour les soignants),
        une simple deduction NAF ne suffit PAS : le code 86.90F contient
        autant de psychologues et de sophrologues que d'osteopathes. La fiche
        doit etre confirmee par cette autorite, sinon elle est mise de cote.
        """
        regle = _regle(f["metier"])
        attendu = M.cle(regle["libelle"])
        reel = M.cle(f.get("metier_reel") or "")
        source = f.get("metier_reel_source", "")
        autorite = regle.get("autorite")

        if autorite:
            # Le critere n'est pas le NOM de la source mais son niveau de
            # confiance : RPPS et Ameli sont tous deux des registres. Exiger
            # la chaine "rpps" rejetait a tort les 15 kines confirmes par Ameli.
            #
            # Et on regarde TOUTES les valeurs de registre, pas seulement la
            # meilleure : un praticien kine ET osteopathe porte les deux
            # libelles, et n'en afficher qu'un le faisait disparaitre de
            # l'autre metier. C'est le cas de 8 des 18 osteopathes de Bruz.
            registres = [v["valeur"] for v in store.concurrentes(f["siret"], "metier_reel")
                         if v["confiance"] == "registre"]
            if not registres:
                return False, "non confirme par un registre (%s)" % (source or "aucune source")
            for r in registres:
                k = M.cle(r)
                if attendu in k or k in attendu:
                    return True, ""
            return False, "le registre dit : %s" % " / ".join(registres)

        if not reel or source.startswith("NAF"):
            return True, ""      # simple deduction, sans autorite : on garde
        ok = attendu in reel or reel in attendu
        return ok, "" if ok else "source %s dit : %s" % (source, f.get("metier_reel"))

    # Une fiche candidate a plusieurs metiers est evaluee une fois par metier :
    # un praticien 86.90E peut etre un vrai osteopathe ET un vrai kine.
    par = {}
    for f in fiches:
        for metier in (f.get("metiers") or [f["metier"]]):
            vue = dict(f, metier=metier)
            vue["coherente"], vue["motif"] = coherente(vue)
            par.setdefault(metier, []).append(vue)

    out = {}
    for metier, lot in par.items():
        retenus = [f for f in lot if f["coherente"]]
        retenus.sort(key=lambda f: (-f["note"], f["nom"]))
        out[metier] = {"total": len(lot), "coherentes": len(retenus),
                       "top": retenus[:par_metier]}
    return out


def _noter(f, ref_lat=None, ref_lon=None):
    """Les 4 criteres BNI : anciennete, structure, presence en ligne, distance."""
    total, detail = 0.0, []

    try:
        a, m, j = (int(x) for x in f["date_creation"].split("-"))
        ans = (date.today() - date(a, m, j)).days / 365.25
        if ans >= 5:
            total += 1
        elif ans >= 2:
            total += 0.5
        detail.append("%d ans" % ans)
    except Exception:
        detail.append("anciennete ?")

    if f["tranche_effectif"] not in ("NN", "00", "", None):
        total += 1
        detail.append("employeur")
    elif f["tranche_effectif"] == "00":
        total += 0.5
        detail.append("sans salarie")

    if f.get("site_web"):
        total += 1
        detail.append("site web")

    if ref_lat is not None and f.get("latitude"):
        d = M.distance_km(ref_lat, ref_lon, f["latitude"], f["longitude"])
        if d <= 2:
            total += 1
        elif d <= 5:
            total += 0.5
        detail.append("%.1f km" % d)

    return total, " / ".join(detail)


# =====================================================================
# EXPORT
# =====================================================================

COLONNES = ["siret", "metier", "metier_reel", "metier_reel_source", "nom",
            "enseigne", "dirigeants", "adresse", "code_postal", "commune",
            "date_creation", "tranche_effectif", "telephone", "telephone_source",
            "email", "email_source", "email_note", "site_web", "naf"]


def exporter_csv(store, chemin, metier=None):
    fiches = store.fiches(metier=metier)
    with io.open(chemin, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.DictWriter(fh, fieldnames=COLONNES, delimiter=";",
                           extrasaction="ignore")
        w.writeheader()
        w.writerows(sorted(fiches, key=lambda f: (f["metier"], f["nom"])))
    return len(fiches)
