"""Serveur local : dépôt des photos d'infomerciales BNI + génération du deck.

    python server.py            -> http://127.0.0.1:8787  (membres)
                                   http://127.0.0.1:8787/admin  (toi)

Le deck source se place dans data/deck-source.pptx.
"""
import base64
import json
import os
import shutil
import sys
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import deck

RACINE = Path(__file__).resolve().parent
WEB = RACINE / "web"
DATA = RACINE / "data"
DECK_SOURCE = DATA / "deck-source.pptx"
DEPOTS = DATA / "depots"
ARCHIVES = DATA / "archives"
SORTIE = DATA / "sortie"
CACHE_MEMBRES = DATA / "membres.json"

PORT = int(os.environ.get("PORT", "8787"))
TAILLE_MAX = 40 * 1024 * 1024
RECHERCHE_MAX = 160

verrou = threading.Lock()


def membres():
    """Membres du deck source, mis en cache tant que le fichier ne change pas."""
    if not DECK_SOURCE.exists():
        return []
    mtime = DECK_SOURCE.stat().st_mtime
    if CACHE_MEMBRES.exists():
        cache = json.loads(CACHE_MEMBRES.read_text("utf-8"))
        if cache.get("mtime") == mtime:
            return cache["membres"]
    liste = deck.lister_membres(DECK_SOURCE)
    CACHE_MEMBRES.write_text(json.dumps({"mtime": mtime, "membres": liste}, ensure_ascii=False), "utf-8")
    return liste


def depot(slide_id):
    f = DEPOTS / f"{slide_id}.json"
    return json.loads(f.read_text("utf-8")) if f.exists() else None


def etat():
    liste = []
    for m in membres():
        d = depot(m["slide_id"])
        liste.append({**m, "depot": d and {k: d[k] for k in ("recherche", "date", "a_photo")}})
    info = None
    if DECK_SOURCE.exists():
        st = DECK_SOURCE.stat()
        info = {"taille_mo": round(st.st_size / 1e6), "modifie": datetime.fromtimestamp(st.st_mtime).isoformat(timespec="minutes")}
    sorties = sorted((p.name for p in SORTIE.glob("*.pptx")), reverse=True)[:5] if SORTIE.exists() else []
    return {"deck": info, "membres": liste, "sorties": sorties}


def enregistrer_depot(corps):
    slide_id = int(corps.get("slide_id", 0))
    membre = next((m for m in membres() if m["slide_id"] == slide_id), None)
    if membre is None:
        raise ValueError("Membre inconnu.")
    recherche = " ".join(str(corps.get("recherche", "")).split())[:RECHERCHE_MAX]
    photo = corps.get("photo") or ""
    if not photo and not recherche:
        raise ValueError("Ajoute au moins une photo ou ta recherche.")
    DEPOTS.mkdir(parents=True, exist_ok=True)
    precedent = depot(slide_id) or {}
    infos = {
        "slide_id": slide_id,
        "nom": membre["nom"],
        "recherche": recherche,
        "date": datetime.now().isoformat(timespec="minutes"),
        "a_photo": precedent.get("a_photo", False),
        "largeur": precedent.get("largeur"),
        "hauteur": precedent.get("hauteur"),
    }
    if photo:
        brut = base64.b64decode(photo.split(",", 1)[-1])
        try:
            jpeg, l, h = deck.preparer_photo(brut)
        except Exception:
            raise ValueError("Cette image n'est pas lisible. Essaie en JPG ou PNG.")
        (DEPOTS / f"{slide_id}.jpg").write_bytes(jpeg)
        infos.update(a_photo=True, largeur=l, hauteur=h)
    (DEPOTS / f"{slide_id}.json").write_text(json.dumps(infos, ensure_ascii=False), "utf-8")
    return infos


