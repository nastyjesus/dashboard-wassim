"""Job hebdo : applique les dépôts des membres au deck OneDrive.

    WORKER_URL=https://bni-infomerciales.loumiwassim.workers.dev \
    WASSIM_AUTH_TOKEN=... python job.py

1. récupère auprès du worker les dépôts et le jeton Microsoft ;
2. télécharge le deck via Microsoft Graph ;
3. pose photos et textes (deck.py) ;
4. renvoie le deck, seulement s'il n'a pas changé entre-temps (If-Match sur l'eTag) :
   sinon on recommence avec la nouvelle version, pour ne jamais écraser une modif ;
5. renvoie au worker la liste des membres et les dépôts appliqués.

Le dépôt GitHub est public : ce script n'affiche jamais de nom, seulement des compteurs.
"""
import configparser
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import requests

import deck

LOGIN = os.environ.get("MS_LOGIN_URL", "https://login.microsoftonline.com/consumers/oauth2/v2.0")
GRAPH = os.environ.get("MS_GRAPH_URL", "https://graph.microsoft.com/v1.0")
SCOPE = "Files.ReadWrite offline_access"
TRANCHE = 320 * 1024 * 32  # 10 Mio, multiple de 320 Kio exigé par Graph
ESSAIS = 3
PAUSE_ESSAI = int(os.environ.get("PAUSE_ESSAI", "60"))
RCLONE = os.environ.get("RCLONE", "rclone")


class Conflit(Exception):
    """Le deck a changé (412) ou est verrouillé (423) : on recommence."""


class Worker:
    def __init__(self, url, jeton):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers["X-Wassim-Auth"] = jeton

    def get(self, chemin, **kw):
        r = self.s.get(self.url + chemin, timeout=60, **kw)
        r.raise_for_status()
        return r

    def envoyer(self, methode, chemin, data):
        r = self.s.request(methode, self.url + chemin, json=data, timeout=60)
        r.raise_for_status()
        return r.json()


def jeton_via_rclone(worker, ms):
    """rclone (application Microsoft publique, sans inscription Azure) renouvelle
    le jeton ; on garde le jeton à jour côté worker et on utilise son accès."""
    with tempfile.TemporaryDirectory() as dossier:
        conf = Path(dossier) / "rclone.conf"
        conf.write_text(
            "[od]\ntype = onedrive\n"
            f"token = {ms['rclone_token']}\n"
            f"drive_id = {ms['drive_id']}\ndrive_type = {ms.get('drive_type', 'personal')}\n",
            "utf-8",
        )
        r = subprocess.run([RCLONE, "about", "od:", "--config", str(conf)], capture_output=True, text=True, timeout=120)
        if r.returncode != 0:
            # pas de sortie rclone dans les logs : elle peut contenir le jeton
            raise RuntimeError("rclone n'a pas pu se connecter à OneDrive : relancer connexion_microsoft.py")
        lecture = configparser.ConfigParser()
        lecture.read(conf, encoding="utf-8")
        token = lecture["od"]["token"]
    if token != ms["rclone_token"]:
        worker.envoyer("PUT", "/api/job/ms", {"rclone_token": token})
        ms["rclone_token"] = token
    return json.loads(token)["access_token"]


def jeton_microsoft(worker, ms):
    if ms.get("rclone_token"):
        return jeton_via_rclone(worker, ms)
    r = requests.post(f"{LOGIN}/token", data={
        "client_id": ms["client_id"],
        "grant_type": "refresh_token",
        "refresh_token": ms["refresh_token"],
        "scope": SCOPE,
    }, timeout=60)
    if r.status_code != 200:
        raise RuntimeError(f"Connexion Microsoft refusée ({r.status_code}) : relancer connexion_microsoft.py")
    t = r.json()
    if t.get("refresh_token"):
        # Microsoft renouvelle le jeton à chaque usage : on garde le plus récent
        worker.envoyer("PUT", "/api/job/ms", {"refresh_token": t["refresh_token"]})
    return t["access_token"]


def element(ms):
    return f"{GRAPH}/drives/{ms['drive_id']}/items/{ms['item_id']}"


