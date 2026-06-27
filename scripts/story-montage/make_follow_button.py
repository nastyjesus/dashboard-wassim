#!/usr/bin/env python3
"""Génère assets/follow_button.png — bouton 'S'ABONNER' style Instagram.

Rectangle arrondi rempli d'un dégradé Instagram (jaune→orange→magenta→violet) + glyphe IG
blanc + texte blanc bold. Pendant Instagram du subscribe_button.png YouTube : rendu une seule
fois en haute résolution, puis animé au runtime (slide-up + bounce) par make_ig_reel.py.

Usage : python make_follow_button.py [--handle @wassimloumi]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

WIDTH = 760
HEIGHT = 180
RADIUS = 40
WHITE = (255, 255, 255, 255)

# Stops du dégradé officiel Instagram (du coin bas-gauche au coin haut-droit).
IG_STOPS = [
    (0.00, (254, 218, 117)),  # jaune
    (0.25, (250, 126, 30)),   # orange
    (0.55, (214, 41, 118)),   # magenta
    (0.78, (150, 47, 191)),   # violet
    (1.00, (79, 91, 213)),    # bleu
]


def _load_font(name: str, size: int) -> ImageFont.FreeTypeFont:
    candidates = [
        rf"C:\Windows\Fonts\{name}",
        r"C:\Windows\Fonts\Montserrat-ExtraBold.ttf",
        r"C:\Windows\Fonts\seguiblk.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
    ]
    for fp in candidates:
        if Path(fp).exists():
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()


def _diagonal_gradient(size: tuple[int, int]) -> Image.Image:
    """Dégradé diagonal (bas-gauche → haut-droit) interpolant les stops IG."""
    w, h = size
    grad = Image.new("RGB", size)
    px = grad.load()
    stops = IG_STOPS
    for y in range(h):
        for x in range(w):
            # t projeté sur la diagonale bas-gauche -> haut-droit, normalisé 0..1.
            t = (x / max(1, w - 1) + (h - 1 - y) / max(1, h - 1)) / 2.0
            # Trouver le segment de stops encadrant t.
            for i in range(len(stops) - 1):
                t0, c0 = stops[i]
                t1, c1 = stops[i + 1]
                if t0 <= t <= t1:
                    f = (t - t0) / (t1 - t0) if t1 > t0 else 0.0
                    px[x, y] = tuple(int(c0[k] + (c1[k] - c0[k]) * f) for k in range(3))
                    break
            else:
                px[x, y] = stops[-1][1]
    return grad


def _draw_ig_glyph(draw: ImageDraw.ImageDraw, cx: int, cy: int, s: int) -> None:
    """Logo Instagram stylisé blanc (carré arrondi + cercle objectif + point flash)."""
    half = s // 2
    lw = max(4, s // 12)
    # Carré arrondi (contour blanc, intérieur transparent)
    draw.rounded_rectangle(
        (cx - half, cy - half, cx + half, cy + half),
        radius=s // 4,
        outline=WHITE,
        width=lw,
    )
    # Objectif (cercle au centre)
    r = s // 4
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=WHITE, width=lw)
    # Point flash en haut-droite
    pd = max(3, s // 14)
    fx, fy = cx + half - s // 5, cy - half + s // 5
    draw.ellipse((fx - pd, fy - pd, fx + pd, fy + pd), fill=WHITE)


def make_button(out_path: Path, handle: str = "@wassimloumi") -> None:
    pad = 16
    canvas = Image.new("RGBA", (WIDTH + pad * 2, HEIGHT + pad * 2), (0, 0, 0, 0))

    # Ombre douce sous le bouton.
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle(
        (pad, pad + 8, pad + WIDTH, pad + HEIGHT + 8), radius=RADIUS, fill=(0, 0, 0, 120)
    )
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(10)))

    # Bouton : dégradé IG masqué par un rectangle arrondi.
    grad = _diagonal_gradient((WIDTH, HEIGHT)).convert("RGBA")
    mask = Image.new("L", (WIDTH, HEIGHT), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, WIDTH - 1, HEIGHT - 1), radius=RADIUS, fill=255)
    canvas.paste(grad, (pad, pad), mask)

    draw = ImageDraw.Draw(canvas)

    # Glyphe IG à gauche.
    glyph_s = 84
    gx = pad + 90
    gy = pad + HEIGHT // 2
    _draw_ig_glyph(draw, gx, gy, glyph_s)

    # Texte "S'ABONNER".
    font = _load_font("Montserrat-Black.ttf", 60)
    text = "S'ABONNER"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    tx = pad + 160 + ((WIDTH - 160) - tw) // 2
    ty = pad + (HEIGHT - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=WHITE)

    canvas.save(out_path)
    print(f"Wrote {out_path} ({canvas.size[0]}x{canvas.size[1]})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--handle", default="@wassimloumi")
    ap.add_argument("--out", default=str(ASSETS / "follow_button.png"))
    args = ap.parse_args()
    make_button(Path(args.out), handle=args.handle)
