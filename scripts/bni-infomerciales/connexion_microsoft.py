"""Connexion unique au compte Microsoft propriétaire du deck (à lancer sur ton PC).

    python connexion_microsoft.py           # via rclone : gratuit, sans Azure
    python connexion_microsoft.py --azure   # via une inscription d'app Azure

Mode rclone (rclone installé) : ouvre la page Microsoft, tu acceptes l'accès
pour « rclone ». Mode Azure : code à saisir sur microsoft.com/devicelogin.
Enregistre ensuite dans le worker (KV, accès admin seulement) le jeton et
l'emplacement du deck. Lit le .env local (BNI_ADMIN_TOKEN, BNI_DECK_LIEN…).
"""
import base64
import getpass
import json
import os
import re
import subprocess
import sys
import time

import requests

LOGIN = "https://login.microsoftonline.com/consumers/oauth2/v2.0"
GRAPH = "https://graph.microsoft.com/v1.0"
SCOPE = "Files.ReadWrite offline_access"
WORKER_DEFAUT = "https://bni-infomerciales.loumiwassim.workers.dev"


def demander(invite, env, secret=False, defaut=None):
    valeur = os.environ.get(env)
    if valeur:
        return valeur
    suffixe = f" [{defaut}]" if defaut else ""
    valeur = (getpass.getpass if secret else input)(f"{invite}{suffixe} : ").strip()
    return valeur or defaut


def connexion(client_id):
    r = requests.post(f"{LOGIN}/devicecode", data={"client_id": client_id, "scope": SCOPE}, timeout=30)
    r.raise_for_status()
    code = r.json()
    print()
    print(f"  1. Ouvre {code['verification_uri']}")
    print(f"  2. Saisis le code : {code['user_code']}")
    print("  3. Connecte-toi avec le compte Microsoft propriétaire du deck et accepte.")
    print()
    attente = code.get("interval", 5)
    fin = time.time() + code.get("expires_in", 900)
    while time.time() < fin:
        time.sleep(attente)
        t = requests.post(f"{LOGIN}/token", data={
            "client_id": client_id,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
            "device_code": code["device_code"],
        }, timeout=30)
        data = t.json()
        if t.status_code == 200:
            return data
        if data.get("error") == "slow_down":
            attente += 5
        elif data.get("error") != "authorization_pending":
            sys.exit(f"Connexion refusée : {data.get('error_description', data.get('error'))}")
    sys.exit("Code expiré, relance le script.")


def trouver_deck(acces, lien):
    jeton_partage = "u!" + base64.urlsafe_b64encode(lien.encode()).decode().rstrip("=")
    r = requests.get(f"{GRAPH}/shares/{jeton_partage}/driveItem", headers={"Authorization": f"Bearer {acces}"},
                     params={"$select": "id,name,size,parentReference"}, timeout=30)
    if r.status_code != 200:
        sys.exit(f"Deck introuvable via ce lien ({r.status_code}). Vérifie le lien de partage.")
    item = r.json()
    return item["parentReference"]["driveId"], item["id"], item["name"], item.get("size", 0)


def charger_env():
    """Lit le .env local (ignoré par git) à côté du script."""
    fichier = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if os.path.exists(fichier):
        for ligne in open(fichier, encoding="utf-8"):
            if "=" in ligne and not ligne.lstrip().startswith("#"):
                cle, valeur = ligne.strip().split("=", 1)
                os.environ.setdefault(cle, valeur)


def connexion_rclone():
    """Autorise l'application publique rclone (pas d'inscription Azure, gratuit)."""
    rclone = os.environ.get("RCLONE", "rclone")
    print("Une page Microsoft va s'ouvrir dans ton navigateur : connecte-toi avec le")
    print("compte propriétaire du deck et accepte l'accès pour « rclone ».\n")
    r = subprocess.run([rclone, "authorize", "onedrive"], capture_output=True, text=True, timeout=600)
    m = re.search(r"--->\s*(\{.*?\})\s*<---", r.stdout, re.S)
    if r.returncode != 0 or not m:
        sys.exit("Autorisation rclone non obtenue, relance le script.")
    token = m.group(1).strip()
    return token, json.loads(token)["access_token"]


def main():
    charger_env()
    print("Connexion du deck BNI à OneDrive\n")
    azure = "--azure" in sys.argv
    client_id = demander("ID d'application (client) Azure", "MS_CLIENT_ID") if azure else None
    lien = demander("Lien de partage OneDrive du deck", "BNI_DECK_LIEN")
    worker = demander("URL du worker", "WORKER_URL", defaut=WORKER_DEFAUT).rstrip("/")
    admin = os.environ.get("BNI_ADMIN_TOKEN") or demander("Jeton admin", "WASSIM_AUTH_TOKEN", secret=True)

    if azure:
        jetons = connexion(client_id)
        acces = jetons["access_token"]
        config = {"refresh_token": jetons["refresh_token"], "client_id": client_id}
    else:
        token, acces = connexion_rclone()
        drive = requests.get(f"{GRAPH}/me/drive", headers={"Authorization": f"Bearer {acces}"},
                             params={"$select": "id,driveType"}, timeout=30)
        drive.raise_for_status()
        config = {"rclone_token": token, "drive_type": drive.json()["driveType"]}

    drive_id, item_id, nom, taille = trouver_deck(acces, lien)
    print(f"Deck trouvé : {nom} ({round(taille / 1e6)} Mo)")
    if not nom.lower().endswith(".pptx"):
        sys.exit("Ce lien ne pointe pas vers un .pptx.")

    r = requests.put(f"{worker}/api/job/ms", headers={"X-Wassim-Auth": admin}, json={
        **config, "drive_id": drive_id, "item_id": item_id,
    }, timeout=30)
    if r.status_code != 200:
        sys.exit(f"Le worker a refusé l'enregistrement ({r.status_code}) : vérifie le jeton admin.")
    print("✓ OneDrive connecté. Lance maintenant le workflow « BNI infomerciales » pour lire la liste des membres.")


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    main()
