"""Tests de la conférence de la semaine sur des decks construits en local
(jamais OneDrive) : python -m unittest test_conference"""
import io
import posixpath
import tempfile
import unittest
from pathlib import Path
from unittest import mock

from lxml import etree
from PIL import Image
from pptx import Presentation
from pptx.util import Inches
from reportlab.pdfgen import canvas

import conference
import deck
import job
from test_job import MS, FauxWorker, utc

NS = conference.NS
VENDREDI = "2026-11-27"


def png(couleur="green"):
    sortie = io.BytesIO()
    Image.new("RGB", (40, 30), couleur).save(sortie, "PNG")
    return sortie.getvalue()


def construire_cible(chemin, sections=True):
    """Deck façon support BNI : ouverture, slide « Membre à l'honneur » (titre
    de la conférence), une slide posée à la main (image plein cadre, disposition
    « Page vide »), puis la suite de la réunion. Deux sections."""
    prs = Presentation()
    prs.slide_layouts[6]._element.cSld.set("name", conference.LAYOUT_VIDE)
    prs.slide_layouts[5]._element.cSld.set("name", conference.LAYOUT_ANCRE)
    prs.slides.add_slide(prs.slide_layouts[0]).shapes.title.text = "Ouverture"
    prs.slides.add_slide(prs.slide_layouts[5]).shapes.title.text = "Membre à l'honneur"
    main = prs.slides.add_slide(prs.slide_layouts[6])
    main.shapes.add_picture(io.BytesIO(png("blue")), 0, 0, prs.slide_width, prs.slide_height)
    prs.slides.add_slide(prs.slide_layouts[1]).shapes.title.text = "TAT express"
    if sections:
        ids = [s.slide_id for s in prs.slides]
        p14 = NS["p14"]
        ext_lst = etree.SubElement(prs.part._element, f"{{{NS['p']}}}extLst")
        ext = etree.SubElement(ext_lst, f"{{{NS['p']}}}ext", uri="{521415D9-36F7-43E2-AB2F-B90AF26B5E84}")
        lst = etree.SubElement(ext, f"{{{p14}}}sectionLst")
        for i, (nom, part) in enumerate((("Début", ids[:1]), ("Conférence", ids[1:])), 1):
            sec = etree.SubElement(lst, f"{{{p14}}}section", name=nom, id="{00000000-0000-0000-0000-00000000000%d}" % i)
            sl = etree.SubElement(sec, f"{{{p14}}}sldIdLst")
            for x in part:
                etree.SubElement(sl, f"{{{p14}}}sldId", id=str(x))
    prs.save(chemin)


def pdf(pages=3, format_page=(595, 842)):
    sortie = io.BytesIO()
    c = canvas.Canvas(sortie, pagesize=format_page)
    for k in range(pages):
        c.drawString(100, 500, f"Page {k + 1}")
        c.showPage()
    c.save()
    return sortie.getvalue()


def pptx(slides=2, layout_membre=False):
    """Conférence en PowerPoint : image, notes, lien vers une autre slide."""
    prs = Presentation()
    if layout_membre:
        prs.slide_layouts[1]._element.cSld.set("name", deck.LAYOUT_MEMBRE)
    for k in range(slides):
        s = prs.slides.add_slide(prs.slide_layouts[1])
        s.shapes.title.text = f"Diapo {k + 1}"
        s.shapes.add_picture(io.BytesIO(png()), Inches(1), Inches(3))
        s.notes_slide.notes_text_frame.text = "notes de l'orateur"
    premiere = prs.slides[0]
    rpr = prs.slides[-1].shapes.title.text_frame.paragraphs[0].runs[0]._r.get_or_add_rPr()
    rid = prs.slides[-1].part.relate_to(premiere.part, "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide")
    etree.SubElement(rpr, "{http://schemas.openxmlformats.org/drawingml/2006/main}hlinkClick",
                     {f"{{{NS['r']}}}id": rid, "action": "ppaction://hlinksldjump"})
    if layout_membre:
        tb = prs.slides[0].shapes.add_textbox(int(prs.slide_width * 0.8), int(prs.slide_height * 0.34), Inches(1), Inches(0.3))
        tb.text_frame.text = "Nom DANS LA CONF"
    sortie = io.BytesIO()
    prs.save(sortie)
    return sortie.getvalue()


