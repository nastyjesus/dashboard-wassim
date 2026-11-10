# -*- coding: utf-8 -*-
"""Sources de donnees. Toutes gratuites, aucune cle d'API.

Ordre de fiabilite sur la profession reelle :
    RPPS (ANS) > Ameli (CNAM) > site officiel > OSM > recherche web > NAF

Ordre de fiabilite sur les coordonnees :
    site officiel > RPPS/Ameli > OSM > recherche web
"""
import io
import json
import os
import re
import subprocess
import time
import urllib.parse

from . import matching as M

RACINE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(RACINE, "cache")

API_SIRENE = "https://recherche-entreprises.api.gouv.fr/search"
API_GEO = "https://geo.api.gouv.fr"
API_OVERPASS = "https://overpass-api.de/api/interpreter"
API_TABULAIRE = "https://tabular-api.data.gouv.fr/api/resources"

# Annuaire sante Ameli (CNAM) : professionnels conventionnes, avec telephone.
RES_AMELI = "432983b9-2e6f-473a-b35a-20403c300a5f"
# Annuaire sante RPPS (ANS) : TOUS les professionnels enregistres, avec
# telephone ET email. Seule source qui couvre les osteopathes.
# Lien PERMANENT vers la ressource : data.gouv redirige toujours vers le
# fichier du jour. L'URL datee codee en dur (20260911-114338) renvoyait 404
# trois semaines plus tard, quand l'ANS avait publie de nouvelles extractions.
URL_RPPS = ("https://www.data.gouv.fr/fr/datasets/r/"
            "fffda7e9-0ea2-4c35-bba0-4496f3af935d")

# Le magasin de CA de Python est perime sur certains postes : on passe par curl.
def _curl(url, methode="GET", corps=None, timeout=90):
    # -L est indispensable : sans lui, un site qui redirige son apex vers
    # www rend un 301 au corps vide, et l'appelant croit la page introuvable.
    # rennesparcexpo.fr etait dans ce cas depuis le debut.
    cmd = ["curl", "-sSL", "--max-redirs", "5", "--compressed",
           "--max-time", str(timeout),
           "-A", "Mozilla/5.0 (compatible; prospect/1.0)"]
    if methode == "POST":
        cmd += ["-X", "POST", "--data-binary", corps or ""]
    cmd.append(url)
    r = subprocess.run(cmd, capture_output=True, timeout=timeout + 30)
    return r.stdout.decode("utf-8", errors="replace")


def _json(url, **kw):
    txt = _curl(url, **kw)
    try:
        return json.loads(txt)
    except ValueError:
        return {}


def _cache(nom):
    if not os.path.isdir(CACHE):
        os.makedirs(CACHE)
    return os.path.join(CACHE, nom)


# ------------------------------------------------------------ geographie

def communes_epci(code_epci):
    d = _json("%s/epcis/%s/communes?fields=nom,code,population,centre" % (API_GEO, code_epci))
    return d if isinstance(d, list) else []


def commune(code_insee):
    return _json("%s/communes/%s?fields=nom,code,centre,mairie,population"
                 % (API_GEO, code_insee))


def communes_autour(code_insee, rayon_km):
    """Communes dont le centre est dans le rayon. Sert a elargir une recherche."""
    ref = commune(code_insee)
    if not ref:
        return []
    lon0, lat0 = ref["centre"]["coordinates"]
    dep = code_insee[:2]
    toutes = _json("%s/departements/%s/communes?fields=nom,code,centre" % (API_GEO, dep))
    out = []
    for c in toutes if isinstance(toutes, list) else []:
        if not c.get("centre"):
            continue
        lon, lat = c["centre"]["coordinates"]
        d = M.distance_km(lat0, lon0, lat, lon)
        if d <= rayon_km:
            out.append({"code": c["code"], "nom": c["nom"], "distance_km": round(d, 2)})
    out.sort(key=lambda c: c["distance_km"])
    return out


# ---------------------------------------------------------------- SIRENE

# L'API plafonne a 64 pages de 25 : au-dela il faut decouper.
PLAFOND = 1500


