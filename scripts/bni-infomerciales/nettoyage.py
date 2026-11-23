"""Nettoyage hebdo : vide les slides membres après la réunion du vendredi.

    python job.py nettoyage            créneau automatique (samedi, à partir de 07:00 Paris)
    python job.py nettoyage --essai    essai à blanc : liste ce qui serait effacé, n'écrit rien
    python job.py nettoyage --forcer   hors créneau, et même si la semaine est déjà nettoyée

Pour chaque slide membre reconnue (deck.nettoyer) : retire la photo de la
semaine et vide le bandeau « Qui peut m'aider à rencontrer », pour qu'une
infomerciale ne réapparaisse pas la semaine suivante si le membre n'en
renvoie pas. Les slides où un dépôt de la nouvelle semaine est déjà posé
(plan du worker : « preserver ») ne sont pas touchées. Les slides de la
conférence de la réunion passée (posées par conference.py) sont retirées ;
celles d'une réunion à venir restent (plan : « conference_jusqu_au »).
Idem pour les slides « Réseaux sociaux » (reseaux.py, plan :
« reseaux_jusqu_au »), plus un retrait unique de slides posées à la main
(plan : « reseaux_retrait_unique », appliqué seulement le reseaux.RETRAIT_UNIQUE_JOUR,
date de Paris ; l'essai à blanc l'affiche quel que soit le jour) :
une slide qui ne passe pas les garde-fous reste, et le rapport le dit.

Sûreté :
- copie datée du deck à côté de l'original (copie côté OneDrive, sans
  transfert), les SAUVEGARDES_GARDEES plus récentes sont conservées ; si la
  copie est impossible, on ne continue que si l'historique des versions
  OneDrive répond (la version d'avant l'envoi y reste restaurable) ;
- envoi seulement si le deck n'a pas changé depuis le téléchargement
  (If-Match), sinon nouvel essai ; deck ouvert/verrouillé (409/423) : essais
  espacés, puis créneaux de rattrapage du samedi ;
- idempotent : le worker mémorise la semaine nettoyée, les créneaux suivants
  ne font rien.

Dépôt public : n'affiche que des compteurs et des numéros de slide.
"""
import os
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

import requests

import deck
import reseaux
from job import (ESSAIS, GRAPH, PAUSE_ESSAI, Conflit, Worker, attendre_calme, element, envoyer_deck,
                 jeton_microsoft, metadonnees, telecharger)

PARIS = ZoneInfo("Europe/Paris")
JOUR_NETTOYAGE = 5  # samedi (lundi = 0)
HEURE_MIN = 7  # les crons UTC tombent à 06:00 ou 07:00 Paris selon l'heure d'été
SAUVEGARDES_GARDEES = 2  # le deck pèse plusieurs centaines de Mo
SUFFIXE_SAUVEGARDE = " - sauvegarde avant nettoyage "
ATTENTE_COPIE = 20 * 60
COPIE_DATEE = False  # copie datée désactivée : refusée par OneDrive perso (voir sauvegarder)


def dans_le_creneau(maintenant):
    """Samedi, à partir de 07:00 heure de Paris (maintenant : datetime de Paris)."""
    return maintenant.weekday() == JOUR_NETTOYAGE and maintenant.hour >= HEURE_MIN


def nom_sauvegarde(nom_deck, jour):
    base = nom_deck[:-5] if nom_deck.lower().endswith(".pptx") else nom_deck
    return f"{base}{SUFFIXE_SAUVEGARDE}{jour}.pptx"


def sauvegardes_a_supprimer(noms, nom_deck, garder=SAUVEGARDES_GARDEES):
    """Anciennes copies de ce deck, au-delà des `garder` plus récentes (date dans le nom)."""
    prefixe = nom_sauvegarde(nom_deck, "")[: -len(".pptx")]
    copies = sorted((n for n in noms if n.startswith(prefixe) and n.lower().endswith(".pptx")), reverse=True)
    return copies[garder:]


def _h(acces):
    return {"Authorization": f"Bearer {acces}"}


