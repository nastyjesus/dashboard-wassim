# -*- coding: utf-8 -*-
"""Regles d'appariement et de nettoyage.

Tout ce module est le produit d'erreurs constatees en production. Chaque
constante porte l'exemple qui l'a motivee : ne pas les alleger sans avoir
relu ces exemples.
"""
import math
import re
import unicodedata

# ---------------------------------------------------------------- texte

def sans_accents(txt):
    txt = unicodedata.normalize("NFD", txt or "")
    return "".join(c for c in txt if unicodedata.category(c) != "Mn")


def cle(txt):
    """Cle ASCII minuscule, pour comparer des libelles accentues.

    Indispensable : "steopathe" n'est pas une sous-chaine de "Osteopathe",
    l'accent coupe le mot. Et un fichier UTF-8 lu en cp1252 transforme
    "Osteopathe" en "ostaopathe" - le bug a coute une passe complete.
    """
    return re.sub(r"[^a-z0-9]+", "", sans_accents(txt).lower())


# Mots qui n'identifient personne : formes juridiques, mots de metier,
# civilites. Un mot commun pris ici ne vaut pas appariement.
VIDES = {
    "SARL", "SAS", "SASU", "EURL", "SCI", "SCP", "SELARL", "SELAS", "EIRL",
    "MONSIEUR", "MADAME", "SOCIETE", "GROUPE", "ENTREPRISE", "CABINET",
    "AGENCE", "LES", "DES", "DU", "DE", "LA", "LE", "ET", "AUX", "SUR",
    "FRANCE", "BRETAGNE", "LTD", "HOLDING", "ASSOCIES",
    "ATELIER", "AGENCEMENT", "PUBLICITE", "IMMOBILIER", "IMMO", "PAYSAGE",
    "PAYSAGES", "MENUISERIE", "CONSEIL", "CONSEILS", "CREATION", "CREATIONS",
    "SERVICES", "SERVICE", "HABITAT", "JARDIN", "JARDINS", "DESIGN", "STUDIO",
    "TRANSACTION", "GESTION", "PATRIMOINE", "COMMUNICATION", "GRAPHIQUE",
    "OSTEOPATHIE", "OSTEOPATHE", "KINESITHERAPIE", "NOTAIRE", "NOTAIRES",
    "AVOCAT", "AVOCATS", "SANTE", "CENTRE", "INSTITUT", "NOM", "METIER",
    "BOITE", "LETTRES",
}

TYPES_VOIE = {"RUE", "AVENUE", "AV", "BOULEVARD", "BD", "PLACE", "PL", "ALLEE",
              "IMPASSE", "CHEMIN", "ROUTE", "SQUARE", "COURS", "QUAI", "ZA", "ZI"}

# Prenoms courants. Ils restent utiles COMBINES a un patronyme, donc pas dans
# VIDES : ils sont seulement interdits comme seule preuve d'appariement.
# Constate sans cette liste : une osteopathe recuperait le telephone d'une
# agence immobiliere portant le meme prenom, parce que sur un petit corpus
# un prenom devient statistiquement "unique".
PRENOMS = {
    "MARIE", "JEAN", "PIERRE", "MICHEL", "ANDRE", "PHILIPPE", "ALAIN", "JACQUES",
    "BERNARD", "CLAUDE", "DANIEL", "PATRICK", "CHRISTIAN", "OLIVIER", "PASCAL",
    "LAURENT", "ERIC", "FRANCOIS", "NICOLAS", "STEPHANE", "THIERRY", "DIDIER",
    "SEBASTIEN", "JULIEN", "DAVID", "THOMAS", "VINCENT", "GUILLAUME", "ANTOINE",
    "ALEXANDRE", "MAXIME", "ROMAIN", "BENOIT", "CEDRIC", "FABIEN", "MATHIEU",
    "JEROME", "YANN", "GAEL", "LOIC", "ARNAUD", "DAMIEN", "JEREMY", "KEVIN",
    "SAMUEL", "MALO", "TANGUY", "JOCELYN", "MORGAN", "FLORIAN", "CAMILLE",
    "NATHALIE", "ISABELLE", "SYLVIE", "CATHERINE", "MARTINE", "CHRISTINE",
    "VALERIE", "SANDRINE", "STEPHANIE", "VERONIQUE", "CAROLE", "CELINE",
    "AUDREY", "JULIE", "EMILIE", "AURELIE", "LAURA", "MANON", "CHLOE", "LEA",
    "ANNE", "SOPHIE", "CLAIRE", "LAURENCE", "PATRICIA", "FLORENCE", "DELPHINE",
    "MURIEL", "ELISABETH", "HELENE", "CHARLOTTE", "LOUISE", "MARINE", "FANNY",
    "JUSTINE", "ROMANE", "MORGANE", "ELODIE", "CHRISTELLE", "ANNIE", "AGNES",
    "LAETITIA", "PERRINE", "AURANE", "NADINE", "SOLENE", "MATHILDE", "ZOE",
}


