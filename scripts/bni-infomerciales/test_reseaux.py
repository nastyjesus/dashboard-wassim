"""Tests du module « Réseaux sociaux » sur des decks construits en local
(jamais OneDrive, noms fictifs) : python -m unittest test_reseaux"""
import io
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from lxml import etree
from PIL import Image
from pptx import Presentation

import conference
import deck
import job
import nettoyage
import reseaux
from test_conference import pdf, png, pptx, verifier_integrite
from test_job import FauxWorker, utc

NS = conference.NS
VENDREDI = "2026-11-27"


def ajouter_sections(prs, parts):
    """parts : [(nom, [slide_id])] → sections p14 du deck."""
    p14 = NS["p14"]
    ext_lst = etree.SubElement(prs.part._element, f"{{{NS['p']}}}extLst")
    ext = etree.SubElement(ext_lst, f"{{{NS['p']}}}ext", uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}")
    lst = etree.SubElement(ext, f"{{{p14}}}sectionLst")
    for i, (nom, ids) in enumerate(parts, 1):
        sec = etree.SubElement(lst, f"{{{p14}}}section", name=nom, id="{00000000-0000-0000-0000-00000000000%d}" % i)
        sl = etree.SubElement(sec, f"{{{p14}}}sldIdLst")
        for x in ids:
            etree.SubElement(sl, f"{{{p14}}}sldId", id=str(x))


def construire(chemin, repere_id=None, doublon_texte=False):
    """Deck façon support BNI : ouverture, repère « Réseaux sociaux », deux
    slides posées à la main (image plein cadre, « Page vide »), TAT, partie
    conférence. Trois sections. repere_id : renumérote la repère (ex. 3854).
    doublon_texte : une autre slide commence aussi par « Réseaux sociaux »."""
    prs = Presentation()
    prs.slide_layouts[6]._element.cSld.set("name", conference.LAYOUT_VIDE)
    prs.slide_layouts[5]._element.cSld.set("name", conference.LAYOUT_ANCRE)
    s = {}
    s["ouverture"] = prs.slides.add_slide(prs.slide_layouts[0])
    s["ouverture"].shapes.title.text = "Ouverture"
    if doublon_texte:
        s["comite"] = prs.slides.add_slide(prs.slide_layouts[1])
        s["comite"].shapes.title.text = "Réseaux sociaux : le comité"
    s["repere"] = prs.slides.add_slide(prs.slide_layouts[1])
    s["repere"].shapes.title.text = "  RÉSEAUX   sociaux "
    for k in ("main1", "main2"):
        s[k] = prs.slides.add_slide(prs.slide_layouts[6])
        s[k].shapes.add_picture(io.BytesIO(png("blue")), 0, 0, prs.slide_width, prs.slide_height)
    s["tat"] = prs.slides.add_slide(prs.slide_layouts[1])
    s["tat"].shapes.title.text = "TAT express"
    s["honneur"] = prs.slides.add_slide(prs.slide_layouts[5])
    s["honneur"].shapes.title.text = "Membre à l'honneur"
    s["fin"] = prs.slides.add_slide(prs.slide_layouts[1])
    s["fin"].shapes.title.text = "Fin"
    ids = {k: v.slide_id for k, v in s.items()}
    if repere_id:
        el = next(e for e in prs.part._element.find("p:sldIdLst", NS) if e.get("id") == str(ids["repere"]))
        el.set("id", str(repere_id))
        ids["repere"] = repere_id
    ordre = [v.slide_id for v in prs.slides]
    i_rep, i_hon = ordre.index(ids["repere"]), ordre.index(ids["honneur"])
    ajouter_sections(prs, [("Début", ordre[:i_rep]), ("Réseaux", ordre[i_rep:i_hon]), ("Conférence", ordre[i_hon:])])
    prs.save(chemin)
    return ids


def section_de(prs, slide_id):
    for sec in prs.part._element.findall(".//p14:sectionLst/p14:section", NS):
        if str(slide_id) in [e.get("id") for e in sec.findall("p14:sldIdLst/p14:sldId", NS)]:
            return sec.get("name")
    return None


def image_png_transparente(taille=(60, 40)):
    img = Image.new("RGBA", taille, (0, 0, 0, 0))
    sortie = io.BytesIO()
    img.save(sortie, "PNG")
    return sortie.getvalue()