def telecharger(acces, ms, destination):
    h = {"Authorization": f"Bearer {acces}"}
    meta = requests.get(element(ms), headers=h, params={"$select": "id,eTag,size"}, timeout=60)
    meta.raise_for_status()
    etag = meta.json()["eTag"]
    with requests.get(element(ms) + "/content", headers=h, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(destination, "wb") as f:
            for bloc in r.iter_content(1024 * 1024):
                f.write(bloc)
    return etag


def envoyer_deck(acces, ms, chemin, etag):
    r = requests.post(element(ms) + "/createUploadSession", headers={
        "Authorization": f"Bearer {acces}", "If-Match": etag,
    }, json={"item": {"@microsoft.graph.conflictBehavior": "replace"}}, timeout=60)
    if r.status_code in (409, 412, 423):
        raise Conflit(f"création de session : {r.status_code}")
    r.raise_for_status()
    url = r.json()["uploadUrl"]
    taille = Path(chemin).stat().st_size
    with open(chemin, "rb") as f:
        debut = 0
        while debut < taille:
            bloc = f.read(TRANCHE)
            fin = debut + len(bloc) - 1
            # l'URL de session est pré-authentifiée : pas d'en-tête Authorization
            r = requests.put(url, data=bloc, headers={
                "Content-Length": str(len(bloc)), "Content-Range": f"bytes {debut}-{fin}/{taille}",
            }, timeout=600)
            if r.status_code in (409, 412, 423):
                requests.delete(url, timeout=60)
                raise Conflit(f"envoi : {r.status_code}")
            r.raise_for_status()
            debut = fin + 1


def preparer_depots(worker, depots):
    prets = []
    for d in depots:
        photo = None
        if d.get("a_photo"):
            r = worker.s.get(f"{worker.url}/api/job/photo/{d['slide_id']}", timeout=60)
            if r.status_code == 200:
                photo = r.content
        if photo:
            photo, l, h = deck.preparer_photo(photo)
            prets.append({**d, "photo": photo, "largeur": l, "hauteur": h})
        else:
            prets.append({**d, "photo": None})
    return prets


def un_passage(worker, ms, depots, dossier):
    acces = jeton_microsoft(worker, ms)
    source = Path(dossier) / "source.pptx"
    etag = telecharger(acces, ms, source)
    membres = deck.lister_membres(source)
    ids_deck = {m["slide_id"] for m in membres}
    # dépôt d'une slide disparue du deck : on le marque traité pour le purger
    orphelins = [d for d in depots if d["slide_id"] not in ids_deck]
    a_faire = [d for d in depots if d["slide_id"] in ids_deck and (d.get("photo") or d.get("recherche"))]
    if not a_faire:
        return membres, orphelins, 0
    sortie = Path(dossier) / "sortie.pptx"
    faits = set(deck.appliquer(source, sortie, a_faire))
    envoyer_deck(acces, ms, sortie, etag)
    return deck.lister_membres(sortie), orphelins + [d for d in a_faire if d["slide_id"] in faits], len(faits)


def main():
    worker = Worker(os.environ["WORKER_URL"], os.environ["WASSIM_AUTH_TOKEN"])
    entree = worker.get("/api/job/entree").json()
    ms = entree.get("ms")
    if not ms or not (ms.get("refresh_token") or ms.get("rclone_token")) or not ms.get("item_id"):
        print("OneDrive non connecté : lancer connexion_microsoft.py une fois.")
        return 1
    depots = preparer_depots(worker, entree["depots"])
    print(f"{len(depots)} dépôt(s) à traiter.")
    erreur = None
    for essai in range(1, ESSAIS + 1):
        try:
            with tempfile.TemporaryDirectory() as dossier:
                membres, appliques, nb = un_passage(worker, ms, depots, dossier)
            worker.envoyer("POST", "/api/job/resultat", {
                "ok": True,
                "message": f"{nb} slide(s) mise(s) à jour" if nb else "aucun dépôt, liste des membres synchronisée",
                "membres": membres,
                "appliques": [{"slide_id": d["slide_id"], "date": d["date"]} for d in appliques],
            })
            print(f"OK : {nb} slide(s) mise(s) à jour, {len(membres)} membre(s) dans le deck.")
            return 0
        except Conflit as e:
            erreur = f"deck modifié ou ouvert pendant la mise à jour ({e})"
            print(f"Essai {essai}/{ESSAIS} : {erreur}")
            if essai < ESSAIS:
                time.sleep(PAUSE_ESSAI)
            ms = worker.get("/api/job/entree").json()["ms"]  # jeton renouvelé entre-temps
        except requests.HTTPError as e:
            # pas d'URL dans le message : elle contient les identifiants OneDrive
            erreur = f"HTTP {e.response.status_code} sur {e.response.request.method}"
            break
        except Exception as e:
            erreur = f"{type(e).__name__} : {e}"
            break
    worker.envoyer("POST", "/api/job/resultat", {"ok": False, "message": f"échec : {erreur}"[:300]})
    print(f"ÉCHEC : {erreur}")
    return 1


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    sys.exit(main())
