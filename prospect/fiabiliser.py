# -*- coding: utf-8 -*-
"""Fiabilise les emails avant un mailing.

Un email faux coute plus qu'un email absent : il fait rebondir l'envoi et
degrade la reputation du domaine expediteur. Chaque adresse passe donc par
des controles qui ne devinent rien et ne contactent personne :

1. Syntaxe, et adresses techniques ou factices (exemple@, noreply, sentry...).
2. Le domaine recoit-il du courrier ? Enregistrement MX, a defaut A (RFC 5321).
   Un domaine sans l'un ni l'autre fait rebondir a coup sur.
3. L'etablissement est-il toujours actif ? Etat administratif SIRENE du jour.
4. L'adresse est-elle partagee par plusieurs entreprises ? Si oui, on ne sait
   pas a qui elle appartient : elle sort du mailing.
5. Le domaine de l'email a-t-il un rapport avec l'entreprise (nom, enseigne,
   site) ? Les webmails (gmail, orange...) sont admis : beaucoup d'artisans
   n'ont que ca.

Aucune verification SMTP (RCPT TO) : sonder un serveur sans envoyer ressemble
a du spam et fait blacklister l'IP ; et beaucoup de serveurs acceptent tout.

Sortie : une colonne `statut_mailing` dans chaque CSV de section, et
data/prospection/mailing.csv, une ligne par email retenu, sans doublon.

    python -m prospect.fiabiliser
"""
import csv
import io
import json
import os
import re
import time
import unicodedata
import urllib.request

import dns.resolver

RACINE = os.path.dirname(os.path.abspath(__file__))
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")
CACHE_MX = os.path.join(RACINE, "cache", "mx.json")
CACHE_ETAT = os.path.join(RACINE, "cache", "etat_sirene.json")

SECTIONS = ["bruz_entreprises_actuelles.csv", "bruz_lot2.csv", "zone_sud.csv",
            "bruz_lot4.csv", "demandes_membres.csv", "vague5.csv", "vague6.csv", "vague6b.csv"]

SYNTAXE = re.compile(r"^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
                     r"(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$")
FACTICE = re.compile(r"exemple|example|votre[._-]?(nom|email|adresse)|nom@|prenom|"
                     r"no-?reply|ne-?pas-?repondre|sentry|wixpress|wordpress@|"
                     r"jean\.dupont|john\.doe|test@|@test\.|^you@|@company\.com$|@yourdomain|@votredomaine|\.(png|jpe?g|gif|webp|svg)$|"
                     r"@(sentry|wix|domain|email|mail)\.(com|fr|io)$|u00|%20|"
                     # Hebergeurs et createurs de sites : leur adresse figure
                     # dans les mentions legales du client, ce n'est pas la sienne.
                     r"@(ovh|ovhcloud|webador|ionos|o2switch|hostinger|jimdo|gandi|lws|"
                     r"planethoster|infomaniak|squarespace|shopify|wordpress|webflow|"
                     r"sitew|simplebo|e-monsite|solocal|pagesjaunes)\.|@local\.fr$|"
                     r"^(support|abuse|dpo|rgpd|privacy|webmaster|hostmaster|postmaster)@")
WEBMAILS = {"gmail.com", "orange.fr", "wanadoo.fr", "hotmail.fr", "hotmail.com",
            "yahoo.fr", "yahoo.com", "free.fr", "sfr.fr", "laposte.net", "outlook.fr",
            "outlook.com", "live.fr", "icloud.com", "neuf.fr", "bbox.fr", "aliceadsl.fr",
            "gmx.fr", "msn.com", "me.com", "protonmail.com", "proton.me", "numericable.fr"}
# Domaines de reseaux ou d'ordres professionnels : l'adresse est nominative
# chez eux, le domaine ne porte jamais le nom de l'entreprise.
DOMAINES_RESEAU = re.compile(r"(^|\.)notaires\.fr$|(^|\.)avocat(s)?[-.]|orpi\.com|"
                             r"century21|laforet\.com|guyhoquet|stephaneplazaimmobilier|"
                             r"nestenn|iadfrance|safti|capifrance|axa\.fr|allianz|"
                             r"agents\.|mma\.fr|groupama|gan\.fr|generali|"
                             r"credit-?agricole|ca-|cic\.fr|ag2r|swisslife|thelem")