def jpeg_exif_tourne():
    """JPEG 40×30 dont l'EXIF dit « tourner de 90° » (orientation 6)."""
    img = Image.new("RGB", (40, 30), "red")
    exif = Image.Exif()
    exif[0x0112] = 6
    sortie = io.BytesIO()
    img.save(sortie, "JPEG", exif=exif)
    return sortie.getvalue()


def f(type_fichier, octets):
    return {"type": type_fichier, "octets": octets}


class Base(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.dossier, True)
        self.cible = self.dossier / "cible.pptx"
        self.ids = construire(self.cible)

    def ordre(self, chemin):
        return [s.slide_id for s in Presentation(chemin).slides]


class TestPose(Base):
    def test_fichiers_poses_dans_l_ordre_juste_apres_la_repere(self):
        sortie = self.dossier / "o.pptx"
        r = reseaux.inserer(self.cible, sortie, VENDREDI, [f("pptx", pptx(2)), f("pdf", pdf(1)), f("png", png("red"))])
        self.assertEqual((r["slides"], r["retirees"]), (4, 0))
        prs = verifier_integrite(self, sortie)
        slides = list(prs.slides)
        avant = self.ordre(self.cible)
        i = avant.index(self.ids["repere"])
        poses = slides[i + 1:i + 5]
        self.assertEqual([s._element.cSld.get("name") for s in poses],
                         [f"Réseaux sociaux du {VENDREDI} ({k}/4)" for k in range(1, 5)])
        self.assertEqual([poses[0].shapes.title.text, poses[1].shapes.title.text], ["Diapo 1", "Diapo 2"])
        self.assertEqual([s.slide_layout.name for s in poses[2:]], [conference.LAYOUT_VIDE] * 2)
        # même section que la repère ; tout le reste du deck inchangé et dans l'ordre
        self.assertTrue(all(section_de(prs, s.slide_id) == "Réseaux" for s in poses))
        self.assertEqual([s.slide_id for s in slides if not reseaux.est_reseaux(s)], avant)
        masques = [m._element.cSld.get("name") for m in prs.slide_masters]
        self.assertIn(f"Réseaux sociaux du {VENDREDI} (modèle 1)", masques)
        # image seule sur sa slide, centrée, sur toute la largeur ou la hauteur
        pic = poses[3].shapes[0]
        self.assertEqual(len(poses[3].shapes), 1)
        self.assertTrue(pic.width == prs.slide_width or pic.height == prs.slide_height)
        self.assertAlmostEqual(pic.left * 2 + pic.width, prs.slide_width, delta=2)
        prs.save(self.dossier / "o2.pptx")  # se réenregistre normalement
        verifier_integrite(self, self.dossier / "o2.pptx")

    def test_deux_powerpoint_et_image_entre_les_deux(self):
        sortie = self.dossier / "o.pptx"
        r = reseaux.inserer(self.cible, sortie, VENDREDI, [f("pptx", pptx(1)), f("jpg", jpeg_exif_tourne()), f("pptx", pptx(2))])
        self.assertEqual(r["slides"], 4)
        prs = verifier_integrite(self, sortie)
        poses = [s for s in prs.slides if reseaux.est_reseaux(s)]
        self.assertEqual([s.slide_layout.name == conference.LAYOUT_VIDE for s in poses], [False, True, False, False])
        self.assertEqual([s.shapes.title.text for s in (poses[0], poses[2], poses[3])], ["Diapo 1", "Diapo 1", "Diapo 2"])
        masques = sorted(m._element.cSld.get("name") for m in prs.slide_masters if m._element.cSld.get("name"))
        self.assertEqual([m for m in masques if m.startswith("Réseaux")],
                         [f"Réseaux sociaux du {VENDREDI} (modèle 1)", f"Réseaux sociaux du {VENDREDI} (modèle 2)"])

    def test_nouveau_depot_remplace_et_retire_les_anciens(self):
        a, b, c = (self.dossier / n for n in ("a.pptx", "b.pptx", "c.pptx"))
        reseaux.inserer(self.cible, a, "2026-12-04", [f("png", png())])  # réunion à venir : doit rester
        reseaux.inserer(a, b, "2026-11-20", [f("pptx", pptx(2))])  # ancien dépôt
        r = reseaux.inserer(b, c, VENDREDI, [f("pdf", pdf(3))])
        self.assertEqual((r["slides"], r["retirees"]), (3, 2))
        prs = verifier_integrite(self, c)
        self.assertEqual([reseaux.vendredi_de(s) for s in prs.slides if reseaux.est_reseaux(s)],
                         [VENDREDI] * 3 + ["2026-12-04"])
        self.assertEqual(len(prs.slide_masters), 1)  # masque recopié retiré avec ses slides
        # redépôt du même vendredi : remplacement
        r = reseaux.inserer(c, a, VENDREDI, [f("png", png()), f("png", png("red"))])
        self.assertEqual((r["slides"], r["retirees"]), (2, 3))
        verifier_integrite(self, a)

    def test_image_transparente_sur_blanc_reduite(self):
        jpeg, l, h = reseaux.preparer_image(image_png_transparente((5000, 1000)))
        self.assertEqual((l, h), (2400, 480))
        img = Image.open(io.BytesIO(jpeg))
        self.assertEqual(img.format, "JPEG")
        self.assertGreater(min(img.convert("RGB").getpixel((10, 10))), 245)  # blanc, pas noir

    def test_orientation_exif_respectee(self):
        _, l, h = reseaux.preparer_image(jpeg_exif_tourne())
        self.assertEqual((l, h), (30, 40))

    def test_conference_et_membres_ne_prennent_pas_les_slides_reseaux(self):
        sortie = self.dossier / "o.pptx"
        reseaux.inserer(self.cible, sortie, VENDREDI, [f("pptx", pptx(2, layout_membre=True))])
        self.assertEqual(deck.lister_membres(sortie), [])
        # la conférence se pose toujours après « Membre à l'honneur »
        conference.inserer(sortie, self.dossier / "c.pptx", VENDREDI, "pdf", pdf(1))
        prs = verifier_integrite(self, self.dossier / "c.pptx")
        noms = [s.slide_id for s in prs.slides]
        conf = [s.slide_id for s in prs.slides if conference.est_conference(s)]
        self.assertEqual(noms.index(conf[0]), noms.index(self.ids["honneur"]) + 1)


