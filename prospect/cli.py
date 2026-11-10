# -*- coding: utf-8 -*-
"""Ligne de commande.

    python -m prospect metiers
    python -m prospect communes --autour 35047 --rayon 10
    python -m prospect extract  --metier osteopathe,graphiste --commune 35047
    python -m prospect enrich   --source rpps,ameli,osm,site --cp 35170 --ville BRUZ
    python -m prospect qualify  --top 5 --depuis 35047
    python -m prospect arbitrer --metier cuisiniste
    python -m prospect export   --vers prospects.csv
    python -m prospect etat
"""
import argparse
import sys

from . import pipeline as P
from . import sources as S
from .store import Store


def _liste(txt):
    return [x.strip() for x in (txt or "").split(",") if x.strip()]


def main(argv=None):
    p = argparse.ArgumentParser(prog="prospect", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd")

    sub.add_parser("metiers", help="liste les metiers du referentiel")
    sub.add_parser("etat", help="compte ce que contient la base")

    c = sub.add_parser("communes", help="resout un perimetre geographique")
    c.add_argument("--autour", help="code INSEE de la commune centre")
    c.add_argument("--rayon", type=float, default=0, help="rayon en km")
    c.add_argument("--epci", help="code EPCI (intercommunalite)")

    e = sub.add_parser("extract", help="remplit la base depuis SIRENE")
    e.add_argument("--metier", required=True, help="cles separees par des virgules")
    e.add_argument("--commune", help="codes INSEE separes par des virgules")
    e.add_argument("--autour", help="code INSEE centre, a combiner avec --rayon")
    e.add_argument("--rayon", type=float, default=0)
    e.add_argument("--epci")
    e.add_argument("--anciennete-min", type=float, default=None,
                   help="annees minimum depuis la creation")
    e.add_argument("--avec-salaries", action="store_true",
                   help="ne garder que les employeurs")

    n = sub.add_parser("enrich", help="remplit telephone, email, site")
    n.add_argument("--source", default="rpps,ameli,osm,site")
    n.add_argument("--cp", help="code postal, pour RPPS")
    n.add_argument("--ville", help="libelle commune en majuscules, pour Ameli")
    n.add_argument("--insee", help="code INSEE, pour OSM")
    n.add_argument("--max", type=int, default=None, help="plafond de fiches par source")

    q = sub.add_parser("qualify", help="note et classe les prospects")
    q.add_argument("--top", type=int, default=5, help="fiches par metier")
    q.add_argument("--depuis", help="code INSEE servant de point de reference")

    k = sub.add_parser("manque", help="ce qu'il reste a chercher, par priorite")
    k.add_argument("--champ", default="email", help="telephone ou email")
    k.add_argument("--top", type=int, default=5, help="fiches par metier")
    k.add_argument("--depuis", help="code INSEE de reference pour la distance")

    b = sub.add_parser("arbitrer", help="fiches ecartees par une regle, a relire")
    b.add_argument("--metier", default=None)
    b.add_argument("--motif", default="mot-cle",
                   help="filtre sur le motif ; vide pour tout voir")

    v = sub.add_parser("veille", help="nouvelles entreprises d'une commune (BODACC)")
    v.add_argument("--ville", required=True, help="libelle de la commune, ex: Bruz")
    v.add_argument("--depuis", default=None, help="date AAAA-MM-JJ")
    v.add_argument("--familles", default="creation,immatriculation",
                   help="creation,immatriculation,vente,radiation,collective")
    v.add_argument("--metier", default=None,
                   help="filtre sur les metiers du referentiel (defaut : tous ceux "
                        "qui ont des mots_activite)")
    v.add_argument("--vers", default=None, help="ecrire le resultat dans un CSV")

    x = sub.add_parser("export", help="ecrit un CSV")
    x.add_argument("--vers", required=True)
    x.add_argument("--metier", default=None)

    a = p.parse_args(argv)
    if not a.cmd:
        p.print_help()
        return 0

    if a.cmd == "metiers":
        for m in P.metiers_connus():
            r = P.REFERENTIEL[m]
            drapeau = " [mot-cle obligatoire]" if r.get("mot_cle_obligatoire") else ""
            autorite = " [autorite: %s]" % r["autorite"] if r.get("autorite") else ""
            print("  %-26s %s%s%s" % (m, ",".join(r["naf"]), drapeau, autorite))
            if r.get("note"):
                print("      %s" % r["note"])
        return 0

    if a.cmd == "communes":
        if a.epci:
            liste = [{"code": c["code"], "nom": c["nom"]} for c in S.communes_epci(a.epci)]
        elif a.autour:
            liste = S.communes_autour(a.autour, a.rayon)
        else:
            print("precisez --epci ou --autour")
            return 2
        print("%d communes" % len(liste))
        print(",".join(c["code"] for c in liste))
        for c in liste:
            d = c.get("distance_km")
            print("  %-8s %-32s %s" % (c["code"], c["nom"],
                                       ("%.1f km" % d) if d is not None else ""))
        return 0

    store = Store()

    if a.cmd == "etat":
        for k, v in sorted(store.compter().items()):
            print("  %-16s %d" % (k, v))
        fiches = store.fiches()
        par = {}
        for f in fiches:
            for metier in (f.get("metiers") or [f["metier"]]):
                m = par.setdefault(metier, [0, 0, 0])
                m[0] += 1
                m[1] += bool(f["telephone"])
                m[2] += bool(f["email"])
        print()
        print("  %-26s %6s %6s %6s" % ("metier", "fiches", "tel", "email"))
        for m, (t, tel, mail) in sorted(par.items()):
            print("  %-26s %6d %6d %6d" % (m, t, tel, mail))
        return 0

    if a.cmd == "extract":
        codes = _resoudre_communes(a)
        if not codes:
            print("aucune commune : utilisez --commune, --autour/--rayon ou --epci")
            return 2
        print("%d communes, %d metiers" % (len(codes), len(_liste(a.metier))))
        bilan = P.extraire(store, _liste(a.metier), codes,
                           anciennete_min=a.anciennete_min,
                           avec_salaries=a.avec_salaries)
        print("\n%(gardes)d etablissements retenus sur %(vus)d vus" % bilan)
        return 0

    if a.cmd == "enrich":
        P.enrichir(store, _liste(a.source), code_postal=a.cp,
                   code_insee=a.insee, ville=a.ville, maximum=a.max)
        return 0

    if a.cmd == "qualify":
        lat = lon = None
        if a.depuis:
            ref = S.commune(a.depuis)
            pt = (ref.get("mairie") or ref.get("centre") or {}).get("coordinates")
            if pt:
                lon, lat = pt
        res = P.qualifier(store, par_metier=a.top, ref_lat=lat, ref_lon=lon)
        for metier, d in sorted(res.items()):
            print("### %s  (%d fiches, %d coherentes)"
                  % (metier, d["total"], d["coherentes"]))
            for f in d["top"]:
                print("   %.1f/4  %-34s %-16s %s"
                      % (f["note"], f["nom"][:34], f["telephone"] or "-", f["detail"]))
        return 0

    if a.cmd == "manque":
        lat = lon = None
        if a.depuis:
            ref = S.commune(a.depuis)
            pt = (ref.get("mairie") or ref.get("centre") or {}).get("coordinates")
            if pt:
                lon, lat = pt
        res = P.qualifier(store, par_metier=999, ref_lat=lat, ref_lon=lon)
        total = 0
        for metier, d in sorted(res.items()):
            manquants = [f for f in d["top"] if not f.get(a.champ)][:a.top]
            if not manquants:
                continue
            print("### %s" % metier)
            for f in manquants:
                total += 1
                print("   %.1f/4 | %-34s | %-28s | %s"
                      % (f["note"], f["nom"][:34], f["adresse"][:28],
                         f.get("site_web") or "-"))
        print("\n%d fiches sans %s, a chercher a la main" % (total, a.champ))
        return 0

    if a.cmd == "arbitrer":
        lignes = store.ecartes(motif=a.motif or None, metier=_liste(a.metier) or None)
        if not lignes:
            print("rien a arbitrer")
            return 0
        print("%d fiches ecartees, a confirmer ou a repecher\n" % len(lignes))
        for f in lignes:
            print("  %-46s %-30s %s" % (f["nom"][:46], f["adresse"][:30],
                                        f.get("date_creation") or ""))
            print("      %s" % f["motif"])
        print("\nPour en repecher une : ajoutez-la a prospect/apports.json avec")
        print('"repecher": true et une source, puis relancez `enrich --source apports`.')
        return 0

    if a.cmd == "veille":
        import csv
        import io as _io
        from . import bodacc as B

        familles = set(_liste(a.familles))
        brutes = B.annonces_commune(a.ville, familles=familles, depuis=a.depuis)
        retenues = B.filtrer_metiers(brutes, P.REFERENTIEL, _liste(a.metier) or None)

        connus = {f["siren"] for f in store.fiches(avec_exclusions=True) if f["siren"]}
        for d in retenues:
            d["deja_en_base"] = "oui" if d["siren"] in connus else "non"

        periode = (" depuis le %s" % a.depuis) if a.depuis else ""
        print("%d annonces a %s%s, %d sur tes metiers"
              % (len(brutes), a.ville, periode, len(retenues)))
        par = {}
        for d in retenues:
            par[d["metiers"]] = par.get(d["metiers"], 0) + 1
        for m, n in sorted(par.items(), key=lambda x: -x[1]):
            print("   %-28s %d" % (m, n))
        print("")
        for d in retenues[:40]:
            print("  %s | %-30s | %-20s | %s"
                  % (d["date"], d["nom"][:30], d["metiers"][:20],
                     "deja en base" if d["deja_en_base"] == "oui" else d["activite"][:44]))

        if a.vers:
            cols = ["date", "metiers", "nom", "forme", "dirigeant", "activite",
                    "adresse", "siren", "deja_en_base", "famille", "url"]
            with _io.open(a.vers, "w", newline="", encoding="utf-8-sig") as fh:
                w = csv.DictWriter(fh, fieldnames=cols, delimiter=";",
                                   extrasaction="ignore")
                w.writeheader()
                w.writerows(retenues)
            print("\n%d lignes -> %s" % (len(retenues), a.vers))
        return 0

    if a.cmd == "export":
        n = P.exporter_csv(store, a.vers, metier=_liste(a.metier) or None)
        print("%d fiches -> %s" % (n, a.vers))
        return 0

    return 0


def _resoudre_communes(a):
    if a.commune:
        return _liste(a.commune)
    if a.epci:
        return [c["code"] for c in S.communes_epci(a.epci)]
    if a.autour:
        return [c["code"] for c in S.communes_autour(a.autour, a.rayon)]
    return []


if __name__ == "__main__":
    sys.exit(main())
