"""
sync-banks.py — Extrait les comptes et transactions Fortuneo + Banque Populaire
                via woob, et push le résultat vers le worker Cloudflare.

Utilisation :
    python sync-banks.py

Variables d'environnement attendues :
    WOOB_DATA_DIR              répertoire de config woob (ex: ./woob-data)
    WORKER_URL                 URL du worker Cloudflare
    WASSIM_AUTH_TOKEN          header X-Wassim-Auth
    FORTUNEO_BACKEND_NAME      nom du backend woob Fortuneo (par défaut: fortuneo)
    BPGO_BACKEND_NAME          nom du backend woob BPGO (par défaut: bpgo)

Le script lit la config woob, fetch comptes + history, normalise au format
attendu par le worker, et POST le tout sur /scraped/ingest.

Conçu pour tourner dans GitHub Actions avec un dossier woob-data fourni en
artefact (le user fait la config interactive UNE fois en local et upload
le ~/.config/woob comme secret base64 GH).
"""

from __future__ import annotations

import json
import os
import sys
import datetime as dt
from pathlib import Path
from typing import Any

# IMPORTANT : woob lit son workdir depuis WOOB_WORKDIR (= dossier qui CONTIENT
# le fichier `backends`, pas un parent qui contient un sous-dossier `woob/`).
# Le tarball que fournit le user est structuré en `woob/backends`, donc il faut
# que WOOB_WORKDIR pointe sur le sous-dossier `woob` du WOOB_DATA_DIR.
_WORKDIR = os.environ.get("WOOB_DATA_DIR")
_WOOB_DIR = None
if _WORKDIR:
    Path(_WORKDIR).mkdir(parents=True, exist_ok=True)
    # Détecte la structure réelle du tarball (backends à la racine ou dans woob/)
    candidates = [
        os.path.join(_WORKDIR, "woob"),  # tarball fait via `tar -C ~/.config woob`
        _WORKDIR,                          # tarball fait depuis ~/.config/woob directement
    ]
    for c in candidates:
        if os.path.exists(os.path.join(c, "backends")):
            _WOOB_DIR = c
            break
    if _WOOB_DIR:
        os.environ["WOOB_WORKDIR"] = _WOOB_DIR
        os.environ["XDG_CONFIG_HOME"] = os.path.dirname(_WOOB_DIR)
    # Debug : montre où woob va aller chercher
    print(f"[debug] WOOB_DATA_DIR = {_WORKDIR}", file=sys.stderr)
    print(f"[debug] resolved WOOB_WORKDIR = {_WOOB_DIR}", file=sys.stderr)
    if _WOOB_DIR and os.path.exists(os.path.join(_WOOB_DIR, "backends")):
        print(f"[debug] ✓ backends file found at {os.path.join(_WOOB_DIR, 'backends')}", file=sys.stderr)
        with open(os.path.join(_WOOB_DIR, "backends")) as f:
            sections = [l.strip() for l in f if l.strip().startswith("[")]
            print(f"[debug] backends sections: {sections}", file=sys.stderr)
    else:
        print(f"[debug] ✗ backends file NOT found — listing {_WORKDIR}", file=sys.stderr)
        for root, dirs, files in os.walk(_WORKDIR):
            for f in files:
                print(f"[debug]   - {os.path.join(root, f)}", file=sys.stderr)

# Maintenant on peut importer woob
from woob.core import Woob
from woob.capabilities.bank import CapBank


BANKS = [
    {
        "slug": "fortuneo",
        "bank_name": "Fortuneo",
        "backend_env": "FORTUNEO_BACKEND_NAME",
        "default_backend": "fortuneo",
        "type": "Perso",
    },
    {
        "slug": "bpo",
        "bank_name": "Banque Populaire",
        "backend_env": "BPGO_BACKEND_NAME",
        "default_backend": "bpgo",
        "type": "Pro",
    },
]


def normalize_account(acc, bank_cfg) -> dict[str, Any]:
    return {
        "id": f"scraped_{bank_cfg['slug']}_{acc.id}",
        "bank_slug": bank_cfg["slug"],
        "bank_name": bank_cfg["bank_name"],
        "type": bank_cfg["type"],
        "name": str(acc.label or "")[:80],
        "iban_last4": (str(acc.iban or "")[-4:]) if acc.iban else "",
        "balance": float(acc.balance) if acc.balance is not None else 0.0,
        "currency_code": str(acc.currency or "EUR"),
        "scraped_at": dt.datetime.utcnow().isoformat() + "Z",
    }


