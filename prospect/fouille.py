# -*- coding: utf-8 -*-
"""Fouille manuelle assistee : chercher, lire, extraire - sans rien deviner.

Ce module ne decide rien. Il rassemble ce qui est PUBLIE sur une fiche pour
qu'un humain tranche : des resultats de recherche, le texte des pages, les
adresses et telephones qui y figurent.

Pourquoi DuckDuckGo plutot que Google : Google sert un CAPTCHA aux clients
non interactifs, et le franchir n'est pas une option. Pourquoi curl plutot
que le navigateur : sur des annuaires et des sites d'office, tout est dans
le HTML servi. Le navigateur reste utile quand la page monte en JavaScript -
c'est ainsi qu'on avait trouve les adresses nominatives des notaires de Bruz.
"""
import re
import urllib.parse

from . import matching as M
from . import sources as S

DDG = "https://html.duckduckgo.com/html/?q="

# Un resultat DDG pointe vers /l/?uddg=<url encodee>.
_REDIR = re.compile(r'/l/\?uddg=([^&"\']+)')
_LIEN = re.compile(r'<a[^>]+class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S)
_EXTRAIT = re.compile(r'<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>(.*?)</a>', re.S)

_MAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Les bornes (?<!\d) et (?!\d) sont indispensables : sans elles, le motif
# se satisfait de dix chiffres pris AU MILIEU d'un SIRET. La page
# pagesjaunes.fr/siret/10219868600010 rendait ainsi "02 19 86 86 00",
# un numero qui n'existe pas.
_TEL = re.compile(r"(?<!\d)0[1-9](?:[ .\-]?\d{2}){4}(?!\d)")
_BINAIRE = re.compile(r"\.(png|jpe?g|gif|svg|webp|css|js|woff2?)$", re.I)

# Adresses techniques et exemples de formulaire. Doctolib expose son collecteur
# d'erreurs (sentry.io, exceptions.doctolib.fr) et un "jean.dupont@email.fr"
# dans ses champs de saisie : trois adresses qui n'appartiennent a personne.
_TECHNIQUE = re.compile(
    r"sentry\.io|exceptions?\.|@o\d+\.ingest|bugsnag|datadog|newrelic|"
    r"noreply|no-reply|donotreply|postmaster|abuse@|mailer-daemon|"
    r"jean\.?dupont|john\.?doe|nom\.prenom|prenom\.nom|votre\.?(e-?mail|nom)|"
    r"exemple|example\.(com|org)|wixpress|sentry-next|wordpress@", re.I)


def _texte(html):
    html = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", html or "")
    t = re.sub(r"<[^>]+>", " ", html)
    for avant, apres in (("&nbsp;", " "), ("&amp;", "&"), ("&quot;", '"'),
                         ("&#039;", "'"), ("&#8217;", "'"), ("&eacute;", "e")):
        t = t.replace(avant, apres)
    return re.sub(r"\s+", " ", t).strip()


class MoteurFerme(RuntimeError):
    """DuckDuckGo a cesse de repondre - il ne faut surtout pas continuer.

    Le 24/09/2026, apres environ 450 requetes, DDG a renvoye une page
    d'erreur de 236 octets. Le script a poursuivi et enregistre 169 fiches
    "sans resultat" alors qu'aucune recherche n'avait eu lieu, puis est
    sorti en code 0. Un rapport faux est pire qu'un rapport absent : il se
    lit comme une conclusion. On leve desormais, et l'appelant s'arrete.
    """


def chercher(requete, maximum=6, essais=3, attente=45):
    """Resultats d'une recherche : titre, url, extrait.

    DuckDuckGo est le seul moteur dont les resultats soient lisibles sans
    JavaScript : Mojeek et Brave ne servent que leur coquille applicative.
    Il n'y a donc pas de moteur de secours, seulement de la patience. Un
    refus est le plus souvent temporaire : on attend et on reessaie avant
    d'abandonner.

    Leve MoteurFerme si le moteur refuse toujours apres `essais` tentatives.
    """
    import time as _t
    for essai in range(essais):
        html = S._curl(DDG + urllib.parse.quote(requete)) or ""
        if not (len(html) < 2000 and "result__a" not in html):
            break
        if essai < essais - 1:
            _t.sleep(attente * (essai + 1))
    else:
        html = ""
    # Une reponse de recherche fait des dizaines de milliers d'octets. En
    # dessous de 2 ko sans aucun resultat, c'est une page de refus.
    if len(html) < 2000 and 'result__a' not in html:
        apercu = " ".join(re.sub(r"<[^>]+>", " ", html).split())[:110]
        raise MoteurFerme("DuckDuckGo ne repond plus (%d octets) : %s"
                          % (len(html), apercu or "reponse vide"))
    out = []
    for href, titre in _LIEN.findall(html)[:maximum]:
        m = _REDIR.search(href)
        url = urllib.parse.unquote(m.group(1)) if m else href
        out.append({"titre": _texte(titre), "url": url})
    for i, ex in enumerate(_EXTRAIT.findall(html)[:len(out)]):
        out[i]["extrait"] = _texte(ex)
    return out


def contacts(url):
    """Emails et telephones PUBLIES sur une page, qualifies.

    `qualifier_email` ecarte les placeholders de formulaire - c'est lui qui
    a evite d'inscrire contact@contact.fr et jean.dupont@gmail.com, affiches
    par le formulaire de pilcreation.fr.
    """
    html = S._curl(url) or ""
    if not html:
        return {"url": url, "erreur": "page vide ou inaccessible"}
    texte = _texte(html)
    mails = []
    for m in dict.fromkeys(_MAIL.findall(html)):
        if _BINAIRE.search(m) or _TECHNIQUE.search(m):
            continue
        # Une adresse de 32 caracteres hexadecimaux est un identifiant de
        # telemetrie, pas une boite aux lettres.
        if re.match(r"^[0-9a-f]{24,}@", m, re.I):
            continue
        verdict = M.qualifier_email(m)
        mails.append({"email": m, "verdict": verdict})
    tels = [M.tel_fr(t) or t for t in dict.fromkeys(_TEL.findall(texte))]
    return {"url": url, "octets": len(html), "titre": _titre(html),
            "emails": mails, "telephones": tels, "texte": texte}


def _titre(html):
    m = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.S)
    return _texte(m.group(1)) if m else ""