def verifier_integrite(test, chemin):
    """Chaque r:id de chaque partie XML pointe vers une relation existante, et
    les identifiants de masques / dispositions / slides sont uniques."""
    prs = Presentation(chemin)
    for partie in prs.part.package.iter_parts():
        if not partie.content_type.endswith("+xml"):
            continue
        racine = etree.fromstring(partie.blob)
        for attr in racine.xpath("//@*[namespace-uri()=$r]", r=NS["r"]):
            # r:id="" est valide (action sans cible, déjà présent dans le vrai deck)
            if str(attr) and etree.QName(attr.attrname).localname in ("id", "embed", "link", "pict", "dm", "lo", "qs", "cs"):
                test.assertIn(str(attr), partie.rels, f"{partie.partname} : {attr} sans relation")
    p = etree.fromstring(prs.part.blob)
    ids = [int(x) for x in p.xpath("./p:sldMasterIdLst/p:sldMasterId/@id", namespaces=NS)]
    for m in prs.slide_masters:
        ids += [int(x) for x in etree.fromstring(m.part.blob).xpath("./p:sldLayoutIdLst/p:sldLayoutId/@id", namespaces=NS)]
    test.assertEqual(len(ids), len(set(ids)), "identifiants de masques/dispositions en double")
    slides = [s.slide_id for s in prs.slides]
    test.assertEqual(len(slides), len(set(slides)))
    sections = [int(x) for x in p.xpath(".//p14:sectionLst//p14:sldId/@id", namespaces=NS)]
    if sections:
        test.assertEqual(sorted(sections), sorted(slides), "chaque slide doit être dans une section")
        test.assertEqual(sections, slides, "ordre des sections = ordre des slides")
    return prs


def resume(prs):
    return [(s.slide_layout.name, conference.vendredi_de(s)) for s in prs.slides]


