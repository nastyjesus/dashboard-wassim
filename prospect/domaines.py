# -*- coding: utf-8 -*-
"""Trouve le site d'une entreprise en devinant son domaine, PUIS en verifiant.

Deviner un domaine est sans risque : on peut confirmer en lisant la page.
Deviner une adresse e-mail ne se verifie pas - on n'en genere jamais.

Un domaine n'est retenu que si la page qu'il sert mentionne reellement
l'entreprise : plusieurs mots de sa raison sociale, ou un mot plus la commune.
Sans cette verification on ramasse des domaines parques et des homonymes.
"""
import re
import socket

from . import matching as M
from . import sources as S

# Suffixes de forme juridique et mots vides : ils ne font pas partie du domaine.
A_RETIRER = re.compile(
    r"\b(sarl|sas|sasu|eurl|sci|scp|selarl|selas|eirl|sa|snc|"
    r"societe|entreprise|groupe|ets|etablissements)\b", re.I)

# Pages de domaine parque ou en vente : ce ne sont pas des sites d'entreprise.
PARKING = re.compile(
    r"(ce domaine est [aà] vendre|domain (name )?(is )?for sale|acheter ce domaine|"
    r"domaine r[ée]serv[ée]|parking|parked domain|site en construction|"
    r"under construction|coming soon|expired domain)", re.I)

EXTENSIONS = [".fr", ".com"]

# Pour verifier une page, on garde les mots de metier : "Paysages" sur
# leroypaysages.fr EST un signal. La liste VIDES de matching.py les ecarte,
# ce qui est bon pour comparer deux noms entre eux mais trop severe ici -
# LEROY PAYSAGES se retrouvait avec un seul mot exploitable et etait rejete.
MOTS_IGNORES_SITE = {"SARL", "SAS", "SASU", "EURL", "SCI", "SCP", "SELARL",
                     "SELAS", "EIRL", "SOCIETE", "ENTREPRISE", "GROUPE",
                     "MONSIEUR", "MADAME", "LES", "DES", "DU", "DE", "LA",
                     "LE", "ET"}


def mots_site(txt):
    return {m for m in re.split(r"[^A-Za-z0-9]+", M.sans_accents(txt).upper())
            if len(m) > 2 and m not in MOTS_IGNORES_SITE}


def candidats(nom, enseigne=""):
    """Domaines plausibles pour une entreprise, du plus au moins probable."""
    base = enseigne.strip() or nom.strip()
    base = re.sub(r"\(.*?\)", " ", base)          # (FORME JURIDIQUE) en trop
    base = A_RETIRER.sub(" ", M.sans_accents(base))
    mots = [m.lower() for m in re.split(r"[^A-Za-z0-9]+", base) if len(m) > 1]
    if not mots:
        return []

    # Un label DNS ne depasse pas 63 octets. Au-dela, socket.getaddrinfo ne
    # leve pas gaierror mais UnicodeError depuis le codec idna, ce qui
    # interrompait tout l'enrichissement sur une raison sociale a rallonge.
    MAX = 63

    formes = []
    colle = "".join(mots)
    tiret = "-".join(mots)
    if 4 <= len(colle) <= MAX:
        formes.append(colle)
    if tiret != colle and len(mots) > 1 and len(tiret) <= MAX:
        formes.append(tiret)
    # Les enseignes longues sont souvent raccourcies aux deux premiers mots.
    if len(mots) > 2:
        court = "".join(mots[:2])
        if len(court) <= MAX:
            formes.append(court)

    out = []
    for f in formes[:3]:
        for ext in EXTENSIONS:
            d = f + ext
            if d not in out:
                out.append(d)
    return out[:4]


def existe(domaine):
    """Le domaine resout-il ? Evite d'ouvrir une connexion pour rien.

    La grande majorite des domaines devines n'existent pas : ce test coute
    quelques millisecondes la ou une requete HTTP coute plusieurs secondes.
    """
    try:
        socket.getaddrinfo(domaine, 443, proto=socket.IPPROTO_TCP)
        return True
    except socket.gaierror:
        return False
    except UnicodeError:
        # Label hors specification : le codec idna refuse avant toute
        # resolution. Ce n'est pas une panne, c'est un candidat invalide.
        return False


def verifier(domaine, nom, enseigne="", commune=""):
    """Rend (url, confiance, motif) si la page confirme l'entreprise."""
    if not existe(domaine):
        return None, None, "domaine inexistant"
    for schema in ("https://", "http://"):
        html = S._curl(schema + domaine, timeout=8)
        if not html or len(html) < 200:
            continue
        if PARKING.search(html[:4000]):
            return None, None, "domaine parque"

        texte = M.sans_accents(re.sub(r"<[^>]+>", " ", html)).upper()
        attendus = mots_site(nom) | mots_site(enseigne)
        trouves = {m for m in attendus if m in texte}
        commune_ok = bool(commune) and M.sans_accents(commune).upper() in texte

        if len(trouves) >= 2 or (trouves and commune_ok):
            conf = "site_officiel" if (len(trouves) >= 2 and commune_ok) else "incertain"
            if commune_ok:
                motif = "%d mot(s) du nom + commune" % len(trouves)
            else:
                # Sans la commune, un domaine bati sur un nom de personne peut
                # appartenir a un homonyme d'une autre ville. On le dit.
                motif = ("%d mot(s) du nom, commune NON confirmee - "
                         "homonyme possible" % len(trouves))
            return schema + domaine, conf, motif
        return None, None, "page sans rapport"
    return None, None, "injoignable"


def chercher(fiche):
    """Cherche le site d'une fiche. Rend (url, confiance, motif) ou (None,...)."""
    for d in candidats(fiche.get("nom", ""), fiche.get("enseigne", "")):
        url, conf, motif = verifier(d, fiche.get("nom", ""),
                                    fiche.get("enseigne", ""), fiche.get("commune", ""))
        if url:
            return url, conf, "%s (%s)" % (d, motif)
    return None, None, "aucun domaine confirme"