VIDES = {"", "et", "de", "la", "le", "les", "des", "du", "sarl", "sas", "sasu", "eurl",
         "sci", "selarl", "scp", "ei", "eirl", "sa", "snc", "societe", "entreprise",
         "cabinet", "groupe", "france", "bretagne", "rennes", "bruz", "agence", "and"}


def _plat(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def _charger(p, defaut):
    try:
        return json.load(io.open(p, encoding="utf-8"))
    except (IOError, ValueError):
        return defaut


def _sauver(p, d):
    io.open(p, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))


class Controles(object):
    def __init__(self):
        self.mx = _charger(CACHE_MX, {})
        self.etat = _charger(CACHE_ETAT, {})
        self.res = dns.resolver.Resolver()
        self.res.lifetime = 8

    def recoit(self, domaine):
        """'mx', 'a' (repli RFC 5321), ou '' si le domaine ne recoit rien."""
        if domaine in self.mx:
            return self.mx[domaine]
        verdict = ""
        for qt, nom in (("MX", "mx"), ("A", "a")):
            try:
                if self.res.resolve(domaine, qt):
                    verdict = nom
                    break
            except dns.resolver.NXDOMAIN:
                break                      # le domaine n'existe pas du tout
            except (dns.resolver.NoAnswer, dns.resolver.NoNameservers):
                continue
            except Exception:
                verdict = "?"              # panne reseau : ne pas conclure
                break
        if verdict != "?":
            self.mx[domaine] = verdict
        return verdict

    def actif(self, siret):
        """'A' actif, 'F' ferme, '' inconnu. Cache : une requete par SIRET."""
        if not siret or not re.match(r"^\d{14}$", siret):
            return ""
        if siret in self.etat:
            return self.etat[siret]
        url = "https://recherche-entreprises.api.gouv.fr/search?q=%s" % siret
        for essai in range(4):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
                d = json.load(urllib.request.urlopen(req, timeout=30))
                etat = ""
                for r in d.get("results", []):
                    for e in r.get("matching_etablissements", []) or []:
                        if e.get("siret") == siret:
                            etat = e.get("etat_administratif") or ""
                    if not etat and (r.get("siege") or {}).get("siret") == siret:
                        etat = r["siege"].get("etat_administratif") or ""
                self.etat[siret] = etat
                time.sleep(0.15)           # l'API tolere 7 requetes/s
                return etat
            except Exception:
                time.sleep(2 * (essai + 1))
        return ""

    def sauver(self):
        _sauver(CACHE_MX, self.mx)
        _sauver(CACHE_ETAT, self.etat)


def _lien_entreprise(domaine, ligne):
    """Le domaine de l'email parle-t-il de l'entreprise ?"""
    label = _plat(domaine.split(".")[0] if domaine.count(".") == 1
                  else ".".join(domaine.split(".")[:-1]))
    site = _plat(re.sub(r"^https?://(www\.)?", "", ligne.get("site_web") or "").split("/")[0])
    if site and (site == _plat(domaine) or site.endswith("." + _plat(domaine))
                 or _plat(domaine).endswith(site)):
        return True
    mots = [m for m in re.split(r"[^a-z0-9]+", _plat("%s %s %s" % (
        ligne.get("nom"), ligne.get("enseigne"), ligne.get("dirigeants")))) if len(m) >= 3
        and m not in VIDES]
    compact = re.sub(r"[^a-z0-9]", "", label)
    return any(m in compact for m in mots) or any(
        len(p) >= 4 and p in _plat("%s %s" % (ligne.get("nom"), ligne.get("enseigne"))).replace(" ", "")
        for p in re.split(r"[^a-z0-9]+", label))


