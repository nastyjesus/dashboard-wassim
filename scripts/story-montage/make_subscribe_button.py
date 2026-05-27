#!/usr/bin/env python3
"""Génère assets/subscribe_button.png — bouton YouTube 'S'ABONNER' style.

Rectangle rouge arrondi + texte blanc bold + icône cloche stylisée. Rendu une seule fois,
en haute résolution, puis utilisé tel quel par montage.py (l'animation slide-up + bounce
se fait au runtime via ffmpeg overlay)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

WIDTH = 720
HEIGHT = 180
RADIUS = 40
# Rouge YouTube officiel
RED = (255, 0, 0, 255)
WHITE = (255, 255, 255, 255)


def _load_bold_font(size: int) -> ImageFont.FreeTypeFont:
    """Charge une police bold lisible. Préfère Segoe UI Black / Arial Black sous Windows."""
    candidates = [
        r"C:\Windows\Fonts\seguiblk.ttf",   # Segoe UI Black
        r"C:\Windows\Fonts\arialbd.ttf",     # Arial Bold
        r"C:\Windows\Fonts\segoeuib.ttf",   # Segoe UI Bold
        r"/usr/share/fonts/truetype/dejavu/DejaVu Sans-Bold.ttf",
    ]
    for fp in candidates:
        if Path(fp).exists():
            return ImageFont.truetype(fp, size)
    return ImageFont.load_default()


def make_button(out_path: Path) -> None:
    # Canvas transparent un peu plus grand pour laisser respirer l'ombre douce sous le bouton.
    pad = 16
    canvas = Image.new("RGBA", (WIDTH + pad * 2, HEIGHT + pad * 2), (0, 0, 0, 0))

    # Ombre douce
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle(
        (pad, pad + 8, pad + WIDTH, pad + HEIGHT + 8),
        radius=RADIUS,
        fill=(0, 0, 0, 110),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    canvas.alpha_composite(shadow)

    # Bouton rouge arrondi
    btn = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bd = ImageDraw.Draw(btn)
    bd.rounded_rectangle(
        (pad, pad, pad + WIDTH, pad + HEIGHT),
        radius=RADIUS,
        fill=RED,
    )
    canvas.alpha_composite(btn)

    # Icône cloche stylisée (vectorielle, blanche, à gauche du texte)
    bell_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    bd2 = ImageDraw.Draw(bell_layer)
    # Centre vertical bouton, gauche
    cx = pad + 100
    cy = pad + HEIGHT // 2
    # Corps de la cloche (forme trapézoïdale arrondie)
    bell_w, bell_h = 56, 56
    # Dome supérieur
    bd2.ellipse((cx - bell_w // 2, cy - bell_h // 2 - 6, cx + bell_w // 2, cy + bell_h // 4), fill=WHITE)
    # Base élargie
    bd2.rounded_rectangle(
        (cx - bell_w // 2 - 8, cy + bell_h // 6, cx + bell_w // 2 + 8, cy + bell_h // 2 + 4),
        radius=6,
        fill=WHITE,
    )
    # Battant (petite boule sous la cloche)
    bd2.ellipse(
        (cx - 8, cy + bell_h // 2 + 4, cx + 8, cy + bell_h // 2 + 20),
        fill=WHITE,
    )
    # Petit décrochage en haut (poignée)
    bd2.ellipse((cx - 7, cy - bell_h // 2 - 14, cx + 7, cy - bell_h // 2), fill=WHITE)
    canvas.alpha_composite(bell_layer)

    # Texte "S'ABONNER"
    font = _load_bold_font(64)
    draw = ImageDraw.Draw(canvas)
    text = "S'ABONNER"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    tx = pad + 200 + ((WIDTH - 200) - tw) // 2
    ty = pad + (HEIGHT - th) // 2 - bbox[1]
    draw.text((tx, ty), text, font=font, fill=WHITE)

    canvas.save(out_path)
    print(f"Wrote {out_path} ({canvas.size[0]}x{canvas.size[1]})")


if __name__ == "__main__":
    make_button(ASSETS / "subscribe_button.png")