def indices_metier(texte, mots):
    """Ou le texte parle-t-il du metier ? Rend les passages, pas un verdict."""
    t = M.sans_accents(texte).lower() if hasattr(M, "sans_accents") else texte.lower()
    vus = []
    for mot in mots:
        for m in re.finditer(re.escape(mot.lower()), t):
            i = m.start()
            vus.append((mot, texte[max(0, i - 90):i + 90]))
            break
    return vus


# ===================================================================
# ENQUETE PAR FICHE
# ===================================================================

# Domaines qui ne portent jamais le contact de l'entreprise elle-meme :
# registres, agregateurs de donnees legales, offres d'emploi.
STERILES = re.compile(
    r"societe\.com|pappers\.fr|infogreffe|verif\.com|manageo|bodacc|infonet\.fr|"
    r"lefigaro\.fr|datalegal|lesentreprises\.com|unike\.fr|annuaire-entreprises|"
    r"indeed|glassdoor|trabajo|jobijoba|hellowork|linkedin\.com/jobs|"
    r"leguichetdesformalites|contract-factory|societeinfo|cataloxy|"
    # Agregateurs qui affichent LEUR propre numero a cote du nom scrape :
    # northdata rendait 01 49 18 67 67 pour un paysagiste de Bruz.
    r"northdata|obteniruncontact|mafleuriste\.net|trouver-ouvert|"
    r"starofservice|jesuisnumerique|graphistesdufutur|meilleur-artisan|"
    # PagesJaunes masque les numeros derriere un clic : ce qui reste lisible
    # dans le HTML est peu fiable, et forcer l'affichage contreviendrait a
    # leurs conditions d'utilisation.
    r"pagesjaunes\.fr", re.I)