class TestRepere(Base):
    def test_slide_id_3854_prioritaire_sur_le_texte(self):
        construire(self.cible, repere_id=reseaux.REPERE_ID, doublon_texte=True)
        sortie = self.dossier / "o.pptx"
        reseaux.inserer(self.cible, sortie, VENDREDI, [f("png", png())])
        ordre = self.ordre(sortie)
        self.assertTrue(reseaux.est_reseaux(Presentation(sortie).slides[ordre.index(reseaux.REPERE_ID) + 1]))

    def test_texte_ambigu_sans_3854_erreur_sans_rien_ecrire(self):
        construire(self.cible, doublon_texte=True)
        with self.assertRaisesRegex(reseaux.ReseauxImpossible, "repère Réseaux sociaux introuvable"):
            reseaux.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, [f("png", png())])
        self.assertFalse((self.dossier / "o.pptx").exists())

    def test_repli_ignore_les_slides_membres(self):
        construire(self.cible)
        prs = Presentation(self.cible)
        prs.slide_layouts[1]._element.cSld.set("name", deck.LAYOUT_MEMBRE)  # « TAT », « Fin », la repère…
        prs.slide_layouts[0]._element.cSld.set("name", "Titre")
        prs.slides[0].shapes.title.text = "Réseaux sociaux"  # seule candidate hors disposition membre
        prs.save(self.cible)
        self.assertEqual(reseaux.LAYOUT_MEMBRE, deck.LAYOUT_MEMBRE)
        self.assertEqual(reseaux.trouver_repere(Presentation(self.cible)).slide_id, self.ids["ouverture"])

    def test_plafond_global_de_slides(self):
        fichiers = [f("pdf", pdf(30)), f("pdf", pdf(30)), f("pptx", pptx(21))]
        with self.assertRaisesRegex(reseaux.ReseauxImpossible, r"dépôt trop long \(81 slides au total, 80 max\)"):
            reseaux.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, fichiers)
        self.assertFalse((self.dossier / "o.pptx").exists())

    def test_page_pdf_tres_haute_bornee(self):
        [(jpeg, l, h)] = conference.pages_pdf(pdf(1, format_page=(595, 14000)))
        self.assertEqual(h, conference.LARGEUR_IMAGE)
        self.assertLessEqual(l * h, conference.PIXELS_MAX)
        self.assertEqual(Image.open(io.BytesIO(jpeg)).size, (l, h))

    def test_repere_absente(self):
        prs = Presentation()
        prs.slides.add_slide(prs.slide_layouts[0]).shapes.title.text = "Autre chose"
        prs.save(self.cible)
        with self.assertRaisesRegex(reseaux.ReseauxImpossible, "introuvable"):
            reseaux.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, [f("png", png())])

    def test_fichier_illisible_rien_ecrit(self):
        for fichiers in ([f("png", png()), f("pdf", b"%PDF-1.4 abime")], [f("jpg", b"\xff\xd8\xff pas une image")],
                         [f("pptx", b"PK pas un pptx")], [f("gif", b"GIF89a")], []):
            with self.assertRaises(reseaux.ReseauxImpossible) as e:
                reseaux.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, fichiers)
            if len(fichiers) == 2:
                self.assertIn("fichier 2/2", str(e.exception))
        self.assertFalse((self.dossier / "o.pptx").exists())