def sauvegarder(acces, ms, etag, jour):
    """Copie datée du deck dans son dossier (copie faite par OneDrive). Renvoie
    un libellé pour le rapport. Lève RuntimeError si aucune sauvegarde n'est sûre."""
    if not COPIE_DATEE:
        # OneDrive perso refuse la copie du deck par l'API (notSupported /
        # quotaLimitReached, constaté le 22/11/2026) : on s'appuie sur
        # l'historique des versions, vérifié avant chaque nettoyage.
        r = requests.get(element(ms) + "/versions", headers=_h(acces), params={"$top": "1"}, timeout=60)
        if r.status_code == 200:
            return "historique des versions OneDrive"
        raise RuntimeError(f"aucune sauvegarde possible (historique des versions : {r.status_code})")
    try:
        r = requests.get(element(ms), headers=_h(acces), params={"$select": "name,eTag,parentReference"}, timeout=60)
        r.raise_for_status()
        meta = r.json()
        if meta["eTag"] != etag:
            raise Conflit("deck modifié avant la sauvegarde")
        parent = meta["parentReference"]
        nom = nom_sauvegarde(meta["name"], jour)
        r = requests.post(element(ms) + "/copy", headers=_h(acces),
                          params={"@microsoft.graph.conflictBehavior": "replace"},
                          json={"parentReference": {"driveId": parent["driveId"], "id": parent["id"]}, "name": nom},
                          timeout=60)
        if r.status_code != 202:
            raise RuntimeError(f"copie refusée ({r.status_code})")
        suivi, debut = r.headers["Location"], time.time()
        while True:
            # URL de suivi pré-authentifiée : pas d'en-tête Authorization
            s = requests.get(suivi, timeout=60, allow_redirects=False)
            statut = s.json().get("status") if s.headers.get("Content-Type", "").startswith("application/json") else None
            if s.status_code == 303 or statut == "completed":
                break
            if statut == "failed":
                raise RuntimeError("copie échouée côté OneDrive")
            if time.time() - debut > ATTENTE_COPIE:
                raise RuntimeError("copie trop longue")
            time.sleep(10)
        if metadonnees(acces, ms)["eTag"] != etag:
            raise Conflit("deck modifié pendant la sauvegarde")
        _elaguer(acces, parent, meta["name"])
        return f"copie datée {jour} à côté du deck"
    except Conflit:
        raise
    except Exception as e:  # noqa: BLE001 — on tente le repli sur l'historique
        motif = f"{type(e).__name__}" + (f" : {e}" if isinstance(e, RuntimeError) else "")
    r = requests.get(element(ms) + "/versions", headers=_h(acces), params={"$top": "1"}, timeout=60)
    if r.status_code == 200:
        print(f"Copie impossible ({motif}) : on s'appuie sur l'historique des versions OneDrive.")
        return "historique des versions OneDrive (copie impossible)"
    raise RuntimeError(f"aucune sauvegarde possible (copie : {motif} ; versions : {r.status_code})")


def _elaguer(acces, parent, nom_deck):
    """Supprime (corbeille OneDrive) les copies plus anciennes que les SAUVEGARDES_GARDEES dernières."""
    try:
        r = requests.get(f"{GRAPH}/drives/{parent['driveId']}/items/{parent['id']}/children",
                         headers=_h(acces), params={"$select": "id,name", "$top": "999"}, timeout=60)
        r.raise_for_status()
        enfants = r.json().get("value", [])
        a_supprimer = set(sauvegardes_a_supprimer([e["name"] for e in enfants], nom_deck))
        for e in enfants:
            if e["name"] in a_supprimer:
                requests.delete(f"{GRAPH}/drives/{parent['driveId']}/items/{e['id']}", headers=_h(acces), timeout=60)
        if a_supprimer:
            print(f"{len(a_supprimer)} ancienne(s) copie(s) mise(s) à la corbeille OneDrive.")
    except Exception as e:  # noqa: BLE001 — l'élagage ne doit pas bloquer le nettoyage
        print(f"Élagage des anciennes copies ignoré ({type(e).__name__}).")


def un_passage(worker, ms, plan, dossier, essai):
    acces = jeton_microsoft(worker, ms)
    if not essai:
        attendre_calme(acces, ms)
    source = Path(dossier) / "source.pptx"
    etag = telecharger(acces, ms, source)
    sortie = Path(dossier) / "sortie.pptx"
    rapport = deck.nettoyer(source, sortie, preserver=plan.get("preserver", []), essai=essai,
                            conference_jusqu_au=plan.get("conference_jusqu_au"),
                            reseaux_jusqu_au=plan.get("reseaux_jusqu_au"),
                            reseaux_retrait_unique=plan.get("reseaux_retrait_unique") or [])
    rapport["sauvegarde"] = ""
    if (rapport["nettoyees"] or rapport["conference"] or rapport["reseaux"]) and not essai:
        rapport["sauvegarde"] = sauvegarder(acces, ms, etag, plan["semaine"])
        envoyer_deck(acces, ms, sortie, etag)
    return rapport