# Un contact n'est retenu que si la page prouve qu'elle parle bien de CETTE
# entreprise. Sans cette regle, on recolte le telephone du voisin : c'est
# ainsi que l'adresse d'une agence immobiliere avait failli etre attribuee a
# une autre societe de la meme avenue.
def _preuves(texte, fiche):
    t = M.sans_accents(texte).upper()
    mots = {m for m in re.split(r"[^A-Za-z0-9]+", M.sans_accents(fiche.get("nom", "")).upper())
            if len(m) > 3 and m not in M.VIDES and m not in M.PRENOMS}
    trouves = {m for m in mots if m in t}
    rue = ""
    m = re.search(r"\d+\s*[A-Z]?\s+(RUE|AVENUE|BOULEVARD|PLACE|ALLEE|IMPASSE|CHEMIN|ROUTE)\s+[A-Z' -]+",
                  M.sans_accents(fiche.get("adresse", "")).upper())
    if m:
        rue = " ".join(m.group(0).split()[2:])
    return {
        "mots_du_nom": sorted(trouves),
        "commune": M.sans_accents(fiche.get("commune", "")).upper() in t,
        "rue": bool(rue) and rue in t,
    }


def enqueter(fiche, maximum=4, pause=0.4, requete=None, metier=None, voc=None):
    """Cherche les coordonnees d'une fiche et rend ce qui est CORROBORE.

    `requete` permet d'interroger autrement que par le nom - le nom commercial
    seul ne suffit pas toujours - SANS toucher aux preuves, qui se calculent
    toujours contre la fiche reelle. Confondre les deux ferait valider une
    page parce qu'elle contient les mots qu'on vient d'y chercher.

    Avec `metier` et `voc`, chaque piste porte aussi ce que la page dit du
    metier. La page qui donne un telephone dit ce que l'entreprise fait :
    une seule visite, deux reponses.

    Rend une liste de pistes. Rien n'est pose en base ici.
    """
    import time
    if requete is None:
        requete = "%s %s" % (fiche.get("enseigne") or fiche.get("nom", ""),
                             fiche.get("commune", ""))
    pistes = []
    for r in chercher(requete, maximum + 4):
        if STERILES.search(r["url"]):
            continue
        if len(pistes) >= maximum:
            break
        time.sleep(pause)
        d = contacts(r["url"])
        if d.get("erreur"):
            continue
        texte = d.get("texte", "")
        preuves = _preuves(texte, fiche)
        # bool() explicite : `a or b or (c and d)` rend la DERNIERE valeur
        # evaluee, pas un booleen. Le rapport portait "corrobore": [].
        solide = bool(len(preuves["mots_du_nom"]) >= 2 or preuves["rue"] or
                      (preuves["mots_du_nom"] and preuves["commune"]))
        # Une coordonnee n'est retenue que si la page situe l'entreprise.
        # Sans cela, coiffure.e-pro.fr/cotes-d-armor/fraboulet donnait
        # 02 96 29 40 13 a une coiffeuse de Bruz, sur la foi d'un homonyme.
        ancre = bool(preuves["rue"] or preuves["commune"])
        mails = [m["email"] for m in d.get("emails", [])
                 if m["verdict"][0] not in ("placeholder", "incertain")]
        piste = {
            "url": r["url"], "titre": d.get("titre", ""), "requete": requete,
            "emails": mails[:4], "telephones": d.get("telephones", [])[:3],
            "preuves": preuves, "corrobore": solide, "ancre": ancre,
        }
        if metier and voc:
            piste["metier"] = indices(texte, metier, voc)
        # Une page sans contact garde sa valeur : elle dit le metier.
        if mails or d.get("telephones") or piste.get("metier", {}).get("mots_attendus"):
            pistes.append(piste)
    return pistes



# ===================================================================
# VERIFICATION DU METIER
# ===================================================================

def vocabulaire(referentiel):
    """mot de metier -> cles de metier qui le revendiquent.

    Un mot partage par plusieurs metiers ne prouve rien : "video" appartient
    au videaste ET au poseur d'alarmes (videosurveillance). On garde la
    correspondance complete pour pouvoir le constater.
    """
    voc = {}
    for cle, r in referentiel.items():
        if cle.startswith("_"):
            continue
        for mot in (r.get("mots_activite") or []):
            voc.setdefault(_plat(mot), set()).add(cle)
    return voc


