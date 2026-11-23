"""Job hebdo : applique les dépôts des membres au deck OneDrive.

    WORKER_URL=https://bni-infomerciales.loumiwassim.workers.dev \
    WASSIM_AUTH_TOKEN=... python job.py

1. récupère auprès du worker les dépôts et le jeton Microsoft ;
2. télécharge le deck via Microsoft Graph ;
3. pose photos et textes (deck.py) ;
4. renvoie le deck, seulement s'il n'a pas changé entre-temps (If-Match sur l'eTag) :
   sinon on recommence avec la nouvelle version, pour ne jamais écraser une modif ;
5. renvoie au worker la liste des membres et les dépôts appliqués.

Deux passages programmés par semaine (heure de Paris) : mercredi soir après la
limite de 19h, puis jeudi midi pour les retardataires. Le second ne repose que
les dépôts arrivés depuis : le worker efface ceux déjà appliqués.

Conférence de la semaine (conference.py) : aux mêmes passages, les slides
déposées par le conférencier sont insérées dans la partie « Conférence » du
deck. Une conférence impossible à poser (fichier illisible…) n'empêche pas la
pose des infomerciales : l'erreur est remontée à l'admin.

Réseaux sociaux de la semaine (reseaux.py) : aux mêmes passages, après les
infomerciales et la conférence, les fichiers déposés par le responsable
réseaux sociaux sont posés juste après la slide repère « RÉSEAUX SOCIAUX ».
Une erreur ici ne bloque ni les infomerciales ni la conférence.

Le dépôt GitHub est public : ce script n'affiche jamais de nom, seulement des compteurs.

`python job.py nettoyage [--essai] [--forcer]` : nettoyage du samedi (nettoyage.py).
"""
import configparser
import datetime as dt
import json
import os
import subprocess
import sys
import tempfile
import time
import unicodedata
from pathlib import Path
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import conference
import deck
import reseaux

LOGIN = os.environ.get("MS_LOGIN_URL", "https://login.microsoftonline.com/consumers/oauth2/v2.0")
GRAPH = os.environ.get("MS_GRAPH_URL", "https://graph.microsoft.com/v1.0")
SCOPE = "Files.ReadWrite offline_access"
TRANCHE = 320 * 1024 * 32  # 10 Mio, multiple de 320 Kio exigé par Graph
ESSAIS = 5
PAUSE_ESSAI = int(os.environ.get("PAUSE_ESSAI", "180"))  # un verrou (423) dure tant que le deck est ouvert
CALME = int(os.environ.get("CALME", "120"))  # secondes sans modification avant d'écrire
SONDAGE = int(os.environ.get("SONDAGE", "20"))
ATTENTE_MAX = int(os.environ.get("ATTENTE_MAX", str(20 * 60)))
PAUSE_RESEAU = int(os.environ.get("PAUSE_RESEAU", "60"))  # × n° d'essai : 1, 2, 3, 4 min
RCLONE = os.environ.get("RCLONE", "rclone")

# ---------- créneaux de publication (heure de Paris) ----------
PARIS = ZoneInfo("Europe/Paris")
# (jour ISO, heure, minute, nom) : mercredi = 3, jeudi = 4
CRENEAUX = [(3, 19, 0, "mercredi soir"), (4, 12, 0, "jeudi midi")]
# Un passage retardé (cron GitHub en retard, échec) reste dû pendant ce délai.
RATTRAPAGE = dt.timedelta(hours=18)
# Crons UTC du workflow qui publient le deck, doublés pour l'heure d'été et
# d'hiver, plus une heure de rattrapage ; un cron hors de cette liste (autre
# tâche du même workflow) n'est pas filtré ici.
CRONS_PUBLICATION = {
    "5 17 * * 3", "5 18 * * 3", "5 19 * * 3",
    "0 10 * * 4", "0 11 * * 4", "0 12 * * 4",
}


