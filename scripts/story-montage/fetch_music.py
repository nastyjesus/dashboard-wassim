#!/usr/bin/env python3
"""Télécharge une musique de fond chill/corporate libre de droits dans assets/music_chill.mp3.

Sources testées dans l'ordre — Mixkit (Mixkit Stock Music Free License, sans attribution requise pour
usage YouTube) puis Pixabay (CC0). On essaie chaque URL : la première qui répond 200 + .mp3 valide
gagne. Idempotent : si assets/music_chill.mp3 existe déjà, ne refait rien (passer --force pour redownload).
"""
from __future__ import annotations

import argparse
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"

# Tracks candidates — chill / instrumental / corporate, durée ≥ 60s (le short fait ~32s).
# Si une URL casse, on essaie la suivante.
CANDIDATES = [
    # Mixkit — preview MP3s, publiquement accessibles, ~60s, free pour réutilisation.
    "https://assets.mixkit.co/music/preview/mixkit-tech-house-vibes-130.mp3",
    "https://assets.mixkit.co/music/preview/mixkit-driving-ambition-32.mp3",
    "https://assets.mixkit.co/music/preview/mixkit-hip-hop-02-738.mp3",
    "https://assets.mixkit.co/music/preview/mixkit-deep-urban-623.mp3",
    "https://assets.mixkit.co/music/preview/mixkit-tech-house-loop-1671.mp3",
    # Pixabay CDN — fallbacks (URLs peuvent changer, mais on essaie)
    "https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3",
]


def try_download(url: str, dest: Path) -> bool:
    print(f"  > trying {url}")
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) story-montage",
                "Accept": "audio/mpeg,*/*",
            },
        )
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = resp.read()
        if len(data) < 50_000:
            print(f"    skip (too small: {len(data)} bytes — likely an error page)")
            return False
        # Validation rapide : un MP3 commence par 'ID3' ou par une frame sync 0xFFFx
        head = data[:3]
        if head != b"ID3" and not (data[0] == 0xFF and (data[1] & 0xE0) == 0xE0):
            print(f"    skip (not a valid MP3: starts with {head!r})")
            return False
        dest.write_bytes(data)
        print(f"    [OK] saved {len(data):,} bytes -> {dest.name}")
        return True
    except Exception as e:
        print(f"    skip ({type(e).__name__}: {e})")
        return False


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="Re-télécharge même si déjà présent")
    ap.add_argument("--out", default="music_chill.mp3", help="Nom du fichier de sortie dans assets/")
    args = ap.parse_args()

    ASSETS.mkdir(exist_ok=True)
    dest = ASSETS / args.out
    if dest.exists() and not args.force:
        print(f"Already present: {dest}")
        return 0

    for url in CANDIDATES:
        if try_download(url, dest):
            return 0

    print(
        "\n[FAIL] Aucun candidat n'a fonctionne. Depose manuellement un MP3 dans "
        f"{dest} (chill instrumental, libre de droits, >= 60s).",
        file=sys.stderr,
    )
    return 1


if __name__ == "__main__":
    sys.exit(main())