class TestInsertion(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [f.unlink() for f in self.dossier.iterdir()])
        self.cible = self.dossier / "cible.pptx"
        construire_cible(self.cible)

    def test_pdf_une_page_une_image_juste_apres_membre_a_l_honneur(self):
        r = conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, "pdf", pdf(3))
        self.assertEqual(r, {"slides": 3, "retirees": 0, "avertissement": ""})
        prs = verifier_integrite(self, self.dossier / "o.pptx")
        self.assertEqual(resume(prs), [
            ("Title Slide", None), (conference.LAYOUT_ANCRE, None),
            (conference.LAYOUT_VIDE, VENDREDI), (conference.LAYOUT_VIDE, VENDREDI), (conference.LAYOUT_VIDE, VENDREDI),
            (conference.LAYOUT_VIDE, None), ("Title and Content", None),
        ])
        page = prs.slides[2]
        self.assertEqual([sh.shape_type for sh in page.shapes], [13])  # une seule image, rien d'autre
        self.assertEqual(page._element.cSld.get("name"), f"Conférence du {VENDREDI} (1/3)")
        # page A4 portrait : image centrée, sur toute la hauteur de la slide
        pic = page.shapes[0]
        self.assertEqual(pic.height, prs.slide_height)
        self.assertAlmostEqual(pic.left * 2 + pic.width, prs.slide_width, delta=2)

    def test_pptx_slides_recopiees_avec_leur_masque(self):
        r = conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, "pptx", pptx(2))
        self.assertEqual(r["slides"], 2)
        prs = verifier_integrite(self, self.dossier / "o.pptx")
        conf = [s for s in prs.slides if conference.est_conference(s)]
        self.assertEqual([s.shapes.title.text for s in conf], ["Diapo 1", "Diapo 2"])
        self.assertEqual([prs.slides.index(s) for s in conf], [2, 3])
        self.assertEqual(len(prs.slide_masters), 2)
        self.assertTrue(conf[0].slide_layout.slide_master._element.cSld.get("name").startswith("Conférence du "))
        self.assertFalse(any(s.has_notes_slide for s in conf))  # notes de l'orateur non reprises
        # le lien interne pointe vers la copie de la slide, pas vers l'original
        rid = conf[1].shapes.title.text_frame.paragraphs[0].runs[0]._r.xpath(".//a:hlinkClick/@r:id")[0]
        self.assertIs(conf[1].part.related_part(rid), conf[0].part)
        # le deck se réenregistre et se relit normalement
        prs.save(self.dossier / "o2.pptx")
        verifier_integrite(self, self.dossier / "o2.pptx")

    def test_nouveau_depot_remplace_la_conference(self):
        conference.inserer(self.cible, self.dossier / "a.pptx", VENDREDI, "pptx", pptx(4))
        r = conference.inserer(self.dossier / "a.pptx", self.dossier / "b.pptx", VENDREDI, "pdf", pdf(2))
        self.assertEqual((r["slides"], r["retirees"]), (2, 4))
        prs = verifier_integrite(self, self.dossier / "b.pptx")
        self.assertEqual(sum(conference.est_conference(s) for s in prs.slides), 2)
        self.assertEqual(len(prs.slide_masters), 1)  # masque recopié retiré avec ses slides

    def test_sans_sections(self):
        construire_cible(self.cible, sections=False)
        conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, "pdf", pdf(1))
        verifier_integrite(self, self.dossier / "o.pptx")

    def test_format_de_slide_different_signale(self):
        source = Presentation(io.BytesIO(pptx(1)))
        source.slide_width = Inches(13.333)  # 16:9 ; le deck de test est en 4:3
        sortie = io.BytesIO()
        source.save(sortie)
        r = conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, "pptx", sortie.getvalue())
        self.assertIn("format de slide différent", r["avertissement"])

    def test_erreurs_sans_rien_ecrire(self):
        for type_fichier, octets in (("pdf", b"%PDF-1.4 abime"), ("pptx", b"PK pas un pptx"), ("pdf", pdf(conference.PAGES_MAX + 1))):
            with self.assertRaises(conference.ConferenceImpossible):
                conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, type_fichier, octets)
        self.assertFalse((self.dossier / "o.pptx").exists())

    def test_partie_conference_introuvable(self):
        prs = Presentation()
        prs.slides.add_slide(prs.slide_layouts[0])
        prs.save(self.cible)
        with self.assertRaisesRegex(conference.ConferenceImpossible, "introuvable"):
            conference.inserer(self.cible, self.dossier / "o.pptx", VENDREDI, "pdf", pdf(1))