def mots(txt):
    return {m for m in re.split(r"[^A-Za-z0-9]+", sans_accents(txt).upper())
            if len(m) > 2 and m not in VIDES}


def mots_voie(txt):
    return {m for m in mots(txt) if m not in TYPES_VOIE}


def numero_voie(adresse):
    m = re.match(r"\s*(\d+)", adresse or "")
    return m.group(1) if m else ""


# ------------------------------------------------------------ telephone

def tel_fr(num):
    """Normalise en 0X XX XX XX XX. Rend '' si ce n'est pas un numero FR."""
    d = re.sub(r"\D", "", str(num or ""))
    if d.startswith("0033"):
        d = "0" + d[4:]
    elif d.startswith("33") and len(d) == 11:
        d = "0" + d[2:]
    elif len(d) == 9:
        d = "0" + d
    if len(d) != 10 or not d.startswith("0"):
        return ""
    return " ".join(d[i:i + 2] for i in range(0, len(d), 2))


# ---------------------------------------------------------------- email

# Adresses d'exemple laissees dans les formulaires.
# Constate : jean.dupont@gmail.com sur pilcreation.fr
# Le domaine compte autant que la partie locale : "vous@exemple.com" a la
# partie locale banale mais un domaine d'exemple evident.
PLACEHOLDERS = re.compile(
    r"^(jean|john)[._-]?(dupont|doe|martin)@|"
    r"^(prenom|nom)[._-]?(nom|prenom)@|"
    r"^(exemple|sample|demo|monemail|mail|votre|vous|moi|email|adresse)@|"
    r"@(exemple|example|votresite|monsite|mondomaine|domaine|site|test|"
    r"localhost|email|mail)\.", re.I)

# Agences web creditees en pied de page : ce n'est pas l'adresse du prospect.
# Constate : l'adresse de l'agence web sur le site d'un cuisiniste.
AGENCES = re.compile(
    r"@(optavis|simplebo|solocal|wsi[a-z]*|netnco|kiwi[a-z]*|agence[a-z-]*|"
    r"[a-z-]*studio|[a-z-]*digital|webmaster)\.", re.I)

BRUIT = re.compile(
    r"(sentry|wixpress|example|godaddy|cloudflare|jquery|bootstrap|@2x|"
    r"\.png|\.jpg|\.jpeg|\.gif|\.svg|\.webp|\.css|\.js|"
    r"domain\.com|email\.com|user@|test@)", re.I)

# Boites partagees : valables comme contact de structure, jamais pour un
# "Bonjour <prenom>".
GENERIQUES = re.compile(
    r"^(contact|info|infos|accueil|bonjour|hello|commercial|service|agence|"
    r"secretariat|secretaire|direction|admin|administration|rh|recrutement|"
    r"cabinet|scm|selarl)@", re.I)

# Les grands reseaux : le correspondant local n'est pas un dirigeant, donc
# pas une cible pour un reseau d'affaires entre independants.
RESEAUX_NATIONAUX = re.compile(
    r"derichebourg|adecco|manpower|randstad|synergie|proman|startpeople|"
    r"\bcrit\b|aurajob|supplay|samsic|century\s?21|orpi|laforet|guy\s?hoquet",
    re.I)

MOTIF_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")


def domaine(url_ou_email):
    """Domaine enregistrable : les deux derniers labels.

    office-x.notaires.fr et 35176.notaires.fr doivent matcher : deux offices
    sur la meme infrastructure.
    """
    txt = str(url_ou_email or "").lower()
    txt = re.sub(r"^https?://", "", txt).split("@")[-1].split("/")[0]
    txt = re.sub(r"^www\.", "", txt)
    labels = [l for l in txt.split(".") if l]
    return ".".join(labels[-2:]) if len(labels) >= 2 else txt


def _artefact(email):
    """Partie locale identique au domaine : mailto casse.

    Constate : contact@contact.fr sur pilcreation.fr
    """
    local, _, dom = email.partition("@")
    return local == dom.split(".")[0]


def emails_du_html(html, site=None):
    """Emails plausibles trouves dans une page, les plus surs en premier."""
    trouves = []
    for e in MOTIF_EMAIL.findall(html or ""):
        e = e.strip(".").lower()
        if BRUIT.search(e) or PLACEHOLDERS.search(e) or AGENCES.search(e) or _artefact(e):
            continue
        if e not in trouves:
            trouves.append(e)
    if site:
        d = domaine(site)
        trouves.sort(key=lambda e: 0 if domaine(e) == d else 1)
    return trouves