def creneau_du(maintenant):
    """Dernier créneau de publication commencé depuis moins de RATTRAPAGE,
    ou None. Identifiant stable : « AAAA-MM-JJ <nom> » (date de Paris)."""
    ici = maintenant.astimezone(PARIS)
    meilleur = None
    for recul in range(8):
        jour = (ici - dt.timedelta(days=recul)).date()
        for iso, h, mi, nom in CRENEAUX:
            if jour.isoweekday() != iso:
                continue
            debut = dt.datetime(jour.year, jour.month, jour.day, h, mi, tzinfo=PARIS)
            if debut <= ici and (meilleur is None or debut > meilleur[0]):
                meilleur = (debut, f"{jour.isoformat()} {nom}")
    if meilleur and ici - meilleur[0] < RATTRAPAGE:
        return meilleur[1]
    return None


def creneau_a_lancer(cron, passages, maintenant):
    """Pour un lancement programmé : le créneau à publier, ou None s'il n'y a
    rien à faire (pas encore l'heure à Paris, ou passage déjà réussi).
    Chaque créneau a plusieurs crons (été, hiver, rattrapage) : le premier
    qui tombe après l'heure de Paris publie, les suivants voient qu'il a réussi."""
    creneau = creneau_du(maintenant)
    if creneau is None:
        return None
    if any(p.get("ok") and p.get("creneau") == creneau for p in passages or []):
        return None
    return creneau


class Conflit(Exception):
    """Le deck a changé (412) ou est verrouillé (423) : on recommence."""


class Transitoire(Exception):
    """Coupure réseau ou erreur serveur passagère : on recommence plus tard."""


def est_transitoire(e):
    if isinstance(e, Transitoire):
        return True
    if isinstance(e, (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError)):
        return True
    if isinstance(e, requests.HTTPError) and e.response is not None:
        return e.response.status_code == 429 or e.response.status_code >= 500
    return False


class Worker:
    def __init__(self, url, jeton):
        self.url = url.rstrip("/")
        self.s = requests.Session()
        self.s.headers["X-Wassim-Auth"] = jeton
        # un worker lent ponctuellement ne doit pas faire planter le job :
        # toutes nos routes sont rejouables sans effet de bord
        reessai = Retry(total=4, backoff_factor=5, allowed_methods=None, status_forcelist=[500, 502, 503, 504])
        self.s.mount("https://", HTTPAdapter(max_retries=reessai))
        self.s.mount("http://", HTTPAdapter(max_retries=reessai))

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


def metadonnees(acces, ms):
    r = requests.get(element(ms), headers={"Authorization": f"Bearer {acces}"},
                     params={"$select": "id,eTag,size"}, timeout=60)
    r.raise_for_status()
    return r.json()


def attendre_calme(acces, ms):
    """Attend que personne ne modifie le deck (eTag stable pendant CALME secondes) :
    tant que des membres l'éditent en ligne, notre envoi serait refusé."""
    debut = time.time()
    etag, depuis = metadonnees(acces, ms)["eTag"], time.time()
    while time.time() - depuis < CALME:
        if time.time() - debut > ATTENTE_MAX:
            raise Conflit("deck modifié en continu, pas de moment calme")
        time.sleep(SONDAGE)
        actuel = metadonnees(acces, ms)["eTag"]
        if actuel != etag:
            etag, depuis = actuel, time.time()
    return etag


def telecharger(acces, ms, destination):
    h = {"Authorization": f"Bearer {acces}"}
    meta = metadonnees(acces, ms)
    etag, taille = meta["eTag"], meta["size"]
    recu = 0
    with open(destination, "wb") as f:
        for _ in range(5):
            try:
                # reprise là où la connexion a coupé
                plage = {"Range": f"bytes={recu}-"} if recu else {}
                with requests.get(element(ms) + "/content", headers={**h, **plage}, stream=True, timeout=600) as r:
                    r.raise_for_status()
                    for bloc in r.iter_content(1024 * 1024):
                        f.write(bloc)
                        recu += len(bloc)
                if recu >= taille:
                    break
            except (requests.ConnectionError, requests.Timeout, requests.exceptions.ChunkedEncodingError):
                time.sleep(5)
    if recu != taille:
        raise Transitoire("téléchargement du deck incomplet")
    if metadonnees(acces, ms)["eTag"] != etag:
        raise Conflit("deck modifié pendant le téléchargement")
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


