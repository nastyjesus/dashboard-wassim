"""Tests du ciblage des slides : python -m unittest test_job"""
import unittest

from job import recibler

ANCIENS = [
    {"slide_id": 1, "nom": "Wassim LOUMI"},
    {"slide_id": 2, "nom": "Céline GUIHO"},
    {"slide_id": 3, "nom": "Paul JUHEL"},
]


def depot(slide_id):
    return {"slide_id": slide_id, "date": "d", "recherche": "x"}


class TestRecibler(unittest.TestCase):
    def test_slide_deplacee_suivie_par_identifiant(self):
        # des slides ont été ajoutées avant : la position change, pas l'identifiant
        deck = [{"slide_id": 9, "nom": "Nouveau"}, {"slide_id": 3, "nom": "Paul JUHEL"}, {"slide_id": 1, "nom": "Wassim LOUMI"}]
        [d] = recibler([depot(1)], ANCIENS, deck)
        self.assertEqual(d["cible"], 1)

    def test_slide_recreee_retrouvee_par_nom(self):
        deck = [{"slide_id": 77, "nom": "Celine  Guiho"}, {"slide_id": 1, "nom": "Wassim LOUMI"}]
        [d] = recibler([depot(2)], ANCIENS, deck)
        self.assertEqual((d["cible"], d["slide_id"]), (77, 2))

    def test_homonymes_pas_de_devinette(self):
        deck = [{"slide_id": 77, "nom": "Paul JUHEL"}, {"slide_id": 78, "nom": "Paul Juhel"}]
        [d] = recibler([depot(3)], ANCIENS, deck)
        self.assertIsNone(d["cible"])

    def test_membre_sorti_du_deck(self):
        [d] = recibler([depot(2)], ANCIENS, [{"slide_id": 1, "nom": "Wassim LOUMI"}])
        self.assertIsNone(d["cible"])


if __name__ == "__main__":
    unittest.main()