class TestNettoyage(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.addCleanup(lambda: [f.unlink() for f in self.dossier.iterdir()])
        construire_cible(self.dossier / "cible.pptx")
        conference.inserer(self.dossier / "cible.pptx", self.dossier / "avec.pptx", "2026-11-20", "pptx", pptx(2, layout_membre=True))

    def test_retire_la_conference_passee_garde_la_slide_posee_a_la_main(self):
        r = deck.nettoyer(self.dossier / "avec.pptx", self.dossier / "net.pptx", conference_jusqu_au="2026-11-20")
        self.assertEqual(r["conference"], 2)
        prs = verifier_integrite(self, self.dossier / "net.pptx")
        self.assertEqual([s.slide_id for s in prs.slides], [s.slide_id for s in Presentation(self.dossier / "cible.pptx").slides])
        self.assertEqual(len(prs.slide_masters), 1)

    def test_garde_la_conference_d_une_reunion_a_venir(self):
        r = deck.nettoyer(self.dossier / "avec.pptx", self.dossier / "net.pptx", conference_jusqu_au="2026-11-13")
        self.assertEqual(r["conference"], 0)
        self.assertFalse((self.dossier / "net.pptx").exists())  # rien changé : rien enregistré

    def test_essai_ne_retire_rien(self):
        r = deck.nettoyer(self.dossier / "avec.pptx", self.dossier / "net.pptx", essai=True, conference_jusqu_au="2026-11-20")
        self.assertEqual(r["conference"], 2)
        self.assertFalse((self.dossier / "net.pptx").exists())

    def test_slide_recopiee_d_un_deck_bni_jamais_prise_pour_un_membre(self):
        # même nom de disposition et un nom dans la colonne de droite
        self.assertEqual(deck.lister_membres(self.dossier / "avec.pptx"), [])
        r = deck.nettoyer(self.dossier / "avec.pptx", None, essai=True)
        self.assertEqual(r["non_reconnues"], 0)


class FauxWorkerConf(FauxWorker):
    def __init__(self, depots, conf, fichier):
        super().__init__(depots)
        self.conf, self.fichier = conf, fichier
        self.s = mock.Mock()
        self.s.get.side_effect = self.morceau
        self.url = "https://w"

    def morceau(self, url, **kw):
        n = int(url.rsplit("/", 1)[1])
        bloc = self.fichier[n * 10:(n + 1) * 10]
        return mock.Mock(status_code=200 if bloc else 404, content=bloc)

    def get(self, chemin, **kw):
        r = super().get(chemin, **kw)
        corps = {**r.json(), "conference": self.conf}
        return mock.Mock(json=lambda: corps)


class TestJob(unittest.TestCase):
    def setUp(self):
        self.envoi = mock.Mock()
        self.inserer = mock.Mock(return_value={"slides": 5, "retirees": 0, "avertissement": ""})
        rustines = [
            mock.patch.object(job, "jeton_microsoft", return_value="acces"),
            mock.patch.object(job, "attendre_calme", return_value="e"),
            mock.patch.object(job, "telecharger", return_value="etag"),
            mock.patch.object(job, "envoyer_deck", self.envoi),
            mock.patch.object(job.deck, "lister_membres", return_value=[{"slide_id": 1, "nom": "Paul MARTIN"}]),
            mock.patch.object(job.deck, "appliquer", side_effect=lambda src, dst, depots: [d["slide_id"] for d in depots]),
            mock.patch.object(job.conference, "inserer", self.inserer),
            mock.patch.object(job.time, "sleep"),
            mock.patch("builtins.print"),
        ]
        for r in rustines:
            r.start()
            self.addCleanup(r.stop)

    def conf(self, fichier):
        return {"vendredi": VENDREDI, "type": "pdf", "taille": len(fichier), "morceaux": (len(fichier) + 9) // 10, "envoi": "e1", "valide_le": "v1"}

    def test_conference_seule_posee_et_signalee(self):
        fichier = b"%PDF" + b"x" * 21
        w = FauxWorkerConf([], self.conf(fichier), fichier)
        self.assertEqual(job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""}), 0)
        self.assertEqual(self.inserer.call_args.args[2:], (VENDREDI, "pdf", fichier))
        self.envoi.assert_called_once()
        self.assertEqual(w.resultats[0]["conference"], {"vendredi": VENDREDI, "valide_le": "v1", "ok": True, "slides": 5, "message": ""})
        self.assertIn("conférence : 5 slide(s)", w.resultats[0]["message"])

    def test_conference_impossible_n_empeche_pas_les_infomerciales(self):
        self.inserer.side_effect = conference.ConferenceImpossible("PDF illisible")
        fichier = b"%PDF" + b"x" * 5
        w = FauxWorkerConf([{"slide_id": 1, "date": "d", "recherche": "x"}], self.conf(fichier), fichier)
        self.assertEqual(job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""}), 0)
        self.envoi.assert_called_once()  # infomerciale posée quand même
        r = w.resultats[0]
        self.assertEqual((r["ok"], r["conference"]["ok"], r["conference"]["message"]), (True, False, "PDF illisible"))
        self.assertEqual(len(r["appliques"]), 1)

    def test_conference_impossible_seule_pas_d_envoi(self):
        self.inserer.side_effect = conference.ConferenceImpossible("PDF illisible")
        fichier = b"%PDF"
        w = FauxWorkerConf([], self.conf(fichier), fichier)
        job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""})
        self.envoi.assert_not_called()
        self.assertFalse(w.resultats[0]["conference"]["ok"])

    def test_fichier_incomplet_reporte_au_passage_suivant(self):
        fichier = b"%PDF" + b"x" * 21
        conf = {**self.conf(fichier), "taille": 999}
        w = FauxWorkerConf([], conf, fichier)
        job.main(w, utc(2026, 11, 25, 18, 5), {"CRON": ""})
        self.inserer.assert_not_called()
        self.assertIsNone(w.resultats[0]["conference"])


if __name__ == "__main__":
    unittest.main()