class TestNettoyage(Base):
    def setUp(self):
        super().setUp()
        self.avec = self.dossier / "avec.pptx"
        reseaux.inserer(self.cible, self.avec, VENDREDI, [f("pptx", pptx(2)), f("png", png())])

    def test_retire_les_slides_du_vendredi_passe_et_le_retrait_unique(self):
        net = self.dossier / "net.pptx"
        r = deck.nettoyer(self.avec, net, reseaux_jusqu_au=VENDREDI,
                          reseaux_retrait_unique=[self.ids["main1"], self.ids["main2"]])
        self.assertEqual((r["reseaux"], r["reseaux_laissees"]), (5, []))
        self.assertEqual([x["quoi"] for x in r["reseaux_retirees"]], ["posée par le système"] * 3 + ["retrait unique"] * 2)
        prs = verifier_integrite(self, net)
        attendu = [i for i in self.ordre(self.cible) if i not in (self.ids["main1"], self.ids["main2"])]
        self.assertEqual([s.slide_id for s in prs.slides], attendu)
        self.assertEqual(len(prs.slide_masters), 1)

    def test_garde_fous_du_retrait_unique(self):
        sid = lambda k: self.ids[k]  # noqa: E731
        conf = self.dossier / "conf.pptx"
        conference.inserer(self.avec, conf, VENDREDI, "pdf", pdf(1))
        conf_id = next(s.slide_id for s in Presentation(conf).slides if conference.est_conference(s))
        # main1 absent de la liste : main2 n'est plus contiguë à la repère
        r = deck.nettoyer(conf, None, essai=True, reseaux_retrait_unique=[sid("main2"), sid("tat"), conf_id, 999999])
        motifs = {x["slide_id"]: x["motif"] for x in r["reseaux_laissees"]}
        self.assertEqual(motifs, {
            sid("main2"): "pas juste après la repère",
            sid("tat"): "disposition autre que « Page vide »",
            conf_id: "nom système",
            999999: "absente du deck",
        })
        self.assertEqual(r["reseaux"], 0)

    def test_retrait_unique_sans_repere(self):
        prs = Presentation(self.cible)
        prs.slides[1].shapes.title.text = "Autre titre"  # plus de repère
        prs.save(self.cible)
        r = deck.nettoyer(self.cible, None, essai=True, reseaux_retrait_unique=[self.ids["main1"]])
        self.assertEqual(r["reseaux_laissees"][0]["motif"], "repère Réseaux sociaux introuvable")

    def test_garde_une_reunion_a_venir_et_essai_n_ecrit_rien(self):
        net = self.dossier / "net.pptx"
        r = deck.nettoyer(self.avec, net, reseaux_jusqu_au="2026-11-20")
        self.assertEqual(r["reseaux"], 0)
        self.assertFalse(net.exists())
        r = deck.nettoyer(self.avec, net, essai=True, reseaux_jusqu_au=VENDREDI, reseaux_retrait_unique=[self.ids["main1"]])
        self.assertEqual(r["reseaux"], 4)
        self.assertEqual([x["numero"] for x in r["reseaux_retirees"]], [3, 4, 5, 6])
        self.assertFalse(net.exists())


