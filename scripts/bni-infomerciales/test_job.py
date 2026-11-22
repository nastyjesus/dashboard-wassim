"""Tests du job (sans réseau) : python -m unittest test_job"""
import datetime as dt
import unittest
from unittest import mock

import requests

import job
from job import creneau_a_lancer, creneau_du, recibler

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


def utc(*args):
    return dt.datetime(*args, tzinfo=dt.timezone.utc)


class TestCreneaux(unittest.TestCase):
    # 25/11/2026 et 01/07/2026 sont des mercredis
    def test_hiver_utc_plus_1(self):
        self.assertIsNone(creneau_du(utc(2026, 11, 25, 17, 5)))  # 18:05 à Paris : trop tôt
        self.assertEqual(creneau_du(utc(2026, 11, 25, 18, 5)), "2026-11-25 mercredi soir")
        self.assertEqual(creneau_du(utc(2026, 11, 26, 11, 0)), "2026-11-26 jeudi midi")

    def test_ete_utc_plus_2(self):
        self.assertEqual(creneau_du(utc(2026, 7, 1, 17, 5)), "2026-07-01 mercredi soir")
        self.assertEqual(creneau_du(utc(2026, 7, 2, 10, 0)), "2026-07-02 jeudi midi")

    def test_jeudi_avant_midi_rattrape_le_mercredi(self):
        # 10:00 UTC l'hiver = 11:00 à Paris : le créneau courant est encore mercredi soir
        self.assertEqual(creneau_du(utc(2026, 11, 26, 10, 0)), "2026-11-25 mercredi soir")

    def test_trop_tard(self):
        self.assertIsNone(creneau_du(utc(2026, 11, 28, 12, 0)))  # samedi

    def test_creneau_deja_fait(self):
        cron, t = "5 19 * * 3", utc(2026, 11, 25, 19, 5)
        fait = [{"ok": True, "creneau": "2026-11-25 mercredi soir"}]
        rate = [{"ok": False, "creneau": "2026-11-25 mercredi soir"}]
        self.assertIsNone(creneau_a_lancer(cron, fait, t))
        self.assertEqual(creneau_a_lancer(cron, rate, t), "2026-11-25 mercredi soir")
        self.assertEqual(creneau_a_lancer(cron, [], t), "2026-11-25 mercredi soir")


MS = {"rclone_token": "x", "drive_id": "d", "item_id": "i"}
DECK = [{"slide_id": 1, "nom": "Wassim LOUMI"}, {"slide_id": 2, "nom": "Céline GUIHO"}]


class FauxWorker:
    """Simule le worker : efface les dépôts appliqués, comme le vrai."""

    def __init__(self, depots, passages=None):
        self.depots = list(depots)
        self.passages = list(passages or [])
        self.resultats = []

    def get(self, chemin, **kw):
        assert chemin == "/api/job/entree"
        corps = {"ms": dict(MS), "depots": list(self.depots), "membres": DECK, "passages": list(self.passages)}
        return mock.Mock(json=lambda: corps)

    def envoyer(self, methode, chemin, data):
        assert (methode, chemin) == ("POST", "/api/job/resultat")
        self.resultats.append(data)
        faits = {(a["slide_id"], a["date"]) for a in data.get("appliques", [])}
        self.depots = [d for d in self.depots if (d["slide_id"], d["date"]) not in faits]
        self.passages.insert(0, {"ok": data["ok"], "creneau": data.get("creneau"), "source": data.get("source")})
        return {}


def depot_texte(slide_id, date):
    return {"slide_id": slide_id, "date": date, "recherche": f"demande {slide_id}"}


