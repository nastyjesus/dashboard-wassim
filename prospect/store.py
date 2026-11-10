# -*- coding: utf-8 -*-
"""Base SQLite de prospection.

Principe central : AUCUNE valeur n'est ecrasee silencieusement.

Les coordonnees (telephone, email, site, metier verifie) ne sont pas des
colonnes mais des lignes de la table `valeur`, chacune avec sa source et son
niveau de confiance. La valeur retenue est celle de plus haute confiance ;
les autres restent visibles pour arbitrage.

Consequence pratique : on peut relancer un enrichissement autant de fois
qu'on veut, ajouter une source, corriger a la main - rien ne se perd.
"""
import os
import sqlite3
from datetime import datetime, timezone

RACINE = os.path.dirname(os.path.abspath(__file__))
BASE = os.path.join(RACINE, "prospection.db")

# Du plus fiable au moins fiable. Une valeur ne remplace une autre que si
# elle est STRICTEMENT plus fiable.
CONFIANCE = [
    "manuel",        # saisi ou valide par un humain : gagne toujours
    "registre",      # RPPS, Ameli, annuaire d'un ordre professionnel
    "officiel",      # SIRENE, API recherche-entreprises
    "site_officiel", # site web de l'entreprise elle-meme
    "annuaire",      # OSM, annuaire tiers
    "web",           # resultat de recherche web
    "deduit",        # deduit d'une regle (NAF -> metier)
    "incertain",     # a verifier avant usage
]

SCHEMA = """
CREATE TABLE IF NOT EXISTS etablissement (
    siret            TEXT PRIMARY KEY,
    siren            TEXT,
    nom              TEXT,
    enseigne         TEXT,
    dirigeants       TEXT,
    naf              TEXT,
    libelle_naf      TEXT,
    metier           TEXT,          -- cle du referentiel
    adresse          TEXT,
    code_postal      TEXT,
    commune          TEXT,
    code_commune     TEXT,
    latitude         REAL,
    longitude        REAL,
    date_creation    TEXT,
    tranche_effectif TEXT,
    categorie        TEXT,
    est_siege        INTEGER,
    extrait_le       TEXT
);

CREATE TABLE IF NOT EXISTS valeur (
    siret     TEXT NOT NULL,
    champ     TEXT NOT NULL,        -- telephone | email | site_web | metier_reel
    valeur    TEXT NOT NULL,
    source    TEXT NOT NULL,        -- d'ou elle vient, en clair
    confiance TEXT NOT NULL,
    note      TEXT,                 -- reserve d'usage : alerte, doute
    vu_le     TEXT NOT NULL,
    PRIMARY KEY (siret, champ, valeur)
);

-- Un etablissement peut etre candidat a PLUSIEURS metiers : osteopathe et
-- kinesitherapeute partagent le NAF 86.90E, et beaucoup de praticiens ont
-- reellement les deux competences. Sans cette table, le second metier extrait
-- ecrasait le premier et on perdait 63 fiches sur 95.
CREATE TABLE IF NOT EXISTS candidature (
    siret  TEXT NOT NULL,
    metier TEXT NOT NULL,
    PRIMARY KEY (siret, metier)
);

CREATE TABLE IF NOT EXISTS exclusion (
    siret     TEXT PRIMARY KEY,
    motif     TEXT NOT NULL,
    source    TEXT,
    decide_le TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_etab_metier  ON etablissement(metier);
CREATE INDEX IF NOT EXISTS idx_etab_commune ON etablissement(code_commune);
CREATE INDEX IF NOT EXISTS idx_valeur_champ ON valeur(siret, champ);
"""


def maintenant():
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def rang(confiance):
    return CONFIANCE.index(confiance) if confiance in CONFIANCE else len(CONFIANCE)