class FauxWorkerReseaux(FauxWorker):
    """Entrée avec un dépôt réseaux sociaux ; morceaux de 10 octets par envoi."""

    def __init__(self, depots, res, fichiers):
        super().__init__(depots)
        self.res, self.fichiers = res, fichiers
        self.s = mock.Mock()
        self.s.get.side_effect = self.morceau
        self.url = "https://w"

    def morceau(self, url, **kw):
        assert "/api/job/reseaux/morceau/" in url
        envoi, n = url.rsplit("/", 2)[1:]
        bloc = self.fichiers.get(envoi, b"")[int(n) * 10:(int(n) + 1) * 10]
        return mock.Mock(status_code=200 if bloc else 404, content=bloc)

    def get(self, chemin, **kw):
        r = super().get(chemin, **kw)
        corps = {**r.json(), "reseaux": self.res}
        return mock.Mock(json=lambda: corps)


class TestJob(unittest.TestCase):
    def setUp(self):
        self.envoi = mock.Mock()
        self.inserer = mock.Mock(return_value={"slides": 3, "retirees": 0, "avertissement": ""})
        rustines = [
            mock.patch.object(job, "jeton_microsoft", return_value="acces"),
            mock.patch.object(job, "attendre_calme", return_value="e"),
            mock.patch.object(job, "telecharger", return_value="etag"),
            mock.patch.object(job, "envoyer_deck", self.envoi),
            mock.patch.object(job.deck, "lister_membres", return_value=[{"slide_id": 1, "nom": "Paul MARTIN"}]),
            mock.patch.object(job.deck, "appliquer", side_effect=lambda src, dst, depots: [d["slide_id"] for d in depots]),
            mock.patch.object(job.reseaux, "inserer", self.inserer),
            mock.patch.object(job.time, "sleep"),
            mock.patch("builtins.print"),
        ]
        for r in rustines:
            r.start()
            self.addCleanup(r.stop)
        self.fichiers = {"e1": b"PK" + b"x" * 13, "e2": b"\x89PNG" + b"y" * 4}

    def res(self, **autre):
        fichiers = [{"envoi": e, "morceaux": (len(o) + 9) // 10, "taille": len(o), "type": t, "nom": "x"}
                    for (e, o), t in zip(self.fichiers.items(), ("pptx", "png"))]
        return {"vendredi": VENDREDI, "valide_le": "v1", "fichiers": fichiers, **autre}

    def test_depot_pose_et_signale(self):
        w = FauxWorkerReseaux([], self.res(), self.fichiers)
        self.assertEqual(job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""}), 0)
        self.assertEqual(self.inserer.call_args.args[2:], (VENDREDI, [
            {"type": "pptx", "octets": self.fichiers["e1"]}, {"type": "png", "octets": self.fichiers["e2"]}]))
        self.envoi.assert_called_once()
        self.assertEqual(w.resultats[0]["reseaux"], {"vendredi": VENDREDI, "valide_le": "v1", "ok": True, "slides": 3, "message": ""})
        self.assertIn("réseaux sociaux : 3 slide(s)", w.resultats[0]["message"])

    def test_erreur_reseaux_ne_bloque_ni_infomerciales_ni_conference(self):
        self.inserer.side_effect = reseaux.ReseauxImpossible("repère Réseaux sociaux introuvable")
        conf = mock.patch.object(job.conference, "inserer", return_value={"slides": 2, "retirees": 0, "avertissement": ""})
        conf.start()
        self.addCleanup(conf.stop)
        w = FauxWorkerReseaux([{"slide_id": 1, "date": "d", "recherche": "x"}], self.res(), self.fichiers)
        with mock.patch.object(job, "preparer_conference", return_value={"vendredi": VENDREDI, "valide_le": "c1", "type": "pdf", "octets": b"%PDF"}):
            self.assertEqual(job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""}), 0)
        self.envoi.assert_called_once()
        r = w.resultats[0]
        self.assertEqual((r["ok"], r["conference"]["ok"], r["reseaux"]["ok"]), (True, True, False))
        self.assertEqual(r["reseaux"]["message"], "repère Réseaux sociaux introuvable")
        self.assertEqual(len(r["appliques"]), 1)
        # la conférence a été posée sur le deck des infomerciales, les réseaux sur celui de la conférence
        self.assertTrue(str(self.inserer.call_args.args[0]).endswith("conference.pptx"))

    def test_erreur_inattendue_signalee_sans_envoi(self):
        self.inserer.side_effect = KeyError("x")
        w = FauxWorkerReseaux([], self.res(), self.fichiers)
        self.assertEqual(job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""}), 0)
        self.envoi.assert_not_called()
        self.assertEqual(w.resultats[0]["reseaux"]["message"], "erreur inattendue (KeyError)")

    def test_morceau_absent_reporte_au_passage_suivant(self):
        res = self.res()
        res["fichiers"][1]["morceaux"] = 3  # un morceau de trop : 404
        w = FauxWorkerReseaux([], res, self.fichiers)
        job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""})
        self.inserer.assert_not_called()
        self.assertIsNone(w.resultats[0]["reseaux"])

    def test_pas_de_depot(self):
        w = FauxWorkerReseaux([], None, {})
        job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""})
        self.inserer.assert_not_called()
        self.assertIsNone(w.resultats[0]["reseaux"])