class TestMain(unittest.TestCase):
    def setUp(self):
        self.appliquer = mock.Mock(side_effect=lambda src, dst, depots: [d["slide_id"] for d in depots])
        self.envoi = mock.Mock()
        self.telechargements = 0
        self.pannes = []
        rustines = [
            mock.patch.object(job, "jeton_microsoft", return_value="acces"),
            mock.patch.object(job, "attendre_calme", return_value="e"),
            mock.patch.object(job, "telecharger", side_effect=self.telecharger),
            mock.patch.object(job, "envoyer_deck", self.envoi),
            mock.patch.object(job.deck, "lister_membres", return_value=DECK),
            mock.patch.object(job.deck, "appliquer", self.appliquer),
            mock.patch.object(job.time, "sleep"),
            mock.patch("builtins.print"),
        ]
        for r in rustines:
            r.start()
            self.addCleanup(r.stop)

    def telecharger(self, acces, ms, destination):
        self.telechargements += 1
        if self.pannes:
            raise self.pannes.pop(0)
        return "etag"

    def lancer(self, worker, cron="", quand=None):
        return job.main(worker, quand or utc(2026, 11, 25, 18, 5), {"CRON": cron})

    def test_programme_trop_tot_ne_fait_rien(self):
        w = FauxWorker([depot_texte(1, "a")])
        self.assertEqual(self.lancer(w, "5 17 * * 3", utc(2026, 11, 25, 17, 5)), 0)
        self.assertEqual((self.telechargements, w.resultats), (0, []))

    def test_programme_deja_fait_ne_fait_rien(self):
        w = FauxWorker([depot_texte(1, "a")], [{"ok": True, "creneau": "2026-11-25 mercredi soir", "source": "job"}])
        self.assertEqual(self.lancer(w, "5 19 * * 3", utc(2026, 11, 25, 19, 5)), 0)
        self.assertEqual(w.resultats, [])

    def test_lancement_manuel_sans_garde(self):
        w = FauxWorker([depot_texte(1, "a")], [{"ok": True, "creneau": "2026-11-25 mercredi soir", "source": "job"}])
        self.assertEqual(self.lancer(w, ""), 0)
        self.assertIsNone(w.resultats[0]["creneau"])
        self.assertTrue(w.resultats[0]["ok"])

    def test_cron_autre_tache_non_filtre(self):
        w = FauxWorker([])
        self.assertEqual(self.lancer(w, "0 9 * * 6", utc(2026, 11, 28, 9, 0)), 0)
        self.assertEqual(len(w.resultats), 1)

    def test_coupure_reseau_puis_succes(self):
        self.pannes = [requests.exceptions.ChunkedEncodingError("coupure")]
        w = FauxWorker([depot_texte(1, "a")])
        self.assertEqual(self.lancer(w, "5 18 * * 3"), 0)
        self.assertEqual(self.telechargements, 2)
        [r] = w.resultats
        self.assertEqual((r["ok"], r["source"], r["creneau"]), (True, "job", "2026-11-25 mercredi soir"))
        self.assertEqual(r["appliques"], [{"slide_id": 1, "date": "a", "orphelin": False}])
        # le cron de rattrapage suivant voit le succès et ne refait rien
        self.assertEqual(self.lancer(w, "5 19 * * 3", utc(2026, 11, 25, 19, 5)), 0)
        self.assertEqual(len(w.resultats), 1)

    def test_echec_total_signale(self):
        self.pannes = [requests.ConnectionError("hors ligne")] * job.ESSAIS
        w = FauxWorker([depot_texte(1, "a")])
        self.assertEqual(self.lancer(w, "5 18 * * 3"), 1)
        [r] = w.resultats
        self.assertEqual((r["ok"], r["creneau"]), (False, "2026-11-25 mercredi soir"))
        self.assertIn("réseau", r["message"])
        self.assertEqual(len(w.depots), 1)  # gardé pour le passage suivant
        # le rattrapage repasse puisque le créneau a échoué
        self.assertEqual(self.lancer(w, "5 19 * * 3", utc(2026, 11, 25, 19, 5)), 0)
        self.assertTrue(w.resultats[-1]["ok"])

    def test_erreur_non_transitoire_sans_reessai(self):
        self.pannes = [ValueError("deck illisible")]
        w = FauxWorker([depot_texte(1, "a")])
        self.assertEqual(self.lancer(w), 1)
        self.assertEqual(self.telechargements, 1)
        self.assertFalse(w.resultats[0]["ok"])

    def test_aucun_depot_pas_d_envoi(self):
        w = FauxWorker([])
        self.assertEqual(self.lancer(w, "5 18 * * 3"), 0)
        self.envoi.assert_not_called()
        self.appliquer.assert_not_called()
        self.assertTrue(w.resultats[0]["ok"])

    def test_jeudi_ne_repose_que_les_nouveaux_depots(self):
        w = FauxWorker([depot_texte(1, "a")])
        self.assertEqual(self.lancer(w, "5 18 * * 3"), 0)
        w.depots.append(depot_texte(2, "b"))  # retardataire, après le mercredi soir
        self.assertEqual(self.lancer(w, "0 11 * * 4", utc(2026, 11, 26, 11, 0)), 0)
        self.assertEqual(w.resultats[-1]["creneau"], "2026-11-26 jeudi midi")
        deuxieme = self.appliquer.call_args_list[-1].args[2]
        self.assertEqual([d["slide_id"] for d in deuxieme], [2])


class TestTransitoire(unittest.TestCase):
    def http(self, code):
        r = requests.Response()
        r.status_code = code
        return requests.HTTPError(response=r)

    def test_classement(self):
        self.assertTrue(job.est_transitoire(requests.Timeout()))
        self.assertTrue(job.est_transitoire(requests.exceptions.ChunkedEncodingError()))
        self.assertTrue(job.est_transitoire(self.http(503)))
        self.assertTrue(job.est_transitoire(self.http(429)))
        self.assertFalse(job.est_transitoire(self.http(401)))
        self.assertFalse(job.est_transitoire(KeyError("x")))


if __name__ == "__main__":
    unittest.main()
