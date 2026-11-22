"""Tests du nettoyage hebdo sur un deck de test construit en local (jamais
OneDrive) : python -m unittest test_nettoyage"""
import copy
import hashlib
import io
import os
import shutil
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest import mock

from PIL import Image
from pptx import Presentation
from pptx.util import Emu

import deck
import nettoyage

# vrai deck, jamais versionné (BNI_DECK_TEST pour pointer une autre copie locale)
DECK_LOCAL = Path(os.environ.get("BNI_DECK_TEST", Path(__file__).parent / "data" / "deck-test.pptx"))


def jpeg(couleur="red", taille=(64, 48)):
    sortie = io.BytesIO()
    Image.new("RGB", taille, couleur).save(sortie, "JPEG")
    return sortie.getvalue()


def _xfrm(sh, prs, x, y, w, h):
    W, H = prs.slide_width, prs.slide_height
    sh.left, sh.top, sh.width, sh.height = Emu(int(x * W)), Emu(int(y * H)), Emu(int(w * W)), Emu(int(h * H))


def construire_deck(chemin):
    """Deck synthétique à la disposition « Infomerciale_30s » : bandeau texte en
    haut, espace réservé image « Infomerciale » à gauche, colonne de droite."""
    prs = Presentation()
    layout = prs.slide_layouts[1]
    layout._element.cSld.set("name", deck.LAYOUT_MEMBRE)
    titre, corps = list(layout.placeholders)[:2]
    _xfrm(corps, prs, 0.09, 0.06, 0.67, 0.06)  # bandeau « Qui peut m'aider à rencontrer »
    _xfrm(titre, prs, 0.80, 0.90, 0.18, 0.05)
    image = copy.deepcopy(corps._element)  # espace réservé image de la zone photo
    ph = image.xpath(".//p:nvPr/p:ph")[0]
    ph.set("type", "pic")
    ph.set("idx", "20")
    image.xpath(".//p:cNvPr")[0].set("id", "99")
    image.xpath(".//p:cNvPr")[0].set("name", "Infomerciale")
    corps._element.addnext(image)
    image_ph = [p for p in layout.placeholders if p.placeholder_format.idx == 20][0]
    _xfrm(image_ph, prs, *deck.ZONE_PHOTO)

    def slide_membre(nom, recherche="", photo=False, espace_vide=True):
        s = prs.slides.add_slide(layout)
        for p in list(s.placeholders):
            if p.placeholder_format.idx == 20 and not espace_vide:
                p._element.getparent().remove(p._element)
            elif p.placeholder_format.idx == 1 and recherche:
                p.text_frame.text = recherche
        for texte, y in ((nom, 0.34), ("Métier test", 0.44)):
            if texte:
                tb = s.shapes.add_textbox(0, 0, 1, 1)
                _xfrm(tb, prs, 0.80, y, 0.18, 0.05)
                tb.text_frame.text = texte
        logo = s.shapes.add_picture(io.BytesIO(jpeg("blue")), 0, 0)  # logo, colonne de droite
        _xfrm(logo, prs, 0.80, 0.55, 0.18, 0.3)
        if photo:
            pic = s.shapes.add_picture(io.BytesIO(jpeg()), 0, 0)
            _xfrm(pic, prs, 0.05, 0.2, 0.6, 0.7)
            pic.name = deck.NOM_PHOTO
        return s

    a = slide_membre("Membre A", "Demande A", photo=True, espace_vide=False)
    b = slide_membre("Membre B")  # slide vierge
    c = slide_membre("Membre C", "Demande C", photo=True, espace_vide=False)
    modele = slide_membre("", "", photo=True)  # disposition membre sans nom : non reconnue
    autre = prs.slides.add_slide(prs.slide_layouts[6])  # autre disposition, image à gauche
    pic = autre.shapes.add_picture(io.BytesIO(jpeg("green")), 0, 0)
    _xfrm(pic, prs, 0.05, 0.2, 0.6, 0.7)
    d = slide_membre("Membre D", "Demande D")  # photo dans l'espace réservé image lui-même
    [ph_d] = [p for p in d.placeholders if p.placeholder_format.idx == 20]
    ph_d.insert_picture(io.BytesIO(jpeg("yellow")))
    prs.save(chemin)
    return {"A": a.slide_id, "B": b.slide_id, "C": c.slide_id, "modele": modele.slide_id, "autre": autre.slide_id, "D": d.slide_id}