def _rue(adresse):
    a = _plat(adresse)
    m = re.search(r"(\d+)\s*[a-z]?\s+(?:rue|avenue|av|bd|boulevard|place|allee|chemin|route|"
                  r"impasse|square|mail|quai|za|zac|zone)?\s*(?:de la |du |des |de l |de |d )?([a-z]+)", a)
    return (m.group(1), m.group(2)) if m else a[:25]


def _meme_structure(email, lignes):
    """Plusieurs SIREN pour une meme boite aux lettres : groupe ou cabinet ?"""
    if len({_rue(l.get("adresse")) for l in lignes}) == 1:
        return True
    dirigeants = [set(m for m in re.split(r"[^a-z]+", _plat(l.get("dirigeants")))
                      if len(m) >= 4 and m not in VIDES) for l in lignes]
    if dirigeants and all(dirigeants) and set.intersection(*dirigeants):
        return True
    dom = email.split("@", 1)[1]
    if dom not in WEBMAILS and not DOMAINES_RESEAU.search(dom):
        return all(_lien_entreprise(dom, l) for l in lignes)
    return False


# Decisions humaines ou de contexte que la regle ne peut pas deviner
# (membre du chapitre, mandataire qui n'est pas agent general...).
STATUT_FORCE = _charger(os.path.join(RACINE, "cache", "statut_force.json"), {})
# Vague 2 (07/10/2026) : la mission classe les webmails en A VERIFIER.
# Decision de Wassim : cette regle vaut pour les nouvelles fiches seulement.
VAGUE2 = set(_charger(os.path.join(RACINE, "cache", "vague2_emails.json"), []))
# Vague 5 (22/10/2026), regle 3 de la mission : OK seulement pour un email du
# domaine de l'entreprise ou d'une source fiable ; un webmail est A VERIFIER.
VAGUE2 |= set(_charger(os.path.join(RACINE, "cache", "vague5_emails.json"), []))
VAGUE2 |= set(_charger(os.path.join(RACINE, "cache", "vague6_emails.json"), []))
VAGUE2 |= set(_charger(os.path.join(RACINE, "cache", "vague6b_emails.json"), []))


def statut(email, ligne, ctl, partages):
    """(statut, raison). Statuts : OK, A VERIFIER, EXCLURE."""
    e = (email or "").strip().lower()
    if not e:
        return "", ""
    if e in STATUT_FORCE:
        return tuple(STATUT_FORCE[e])
    if not SYNTAXE.match(e):
        return "EXCLURE", "syntaxe invalide"
    if FACTICE.search(e):
        return "EXCLURE", "adresse technique ou factice"
    dom = e.split("@", 1)[1]
    r = ctl.recoit(dom)
    if r == "":
        return "EXCLURE", "le domaine %s ne recoit pas de courrier (ni MX ni A)" % dom
    etat = ctl.actif(ligne.get("siret"))
    if etat == "F":
        return "EXCLURE", "etablissement ferme (SIRENE)"
    if e in partages:
        sirens, proprio = partages[e]
        siren = (ligne.get("siret") or ligne.get("nom"))[:9]
        if proprio and proprio[0] != siren:
            return "EXCLURE", "adresse de %s, attribuee ici par erreur" % proprio[1]
        if not proprio:
            return "A VERIFIER", "adresse partagee par %d entreprises" % len(sirens)
    if r == "a":
        return "A VERIFIER", "domaine sans MX : accepte le courrier par repli, rebond possible"
    if r == "?":
        return "A VERIFIER", "DNS injoignable pendant le controle"
    if dom in WEBMAILS and e in VAGUE2:
        return "A VERIFIER", "webmail : OK reserve aux adresses du domaine de l'entreprise (vagues 2, 5 et 6)"
    if dom in WEBMAILS or DOMAINES_RESEAU.search(dom):
        return "OK", "webmail ou domaine de reseau"
    if _lien_entreprise(dom, ligne):
        return "OK", "domaine de l'entreprise"
    return "A VERIFIER", "domaine %s sans lien visible avec le nom ou le site" % dom


