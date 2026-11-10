# -*- coding: utf-8 -*-
"""Un site trouve en devinant le domaine n'est pas une preuve (controle du
07/11/2026 : ecobat.com, celinebourdon.com... etaient des homonymes).

Pour chaque email d'une section dont le domaine est celui d'un site devine,
on lit la page (accueil, mentions legales, contact) et on cherche une
preuve locale : SIREN, commune, code postal 35, nom du dirigeant, ou
Rennes/Bretagne. Sans preuve : A VERIFIER (statut_force.json), avec la
raison. Jamais EXCLURE automatiquement : l'absence de mention ne prouve
pas l'erreur.

    python -m prospect.preuve_locale vague6b.csv
"""
import csv, io, json, os, re, sqlite3, sys, unicodedata

RACINE = os.path.dirname(os.path.abspath(__file__))
DONNEES = os.path.join(os.path.dirname(RACINE), "data", "prospection")
plat = lambda s: unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()


def main(section):
    from playwright.sync_api import sync_playwright
    cx = sqlite3.connect(os.path.join(RACINE, "prospection.db"))
    devine = {s: v for s, v in cx.execute("select siret, valeur from valeur where champ='site_web' and source like 'domaine devine%'")}
    rows = [r for r in csv.DictReader(io.open(os.path.join(DONNEES, section), encoding="utf-8-sig"), delimiter=";")
            if r["email"] and r["siret"] in devine and r["email"].split("@")[1].split(".")[0] in devine[r["siret"]]
            and re.match(r"(site |page rendue|site, lecture)", r["email_source"] or "")]
    fp = os.path.join(RACINE, "cache", "statut_force.json")
    force = json.load(io.open(fp, encoding="utf-8"))
    print("%d emails sur site devine" % len(rows), flush=True)
    with sync_playwright() as pw:
        nav = pw.chromium.launch(headless=True); pg = nav.new_context(locale="fr-FR").new_page()
        for r in rows:
            dom = r["email"].split("@")[1]; txt = ""
            for u in ["https://" + dom, "https://" + dom + "/mentions-legales", "https://" + dom + "/contact"]:
                try:
                    pg.goto(u, timeout=25000, wait_until="load")
                    txt += " " + pg.inner_text("body")
                except Exception:
                    pass
            t = plat(txt); tc = re.sub(r"\s", "", t)
            noms = [re.sub(r"\(.*?\)", "", plat(x)).split()[-1] for x in r["dirigeants"].split(";") if re.sub(r"\(.*?\)", "", x).split()]
            p = []
            if r["siret"][:9] in tc: p.append("siren")
            if plat(r["commune"]).replace("-", " ")[:8] in t.replace("-", " "): p.append("commune")
            if re.search(r"\b35\s?\d{3}\b", t): p.append("cp35")
            if any(len(n) >= 4 and n in t for n in noms): p.append("dirigeant")
            if re.search(r"rennes|bretagne|ille.et.vilaine|breizh|\bbzh\b", t): p.append("region")
            if not p:
                raison = ("site trouve en devinant le domaine : la page lue ne cite ni la commune, ni un code postal 35, ni la Bretagne"
                          if len(t) >= 300 else
                          "site trouve en devinant le domaine, sans preuve que c'est la meme entreprise (page non lisible automatiquement)")
                force.setdefault(r["email"].lower(), ["A VERIFIER", raison])
            print("  %-40s %-40s %s" % (r["nom"][:40], r["email"], ",".join(p) or "AUCUNE PREUVE"), flush=True)
        nav.close()
    io.open(fp, "w", encoding="utf-8").write(json.dumps(force, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main(sys.argv[1])
