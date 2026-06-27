#!/usr/bin/env python3
"""Génère les cartes dorées du reel Instagram (intro + outro), 1080x1920.

- Carte INTRO  : titre de l'épisode (change à chaque vidéo) + kicker marque + handle.
- Carte OUTRO  : l'offre fixe (DIAGNOSTIC / 30 MIN. OFFERTES / 3 bullets / lien en bio)
                 + une ligne HOOK spécifique à l'épisode.

Reprend la charte dorée du modèle fourni par Wassim. Régénéré à CHAQUE montage (le texte
dépend du contenu transcrit). Consommé ensuite par make_ig_reel.py.

Usage :
  python make_ig_cards.py \
      --intro-title "POURQUOI GOOGLE T'IGNORE" \
      --hook "Le piège SEO vu dans cet épisode" \
      --intro-out assets/ig_intro_card.png \
      --outro-out assets/ig_outro_card.png
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"
ASSETS.mkdir(exist_ok=True)

W, H = 1080, 1920
MARGIN = 80

# Charte dorée (dégradé vertical doux, repris du modèle).
GOLD_TOP = (201, 167, 92)
GOLD_BOT = (176, 142, 74)
WHITE = (255, 255, 255, 255)
CREAM = (245, 239, 224, 255)
DARK = (58, 46, 18, 255)  # brun foncé pour les points d'accent / ombres


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    fp = Path(rf"C:\Windows\Fonts\{name}")
    if fp.exists():
        return ImageFont.truetype(str(fp), size)
    for fb in ("Montserrat-Black.ttf", "Montserrat-ExtraBold.ttf", "seguiblk.ttf", "arialbd.ttf"):
        p = Path(rf"C:\Windows\Fonts\{fb}")
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _gold_bg() -> Image.Image:
    """Fond doré, dégradé vertical subtil."""
    bg = Image.new("RGB", (W, H))
    px = bg.load()
    for y in range(H):
        f = y / (H - 1)
        col = tuple(int(GOLD_TOP[k] + (GOLD_BOT[k] - GOLD_TOP[k]) * f) for k in range(3))
        for x in range(W):
            px[x, y] = col
    return bg.convert("RGBA")


def _wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    cur = ""
    for w in words:
        trial = (cur + " " + w).strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def _draw_block(
    draw: ImageDraw.ImageDraw,
    text: str,
    font: ImageFont.FreeTypeFont,
    x: int,
    y: int,
    max_w: int,
    fill,
    line_gap: float = 1.06,
    accent_last_dot: bool = False,
) -> int:
    """Dessine un bloc multi-lignes gauche, renvoie le y du bas."""
    lines = _wrap(draw, text, font, max_w)
    asc, desc = font.getmetrics()
    lh = int((asc + desc) * line_gap)
    for i, ln in enumerate(lines):
        draw.text((x, y + i * lh), ln, font=font, fill=fill)
        # Accentue le point final (style modèle) en brun foncé.
        if accent_last_dot and i == len(lines) - 1 and ln.endswith("."):
            w_no_dot = draw.textlength(ln[:-1], font=font)
            draw.text((x + w_no_dot, y + i * lh), ".", font=font, fill=DARK)
    return y + len(lines) * lh


def _icon(draw: ImageDraw.ImageDraw, kind: str, cx: int, cy: int, s: int, color) -> None:
    """Petite icône ligne blanche : 'search' | 'check' | 'bolt'."""
    lw = max(3, s // 12)
    if kind == "search":
        r = s // 3
        draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=lw)
        draw.line((cx + r * 0.7, cy + r * 0.7, cx + s // 2, cy + s // 2), fill=color, width=lw)
    elif kind == "check":
        draw.line((cx - s // 3, cy, cx - s // 12, cy + s // 4), fill=color, width=lw)
        draw.line((cx - s // 12, cy + s // 4, cx + s // 3, cy - s // 4), fill=color, width=lw)
    elif kind == "bolt":
        draw.polygon(
            [
                (cx, cy - s // 2),
                (cx - s // 4, cy + s // 12),
                (cx - s // 30, cy + s // 12),
                (cx - s // 12, cy + s // 2),
                (cx + s // 4, cy - s // 12),
                (cx + s // 30, cy - s // 12),
            ],
            fill=color,
        )


def render_outro_card(out_path: Path, hook: str, handle: str = "@wassimloumi") -> None:
    """Carte d'offre (modèle Wassim) + ligne hook spécifique à l'épisode."""
    img = _gold_bg()
    draw = ImageDraw.Draw(img)
    max_w = W - MARGIN * 2

    # 1. Titre offre (FIXE).
    title_font = _font("Montserrat-ExtraBold.ttf", 92)
    y = _draw_block(
        draw,
        "JE VOUS OFFRE UN DIAGNOSTIC COMPLET DE VOTRE VISIBILITÉ.",
        title_font,
        MARGIN,
        150,
        max_w,
        WHITE,
        line_gap=1.02,
        accent_last_dot=True,
    )

    # 2. Ligne HOOK (spécifique à l'épisode).
    if hook:
        hook_font = _font("Montserrat-SemiBoldItalic.ttf", 46)
        y = _draw_block(draw, hook, hook_font, MARGIN, y + 50, max_w, CREAM, line_gap=1.1)

    # 3. Bullets (FIXES).
    bullets = [("search", "Analyse Google + IA"), ("check", "Correctifs prioritaires"), ("bolt", "Gains rapides identifiés")]
    bfont = _font("Montserrat-SemiBold.ttf", 48)
    by = max(y + 80, 900)
    for kind, label in bullets:
        _icon(draw, kind, MARGIN + 26, by + 26, 52, CREAM)
        draw.text((MARGIN + 90, by), label, font=bfont, fill=CREAM)
        by += 92

    # 4. Offre choc (FIXE).
    big = _font("Montserrat-Black.ttf", 168)
    oy = max(by + 80, 1300)
    _draw_block(draw, "30 MIN.", big, MARGIN, oy, max_w, WHITE, line_gap=0.96, accent_last_dot=True)
    _draw_block(draw, "OFFERTES.", big, MARGIN, oy + 175, max_w, WHITE, line_gap=0.96, accent_last_dot=True)

    # 5. Lien en bio (FIXE).
    foot = _font("Montserrat-SemiBoldItalic.ttf", 40)
    draw.text((MARGIN, H - 150), "Lien en bio pour me contacter !", font=foot, fill=CREAM)

    img.convert("RGB").save(out_path)
    print(f"Wrote {out_path} (outro, hook={hook!r})")


def render_intro_card(out_path: Path, title: str, kicker: str = "MINDSET SHIFT", handle: str = "@wassimloumi") -> None:
    """Carte d'intro : titre de l'épisode, grosse typo, charte dorée."""
    img = _gold_bg()
    draw = ImageDraw.Draw(img)
    max_w = W - MARGIN * 2

    # Kicker marque + filet accent.
    kfont = _font("Montserrat-ExtraBold.ttf", 44)
    draw.text((MARGIN, 230), kicker.upper(), font=kfont, fill=CREAM)
    draw.rectangle((MARGIN, 300, MARGIN + 180, 308), fill=DARK)

    # Titre épisode (taille adaptative selon longueur).
    size = 150 if len(title) <= 22 else (120 if len(title) <= 36 else 96)
    tfont = _font("Montserrat-Black.ttf", size)
    lines = _wrap(draw, title.upper(), tfont, max_w)
    asc, desc = tfont.getmetrics()
    lh = int((asc + desc) * 1.0)
    block_h = lh * len(lines)
    y = (H - block_h) // 2 - 60
    for i, ln in enumerate(lines):
        draw.text((MARGIN, y + i * lh), ln, font=tfont, fill=WHITE)

    # Handle bas.
    hfont = _font("Montserrat-ExtraBold.ttf", 44)
    draw.text((MARGIN, H - 160), handle, font=hfont, fill=CREAM)

    img.convert("RGB").save(out_path)
    print(f"Wrote {out_path} (intro, title={title!r})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--intro-title", required=True, help="Titre de l'épisode (carte intro)")
    ap.add_argument("--hook", default="", help="Ligne hook spécifique épisode (carte outro)")
    ap.add_argument("--kicker", default="MINDSET SHIFT", help="Kicker marque sur la carte intro")
    ap.add_argument("--handle", default="@wassimloumi")
    ap.add_argument("--intro-out", default=str(ASSETS / "ig_intro_card.png"))
    ap.add_argument("--outro-out", default=str(ASSETS / "ig_outro_card.png"))
    args = ap.parse_args()
    render_intro_card(Path(args.intro_out), args.intro_title, kicker=args.kicker, handle=args.handle)
    render_outro_card(Path(args.outro_out), args.hook, handle=args.handle)