def sirene(naf, codes_commune, pause=0.15):
    """Etablissements ACTIFS d'un code NAF sur une liste de communes.

    Deux pieges couverts ici :
      - etat_administratif=A filtre l'ENTREPRISE, pas l'etablissement : une
        societe active traine des etablissements fermes. On refiltre.
      - au-dela de ~1500 resultats la pagination est coupee : on decoupe
        commune par commune.
    """
    def _page(communes, page):
        params = {"activite_principale": naf, "code_commune": communes,
                  "etat_administratif": "A", "per_page": 25, "page": page}
        return _json(API_SIRENE + "?" + urllib.parse.urlencode(params))

    liste = ",".join(codes_commune)
    total = (_page(liste, 1) or {}).get("total_results", 0)
    lots = [liste] if total <= PLAFOND else list(codes_commune)

    vus, out = set(), []
    for lot in lots:
        premiere = _page(lot, 1)
        pages = min(premiere.get("total_pages") or 0, 64)
        resultats = list(premiere.get("results") or [])
        for p in range(2, pages + 1):
            time.sleep(pause)
            resultats += (_page(lot, p) or {}).get("results") or []

        for ent in resultats:
            for et in (ent.get("matching_etablissements") or []):
                siret = et.get("siret")
                if not siret or siret in vus:
                    continue
                if et.get("etat_administratif") != "A":
                    continue        # etablissement ferme d'une societe active
                if et.get("commune") not in codes_commune:
                    continue
                vus.add(siret)
                dirs = []
                for d in (ent.get("dirigeants") or [])[:3]:
                    if d.get("type_dirigeant") == "personne physique":
                        dirs.append(("%s %s" % (d.get("prenoms") or "",
                                                d.get("nom") or "")).strip())
                    elif d.get("denomination"):
                        dirs.append(d["denomination"])
                out.append({
                    "siret": siret,
                    "siren": ent.get("siren") or "",
                    "nom": ent.get("nom_complet") or ent.get("nom_raison_sociale") or "",
                    "enseigne": " ".join(et.get("liste_enseignes") or []),
                    "dirigeants": " ; ".join(dirs),
                    "naf": naf,
                    "adresse": et.get("adresse") or "",
                    "code_postal": et.get("code_postal") or "",
                    "commune": et.get("libelle_commune") or "",
                    "code_commune": et.get("commune") or "",
                    "latitude": _flottant(et.get("latitude")),
                    "longitude": _flottant(et.get("longitude")),
                    "date_creation": et.get("date_creation") or "",
                    "tranche_effectif": et.get("tranche_effectif_salarie") or "",
                    "categorie": ent.get("categorie_entreprise") or "",
                    "est_siege": 1 if et.get("est_siege") else 0,
                })
    return out