class TestNettoyageMain(unittest.TestCase):
    PLAN = {"semaine": "2026-11-23", "coupure": "2026-11-27 12:00", "deja_fait": False, "preserver": [],
            "reseaux_jusqu_au": VENDREDI, "reseaux_retrait_unique": [2113419610, 2113419611],
            "ms": {"rclone_token": "x", "item_id": "i", "drive_id": "d"}}
    RAPPORT = {"nettoyees": [], "deja_vides": [], "preservees": [], "non_reconnues": 0, "conference": 0,
               "reseaux": 2, "reseaux_retirees": [{"slide_id": 5, "numero": 90, "quoi": "retrait unique"}] * 2,
               "reseaux_laissees": [], "sauvegarde": "historique"}

    def lancer(self, quand, args=()):
        worker = mock.Mock()
        worker.get.return_value.json.return_value = dict(self.PLAN)
        plans = []
        with mock.patch.object(nettoyage, "Worker", return_value=worker), \
                mock.patch.object(nettoyage, "datetime") as dt, \
                mock.patch.object(nettoyage, "un_passage", side_effect=lambda w, ms, plan, d, essai: plans.append(dict(plan)) or dict(self.RAPPORT)), \
                mock.patch("builtins.print"), \
                mock.patch.dict("os.environ", {"WORKER_URL": "http://w", "WASSIM_AUTH_TOKEN": "t"}):
            dt.now.return_value = quand
            self.assertEqual(nettoyage.main(list(args)), 0)
        return plans[0], (worker.envoyer.call_args.args[2] if worker.envoyer.called else None)

    def test_compteur_reseaux_envoye_au_worker(self):
        plan, corps = self.lancer(datetime(2026, 11, 28, 7, 5))
        self.assertEqual(plan["reseaux_retrait_unique"], [2113419610, 2113419611])
        self.assertEqual(corps["reseaux"], 2)
        self.assertIn("2 slide(s) réseaux sociaux retirée(s)", corps["message"])

    def test_retrait_unique_seulement_le_28_novembre(self):
        for quand in (datetime(2026, 12, 5, 7, 5), datetime(2026, 11, 21, 7, 5), datetime(2026, 11, 29, 9, 0)):
            plan, _ = self.lancer(quand, ["--forcer"])
            self.assertEqual(plan["reseaux_retrait_unique"], [], quand)
            self.assertEqual(plan["reseaux_jusqu_au"], VENDREDI)

    def test_essai_affiche_le_retrait_unique_quel_que_soit_le_jour(self):
        plan, corps = self.lancer(datetime(2026, 12, 5, 7, 5), ["--essai"])
        self.assertEqual(plan["reseaux_retrait_unique"], [2113419610, 2113419611])
        self.assertIsNone(corps)  # essai : rien envoyé au worker


if __name__ == "__main__":
    unittest.main()