def _plat(txt):
    """Normalise pour comparer : accents, apostrophes, pluriels, espaces.

    Sans cela "vehicules d'occasions" ne rencontrait pas "vehicules d occasion" :
    l'apostrophe et le pluriel suffisaient a manquer trois concessionnaires.
    """
    t = M.sans_accents(txt or "").lower()
    t = re.sub(r"['’\-]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t


def indices(texte, metier, voc):
    """Ce que la page dit du metier : mots attendus trouves, mots d'autres metiers.

    Ne rend aucun verdict. Un restaurant dont la page parle de traiteur fait
    peut-etre les deux ; c'est a un humain de trancher.
    """
    t = _plat(texte)
    attendus, concurrents = [], {}
    for mot, metiers in voc.items():
        # Le singulier du vocabulaire doit rencontrer le pluriel du texte.
        if _plat(mot) not in t and _plat(mot) + "s" not in t:
            continue
        if metier in metiers:
            attendus.append(mot)
        else:
            for autre in metiers:
                concurrents.setdefault(autre, []).append(mot)
    # Un seul mot court et generique ne signale pas un autre metier : "salon"
    # appartient a l'organisateur d'evenements et sortait sur chaque salon de
    # coiffure. On exige deux mots, ou une expression de plusieurs mots.
    serieux = {}
    for autre, mots in concurrents.items():
        if len(set(mots)) >= 2 or any(" " in m for m in mots):
            serieux[autre] = sorted(set(mots))
    return {
        "mots_attendus": sorted(set(attendus)),
        "autres_metiers": {k: serieux[k] for k in sorted(serieux)},
    }


def page_de_l_etablissement(url, nom, enseigne="", commune=""):
    """Page qui parle de CET etablissement : son site, ou sa page dediee.

    Une enseigne de reseau n'a pas de domaine a elle : L'Orange Bleue de Bruz
    vit sur lorangebleue.fr/clubs/bruz/. Le chemin nomme la commune, ce qui
    suffit a rattacher la page a l'etablissement.
    """
    if site_propre(url, nom, enseigne):
        return True
    if not commune:
        return False
    slug = re.sub(r"[^a-z0-9]+", "-", M.sans_accents(commune).lower()).strip("-")
    chemin = (url or "").split("?")[0].lower()
    return bool(slug) and re.search(r"[/\-]%s(?:[/\-]|$)" % re.escape(slug), chemin)


def site_propre(url, nom, enseigne=""):
    """La page est-elle sur le domaine de l'entreprise elle-meme ?

    Un site propre n'a pas a nommer sa commune pour que ses coordonnees lui
    appartiennent : dameelectrique.com EST le site de DAME ELECTRIQUE.
    Mais la ressemblance doit etre franche - jolygarage.fr ne partage que
    "JOLY" avec WALKER JOLY, et ce site est celui d'un garage des Vosges.
    """
    hote = re.sub(r"^https?://(www\.)?", "", url or "").split("/")[0]
    label = re.sub(r"[^a-z0-9]", "", hote.rsplit(".", 2)[0].lower())
    if not label:
        return False
    # Les mots de deux lettres comptent : sans "ma", l'enseigne MA PARENTHESE
    # COIFFURE ne reconnaissait pas maparenthese-coiffure.fr, son propre site.
    mots = [M.sans_accents(m).lower()
            for m in re.split(r"[^A-Za-z0-9]+", "%s %s" % (nom, enseigne))
            if len(m) >= 2 and M.sans_accents(m).upper() not in M.VIDES]
    if not mots:
        return False
    # Le domaine COMMENCE par au moins deux mots consecutifs du nom. La
    # simple presence ne suffit pas : worksweethome.fr contient "sweethome"
    # sans appartenir a SWEET HOME BY CARO - c'est un espace de reunion.
    for i in range(len(mots) - 1):
        for j in range(i + 2, len(mots) + 1):
            if label.startswith("".join(mots[i:j])):
                return True
    # ...ou il EST un mot du nom, assez long pour ne pas etre un hasard.
    return any(len(m) >= 8 and label == m for m in mots)