def generer():
    if not DECK_SOURCE.exists():
        raise ValueError("Pas de deck source : place-le dans data/deck-source.pptx.")
    a_appliquer = []
    for f in sorted(DEPOTS.glob("*.json")) if DEPOTS.exists() else []:
        d = json.loads(f.read_text("utf-8"))
        jpg = DEPOTS / f"{d['slide_id']}.jpg"
        d["photo"] = jpg.read_bytes() if d.get("a_photo") and jpg.exists() else None
        a_appliquer.append(d)
    if not a_appliquer:
        raise ValueError("Aucun dépôt à appliquer.")
    SORTIE.mkdir(parents=True, exist_ok=True)
    horodatage = datetime.now().strftime("%Y-%m-%d_%Hh%M")
    nom = f"BNI-support-{horodatage}.pptx"
    faits = deck.appliquer(DECK_SOURCE, SORTIE / nom, a_appliquer)
    # les dépôts appliqués partent en archive : la semaine suivante repart à zéro
    archive = ARCHIVES / horodatage
    archive.mkdir(parents=True, exist_ok=True)
    for sid in faits:
        for ext in ("json", "jpg"):
            f = DEPOTS / f"{sid}.{ext}"
            if f.exists():
                shutil.move(str(f), archive / f.name)
    return {"fichier": nom, "mis_a_jour": len(faits)}


class Handler(BaseHTTPRequestHandler):
    def _json(self, code, data):
        corps = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def _fichier(self, chemin, type_mime, telechargement=None):
        if not chemin.is_file():
            return self._json(404, {"erreur": "Introuvable."})
        self.send_response(200)
        self.send_header("Content-Type", type_mime)
        self.send_header("Content-Length", str(chemin.stat().st_size))
        self.send_header("Cache-Control", "no-store")
        if telechargement:
            self.send_header("Content-Disposition", f'attachment; filename="{telechargement}"')
        self.end_headers()
        with open(chemin, "rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def do_GET(self):
        chemin = self.path.split("?", 1)[0]
        if chemin == "/":
            return self._fichier(WEB / "index.html", "text/html; charset=utf-8")
        if chemin == "/admin":
            return self._fichier(WEB / "admin.html", "text/html; charset=utf-8")
        if chemin == "/api/etat":
            return self._json(200, etat())
        if chemin.startswith("/api/photo/"):
            sid = chemin.rsplit("/", 1)[-1]
            if sid.isdigit():
                return self._fichier(DEPOTS / f"{sid}.jpg", "image/jpeg")
        if chemin.startswith("/sortie/"):
            nom = Path(chemin).name
            return self._fichier(SORTIE / nom, "application/vnd.openxmlformats-officedocument.presentationml.presentation", nom)
        self._json(404, {"erreur": "Introuvable."})

    def do_POST(self):
        longueur = int(self.headers.get("Content-Length", 0))
        if longueur > TAILLE_MAX:
            return self._json(413, {"erreur": "Fichier trop lourd (40 Mo max)."})
        try:
            corps = json.loads(self.rfile.read(longueur) or b"{}")
            with verrou:
                if self.path == "/api/depot":
                    return self._json(200, enregistrer_depot(corps))
                if self.path == "/api/generer":
                    return self._json(200, generer())
        except ValueError as e:
            return self._json(400, {"erreur": str(e)})
        except Exception as e:  # on renvoie l'erreur à l'admin plutôt que de planter
            print("ERREUR", repr(e), file=sys.stderr)
            return self._json(500, {"erreur": "Erreur interne : " + str(e)})
        self._json(404, {"erreur": "Introuvable."})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (datetime.now().strftime("%H:%M:%S"), fmt % args))


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    DATA.mkdir(exist_ok=True)
    if not DECK_SOURCE.exists():
        print(f"⚠ Place le deck dans {DECK_SOURCE}")
    else:
        print(f"{len(membres())} membres trouvés dans le deck.")
    print(f"Membres : http://127.0.0.1:{PORT}   Admin : http://127.0.0.1:{PORT}/admin")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