class Store(object):
    def __init__(self, chemin=BASE):
        # Plusieurs traitements tournent en parallele (extraction, recherche
        # de domaines, scraping). Sans WAL ni attente, le second ecrivain
        # echouait aussitot en "database is locked" : le premier gardait le
        # verrou jusqu'a sa validation finale, apres des dizaines de minutes.
        self.cx = sqlite3.connect(chemin, timeout=120)
        self.cx.execute("PRAGMA journal_mode=WAL")
        self.cx.row_factory = sqlite3.Row
        self._ecritures = 0
        self.cx.executescript(SCHEMA)
        self.cx.commit()

    def fermer(self):
        self.cx.close()

    # --- ecriture ------------------------------------------------------

    def poser_etablissement(self, e):
        """Insere ou met a jour les faits SIRENE (ils font foi, ils ecrasent)."""
        champs = ["siret", "siren", "nom", "enseigne", "dirigeants", "naf",
                  "libelle_naf", "metier", "adresse", "code_postal", "commune",
                  "code_commune", "latitude", "longitude", "date_creation",
                  "tranche_effectif", "categorie", "est_siege", "extrait_le"]
        e = dict(e)
        e["extrait_le"] = maintenant()
        self.cx.execute(
            "INSERT OR REPLACE INTO etablissement (%s) VALUES (%s)"
            % (",".join(champs), ",".join("?" * len(champs))),
            [e.get(c) for c in champs])

    def poser_candidature(self, siret, metier):
        self.cx.execute("INSERT OR IGNORE INTO candidature (siret,metier) VALUES (?,?)",
                        (siret, metier))
        self._peut_etre_valider()

    def poser_valeur(self, siret, champ, valeur, source, confiance, note=None):
        """Enregistre une valeur candidate. N'ecrase jamais : elle s'ajoute."""
        if not valeur or not str(valeur).strip():
            return False
        if confiance not in CONFIANCE:
            raise ValueError("confiance inconnue : %s" % confiance)
        self.cx.execute(
            "INSERT OR REPLACE INTO valeur (siret,champ,valeur,source,confiance,note,vu_le)"
            " VALUES (?,?,?,?,?,?,?)",
            (siret, champ, str(valeur).strip(), source, confiance, note, maintenant()))
        self._peut_etre_valider()
        return True

    def exclure(self, siret, motif, source=None):
        self.cx.execute(
            "INSERT OR REPLACE INTO exclusion (siret,motif,source,decide_le) VALUES (?,?,?,?)",
            (siret, motif, source, maintenant()))

    def repecher(self, siret):
        """Annule une mise a l'ecart decidee par une regle.

        Le jugement humain prime sur la regle : c'est ainsi que PIL CREATION,
        vrai cuisiniste immatricule au nom de son gerant, revient dans la
        liste dont le filtre par mot-cle l'avait sorti.
        """
        cur = self.cx.execute("DELETE FROM exclusion WHERE siret=?", (siret,))
        return cur.rowcount

    def valider(self):
        self.cx.commit()
        self._ecritures = 0

    def _peut_etre_valider(self):
        """Valide au plus toutes les 2 secondes pour ne pas garder le verrou.

        Un seuil en NOMBRE d'ecritures ne suffisait pas : la recherche de
        domaines met plusieurs secondes par fiche (DNS, lecture de page), et
        cinquante ecritures gardaient le verrou plusieurs minutes. Le rejeu
        des apports, lance en parallele, echouait en "database is locked"
        apres 120 secondes d'attente.
        """
        import time
        self._ecritures += 1
        maintenant_s = time.time()
        if self._ecritures >= 50 or maintenant_s - getattr(self, "_depuis", 0) > 2:
            self.valider()
            self._depuis = maintenant_s

    # --- lecture -------------------------------------------------------

    def meilleure(self, siret, champ):
        """Valeur retenue pour un champ : la plus fiable, puis la plus recente."""
        lignes = self.cx.execute(
            "SELECT valeur, source, confiance, note FROM valeur"
            " WHERE siret=? AND champ=? ORDER BY vu_le DESC", (siret, champ)).fetchall()
        if not lignes:
            return None
        return sorted(lignes, key=lambda r: rang(r["confiance"]))[0]

    def concurrentes(self, siret, champ):
        """Toutes les valeurs connues pour un champ : sert a l'arbitrage."""
        return self.cx.execute(
            "SELECT valeur, source, confiance, note FROM valeur"
            " WHERE siret=? AND champ=?", (siret, champ)).fetchall()

    def fiches(self, metier=None, commune=None, sans=None, avec_exclusions=False):
        """Fiches enrichies de leurs meilleures valeurs.

        sans : nom de champ ('telephone', 'email') pour ne garder que les
               fiches ou ce champ est vide - c'est la file d'attente
               d'enrichissement.
        """
        sql = "SELECT * FROM etablissement WHERE 1=1"
        args = []
        if metier:
            sql += (" AND siret IN (SELECT siret FROM candidature WHERE metier IN (%s))"
                    % ",".join("?" * len(metier)))
            args += list(metier)
        if commune:
            sql += " AND code_commune IN (%s)" % ",".join("?" * len(commune))
            args += list(commune)
        if not avec_exclusions:
            sql += " AND siret NOT IN (SELECT siret FROM exclusion)"

        out = []
        for ligne in self.cx.execute(sql, args).fetchall():
            f = dict(ligne)
            f["metiers"] = [r["metier"] for r in self.cx.execute(
                "SELECT metier FROM candidature WHERE siret=? ORDER BY metier",
                (f["siret"],)).fetchall()] or ([f["metier"]] if f["metier"] else [])
            for champ in ("telephone", "email", "site_web", "metier_reel"):
                m = self.meilleure(f["siret"], champ)
                f[champ] = m["valeur"] if m else ""
                f[champ + "_source"] = ("%s (%s)" % (m["source"], m["confiance"])) if m else ""
                f[champ + "_confiance"] = m["confiance"] if m else ""
                f[champ + "_note"] = (m["note"] or "") if m else ""
            if sans and f.get(sans):
                continue
            out.append(f)
        return out

    def ecartes(self, motif=None, metier=None):
        """Fiches sorties des resultats, avec le motif de leur mise a l'ecart.

        Une exclusion est un jugement, pas une verite : `mot-cle absent` en
        particulier repose sur le nom commercial, qui ment souvent. Cette
        lecture existe pour que ces jugements restent relisables.
        """
        sql = ("SELECT e.*, x.motif, x.source AS motif_source, x.decide_le"
               " FROM exclusion x JOIN etablissement e ON e.siret = x.siret"
               " WHERE 1=1")
        args = []
        if motif:
            sql += " AND x.motif LIKE ?"
            args.append("%" + motif + "%")
        if metier:
            sql += (" AND e.siret IN (SELECT siret FROM candidature WHERE metier IN (%s))"
                    % ",".join("?" * len(metier)))
            args += list(metier)
        sql += " ORDER BY e.commune, e.nom"
        return [dict(r) for r in self.cx.execute(sql, args)]

    def compter(self):
        c = self.cx.execute("SELECT COUNT(*) n FROM etablissement").fetchone()["n"]
        x = self.cx.execute("SELECT COUNT(*) n FROM exclusion").fetchone()["n"]
        v = self.cx.execute("SELECT COUNT(*) n FROM valeur").fetchone()["n"]
        return {"etablissements": c, "exclusions": x, "valeurs": v}