def qualifier_email(email, nom_personne=None, site=None):
    """Rend (confiance, note) pour un email donne.

    Le RPPS associe parfois a un praticien l'adresse d'un confrere du meme
    cabinet (constate sur une fiche de praticien).
    Un email nominatif qui ne contient rien du nom du praticien est donc
    signale, pas rejete : il reste valable comme contact de cabinet.
    """
    if not email:
        return None, None
    local = email.split("@")[0]
    if GENERIQUES.match(local):
        return "annuaire", "adresse de structure, pas nominative"
    if nom_personne:
        lm = re.sub(r"[^a-z]", "", local.lower())
        if not any(len(m) > 3 and m.lower() in lm for m in mots(nom_personne)):
            return "incertain", "adresse non nominative du praticien - a verifier"
    if site and domaine(email) != domaine(site):
        return "incertain", "domaine different du site - a verifier"
    return "site_officiel", None


# ------------------------------------------------------- rapprochement

class Rapprocheur(object):
    """Apparie des entites par nom, en s'appuyant sur la RARETE des mots.

    La longueur d'un mot ne dit rien : VALERIE, ISABELLE, ATELIER et
    AGENCEMENT font tous plus de six lettres et n'identifient personne.
    Un mot present une seule fois de chaque cote, lui, identifie.

    Constate sans cette regle : une praticienne appariee a une agence
    immobiliere portant son prenom, un atelier apparie a un restaurant
    qui partageait le mot "atelier".
    """

    def __init__(self, gauche, droite, cle_nom=lambda x: x["nom"]):
        self.cle_nom = cle_nom
        self.droite = list(droite)
        self.freq_g, self.freq_d = {}, {}
        for x in gauche:
            for m in mots(cle_nom(x)):
                self.freq_g[m] = self.freq_g.get(m, 0) + 1
        for x in self.droite:
            for m in mots(cle_nom(x)):
                self.freq_d[m] = self.freq_d.get(m, 0) + 1
        self.index = {}
        for x in self.droite:
            for m in mots(cle_nom(x)):
                self.index.setdefault(m, []).append(x)

    def apparier(self, item, adresse=None, exiger_adresse=False,
                 adresse_de=lambda x: x.get("adresse", "")):
        """Rend (candidat, raison) ou (None, motif de refus).

        exiger_adresse : impose que la voie et le numero concordent. A activer
        quand les noms sont peu distinctifs.
        """
        toks = mots(self.cle_nom(item))
        if not toks:
            return None, "nom non exploitable"

        voie = mots_voie(adresse or "")
        num = numero_voie(adresse or "")

        candidats = []
        for m in toks:
            for c in self.index.get(m, []):
                if c in [x[0] for x in candidats]:
                    continue
                communs = mots(self.cle_nom(c)) & toks
                if not communs:
                    continue

                adr_c = adresse_de(c)
                voie_c = mots_voie(adr_c)
                adresse_ok = bool(voie_c) and voie_c <= voie and not (
                    numero_voie(adr_c) and num and numero_voie(adr_c) != num)
                # Mot unique des deux cotes = identifiant. Trois garde-fous :
                #  - >= 4 lettres : "SUR"/"AUX" peuvent etre uniques par
                #    accident (une enseigne SIRENE contenait la phrase
                #    "NOM + METIER SUR LA BOITE AUX LETTRES").
                #  - jamais un prenom : sur un petit corpus, un prenom devient
                #    "unique" et apparie deux personnes sans rapport.
                #  - la rarete est relative au corpus : sur moins de 30
                #    entites a droite, elle ne prouve plus rien.
                assez_de_corpus = len(self.droite) >= 30
                unique = assez_de_corpus and any(
                    len(w) >= 4 and w not in PRENOMS
                    and self.freq_g.get(w, 0) == 1 and self.freq_d.get(w, 0) == 1
                    for w in communs)

                if exiger_adresse and not adresse_ok:
                    continue
                if not (adresse_ok or unique or len(communs) >= 2):
                    continue
                raison = ("adresse+nom" if adresse_ok else
                          "mot unique" if unique else "deux mots communs")
                candidats.append((c, raison, len(communs)))

        if not candidats:
            return None, "aucun candidat"
        candidats.sort(key=lambda x: -x[2])
        if len(candidats) > 1 and candidats[0][2] == candidats[1][2]:
            return None, "ambigu : plusieurs candidats a egalite"
        return candidats[0][0], candidats[0][1]


# ------------------------------------------------------------ geographie

def distance_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))