def normalize_transaction(tx, account_id) -> dict[str, Any]:
    return {
        "id": f"scraped_{account_id}_{getattr(tx, 'id', None) or hash((str(tx.date), str(tx.label), float(tx.amount or 0)))}",
        "account_id": account_id,
        "date": (tx.date.isoformat() if hasattr(tx.date, "isoformat") else str(tx.date)),
        "description": str(tx.label or tx.raw or "(sans libellé)")[:200],
        "amount": float(tx.amount) if tx.amount is not None else 0.0,
        "currency_code": "EUR",
        "category": str(getattr(tx, "category", "") or "")[:60],
        "bridge_category": None,
    }


def fetch_bank(woob: Woob, bank_cfg, history_days: int = 365):
    """Pour un backend donné, lit comptes + transactions sur N jours."""
    backend_name = os.environ.get(bank_cfg["backend_env"], bank_cfg["default_backend"])
    accounts_out = []
    transactions_out = []
    since = dt.date.today() - dt.timedelta(days=history_days)

    try:
        backend = woob.get_backend(backend_name)
    except KeyError:
        print(f"[warn] backend '{backend_name}' not configured, skipping {bank_cfg['slug']}", file=sys.stderr)
        return accounts_out, transactions_out

    print(f"[info] fetching {bank_cfg['slug']} via backend '{backend_name}'…", file=sys.stderr)
    try:
        for acc in backend.iter_accounts():
            n_acc = normalize_account(acc, bank_cfg)
            accounts_out.append(n_acc)
            try:
                for tx in backend.iter_history(acc):
                    if hasattr(tx.date, "year") and tx.date < since:
                        break
                    transactions_out.append(normalize_transaction(tx, n_acc["id"]))
            except Exception as e:
                print(f"[warn] history failed for {acc.id}: {e}", file=sys.stderr)
    except Exception as e:
        print(f"[error] fetch failed for {bank_cfg['slug']}: {e}", file=sys.stderr)

    print(f"[info] {bank_cfg['slug']}: {len(accounts_out)} accounts, {len(transactions_out)} transactions", file=sys.stderr)
    return accounts_out, transactions_out


def push_to_worker(payload: dict, worker_url: str, auth_token: str) -> None:
    import urllib.request

    req = urllib.request.Request(
        worker_url.rstrip("/") + "/scraped/ingest",
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Wassim-Auth": auth_token,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read().decode("utf-8")
        if resp.status >= 300:
            raise RuntimeError(f"worker {resp.status}: {body}")
        print(f"[info] worker ingest OK: {body}", file=sys.stderr)


def main() -> int:
    worker_url = os.environ.get("WORKER_URL")
    auth_token = os.environ.get("WASSIM_AUTH_TOKEN")
    if not worker_url or not auth_token:
        print("[fatal] WORKER_URL and WASSIM_AUTH_TOKEN must be set", file=sys.stderr)
        return 2

    print("[info] loading woob backends…", file=sys.stderr)
    # Passe workdir explicitement à Woob() pour pas dépendre des env vars
    # (XDG_CONFIG_HOME et WOOB_WORKDIR ne sont pas tjs respectés par woob v3).
    woob = Woob(workdir=_WOOB_DIR) if _WOOB_DIR else Woob()
    print(f"[debug] Woob instance workdir = {getattr(woob, 'workdir', '?')}", file=sys.stderr)

    # Met à jour les modules pour éviter VersionsMismatchError quand la cache locale
    # (issue du tarball) ne matche pas la version installée dans le runner.
    class _SilentProgress:
        def progress(self, percent, message=""):
            pass
        def error(self, message):
            print(f"[woob.repo.error] {message}", file=sys.stderr)
        def prompt(self, message):
            print(f"[woob.repo.prompt] {message} → auto-yes", file=sys.stderr)
            return True

    try:
        print("[info] updating woob repositories…", file=sys.stderr)
        woob.repositories.update_repositories(progress=_SilentProgress())
    except Exception as e:
        print(f"[warn] update_repositories failed (continuing): {e}", file=sys.stderr)

    woob.load_backends(CapBank)
    print(f"[info] loaded {len(list(woob.backend_instances.keys()))} backends: {list(woob.backend_instances.keys())}", file=sys.stderr)

    accounts: list[dict] = []
    transactions: list[dict] = []
    for cfg in BANKS:
        accs, txs = fetch_bank(woob, cfg)
        accounts.extend(accs)
        transactions.extend(txs)

    payload = {
        "scraped_at": dt.datetime.utcnow().isoformat() + "Z",
        "accounts": accounts,
        "transactions": transactions,
    }

    if not accounts:
        print("[warn] no accounts found — abort push to avoid wiping KV", file=sys.stderr)
        return 1

    push_to_worker(payload, worker_url, auth_token)
    return 0


if __name__ == "__main__":
    sys.exit(main())