def empreinte(chemin):
    return hashlib.sha256(Path(chemin).read_bytes()).hexdigest()


def images(slide):
    return [sh for sh in slide.shapes if sh._element.xpath(".//a:blip")]


class TestNettoyerDeck(unittest.TestCase):
    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.source = self.dossier / "source.pptx"
        self.sortie = self.dossier / "sortie.pptx"
        self.ids = construire_deck(self.source)

    def tearDown(self):
        shutil.rmtree(self.dossier, ignore_errors=True)

    def slides(self, chemin):
        return {s.slide_id: s for s in Presentation(chemin).slides}

    def test_vide_photo_et_demande_des_slides_reconnues(self):
        r = deck.nettoyer(self.source, self.sortie, preserver=[self.ids["C"]])
        ids = self.ids
        self.assertEqual(sorted(s["slide_id"] for s in r["nettoyees"]), sorted([ids["A"], ids["D"]]))
        self.assertEqual(r["deja_vides"], [ids["B"]])
        self.assertEqual(r["preservees"], [ids["C"]])
        self.assertEqual(r["non_reconnues"], 1)
        slides = self.slides(self.sortie)
        for cle in ("A", "D"):
            s = slides[ids[cle]]
            self.assertFalse(any(deck._est_photo_semaine(sh, s) for sh in images(s)), cle)
            self.assertEqual(deck._champ_recherche(s).text_frame.text, "")
            # zone photo revenue à l'espace réservé vide de la disposition
            vides = [sh for sh in s.placeholders if sh.placeholder_format.idx == 20]
            self.assertEqual(len(vides), 1)
            self.assertFalse(vides[0]._element.xpath(".//a:blip"))
            self.assertEqual(len(images(s)), 1)  # le logo reste
        membres = {m["slide_id"]: m for m in deck.lister_membres(self.sortie)}
        self.assertEqual({m["nom"] for m in membres.values()}, {"Membre A", "Membre B", "Membre C", "Membre D"})
        self.assertTrue(all(m["metier"] == "Métier test" for m in membres.values()))
        self.assertEqual((membres[ids["A"]]["recherche"], membres[ids["A"]]["a_une_photo"]), ("", False))
        self.assertEqual((membres[ids["C"]]["recherche"], membres[ids["C"]]["a_une_photo"]), ("Demande C", True))
        # slides non reconnues : intactes
        self.assertEqual(len(images(slides[ids["modele"]])), 2)
        self.assertEqual(len(images(slides[ids["autre"]])), 1)

    def test_essai_a_blanc_n_ecrit_rien(self):
        avant = empreinte(self.source)
        r = deck.nettoyer(self.source, self.sortie, essai=True)
        self.assertEqual(sorted(s["slide_id"] for s in r["nettoyees"]),
                         sorted([self.ids["A"], self.ids["C"], self.ids["D"]]))
        self.assertTrue(all(s["photos"] == 1 and s["texte"] for s in r["nettoyees"]))
        self.assertFalse(self.sortie.exists())
        self.assertEqual(empreinte(self.source), avant)

    def test_deuxieme_passage_ne_change_rien(self):
        deck.nettoyer(self.source, self.sortie)
        encore = self.dossier / "encore.pptx"
        r = deck.nettoyer(self.sortie, encore)
        self.assertEqual(r["nettoyees"], [])
        self.assertEqual(len(r["deja_vides"]), 4)
        self.assertFalse(encore.exists())

    def test_slide_nettoyee_reprend_le_depot_suivant(self):
        deck.nettoyer(self.source, self.sortie)
        photo, l, h = deck.preparer_photo(jpeg("purple", (300, 200)))
        final = self.dossier / "final.pptx"
        deck.appliquer(self.sortie, final, [{"slide_id": self.ids["A"], "recherche": "Nouvelle", "photo": photo, "largeur": l, "hauteur": h}])
        [a] = [m for m in deck.lister_membres(final) if m["slide_id"] == self.ids["A"]]
        self.assertEqual((a["recherche"], a["a_une_photo"]), ("Nouvelle", True))