def preparer_conference(worker, conf):
    """Télécharge, morceau par morceau, le fichier de la conférence à poser.
    Renvoie la conférence avec ses octets, ou None (rien à poser / échec réseau :
    on réessaiera au passage suivant)."""
    if not conf:
        return None
    morceaux = []
    for n in range(conf["morceaux"]):
        r = worker.s.get(f"{worker.url}/api/job/conference/morceau/{conf['envoi']}/{n}", timeout=120)
        if r.status_code != 200:
            print(f"Conférence : fichier indisponible (HTTP {r.status_code}), pas posée ce passage-ci.")
            return None
        morceaux.append(r.content)
    octets = b"".join(morceaux)
    if len(octets) != conf["taille"]:
        print("Conférence : fichier incomplet, pas posée ce passage-ci.")
        return None
    return {**conf, "octets": octets}


def poser_conference(chemin, sortie, conf):
    """Insère la conférence ; renvoie (chemin du deck à jour ou None, résultat pour le worker)."""
    ident = {"vendredi": conf["vendredi"], "valide_le": conf["valide_le"]}
    try:
        r = conference.inserer(chemin, sortie, conf["vendredi"], conf["type"], conf["octets"])
    except conference.ConferenceImpossible as e:
        return None, {**ident, "ok": False, "message": str(e)}
    except Exception as e:  # noqa: BLE001 — une conférence ratée ne bloque pas les infomerciales
        return None, {**ident, "ok": False, "message": f"erreur inattendue ({type(e).__name__})"}
    return sortie, {**ident, "ok": True, "slides": r["slides"], "message": r["avertissement"]}


def preparer_reseaux(worker, res):
    """Télécharge, morceau par morceau, les fichiers du dépôt réseaux sociaux.
    Renvoie le dépôt avec les octets de chaque fichier, ou None (rien à poser /
    échec réseau : on réessaiera au passage suivant)."""
    if not res or not res.get("fichiers"):
        return None
    fichiers = []
    for k, f in enumerate(res["fichiers"], 1):
        morceaux = []
        for n in range(f["morceaux"]):
            r = worker.s.get(f"{worker.url}/api/job/reseaux/morceau/{f['envoi']}/{n}", timeout=120)
            if r.status_code != 200:
                print(f"Réseaux sociaux : fichier {k} indisponible (HTTP {r.status_code}), pas posé ce passage-ci.")
                return None
            morceaux.append(r.content)
        octets = b"".join(morceaux)
        if len(octets) != f["taille"]:
            print(f"Réseaux sociaux : fichier {k} incomplet, pas posé ce passage-ci.")
            return None
        fichiers.append({"type": f["type"], "octets": octets})
    return {**res, "fichiers": fichiers}


def poser_reseaux(chemin, sortie, res):
    """Pose le dépôt réseaux sociaux ; renvoie (chemin du deck à jour ou None, résultat pour le worker)."""
    ident = {"vendredi": res["vendredi"], "valide_le": res["valide_le"]}
    try:
        r = reseaux.inserer(chemin, sortie, res["vendredi"], res["fichiers"])
    except reseaux.ReseauxImpossible as e:
        return None, {**ident, "ok": False, "message": str(e)}
    except Exception as e:  # noqa: BLE001 — ne bloque ni les infomerciales ni la conférence
        return None, {**ident, "ok": False, "message": f"erreur inattendue ({type(e).__name__})"}
    return sortie, {**ident, "ok": True, "slides": r["slides"], "message": r["avertissement"]}


def normaliser_nom(nom):
    sans_accents = "".join(c for c in unicodedata.normalize("NFD", nom) if unicodedata.category(c) != "Mn")
    return " ".join(sans_accents.lower().split())