def _flottant(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ------------------------------------------------------- annuaires sante

def ameli(code_postal_ou_ville, par_ville=True, page_size=100):
    """Professionnels de sante CONVENTIONNES, avec telephone.

    Ne contient pas les osteopathes : ils ne sont pas conventionnes.
    """
    champ = "coordonnees_ville" if par_ville else "coordonnees_code_postal"
    out, page = [], 1
    while True:
        url = ("%s/%s/data/?%s__exact=%s&page_size=%d&page=%d"
               % (API_TABULAIRE, RES_AMELI, champ,
                  urllib.parse.quote(str(code_postal_ou_ville)), page_size, page))
        d = _json(url)
        lot = d.get("data") or []
        out += lot
        if len(lot) < page_size:
            break
        page += 1
    return out


def rpps_prefetch(codes_postaux, forcer=False):
    """Filtre le fichier RPPS national pour plusieurs codes postaux en UNE passe.

    Appeler rpps() code par code retelechargeait 780 Mo a chaque fois : sept
    codes postaux, cinq gigaoctets pour quelques centaines de lignes.
    """
    codes = [c for c in codes_postaux
             if forcer or not os.path.exists(_cache("rpps_%s.txt" % c))]
    if not codes:
        return {}
    motifs = {c: ("|%s|" % c).encode() for c in codes}
    fichiers = {c: io.open(_cache("rpps_%s.txt.part" % c), "wb") for c in codes}
    compte = {c: 0 for c in codes}
    proc = subprocess.Popen(
        ["curl", "-sSL", "--compressed", "--max-time", "1800", URL_RPPS],
        stdout=subprocess.PIPE)
    lignes = 0
    for ligne in proc.stdout:
        lignes += 1
        for c, m in motifs.items():
            if m in ligne:
                fichiers[c].write(ligne)
                compte[c] += 1
    proc.wait()
    for c, fh in fichiers.items():
        fh.close()
    # Un telechargement tronque laisse un fichier partiel qui passerait pour
    # un resultat : on ne valide le cache que si le flux a ete lu en entier.
    if proc.returncode != 0 or lignes < 100000:
        for c in codes:
            os.remove(_cache("rpps_%s.txt.part" % c))
        raise RuntimeError("RPPS : telechargement incomplet (%d lignes, code %s)"
                           % (lignes, proc.returncode))
    for c in codes:
        os.replace(_cache("rpps_%s.txt.part" % c), _cache("rpps_%s.txt" % c))
    return compte


def rpps(code_postal, forcer=False):
    """Professionnels de sante ENREGISTRES a l'ARS, avec telephone et email.

    Le fichier national fait 780 Mo : on le filtre en streaming sur le code
    postal et on garde le resultat en cache.
    """
    dest = _cache("rpps_%s.txt" % code_postal)
    if forcer or not os.path.exists(dest):
        # Filtrage en Python et pas via `| grep` : le shell Windows n'a pas
        # grep, et la commande echouait silencieusement en laissant un
        # fichier vide - donc zero praticien, sans erreur visible.
        motif = ("|%s|" % code_postal).encode()
        proc = subprocess.Popen(
            ["curl", "-sSL", "--compressed", "--max-time", "1800", URL_RPPS],
            stdout=subprocess.PIPE)
        with io.open(dest, "wb") as fh:
            for ligne in proc.stdout:
                if motif in ligne:
                    fh.write(ligne)
        proc.wait()

    COLS = {"nom": 7, "prenom": 8, "profession": 10, "num_voie": 28,
            "type_voie": 31, "lib_voie": 32, "cp": 35, "commune": 37,
            "tel": 40, "tel2": 41, "email": 43}
    out = []
    if not os.path.exists(dest):
        return out
    # Le fichier est en UTF-8. Le lire en cp1252 transforme "Osteopathe"
    # en "ostaopathe" et fait echouer toutes les comparaisons.
    for ligne in io.open(dest, encoding="utf-8", errors="replace").read().splitlines():
        ch = ligne.split("|")
        if len(ch) < 56 or ch[COLS["cp"]].strip() != str(code_postal):
            continue
        out.append({
            "nom": ("%s %s" % (ch[COLS["prenom"]].strip(),
                               ch[COLS["nom"]].strip())).strip(),
            "profession": ch[COLS["profession"]].strip(),
            "adresse": " ".join(x for x in (ch[COLS["num_voie"]].strip(),
                                            ch[COLS["type_voie"]].strip(),
                                            ch[COLS["lib_voie"]].strip()) if x),
            "code_postal": ch[COLS["cp"]].strip(),
            "commune": ch[COLS["commune"]].strip(),
            "telephone": M.tel_fr(ch[COLS["tel"]] or ch[COLS["tel2"]]),
            "email": ch[COLS["email"]].strip(),
        })
    return out


# ------------------------------------------------------------------- OSM

def osm(code_insee, forcer=False):
    """POI OpenStreetMap d'une commune ayant un contact.

    Couverture correcte sur les commerces avec vitrine, faible sur les
    professions exercees a domicile.
    """
    dest = _cache("osm_%s.json" % code_insee)
    if forcer or not os.path.exists(dest):
        # On n'ecrit le cache QUE si la reponse est du JSON exploitable.
        # Overpass a rendu une page d'erreur 406 le 24/09/2026 ; elle a ete
        # mise en cache telle quelle, et l'enrichissement a ensuite rendu
        # zero valeur sans rien signaler, pour les cinq communes. Un echec
        # doit rester un echec, pas devenir un resultat vide permanent.
        requete = ("""[out:json][timeout:90];
area["ref:INSEE"="%s"]->.a;
(
  nwr(area.a)["name"]["phone"];
  nwr(area.a)["name"]["contact:phone"];
  nwr(area.a)["name"]["email"];
  nwr(area.a)["name"]["contact:email"];
  nwr(area.a)["name"]["website"];
  nwr(area.a)["name"]["contact:website"];
);
out tags center;""" % code_insee)
        brut = _curl(API_OVERPASS, methode="POST", corps=requete, timeout=120)
        try:
            json.loads(brut)
        except ValueError:
            apercu = " ".join((brut or "").split())[:120]
            print("    OSM indisponible pour %s, rien mis en cache : %s"
                  % (code_insee, apercu or "reponse vide"))
            return []
        io.open(dest, "w", encoding="utf-8").write(brut)

    try:
        elements = json.load(io.open(dest, encoding="utf-8")).get("elements", [])
    except ValueError:
        # Cache ecrit par une version anterieure, avant ce garde-fou.
        os.remove(dest)
        print("    cache OSM illisible pour %s, supprime" % code_insee)
        return []
    out = []
    for e in elements:
        t = e.get("tags", {})
        out.append({
            "nom": t.get("name", ""),
            "adresse": " ".join(x for x in (t.get("addr:housenumber", ""),
                                            t.get("addr:street", "")) if x),
            "telephone": M.tel_fr(t.get("phone") or t.get("contact:phone")),
            "email": (t.get("email") or t.get("contact:email") or "").strip(),
            "site_web": (t.get("website") or t.get("contact:website") or "").strip(),
        })
    return out


# ------------------------------------------------------- site du prospect

CHEMINS_CONTACT = ["", "/contact", "/contact.html", "/contactez-nous",
                   "/nous-contacter", "/mentions-legales", "/a-propos"]


# Un lien qui promet un contact, par son adresse ou par son libelle.
LIEN_CONTACT = re.compile(
    r"contact|mentions|legal|nous-joindre|nous-ecrire|joindre|coordonnees|"
    r"a-propos|apropos|qui-sommes|equipe|impressum|devis", re.I)


def emails_du_site(url, maximum=8):
    """Cherche un email sur le site du prospect.

    On essaie les chemins habituels, puis - et c'est ce qui change tout - on
    SUIT les liens de la page d'accueil qui ressemblent a une page de contact.
    Les chemins devines ne couvrent pas la realite : tilloy-immo.fr cachait
    son adresse dans /catalog/mentions.php, que personne ne devine. C'est en
    suivant le lien depuis l'accueil qu'on l'avait trouvee a la main.
    """
    if not url:
        return [], ""
    base = url.rstrip("/")
    vues, accueil = set(), None

    def lire(page):
        if page in vues:
            return None, None
        vues.add(page)
        html = _curl(page, timeout=20)
        if not html:
            return None, None
        return M.emails_du_html(html, site=base), html

    for chemin in CHEMINS_CONTACT:
        trouves, html = lire(base + chemin)
        if trouves:
            return trouves, base + chemin
        if chemin == "" and html:
            accueil = html
    if not accueil:
        return [], ""

    pistes = []
    for href in re.findall(r"""href=["']([^"']+)["']""", accueil):
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        if not LIEN_CONTACT.search(href):
            continue
        if href.startswith("http"):
            # Un lien sortant mene chez un tiers : son adresse n'est pas la leur.
            if urllib.parse.urlparse(href).netloc not in base:
                continue
            pistes.append(href)
        else:
            pistes.append(base + "/" + href.lstrip("/"))

    for page in list(dict.fromkeys(pistes))[:maximum]:
        trouves, _ = lire(page)
        if trouves:
            return trouves, page
    return [], ""