@unittest.skipUnless(DECK_LOCAL.exists(), "deck réel absent (data/ n'est jamais versionné)")
class TestDeckReel(unittest.TestCase):
    """Sur la copie locale du vrai deck : n'affiche aucun nom."""

    def test_nettoyage_garde_noms_metiers_et_autres_formes(self):
        with tempfile.TemporaryDirectory() as dossier:
            sortie = Path(dossier) / "sortie.pptx"
            avant = {m["slide_id"]: m for m in deck.lister_membres(DECK_LOCAL)}
            formes_avant = {s.slide_id: len(s.shapes) for s in Presentation(DECK_LOCAL).slides}
            r = deck.nettoyer(DECK_LOCAL, sortie)
            self.assertTrue(r["nettoyees"])
            apres = {m["slide_id"]: m for m in deck.lister_membres(sortie)}
            self.assertEqual(set(apres), set(avant))
            for i, m in apres.items():
                self.assertEqual((m["nom"], m["metier"]), (avant[i]["nom"], avant[i]["metier"]))
                self.assertEqual((m["recherche"], m["a_une_photo"]), ("", False))
            nettoyees = {s["slide_id"]: s for s in r["nettoyees"]}
            for s in Presentation(sortie).slides:
                if s.slide_id not in nettoyees:
                    self.assertEqual(len(s.shapes), formes_avant[s.slide_id])
                else:
                    # chaque photo retirée est remplacée au plus par un espace réservé vide
                    retirees = nettoyees[s.slide_id]["photos"]
                    self.assertIn(len(s.shapes), (formes_avant[s.slide_id] - retirees, formes_avant[s.slide_id] - retirees + 1))


class TestCreneauEtSauvegardes(unittest.TestCase):
    def test_creneau_samedi_7h_paris(self):
        self.assertTrue(nettoyage.dans_le_creneau(datetime(2026, 11, 21, 7, 0)))
        self.assertTrue(nettoyage.dans_le_creneau(datetime(2026, 11, 21, 14, 30)))
        self.assertFalse(nettoyage.dans_le_creneau(datetime(2026, 11, 21, 6, 59)))  # cron d'hiver trop tôt
        self.assertFalse(nettoyage.dans_le_creneau(datetime(2026, 11, 20, 18, 0)))  # vendredi

    def test_elagage_garde_les_plus_recentes(self):
        noms = [nettoyage.nom_sauvegarde("Support.pptx", j) for j in ("2026-11-02", "2026-11-16", "2026-11-09")]
        noms += ["Support.pptx", "Autre - sauvegarde avant nettoyage 2026-10-01.pptx"]
        self.assertEqual(nettoyage.sauvegardes_a_supprimer(noms, "Support.pptx", garder=2),
                         [nettoyage.nom_sauvegarde("Support.pptx", "2026-11-02")])