def recibler(depots, anciens_membres, membres_deck):
    """Associe chaque dépôt à sa slide dans le deck téléchargé.

    On suit d'abord l'identifiant interne de la slide (insensible aux
    déplacements). S'il a disparu (slide supprimée puis recréée, ou recopiée),
    on retrouve la slide du même membre par son nom. Chaque dépôt reçoit
    « cible » (slide du deck) ou None, et garde son slide_id d'origine.
    """
    ids_deck = {m["slide_id"] for m in membres_deck}
    nom_avant = {m["slide_id"]: normaliser_nom(m["nom"]) for m in anciens_membres}
    par_nom = {}
    for m in membres_deck:
        par_nom.setdefault(normaliser_nom(m["nom"]), []).append(m["slide_id"])
    resultat = []
    for d in depots:
        cible = d["slide_id"] if d["slide_id"] in ids_deck else None
        if cible is None and d["slide_id"] in nom_avant:
            candidats = par_nom.get(nom_avant[d["slide_id"]], [])
            cible = candidats[0] if len(candidats) == 1 else None  # homonymes : on ne devine pas
        resultat.append({**d, "cible": cible})
    return resultat


def un_passage(worker, ms, depots, anciens_membres, dossier, conf=None, res=None):
    """Renvoie (membres, dépôts traités, nb de slides membres mises à jour,
    résultat de la conférence ou None, résultat réseaux sociaux ou None)."""
    acces = jeton_microsoft(worker, ms)
    source = Path(dossier) / "source.pptx"
    if depots or conf or res:
        attendre_calme(acces, ms)
    etag = telecharger(acces, ms, source)
    membres = deck.lister_membres(source)
    depots = recibler(depots, anciens_membres, membres)
    # membre sorti du deck : son dépôt est marqué traité pour être purgé
    orphelins = [d for d in depots if d["cible"] is None]
    a_faire = [d for d in depots if d["cible"] is not None and (d.get("photo") or d.get("recherche"))]
    courant, faits, resultat_conf, resultat_res = None, set(), None, None
    if a_faire:
        courant = Path(dossier) / "sortie.pptx"
        faits = set(deck.appliquer(source, courant, [{**d, "slide_id": d["cible"]} for d in a_faire]))
    if conf:
        pose, resultat_conf = poser_conference(courant or source, Path(dossier) / "conference.pptx", conf)
        courant = pose or courant
    if res:
        pose, resultat_res = poser_reseaux(courant or source, Path(dossier) / "reseaux.pptx", res)
        courant = pose or courant
    if courant is None:
        return membres, orphelins, 0, resultat_conf, resultat_res
    envoyer_deck(acces, ms, courant, etag)
    return (deck.lister_membres(courant), orphelins + [d for d in a_faire if d["cible"] in faits], len(faits),
            resultat_conf, resultat_res)


def decrire(e):
    """Message d'erreur sans URL : elle contient les identifiants OneDrive."""
    if isinstance(e, requests.HTTPError) and e.response is not None:
        return f"HTTP {e.response.status_code} sur {e.response.request.method}"
    if isinstance(e, requests.RequestException):
        return type(e).__name__
    return f"{type(e).__name__} : {e}"