def resume(rapport):
    return (f"{len(rapport['nettoyees'])} slide(s) vidée(s), {len(rapport['deja_vides'])} déjà vide(s), "
            f"{len(rapport['preservees'])} gardée(s), {rapport['non_reconnues']} non reconnue(s) laissée(s), "
            f"{rapport['conference']} slide(s) de conférence retirée(s), "
            f"{rapport.get('reseaux', 0)} slide(s) réseaux sociaux retirée(s)"
            + (f", {len(rapport['reseaux_laissees'])} slide(s) du retrait unique laissée(s) "
               f"({', '.join(str(l['slide_id']) + ' : ' + l['motif'] for l in rapport['reseaux_laissees'])})"
               if rapport.get("reseaux_laissees") else ""))


def main(args):
    essai, forcer = "--essai" in args, "--forcer" in args
    maintenant = datetime.now(PARIS)
    if not (essai or forcer or dans_le_creneau(maintenant)):
        print(f"Hors créneau ({maintenant:%A %H:%M} à Paris) : le nettoyage tourne le samedi à partir de {HEURE_MIN}h.")
        return 0
    worker = Worker(os.environ["WORKER_URL"], os.environ["WASSIM_AUTH_TOKEN"])
    plan = worker.get("/api/job/nettoyage").json()
    if plan.get("deja_fait") and not (essai or forcer):
        print(f"Semaine du {plan['semaine']} déjà nettoyée : rien à faire.")
        return 0
    ms = plan.get("ms")
    if not ms or not (ms.get("refresh_token") or ms.get("rclone_token")) or not ms.get("item_id"):
        print("OneDrive non connecté : lancer connexion_microsoft.py une fois.")
        return 1
    if plan.get("reseaux_retrait_unique") and not essai and maintenant.date().isoformat() != reseaux.RETRAIT_UNIQUE_JOUR:
        print(f"Retrait unique des slides réseaux sociaux ignoré : seulement le {reseaux.RETRAIT_UNIQUE_JOUR}.")
        plan["reseaux_retrait_unique"] = []
    print(f"Nettoyage de la semaine du {plan['semaine']} (coupure {plan['coupure']}, heure de Paris)"
          + (" — ESSAI À BLANC, rien ne sera écrit." if essai else "."))
    erreur = None
    for n in range(1, ESSAIS + 1):
        try:
            with tempfile.TemporaryDirectory() as dossier:
                rapport = un_passage(worker, ms, plan, dossier, essai)
            for s in rapport["nettoyees"]:
                quoi = " + ".join(filter(None, [f"{s['photos']} photo(s)" if s["photos"] else "", "demande" if s["texte"] else ""]))
                print(f"  slide {s['numero']} : {quoi}" + (" serai(en)t effacée(s)" if essai else " effacée(s)"))
            for s in rapport["reseaux_retirees"]:
                print(f"  slide {s['numero']} (id {s['slide_id']}, réseaux sociaux, {s['quoi']})"
                      + (" serait retirée" if essai else " retirée"))
            for s in rapport["reseaux_laissees"]:
                print(f"  slide id {s['slide_id']} du retrait unique laissée : {s['motif']}")
            print(("Essai : " if essai else "OK : ") + resume(rapport) + ".")
            if essai:
                return 0
            worker.envoyer("POST", "/api/job/nettoyage", {
                "ok": True, "semaine": plan["semaine"], "message": resume(rapport),
                "nettoyees": rapport["nettoyees"], "deja_vides": rapport["deja_vides"],
                "preservees": rapport["preservees"], "non_reconnues": rapport["non_reconnues"],
                "conference": rapport["conference"],
                "reseaux": rapport["reseaux"],
                "sauvegarde": rapport["sauvegarde"],
            })
            return 0
        except Conflit as e:
            erreur = f"deck ouvert ou modifié pendant le nettoyage ({e})"
            print(f"Essai {n}/{ESSAIS} : {erreur}")
            if n < ESSAIS:
                time.sleep(PAUSE_ESSAI)
            ms = worker.get("/api/job/nettoyage").json()["ms"]  # jeton renouvelé entre-temps
        except requests.HTTPError as e:
            # pas d'URL dans le message : elle contient les identifiants OneDrive
            erreur = f"HTTP {e.response.status_code} sur {e.response.request.method}"
            break
        except Exception as e:  # noqa: BLE001
            # message seulement pour nos erreurs : celles de requests citent l'URL OneDrive
            erreur = f"{type(e).__name__} : {e}" if isinstance(e, RuntimeError) else type(e).__name__
            break
    if not essai:
        worker.envoyer("POST", "/api/job/nettoyage", {"ok": False, "semaine": plan["semaine"], "message": f"échec : {erreur}"[:300]})
    print(f"ÉCHEC : {erreur} (le créneau suivant réessaiera)")
    return 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    sys.exit(main(sys.argv[1:]))
