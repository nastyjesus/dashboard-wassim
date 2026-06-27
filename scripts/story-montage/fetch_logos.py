"""Fetch brand logos from Wikimedia Commons and turn each into a clean white 'sticker' card
(so even monochrome logos like ChatGPT stay readable over video). Saves assets/logo_<name>.png."""
import io
import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image, ImageDraw

ASSETS = Path(__file__).resolve().parent / "assets"
UA = {"User-Agent": "wassim-story-montage/1.0 (contact: loumiwassim@gmail.com)"}

# name -> Commons search query
BRANDS = {
    "chatgpt": "ChatGPT logo",
    "google": "Google G logo",
    "perplexity": "Perplexity AI logo",
    "claude": "Claude AI logo Anthropic",
    "gemini": "Google Gemini logo",
    "reddit": "Reddit logo",
}


def commons_search_file(query: str) -> str | None:
    api = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "query", "list": "search", "srsearch": query,
         "srnamespace": "6", "srlimit": "5", "format": "json"}
    )
    req = urllib.request.Request(api, headers=UA)
    data = json.loads(urllib.request.urlopen(req, timeout=20).read())
    hits = data.get("query", {}).get("search", [])
    for h in hits:
        title = h["title"]  # e.g. "File:ChatGPT logo.svg"
        if title.lower().endswith((".svg", ".png")):
            return title
    return hits[0]["title"] if hits else None


def download_raster(file_title: str, width: int = 500) -> Image.Image:
    name = file_title.split("File:", 1)[-1]
    url = "https://commons.wikimedia.org/wiki/Special:FilePath/" + urllib.parse.quote(name) + f"?width={width}"
    req = urllib.request.Request(url, headers=UA)
    raw = urllib.request.urlopen(req, timeout=30).read()
    return Image.open(io.BytesIO(raw)).convert("RGBA")


def trim_alpha(img: Image.Image) -> Image.Image:
    bbox = img.split()[3].getbbox()  # bbox of non-transparent
    return img.crop(bbox) if bbox else img


def make_card(logo: Image.Image, target_w: int = 360, pad: int = 46, radius: int = 56) -> Image.Image:
    logo = trim_alpha(logo)
    scale = target_w / logo.width
    logo = logo.resize((target_w, max(1, int(logo.height * scale))), Image.LANCZOS)
    cw, ch = logo.width + 2 * pad, logo.height + 2 * pad
    card = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    ImageDraw.Draw(card).rounded_rectangle([0, 0, cw - 1, ch - 1], radius=radius, fill=(255, 255, 255, 245))
    card.alpha_composite(logo, (pad, pad))
    return card


def main() -> None:
    ASSETS.mkdir(exist_ok=True)
    for name, query in BRANDS.items():
        out = ASSETS / f"logo_{name}.png"
        try:
            title = commons_search_file(query)
            if not title:
                print(f"!! {name}: no Commons match for '{query}'")
                continue
            raw = download_raster(title)
            card = make_card(raw)
            card.save(out)
            print(f"OK {name}: {title} -> {out.name} ({card.width}x{card.height})")
        except Exception as e:
            print(f"!! {name}: {e}")


if __name__ == "__main__":
    main()