def main(worker=None, maintenant=None, environ=os.environ):
    worker = worker or Worker(environ["WORKER_URL"], environ["WASSIM_AUTH_TOKEN"])
    entree = worker.get("/api/job/entree").json()
    cron = environ.get("CRON", "").strip()  # github.event.schedule, vide si lancé à la main
    creneau = None
    if cron in CRONS_PUBLICATION:
        # lancement programmé : seulement à l'heure de Paris, et une fois par créneau
        creneau = creneau_a_lancer(cron, entree.get("passages"), maintenant or dt.datetime.now(dt.timezone.utc))
        if creneau is None:
            print("Pas de passage à faire à cette heure-ci (heure de Paris), ou déjà fait : rien à faire.")
            return 0
        print(f"Passage programmé : {creneau}.")
    ms = entree.get("ms")
    if not ms or not (ms.get("refresh_token") or ms.get("rclone_token")) or not ms.get("item_id"):
        print("OneDrive non connecté : lancer connexion_microsoft.py une fois.")
        return 1
    depots = preparer_depots(worker, entree["depots"])
    conf = preparer_conference(worker, entree.get("conference"))
    res = preparer_reseaux(worker, entree.get("reseaux"))
    print(f"{len(depots)} dépôt(s) à traiter" + (", une conférence à poser" if conf else "")
          + (f", {len(res['fichiers'])} fichier(s) réseaux sociaux à poser" if res else "") + ".")
    trace = {"source": "job", "creneau": creneau}
    erreur = None
    for essai in range(1, ESSAIS + 1):
        try:
            with tempfile.TemporaryDirectory() as dossier:
                membres, appliques, nb, resultat_conf, resultat_res = un_passage(
                    worker, ms, depots, entree.get("membres", []), dossier, conf, res)
            message = f"{nb} slide(s) mise(s) à jour" if nb else "aucun nouveau dépôt, liste des membres synchronisée"
            if resultat_conf:
                message += (f" ; conférence : {resultat_conf['slides']} slide(s) posée(s)" if resultat_conf["ok"]
                            else f" ; conférence non posée : {resultat_conf['message']}")
                print(f"Conférence : {'posée, ' + str(resultat_conf['slides']) + ' slide(s)' if resultat_conf['ok'] else 'non posée (' + resultat_conf['message'] + ')'}.")
            if resultat_res:
                message += (f" ; réseaux sociaux : {resultat_res['slides']} slide(s) posée(s)" if resultat_res["ok"]
                            else f" ; réseaux sociaux non posés : {resultat_res['message']}")
                print(f"Réseaux sociaux : {'posés, ' + str(resultat_res['slides']) + ' slide(s)' if resultat_res['ok'] else 'non posés (' + resultat_res['message'] + ')'}.")
            worker.envoyer("POST", "/api/job/resultat", {
                **trace,
                "ok": True,
                "message": message[:300],
                # vendredi, valide_le, ok, slides, message : jamais de contacts
                "conference": resultat_conf,
                # vendredi, valide_le, ok, slides, message
                "reseaux": resultat_res,
                "membres": membres,
                # orphelin : slide du membre introuvable, dépôt purgé sans être posé
                "appliques": [{"slide_id": d["slide_id"], "date": d["date"], "orphelin": d["cible"] is None}
                              for d in appliques],
            })
            print(f"OK : {nb} slide(s) mise(s) à jour, {len(membres)} membre(s) dans le deck.")
            return 0
        except Exception as e:
            if isinstance(e, Conflit):
                erreur, pause = f"deck modifié ou ouvert pendant la mise à jour ({e})", PAUSE_ESSAI
            elif est_transitoire(e):
                erreur, pause = f"erreur réseau passagère ({decrire(e)})", PAUSE_RESEAU * essai
            else:
                erreur = decrire(e)
                break
            print(f"Essai {essai}/{ESSAIS} : {erreur}")
            if essai == ESSAIS:
                break
            time.sleep(pause)
            try:
                ms = worker.get("/api/job/entree").json()["ms"]  # jeton renouvelé entre-temps
            except Exception:
                pass  # on retente avec l'ancien : l'essai suivant dira si ça bloque
    message = f"échec : {erreur}"[:300]
    print(f"ÉCHEC : {erreur}")
    try:
        # les dépôts restent sur le worker : le passage suivant les reprendra tous
        worker.envoyer("POST", "/api/job/resultat", {**trace, "ok": False, "message": message})
    except Exception as e:
        print(f"Résultat non enregistré sur le worker ({decrire(e)}).")
    return 1


if __name__ == "__main__":
    # ligne par ligne : les messages restent dans les logs même si le job est annulé
    sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
    if sys.argv[1:2] == ["nettoyage"]:
        # nettoyage hebdo du samedi (nettoyage.py) : `python job.py nettoyage [--essai] [--forcer]`
        import nettoyage
        sys.exit(nettoyage.main(sys.argv[2:]))
    sys.exit(main())