def main():
    ctl = Controles()
    sections = {}
    for f in SECTIONS:
        p = os.path.join(DONNEES, f)
        if os.path.exists(p):
            with io.open(p, encoding="utf-8-sig") as fh:
                rd = csv.DictReader(fh, delimiter=";")
                sections[f] = (rd.fieldnames, list(rd))

    # Une adresse est partagee si elle apparait sur des SIREN differents.
    # Sauf si ces SIREN sont une meme structure : meme adresse postale (groupe,
    # holding et societe d'exploitation, cabinet de kines), ou meme dirigeant.
    groupes = {}
    for _, (_, lignes) in sections.items():
        for l in lignes:
            e = (l.get("email") or "").strip().lower()
            if e:
                groupes.setdefault(e, {})[(l.get("siret") or l.get("nom"))[:9]] = l
    partages = {}
    for e, membres in groupes.items():
        if len(membres) > 1 and not _meme_structure(e, list(membres.values())):
            # Si une seule entreprise porte le nom du domaine, l'adresse est
            # la sienne : les autres l'ont recue par erreur d'attribution.
            dom = e.split("@", 1)[1]
            proprio = None
            if dom not in WEBMAILS and not DOMAINES_RESEAU.search(dom):
                ok = [s for s, l in membres.items() if _lien_entreprise(dom, l)]
                if len(ok) == 1:
                    proprio = (ok[0], membres[ok[0]].get("nom"))
            partages[e] = (set(membres), proprio)

    mailing, vus, bilan = [], {}, {}
    n = 0
    for f, (cols, lignes) in sections.items():
        for l in lignes:
            s, raison = statut(l.get("email"), l, ctl, partages)
            l["statut_mailing"] = s
            l["raison_mailing"] = raison
            bilan[s] = bilan.get(s, 0) + 1
            n += 1
            if n % 200 == 0:
                ctl.sauver()
                print("  %d lignes controlees" % n, flush=True)
            e = (l.get("email") or "").strip().lower()
            if s == "OK":
                if e in vus:
                    m = vus[e]
                    if l["metier"] not in m["metiers"]:
                        m["metiers"].append(l["metier"])
                    continue
                vus[e] = {"email": e, "nom": l.get("nom"), "enseigne": l.get("enseigne"),
                          "dirigeants": l.get("dirigeants"), "commune": l.get("commune"),
                          "telephone": l.get("telephone"), "site_web": l.get("site_web"),
                          "metiers": [l.get("metier")], "section": f.replace(".csv", ""),
                          "verif_metier": l.get("verif_metier"),
                          "source_email": l.get("email_source"), "siret": l.get("siret")}
                mailing.append(vus[e])
        cols2 = list(cols) + [c for c in ("statut_mailing", "raison_mailing") if c not in cols]
        with io.open(os.path.join(DONNEES, f), "w", encoding="utf-8-sig", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=cols2, delimiter=";", extrasaction="ignore")
            w.writeheader()
            w.writerows(lignes)
    ctl.sauver()

    def priorite(m):
        v = (m.get("verif_metier") or "").upper()
        if v.startswith("CONFIRME"):
            return "1 - metier confirme"
        if "VERIFIER" in v or "RECLASSER" in v or "ALERTE" in v:
            return "3 - metier a verifier"
        return "2 - metier au seul code NAF"
    for m in mailing:
        m["priorite"] = priorite(m)
    cols_m = ["priorite", "email", "nom", "enseigne", "dirigeants", "metiers", "commune", "telephone",
              "site_web", "verif_metier", "section", "source_email", "siret"]
    with io.open(os.path.join(DONNEES, "mailing.csv"), "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=cols_m, delimiter=";", extrasaction="ignore")
        w.writeheader()
        for m in sorted(mailing, key=lambda x: (x["priorite"], x["metiers"][0] or "", x["nom"] or "")):
            w.writerow(dict(m, metiers=", ".join(x for x in m["metiers"] if x)))
    print("lignes : %d" % n)
    for k in ("OK", "A VERIFIER", "EXCLURE", ""):
        print("  %-11s %d" % (k or "sans email", bilan.get(k, 0)))
    print("mailing.csv : %d adresses uniques retenues" % len(mailing))


if __name__ == "__main__":
    main()