class TestPassage(unittest.TestCase):
    """un_passage avec OneDrive simulé : sauvegarde avant envoi, rien en essai."""

    def setUp(self):
        self.dossier = Path(tempfile.mkdtemp())
        self.source = self.dossier / "deck.pptx"
        self.ids = construire_deck(self.source)
        self.appels = []
        source = self.source

        def telecharger(acces, ms, destination):
            shutil.copy(source, destination)
            return "etag-1"

        self.patchs = [
            mock.patch.object(nettoyage, "jeton_microsoft", lambda w, ms: "acces"),
            mock.patch.object(nettoyage, "attendre_calme", lambda a, ms: self.appels.append("calme")),
            mock.patch.object(nettoyage, "telecharger", telecharger),
            mock.patch.object(nettoyage, "sauvegarder", lambda a, ms, etag, jour: self.appels.append(("sauvegarde", etag, jour)) or "copie"),
            mock.patch.object(nettoyage, "envoyer_deck", lambda a, ms, chemin, etag: self.appels.append(("envoi", etag, Path(chemin).exists()))),
        ]
        for p in self.patchs:
            p.start()

    def tearDown(self):
        for p in self.patchs:
            p.stop()
        shutil.rmtree(self.dossier, ignore_errors=True)

    def passage(self, essai, preserver=()):
        with tempfile.TemporaryDirectory() as d:
            return nettoyage.un_passage(None, {}, {"semaine": "2026-11-16", "preserver": list(preserver)}, d, essai)

    def test_sauvegarde_puis_envoi_conditionnel(self):
        r = self.passage(False, preserver=[self.ids["C"]])
        self.assertEqual(self.appels, ["calme", ("sauvegarde", "etag-1", "2026-11-16"), ("envoi", "etag-1", True)])
        self.assertEqual((len(r["nettoyees"]), r["sauvegarde"]), (2, "copie"))

    def test_essai_ni_sauvegarde_ni_envoi(self):
        r = self.passage(True)
        self.assertEqual(self.appels, [])
        self.assertEqual(len(r["nettoyees"]), 3)

    def test_rien_a_effacer_rien_a_envoyer(self):
        propre = self.dossier / "propre.pptx"
        deck.nettoyer(self.source, propre)
        shutil.copy(propre, self.source)
        self.passage(False)
        self.assertEqual(self.appels, ["calme"])


class TestMain(unittest.TestCase):
    def test_hors_creneau_ne_contacte_personne(self):
        with mock.patch.object(nettoyage, "Worker") as w, \
                mock.patch.object(nettoyage, "datetime") as dt:
            dt.now.return_value = datetime(2026, 11, 22, 10, 0)  # dimanche
            self.assertEqual(nettoyage.main([]), 0)
            w.assert_not_called()

    def test_semaine_deja_nettoyee_rien_a_faire(self):
        worker = mock.Mock()
        worker.get.return_value.json.return_value = {"semaine": "2026-11-16", "deja_fait": True}
        with mock.patch.object(nettoyage, "Worker", return_value=worker), \
                mock.patch.object(nettoyage, "datetime") as dt, \
                mock.patch.object(nettoyage, "un_passage") as passage, \
                mock.patch.dict("os.environ", {"WORKER_URL": "http://w", "WASSIM_AUTH_TOKEN": "t"}):
            dt.now.return_value = datetime(2026, 11, 21, 10, 0)
            self.assertEqual(nettoyage.main([]), 0)
            passage.assert_not_called()
            worker.envoyer.assert_not_called()

    def test_deck_verrouille_echec_signale_au_worker(self):
        worker = mock.Mock()
        worker.get.return_value.json.return_value = {
            "semaine": "2026-11-16", "coupure": "2026-11-20 12:00", "deja_fait": False, "preserver": [],
            "ms": {"rclone_token": "x", "item_id": "i", "drive_id": "d"},
        }
        with mock.patch.object(nettoyage, "Worker", return_value=worker), \
                mock.patch.object(nettoyage, "datetime") as dt, \
                mock.patch.object(nettoyage, "un_passage", side_effect=nettoyage.Conflit("envoi : 423")), \
                mock.patch.object(nettoyage, "PAUSE_ESSAI", 0), \
                mock.patch.dict("os.environ", {"WORKER_URL": "http://w", "WASSIM_AUTH_TOKEN": "t"}):
            dt.now.return_value = datetime(2026, 11, 21, 7, 5)
            self.assertEqual(nettoyage.main([]), 1)
            [(methode, chemin, corps)] = [c.args for c in worker.envoyer.call_args_list]
            self.assertEqual((methode, chemin, corps["ok"], corps["semaine"]), ("POST", "/api/job/nettoyage", False, "2026-11-16"))


if __name__ == "__main__":
    unittest.main()
