#!/usr/bin/env python3
"""
Story SEO montage pipeline.

Takes a raw vertical video (1080x1920 ideal) and produces a story-ready MP4 with:
- Burned-in animated French subtitles (whisper-transcribed)
- Subtle SEO-themed emoji overlays at detected keywords
- Story progress bar at the top
- Small handle watermark
- Light final zoom for punch

Requires: ffmpeg in PATH, faster-whisper, Pillow.
"""

from __future__ import annotations

import argparse
import io
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"

# ---------- Subtitle styling (ASS) ----------

ASS_HEADER_TEMPLATE = """[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes
WrapStyle: 2

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Story,{font},68,&H00FFFFFF,&H00FFFFFF,&H00000000,&HB0000000,1,0,0,0,100,100,0,0,1,5,3,2,60,60,380,1
Style: StoryAccent,{font},68,{accent_ass},&H00FFFFFF,&H00000000,&HB0000000,1,0,0,0,100,100,0,0,1,5,3,2,60,60,380,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

SEO_KEYWORDS = {
    # keyword (lowercase, accent-stripped) -> emoji to pop
    "google": "🔍",
    "seo": "📈",
    "référencement": "📈",
    "referencement": "📈",
    "classement": "🏆",
    "ranking": "🏆",
    "mot-clé": "🔑",
    "mot-cles": "🔑",
    "mots-clés": "🔑",
    "mots-cles": "🔑",
    "keyword": "🔑",
    "backlink": "🔗",
    "backlinks": "🔗",
    "trafic": "🚦",
    "site": "🌐",
    "page": "📄",
    "contenu": "✍️",
    "algorithme": "🤖",
    "algo": "🤖",
    "indexation": "📚",
    "indexer": "📚",
    "crawler": "🕷️",
    "robot": "🤖",
    "data": "📊",
    "stratégie": "🎯",
    "strategie": "🎯",
    "client": "🤝",
    "vente": "💰",
    "argent": "💰",
}

# Words that trigger a short "punch zoom" on the video (dynamism on key moments).
PUNCH_WORDS = {"gpt", "chatgpt", "4gpt", "perplexity", "plexity", "claude", "cloud", "google", "hubspot", "gemini", "gmini", "mistral", "reddit", "clarity"}

# --- Targeted story cut: hesitations / bugs / language tics (--cut-fillers) ---
# The story keeps its natural rhythm; we only excise doubt/hesitation sounds, false starts (stutters)
# and verbal crutches. Kept conservative on purpose (over-cutting sounds choppy): tune per video with
# --filler-words / --filler-phrases. Tokens are normalized (lowercase, accents stripped, no punctuation).
FILLER_WORDS = {"euh", "heu", "heuh", "hein", "hum", "hmm", "mmh", "mh", "bah", "ben"}
# Multi-word tics cut as one block only when spoken consecutively (normalized token sequences).
FILLER_PHRASES = [
    ["en", "fait"],
    ["du", "coup"],
    ["tu", "vois"],
    ["en", "gros"],
]

# Subtitle spelling fixes: Whisper mis-hears brand/tech names. Normalized token -> correct display word.
# Applied to the caption text only (keys are lowercased + accent-stripped). Extend as needed.
SUBTITLE_CORRECTIONS = {
    "cloud": "Claude",
    "claude": "Claude",
    "ria": "IA",
    "rias": "IA",
    "ia": "IA",
    "chatgpt": "ChatGPT",
    "4gpt": "ChatGPT",
    "gpt": "GPT",
    "hubspot": "HubSpot",
    "perplexity": "Perplexity",
    "perplexi": "Perplexity",
    "plexity": "Perplexity",
    "google": "Google",
    "gemini": "Gemini",
    "gmini": "Gemini",
    "reddit": "Reddit",
    "seo": "SEO",
    "geo": "GEO",
    "cro": "CRO",
    # Whisper mis-hears the CTA verb "n'hésite" as "hésise"/"hésites".
    "hesise": "hésite",
    "hesises": "hésite",
    "hesites": "hésite",
    # Whisper entend "Suivant" comme "Sevant".
    "sevant": "Suivant",
    # Whisper entend "afficher" comme "ficher".
    "ficher": "afficher",
    # Whisper entend "abandonné"/"abandon" comme "abondonné"/"abondant".
    "abondonne": "abandonné",
    "abondonnes": "abandonnés",
    "abondant": "abandon",
}

# Brand-name keyword -> filename in assets/ to overlay when that brand is mentioned.
# 'cloud' is a common mis-transcription of 'Claude'. Add new brands here once their logo is in assets/.
BRAND_LOGOS = {
    "hubspot": "logo_hubspot.png",
    "chatgpt": "logo_chatgpt.png",
    "gpt": "logo_chatgpt.png",
    "4gpt": "logo_chatgpt.png",
    "google": "logo_google.png",
    "perplexity": "logo_perplexity.png",
    "plexity": "logo_perplexity.png",
    "claude": "logo_claude.png",
    "cloud": "logo_claude.png",
    "gemini": "logo_gemini.png",
    "gmini": "logo_gemini.png",
    "reddit": "logo_reddit.png",
    "clarity": "logo_clarity.png",
}


def strip_accents(s: str) -> str:
    import unicodedata

    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def run(cmd: list[str], check: bool = True) -> subprocess.CompletedProcess:
    print(f"$ {' '.join(cmd)}")
    return subprocess.run(cmd, check=check)


def transcribe(audio_path: Path, out_json: Path, model_size: str = "small") -> list[dict]:
    from faster_whisper import WhisperModel

    print(f"Loading faster-whisper ({model_size})…")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")
    segments, info = model.transcribe(
        str(audio_path),
        language="fr",
        vad_filter=True,
        word_timestamps=True,
        beam_size=5,
    )

    result = []
    for seg in segments:
        words = []
        if seg.words:
            for w in seg.words:
                words.append({"start": float(w.start), "end": float(w.end), "word": w.word})
        result.append(
            {
                "start": float(seg.start),
                "end": float(seg.end),
                "text": seg.text.strip(),
                "words": words,
            }
        )
        print(f"  [{seg.start:6.2f} - {seg.end:6.2f}] {seg.text.strip()}")

    out_json.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


def group_words(segments: list[dict], max_words: int = 4, max_chars: int = 26) -> list[dict]:
    """Group words into short chunks for dynamic story-style captions. Keeps per-word timings on each chunk."""
    chunks = []
    for seg in segments:
        words = seg["words"] or []
        if not words:
            chunks.append({"start": seg["start"], "end": seg["end"], "text": seg["text"], "words": []})
            continue
        buf = []
        buf_chars = 0
        for w in words:
            tok = w["word"].strip()
            if not tok:
                continue
            if buf and (len(buf) >= max_words or buf_chars + len(tok) + 1 > max_chars):
                chunks.append(
                    {
                        "start": buf[0]["start"],
                        "end": buf[-1]["end"],
                        "text": " ".join(x["word"].strip() for x in buf),
                        "words": list(buf),
                    }
                )
                buf = []
                buf_chars = 0
            buf.append(w)
            buf_chars += len(tok) + 1
        if buf:
            chunks.append(
                {
                    "start": buf[0]["start"],
                    "end": buf[-1]["end"],
                    "text": " ".join(x["word"].strip() for x in buf),
                    "words": list(buf),
                }
            )
    return chunks


def fmt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t - h * 3600 - m * 60
    return f"{h:01d}:{m:02d}:{s:05.2f}"


def hex_to_ass_color(hex_color: str) -> str:
    """Convert #RRGGBB to ASS &H00BBGGRR (BGR byte order, alpha 00 = opaque)."""
    h = hex_color.lstrip("#")
    if len(h) != 6:
        raise ValueError(f"Invalid hex color: {hex_color}")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H00{b}{g}{r}".upper()


def hex_to_ass_inline(hex_color: str) -> str:
    """Inline ASS color override, e.g. {\\c&HBBGGRR&}."""
    h = hex_color.lstrip("#")
    r, g, b = h[0:2], h[2:4], h[4:6]
    return f"&H{b}{g}{r}&".upper()


def write_ass(
    chunks: list[dict],
    out_ass: Path,
    font: str = "Montserrat",
    accent_hex: str = "#2563EB",
    accent_words: set[str] | None = None,
) -> None:
    """Karaoke-style captions: each word pops up (scale + color) when spoken.
    Builds per-word \\t() transforms so a viewer sees a TikTok-like read-along caption."""
    accent_ass = hex_to_ass_color(accent_hex)
    accent_inline = hex_to_ass_inline(accent_hex)
    highlight_inline = hex_to_ass_inline("#FBBF24")  # bright amber for non-accent active word
    lines = [ASS_HEADER_TEMPLATE.format(font=font, accent_ass=accent_ass)]
    accent_words = accent_words or set()
    accent_words_norm = {strip_accents(w).lower() for w in accent_words}

    for ch in chunks:
        chunk_start = ch["start"]
        start = fmt_time(chunk_start)
        end = fmt_time(ch["end"])
        ch_words = ch.get("words") or []

        if not ch_words:
            # No word timings (rare): render chunk text statically.
            text = ch["text"].replace("\n", " ").upper()
            text_ass = "{\\fad(120,80)\\c&HFFFFFF&}" + text
            lines.append(f"Dialogue: 0,{start},{end},Story,,0,0,0,,{text_ass}")
            continue

        parts = []
        for w in ch_words:
            raw = w["word"].strip()
            if not raw:
                continue
            # Fix common mis-transcriptions (cloud->Claude, ria->IA, ...) for a coherent caption.
            tok_norm = strip_accents(re.sub(r"[^\w\-]", "", raw.lower()))
            corrected = SUBTITLE_CORRECTIONS.get(tok_norm, raw)
            tok = corrected.strip().upper()
            if not tok:
                continue
            # Relative ms inside this Dialogue event.
            rel_in = max(0, int((w["start"] - chunk_start) * 1000))
            rel_out = max(rel_in + 80, int((w["end"] - chunk_start) * 1000))
            is_accent = tok_norm in accent_words_norm
            active = accent_inline if is_accent else highlight_inline
            # Base state: white at 95%. Pops to 118% + accent color at word.start, snaps back at word.end.
            tag = (
                "{\\c&HFFFFFF&\\fscx95\\fscy95"
                f"\\t({rel_in},{rel_in + 70},\\fscx118\\fscy118\\c{active})"
                f"\\t({rel_out},{rel_out + 70},\\fscx100\\fscy100\\c&HFFFFFF&)"
                "}"
            )
            parts.append(tag + tok)

        text_styled = " ".join(parts)
        # Whole-chunk fade in/out so chunk transitions stay smooth.
        text_ass = "{\\fad(80,60)}" + text_styled
        lines.append(f"Dialogue: 0,{start},{end},Story,,0,0,0,,{text_ass}")

    out_ass.write_text("\n".join(lines), encoding="utf-8")


def find_punch_times(segments: list[dict], punch_words: set[str]) -> list[float]:
    """Return start-timestamps of spoken punch words for short zoom pulses."""
    times: list[float] = []
    norm = {strip_accents(w).lower() for w in punch_words}
    for seg in segments:
        for w in seg["words"] or []:
            tok = re.sub(r"[^a-z\-]", "", strip_accents(w["word"].strip().lower()))
            if tok and tok in norm:
                times.append(float(w["start"]))
    # Dedup within 0.6s window (avoid double-firing on adjacent tokens).
    times.sort()
    out: list[float] = []
    for t in times:
        if not out or t - out[-1] > 0.6:
            out.append(t)
    return out


def _norm_token(word: str) -> str:
    """Lowercase, strip accents + punctuation -> comparable token ('Euh,' -> 'euh')."""
    return re.sub(r"[^a-z0-9]", "", strip_accents(word.strip().lower()))


def find_filler_ranges(
    segments: list[dict],
    filler_words: set[str],
    filler_phrases: list[list[str]],
    cut_stutter: bool = True,
    pad: float = 0.06,
) -> list[tuple[float, float]]:
    """Time ranges to delete for a targeted story cut: hesitation sounds + verbal-crutch words,
    multi-word tics spoken back-to-back, and immediate stutters (a word repeated right after itself,
    e.g. 'je je', 'le le' = a false start / bug). Returns merged, padded (start,end) ranges on the
    CURRENT timeline of `segments`. Silences are handled separately by cut_silence()."""
    flat: list[tuple[str, float, float]] = []
    for seg in segments:
        for w in seg.get("words") or []:
            tok = _norm_token(w["word"])
            if tok:
                flat.append((tok, float(w["start"]), float(w["end"])))

    filler_norm = {_norm_token(w) for w in filler_words}
    phrases_norm = [[_norm_token(x) for x in ph] for ph in filler_phrases if ph]
    removes: list[tuple[float, float]] = []
    n = len(flat)
    i = 0
    while i < n:
        tok, s, e = flat[i]
        # 1. Multi-word tic: match the longest phrase whose tokens are consecutive here.
        matched = False
        for ph in sorted(phrases_norm, key=len, reverse=True):
            m = len(ph)
            if i + m <= n and [flat[i + k][0] for k in range(m)] == ph:
                removes.append((flat[i][1], flat[i + m - 1][2]))
                i += m
                matched = True
                break
        if matched:
            continue
        # 2. Single filler token (hesitation / crutch word).
        if tok in filler_norm:
            removes.append((s, e))
            i += 1
            continue
        # 3. Immediate stutter: same token repeated back-to-back within 0.5s -> cut the first one.
        if cut_stutter and i + 1 < n and flat[i + 1][0] == tok and len(tok) >= 1 and flat[i + 1][1] - e < 0.5:
            removes.append((s, e))
            i += 1
            continue
        i += 1

    if not removes:
        return []
    # Pad a touch so the trailing breath goes with the word, then merge overlaps.
    padded = sorted((max(0.0, a - pad), b + pad) for a, b in removes)
    merged: list[list[float]] = []
    for a, b in padded:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def find_brand_mentions(segments: list[dict]) -> list[dict]:
    """Earliest mention per distinct logo FILE (so 'gpt'/'chatgpt' or 'claude'/'cloud' don't double up),
    sorted by time. Returns [{'file': fname, 'spoken': float}]."""
    best: dict[str, float] = {}
    for seg in segments:
        for w in seg["words"] or []:
            tok = re.sub(r"[^a-z\-]", "", strip_accents(w["word"].strip().lower()))
            fname = BRAND_LOGOS.get(tok)
            if fname is None:
                continue
            t = float(w["start"])
            if fname not in best or t < best[fname]:
                best[fname] = t
    out = [{"file": f, "spoken": s} for f, s in best.items()]
    out.sort(key=lambda x: x["spoken"])
    return out


def build_zoom_expression(
    times: list[float],
    strength: float = 0.08,
    rise: float = 0.4,
    hold: float = 2.5,
    fall: float = 0.6,
) -> str:
    """Build an ffmpeg expression for the zoom factor Z(t): 1.0 baseline, +strength when zoomed in.
    Each punch is a trapezoid that eases IN over `rise`s, HOLDS zoomed for `hold`s (so the viewer can
    read/breathe), then eases back over `fall`s — instead of a quick in-out punch. Cosine eases the
    ramps; the plateau stays flat at full zoom. Overlapping punches merge via max() into one sustained
    hold. Commas escaped (\\,) for filter syntax."""
    if not times:
        return "1"
    pulses = []
    for t0 in times:
        t_end = t0 + rise + hold + fall
        # Trapezoid in [0,1]: rises 0->1 over `rise`, flat 1 across the hold, falls 1->0 over `fall`.
        env = f"clip(min((t-{t0:.3f})/{rise}\\,({t_end:.3f}-t)/{fall})\\,0\\,1)"
        # Cosine-ease the ramps; flat where env==1 (cos(PI)= -1 -> value 1).
        pulses.append(f"(0.5-0.5*cos(PI*{env}))")
    expr = pulses[0]
    for p in pulses[1:]:
        expr = f"max({expr}\\,{p})"
    return f"(1+{strength}*({expr}))"


def build_pop_scale_expr(base_w: int, appear: float, dur: float = 0.45, overshoot: float = 1.70158) -> str:
    """ffmpeg width expression for a 'pop' entrance: back-ease-out (grows, slightly overshoots, settles).
    Drives scale=eval=frame on a logo input looped for the whole timeline, so its t == global t.
    Built with multiplications (not pow) to avoid NaN on negative bases. Commas escaped for filter syntax."""
    c1 = overshoot
    c3 = overshoot + 1.0
    # p in [0,1] over the pop duration starting at `appear`.
    p = f"clip((t-{appear:.3f})/{dur}\\,0\\,1)"
    q = f"({p}-1)"
    s = f"(1+{c3:.5f}*{q}*{q}*{q}+{c1:.5f}*{q}*{q})"
    # max(2,..) keeps the width valid (>=2px) while the logo is still hidden (enable off).
    return f"max(2\\,{base_w}*{s})"


def _probe_duration(src: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(src)]
    )
    return float(out.strip())


# HDR (HLG/PQ) sources dumped to SDR without tonemapping come out washed-out/overexposed.
# Samsung phone footage is HLG (arib-std-b67). Hable picked over mobius: mobius leaves
# highlights blown on this footage. desat=2 (not 0): desat=0 leaves lit skin oversaturated
# -> faces come out too red/orange. desat=2 re-enables highlight desaturation = natural skin.
# npl=400 (not 100): the HLG signal peaks well above 100 nits, so declaring 100 leaves the
# tonemapper nothing to compress -> ceiling and white t-shirt clip to pure white. 1000 is
# too dark on this footage.
HDR_TRANSFERS = {"arib-std-b67", "smpte2084"}
TONEMAP_SDR = (
    "zscale=t=linear:npl=400,format=gbrpf32le,zscale=p=bt709,"
    "tonemap=hable:desat=2,zscale=t=bt709:m=bt709:r=tv,format=yuv420p"
)


def _probe_color_transfer(src: Path) -> str:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-select_streams", "v:0",
         "-show_entries", "stream=color_transfer",
         "-of", "default=noprint_wrappers=1:nokey=1", str(src)]
    )
    return out.decode().strip()


def cut_silence(src: Path, out: Path, threshold_db: float, min_silence: float, pad: float = 0.10,
                tonemap: bool = True) -> None:
    """Remove silent/breathing pauses and concat the spoken segments into a tighter clip.
    Uses ffmpeg silencedetect to find pauses, keeps the complement (padded so word edges aren't clipped),
    then trim+concat with a re-encode."""
    duration = _probe_duration(src)
    print(f"Detecting silences (<{threshold_db}dB for >{min_silence}s) ...")
    proc = subprocess.run(
        ["ffmpeg", "-i", str(src), "-af",
         f"silencedetect=noise={threshold_db}dB:d={min_silence}", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    log = proc.stderr
    starts = [float(x) for x in re.findall(r"silence_start:\s*([\-\d.]+)", log)]
    ends = [float(x) for x in re.findall(r"silence_end:\s*([\d.]+)", log)]
    # Pair starts with ends; a trailing start without an end means it's silent until the end.
    silences = []
    for i, s in enumerate(starts):
        e = ends[i] if i < len(ends) else duration
        silences.append((max(0.0, s), min(duration, e)))

    # Keep = complement of silences, padded a touch on each side, merged.
    keeps: list[list[float]] = []
    prev = 0.0
    for s, e in sorted(silences):
        if s > prev:
            keeps.append([prev, s])
        prev = max(prev, e)
    if prev < duration:
        keeps.append([prev, duration])
    padded = [[max(0.0, a - pad), min(duration, b + pad)] for a, b in keeps]
    merged: list[list[float]] = []
    for seg in padded:
        if merged and seg[0] <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], seg[1])
        else:
            merged.append(seg)
    merged = [s for s in merged if s[1] - s[0] > 0.05]

    removed = duration - sum(b - a for a, b in merged)
    print(f"  {len(silences)} silences -> keeping {len(merged)} segments, cutting ~{removed:.1f}s")

    is_hdr = _probe_color_transfer(src) in HDR_TRANSFERS
    hdr = is_hdr and tonemap          # apply the hable tonemap
    preserve = is_hdr and not tonemap  # HDR source but keep base colors (just 10->8 bit)
    if hdr:
        print("  HDR source detected -> tonemapping to SDR (bt709, hable)")
    elif preserve:
        print("  HDR source detected -> --no-tonemap: preserving base colors (10->8 bit only)")

    if not merged or removed < 0.15:
        print("  Nothing meaningful to cut; copying through.")
        if hdr:
            run(["ffmpeg", "-y", "-i", str(src), "-vf", TONEMAP_SDR,
                 "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-c:a", "copy", "-movflags", "+faststart", str(out)])
        elif preserve:
            # Keep base pixel values (no tonemap) but RE-TAG as bt709 SDR so colour-managed
            # renderers (Chrome/HyperFrames) don't re-apply an HLG->SDR tonemap and darken it.
            run(["ffmpeg", "-y", "-i", str(src),
                 "-vf", "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p",
                 "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                 "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
                 "-c:a", "copy", "-movflags", "+faststart", str(out)])
        else:
            run(["ffmpeg", "-y", "-i", str(src), "-c", "copy", str(out)])
        return

    parts = []
    for i, (a, b) in enumerate(merged):
        parts.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}]")
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(len(merged)))
    parts.append(f"{concat_in}concat=n={len(merged)}:v=1:a=1[v][a]")
    fc = ";".join(parts)
    v_map = "[v]"
    if hdr:
        fc += f";[v]{TONEMAP_SDR}[vsdr]"
        v_map = "[vsdr]"
    enc = ["-c:v", "libx264", "-crf", "18", "-preset", "medium"]
    if preserve:
        # HDR 10-bit source, no tonemap: keep base values but re-tag bt709 SDR (8-bit) so
        # colour-managed renderers don't re-tonemap HLG and darken the image.
        fc += ";[v]setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709,format=yuv420p[vout]"
        v_map = "[vout]"
        enc += ["-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709"]
    run(
        ["ffmpeg", "-y", "-i", str(src), "-filter_complex", fc,
         "-map", v_map, "-map", "[a]",
         *enc,
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    )


def parse_ranges(spec: str, duration: float) -> list[tuple[float, float]]:
    """Parse '0.0-1.5,12.3-13.0' into clamped, sorted, merged (start,end) ranges to delete."""
    ranges = []
    for chunk in spec.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        m = re.match(r"^([\d.]+)\s*-\s*([\d.]+)$", chunk)
        if not m:
            raise ValueError(f"Bad range '{chunk}' (expected A-B in seconds)")
        a, b = float(m.group(1)), float(m.group(2))
        a, b = max(0.0, min(a, b)), min(duration, max(a, b))
        if b - a > 0.02:
            ranges.append((a, b))
    ranges.sort()
    merged: list[list[float]] = []
    for a, b in ranges:
        if merged and a <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], b)
        else:
            merged.append([a, b])
    return [(a, b) for a, b in merged]


def remove_ranges(src: Path, out: Path, removes: list[tuple[float, float]], duration: float) -> None:
    """Delete the given time ranges (flubs/laughs/false starts) and concat the kept complement.
    Same trim+concat mechanism as cut_silence, but the cut list is explicit rather than silence-derived."""
    keeps: list[tuple[float, float]] = []
    prev = 0.0
    for a, b in removes:
        if a > prev:
            keeps.append((prev, a))
        prev = max(prev, b)
    if prev < duration:
        keeps.append((prev, duration))
    keeps = [(a, b) for a, b in keeps if b - a > 0.05]
    cut = sum(b - a for a, b in removes)
    print(f"Removing {len(removes)} range(s) (~{cut:.1f}s) -> keeping {len(keeps)} segment(s)")
    if not keeps:
        raise ValueError("remove-ranges would delete the entire clip")
    parts = []
    for i, (a, b) in enumerate(keeps):
        parts.append(f"[0:v]trim={a:.3f}:{b:.3f},setpts=PTS-STARTPTS[v{i}]")
        parts.append(f"[0:a]atrim={a:.3f}:{b:.3f},asetpts=PTS-STARTPTS[a{i}]")
    concat_in = "".join(f"[v{i}][a{i}]" for i in range(len(keeps)))
    parts.append(f"{concat_in}concat=n={len(keeps)}:v=1:a=1[v][a]")
    fc = ";".join(parts)
    run(
        ["ffmpeg", "-y", "-i", str(src), "-filter_complex", fc,
         "-map", "[v]", "-map", "[a]",
         "-c:v", "libx264", "-crf", "18", "-preset", "medium",
         "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)]
    )


def ensure_pop_sound(path: Path, sr: int = 48000) -> Path:
    """Synthesize a realistic 'bubble pop' once, cached as a stereo WAV.
    Physics of a real pop: a short resonant blip whose pitch RISES as it decays very fast, plus a
    tiny noise transient for the 'plosive' attack. (A downward sweep sounds like a 'boop', not a pop.)"""
    if path.exists():
        return path
    import wave
    import numpy as np

    dur = 0.085
    n = int(sr * dur)
    t = np.linspace(0, dur, n, endpoint=False)
    # Rising pitch (bubble collapse) + very fast decay -> crisp "pop".
    f0, f1 = 680.0, 1550.0
    freq = f0 * (f1 / f0) ** (t / dur)
    phase = 2 * np.pi * np.cumsum(freq) / sr
    env = np.exp(-t / 0.018)
    sig = np.sin(phase) * env
    # Short filtered-noise attack transient (the 'p' of the pop).
    rng = np.random.default_rng(7)
    click_n = int(sr * 0.004)
    noise = rng.standard_normal(click_n) * np.exp(-np.linspace(0, 6, click_n)) * 0.5
    sig[:click_n] += noise
    sig = sig / (np.max(np.abs(sig)) + 1e-9) * 0.6
    pcm = (np.stack([sig, sig], axis=1) * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(sr)
        wf.writeframes(pcm.tobytes())
    print(f"Generated pop sound: {path.name}")
    return path


def find_keyword_pops(segments: list[dict]) -> list[dict]:
    """Find timestamps where SEO keywords are spoken, to overlay emoji."""
    pops = []
    for seg in segments:
        words = seg["words"] or []
        for w in words:
            tok = strip_accents(w["word"].strip().lower())
            tok = re.sub(r"[^a-z\-]", "", tok)
            if not tok:
                continue
            if tok in SEO_KEYWORDS:
                pops.append({"start": w["start"], "emoji": SEO_KEYWORDS[tok], "word": w["word"]})
    # Deduplicate: keep one pop per 1.5s window per emoji
    pops.sort(key=lambda x: x["start"])
    dedup = []
    last_by_emoji: dict[str, float] = {}
    for p in pops:
        if p["start"] - last_by_emoji.get(p["emoji"], -10) < 1.5:
            continue
        dedup.append(p)
        last_by_emoji[p["emoji"]] = p["start"]
    return dedup


def render_emoji_png(emoji: str, out_path: Path, size: int = 320) -> None:
    """Render an emoji to a PNG with a soft white backdrop pill — TikTok-style sticker look.
    Downloads from Twemoji (cleaner & cross-platform) and falls back to system color-emoji font."""
    from PIL import Image, ImageDraw, ImageFilter
    import urllib.request

    glyph = _fetch_twemoji(emoji, target_px=size - 60)
    if glyph is None:
        glyph = _render_emoji_via_font(emoji, target_px=size - 60)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    # Soft white pill backdrop with subtle blur for a sticker feel.
    pad = 12
    backdrop = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(backdrop).ellipse(
        (pad, pad, size - pad, size - pad), fill=(255, 255, 255, 240)
    )
    backdrop = backdrop.filter(ImageFilter.GaussianBlur(2))
    canvas.alpha_composite(backdrop)

    if glyph is not None:
        gx = (size - glyph.width) // 2
        gy = (size - glyph.height) // 2
        canvas.alpha_composite(glyph, (gx, gy))
    canvas.save(out_path)


def _fetch_twemoji(emoji: str, target_px: int = 260):
    """Try to fetch a Twemoji 72×72 PNG and upscale it with LANCZOS."""
    from PIL import Image
    import urllib.request

    # Twemoji codepoints: drop variation selector U+FE0F.
    cps = [f"{ord(c):x}" for c in emoji if ord(c) != 0xFE0F]
    if not cps:
        return None
    code = "-".join(cps)
    url = f"https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/72x72/{code}.png"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "story-montage"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = resp.read()
        img = Image.open(io.BytesIO(data)).convert("RGBA")
        return img.resize((target_px, target_px), Image.LANCZOS)
    except Exception as e:
        print(f"  ! twemoji fetch failed for {emoji!r} ({code}): {e}")
        return None


def _render_emoji_via_font(emoji: str, target_px: int = 260):
    """Fallback: render the emoji via a locally-installed color-emoji font."""
    from PIL import Image, ImageDraw, ImageFont

    candidate_fonts = [
        "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
        "/System/Library/Fonts/Apple Color Emoji.ttc",
        "C:\\Windows\\Fonts\\seguiemj.ttf",
        "/usr/share/fonts/google-noto-color-emoji-fonts/NotoColorEmoji.ttf",
    ]
    size = target_px
    font = None
    for fp in candidate_fonts:
        if os.path.exists(fp):
            try:
                # NotoColorEmoji only supports specific bitmap sizes (typically 109)
                font = ImageFont.truetype(fp, 109 if "Noto" in fp else size)
                break
            except Exception:
                continue
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if font:
        try:
            bbox = draw.textbbox((0, 0), emoji, font=font, embedded_color=True)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            draw.text(
                ((size - tw) // 2 - bbox[0], (size - th) // 2 - bbox[1]),
                emoji,
                font=font,
                embedded_color=True,
            )
        except Exception:
            draw.text((size // 4, size // 4), emoji, fill=(255, 255, 255, 255))
    else:
        draw.ellipse((10, 10, size - 10, size - 10), fill=(255, 200, 0, 230))
    return img


def build_filter_complex(
    chunks_ass: Path,
    pops: list[dict],
    emoji_files: dict[str, Path],
    duration: float,
    handle: str,
    accent_hex: str = "#2563EB",
    punch_times: list[float] | None = None,
    brand_overlays: list[dict] | None = None,
    progress_bar: bool = False,
) -> str:
    """Build the ffmpeg filter graph: zoom punches + subtitles + overlays + progress bar + watermark + brand logos."""
    fc = []
    last_label = "[0:v]"
    accent_ff = "0x" + accent_hex.lstrip("#").upper()  # ffmpeg accepts 0xRRGGBB

    # 0. Zoom punches: scale up by Z(t) (eval per-frame) then center-crop back to 1080x1920.
    #    `scale` supports eval=frame here (crop does not in ffmpeg 8.x); crop with default x/y
    #    centers automatically using the frame's actual dimensions.
    if punch_times:
        Z = build_zoom_expression(punch_times)
        # Pre-scale to 1080x1920 FIRST so the zoom-crop has a frame >= the crop size.
        # Without this, low-res sources (e.g. 464x832 phone clips) scaled by the small zoom
        # factor stay below 1080x1920, and `crop=1080:1920` fails with "Invalid too big size".
        fc.append(
            f"{last_label}scale=1080:1920,setsar=1,"
            f"scale=w='trunc(iw*{Z}/2)*2':h='trunc(ih*{Z}/2)*2':eval=frame,"
            f"crop=1080:1920,setsar=1[v0z]"
        )
        last_label = "[v0z]"

    # 1. Subtitles (.ass burned-in)
    # Escape ':' so Windows drive letters (C:/...) aren't parsed as filter option separators.
    ass_path = chunks_ass.as_posix().replace(":", r"\:")
    fc.append(f"{last_label}ass='{ass_path}'[v1]")
    last_label = "[v1]"

    if progress_bar:
        # 2. Progress bar background pill (subtle white track)
        fc.append(
            f"{last_label}drawbox=x=40:y=40:w=1000:h=8:color=white@0.25:t=fill[v2]"
        )
        last_label = "[v2]"

        # 3. Progress bar fill in brand accent color
        fc.append(
            f"{last_label}drawbox=x=40:y=40:w='(t/{duration})*1000':h=8:"
            f"color={accent_ff}@0.95:t=fill[v3]"
        )
        last_label = "[v3]"

    # 4. Handle watermark bottom-left, dark pill + white text + thin accent underline
    safe_handle = handle.replace("'", r"\'").replace(":", r"\:")
    fc.append(
        f"{last_label}drawbox=x=40:y=h-150:w=320:h=70:color=black@0.55:t=fill[v4a]"
    )
    last_label = "[v4a]"
    fc.append(
        f"{last_label}drawbox=x=40:y=h-82:w=320:h=3:color={accent_ff}@0.95:t=fill[v4b]"
    )
    last_label = "[v4b]"
    # drawtext needs an explicit fontfile on Windows builds whose libfontconfig is unconfigured (otherwise: 0xC0000005).
    drawtext_font = ""
    if sys.platform == "win32":
        for candidate in (r"C:/Windows/Fonts/segoeuib.ttf", r"C:/Windows/Fonts/arialbd.ttf"):
            if os.path.exists(candidate):
                drawtext_font = f"fontfile='{candidate.replace(':', chr(92) + ':')}':"
                break
    fc.append(
        f"{last_label}drawtext={drawtext_font}text='{safe_handle}':fontcolor=white@0.95:fontsize=34:"
        f"x=64:y=h-130[v4]"
    )
    last_label = "[v4]"

    # 5. Defensive scale to 1080x1920
    fc.append(f"{last_label}scale=1080:1920,setsar=1[v5]")
    last_label = "[v5]"

    # 6. Emoji overlays (top-right area, alternating slightly)
    input_index = 1  # input 0 is the main video
    if pops and emoji_files:
        for i, pop in enumerate(pops):
            emoji = pop["emoji"]
            if emoji not in emoji_files:
                continue
            start = pop["start"]
            end = min(duration, start + 1.4)
            x = 780 + (i % 2) * 20  # right side, slight jitter
            y = 200 + (i % 3) * 80
            new_label = f"[v{6+i}]"
            fc.append(
                f"{last_label}[{input_index}:v]overlay=x={x}:y={y}:"
                f"enable='between(t,{start:.2f},{end:.2f})':alpha=1{new_label}"
            )
            last_label = new_label
            input_index += 1

    # 7. Brand logos: pop in (scale overshoot) on appearance, centered, dwell ~2.5s.
    #    Each logo input is looped for the whole clip (see main) so scale's per-frame `t` == global t,
    #    letting the pop curve fire exactly at the mention time. overlay centers on (w,h) each frame.
    if brand_overlays:
        for i, brand in enumerate(brand_overlays):
            start = brand["start"]
            end = brand.get("end", min(duration, start + 2.0))
            base_w = brand.get("base_w", 500)
            cy = 300 + brand.get("row", 0) * 260  # stack rows top-down so concurrent logos never overlap
            w_expr = build_pop_scale_expr(base_w, start)
            scaled_label = f"[blogo{i}]"
            new_label = f"[vb{i}]"
            fc.append(f"[{input_index}:v]scale=w='{w_expr}':h=-1:eval=frame{scaled_label}")
            fc.append(
                f"{last_label}{scaled_label}overlay=x='(W-w)/2':y='{cy}-h/2':"
                f"enable='between(t,{start:.2f},{end:.2f})'{new_label}"
            )
            last_label = new_label
            input_index += 1

    # Rename last label to [vout]
    fc[-1] = fc[-1].rsplit("[", 1)[0] + "[vout]"
    return ";".join(fc)


def main():
    ap = argparse.ArgumentParser(description="Story SEO montage")
    ap.add_argument("--input", required=True, help="Source video path")
    ap.add_argument("--output", default="story_finale.mp4", help="Output file")
    ap.add_argument("--handle", default="@wassimloumi", help="Watermark handle")
    ap.add_argument(
        "--clean",
        action="store_true",
        help="Story epuree: keep ONLY dynamic zooms + karaoke subtitles + @handle watermark + blurred "
        "background. Drops ALL inserts/incrustations: brand logos, emoji/keyword pops, pop sound, "
        "progress bar. Use for the story render; short/reel keep the full habillage.",
    )
    ap.add_argument("--model", default="small", help="faster-whisper model size")
    ap.add_argument("--skip-transcribe", action="store_true", help="Reuse existing transcript.json")
    ap.add_argument(
        "--font",
        default="Montserrat",
        help="Subtitle font name (must be installed locally; falls back to default sans)",
    )
    ap.add_argument(
        "--accent",
        default="#2563EB",
        help="Brand accent hex color (progress bar, watermark underline, keyword highlights)",
    )
    ap.add_argument(
        "--accent-words",
        default="seo,google,backlink,backlinks,mots-clés,mot-clé,classement,trafic,algorithme,indexation,référencement",
        help="Comma-separated list of words to highlight in the accent color in subtitles",
    )
    ap.add_argument(
        "--punch-words",
        default=",".join(sorted(PUNCH_WORDS)),
        help="Comma-separated list of words that trigger a short zoom punch on the video",
    )
    ap.add_argument(
        "--punch-times",
        default=None,
        help="Comma-separated explicit timestamps (seconds) for zoom punches. Overrides word-based "
        "detection — use for music-only clips with no speech (e.g. beat-synced punches).",
    )
    ap.add_argument(
        "--no-progress-bar",
        action="store_true",
        default=True,
        help="Hide the story progress bar at the top of the frame (hidden by default).",
    )
    ap.add_argument(
        "--bg-blur",
        type=float,
        default=20.0,
        metavar="SIGMA",
        help="Replace background with a blurred copy of itself via RVM matting. ON by default "
        "(sigma 20). Slow first run on CPU (matting); the matte is cached for reuse with "
        "--skip-matte. Disable for quick previews via --no-bg-blur.",
    )
    ap.add_argument(
        "--no-bg-blur",
        dest="bg_blur",
        action="store_const",
        const=None,
        help="Disable background blur (use for fast previews; final renders should keep blur ON).",
    )
    ap.add_argument(
        "--skip-matte",
        action="store_true",
        help="Reuse an existing work_rvm/pha.mp4 alpha matte instead of re-running RVM",
    )
    ap.add_argument(
        "--cut-silence",
        action="store_true",
        help="Remove breathing/silent pauses (jump-cut). Changes the timeline, so it forces a "
        "re-transcribe + re-matte on the tightened video.",
    )
    ap.add_argument("--silence-db", type=float, default=-35.0, help="Silence threshold in dB (closer to 0 = more aggressive; too aggressive cuts into speech)")
    ap.add_argument("--silence-min", type=float, default=0.40, help="Min silence length to cut, seconds")
    ap.add_argument("--skip-cut", action="store_true", help="Reuse an existing work/tightened.mp4")
    ap.add_argument(
        "--cut-fillers",
        action="store_true",
        help="Targeted story cut: after transcribing, also remove hesitation sounds (euh/heu/hum), "
        "verbal-crutch tics (en fait, du coup, tu vois) and immediate stutters/false-starts. Shifts "
        "the timeline, so it re-transcribes + re-mattes automatically. Silences are cut by --cut-silence.",
    )
    ap.add_argument(
        "--filler-words",
        default=",".join(sorted(FILLER_WORDS)),
        help="Comma-separated single filler tokens to cut with --cut-fillers (default: hesitation sounds + ben/bah).",
    )
    ap.add_argument(
        "--filler-phrases",
        default=";".join(" ".join(p) for p in FILLER_PHRASES),
        help="Semicolon-separated multi-word tics to cut with --cut-fillers, e.g. 'en fait;du coup;tu vois'.",
    )
    ap.add_argument("--no-cut-stutter", action="store_true",
                    help="With --cut-fillers, keep immediate word repeats (don't treat 'je je' as a false start).")
    ap.add_argument("--no-tonemap", action="store_true",
                    help="HDR source: skip the hable tonemap, preserve base colors (just 10->8 bit). Use when the tonemap washes out / greys the footage.")
    ap.add_argument(
        "--no-logo-pop-sound",
        action="store_true",
        help="Disable the little 'pop' sound played when a brand logo appears",
    )
    # ---- YouTube Short mode ----
    ap.add_argument(
        "--youtube-short",
        action="store_true",
        help="Add a background music bed (ducked under the voice) + an animated 'Subscribe' "
        "button that slides up on the CTA. Use for a YouTube short rendition (in addition to "
        "the regular story export).",
    )
    ap.add_argument(
        "--music",
        default=str(ASSETS / "music_chill.mp3"),
        help="Background music file for --youtube-short (default: assets/music_chill.mp3). "
        "Run fetch_music.py to download one.",
    )
    ap.add_argument(
        "--music-volume",
        type=float,
        default=0.12,
        help="Background music level for --youtube-short (0..1, before ducking). Default 0.12.",
    )
    ap.add_argument(
        "--subscribe-asset",
        default=str(ASSETS / "subscribe_button.png"),
        help="PNG used for the animated subscribe button overlay (default: assets/subscribe_button.png). "
        "Regenerate via make_subscribe_button.py.",
    )
    ap.add_argument(
        "--subscribe-lead-time",
        type=float,
        default=4.5,
        help="Seconds before the end of the video at which the subscribe button slides in. Default 4.5s.",
    )
    ap.add_argument(
        "--no-subscribe-button",
        action="store_true",
        help="In --youtube-short mode, keep the ducked background music but skip the animated subscribe button overlay.",
    )
    ap.add_argument(
        "--remove-ranges",
        default="",
        help="Comma-separated time ranges to delete from the clip (laughs, flubs, false starts), "
        "e.g. '0.0-1.5,12.3-13.0'. Times are seconds on the post-silence-cut timeline (what the preview shows). "
        "Removing ranges shifts the timeline, so transcript + matte are recomputed automatically.",
    )
    args = ap.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        print(f"Input not found: {src}", file=sys.stderr)
        sys.exit(1)

    work = ROOT / "work"
    work.mkdir(exist_ok=True)
    ASSETS.mkdir(exist_ok=True)

    audio = work / "audio.wav"
    transcript_json = work / "transcript.json"
    ass_path = work / "subs.ass"

    # 0. Optional: remove breathing/silent pauses first. The tightened clip becomes the source for
    #    everything else, so transcript timings, matte and overlays all line up with the new timeline.
    if args.cut_silence:
        tightened = work / "tightened.mp4"
        if args.skip_cut and tightened.exists():
            print(f"Reusing tightened clip: {tightened.name}")
        else:
            cut_silence(src, tightened, args.silence_db, args.silence_min, tonemap=not args.no_tonemap)
            # New timeline invalidates any cached audio/transcript/matte.
            if audio.exists():
                audio.unlink()
            args.skip_transcribe = False
            args.skip_matte = False
        src = tightened

    # 0b. Optional: delete explicit content ranges (laughs, flubs, false starts) from the tightened clip.
    #     Times are on the post-silence-cut timeline (the preview's timeline). This re-cuts the timeline,
    #     so audio/transcript/matte are invalidated and recomputed.
    if args.remove_ranges.strip():
        src_dur = _probe_duration(src)
        removes = parse_ranges(args.remove_ranges, src_dur)
        if removes:
            trimmed = work / "tightened.mp4"
            tmp = work / "tightened_trim.mp4"
            remove_ranges(src, tmp, removes, src_dur)
            tmp.replace(trimmed)
            src = trimmed
            if audio.exists():
                audio.unlink()
            args.skip_transcribe = False
            args.skip_matte = False

    # 1. Probe duration
    probe = subprocess.check_output(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
            str(src),
        ]
    )
    duration = float(probe.strip())
    print(f"Duration: {duration:.2f}s")

    # 2. Extract audio
    if not audio.exists():
        run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(src),
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                str(audio),
            ]
        )

    # 3. Transcribe
    if args.skip_transcribe and transcript_json.exists():
        segments = json.loads(transcript_json.read_text(encoding="utf-8"))
        print(f"Reusing {transcript_json}")
    else:
        segments = transcribe(audio, transcript_json, model_size=args.model)

    # 3b. Targeted story cut (--cut-fillers): drop hesitation sounds / tics / stutters using the
    #     word-level timings we just got. This shifts the timeline, so we re-cut, re-extract audio
    #     and re-transcribe once on the cleaned clip (matte is invalidated too).
    if args.cut_fillers:
        filler_words = {w.strip() for w in args.filler_words.split(",") if w.strip()}
        filler_phrases = [p.split() for p in args.filler_phrases.split(";") if p.strip()]
        ranges = find_filler_ranges(
            segments, filler_words, filler_phrases, cut_stutter=not args.no_cut_stutter,
        )
        if ranges:
            cut = sum(b - a for a, b in ranges)
            print(f"Cutting {len(ranges)} filler/hesitation range(s) (~{cut:.1f}s)")
            cleaned = work / "tightened.mp4"
            tmp = work / "tightened_fillers.mp4"
            remove_ranges(src, tmp, ranges, duration)
            tmp.replace(cleaned)
            src = cleaned
            duration = _probe_duration(src)
            print(f"Duration after filler cut: {duration:.2f}s")
            # New timeline -> refresh audio + transcript, invalidate matte.
            if audio.exists():
                audio.unlink()
            run(["ffmpeg", "-y", "-i", str(src), "-vn", "-acodec", "pcm_s16le",
                 "-ar", "16000", "-ac", "1", str(audio)])
            segments = transcribe(audio, transcript_json, model_size=args.model)
            args.skip_matte = False
        else:
            print("No filler/hesitation ranges detected; nothing to cut.")

    # 4. Group into short chunks for dynamic captions
    chunks = group_words(segments)
    print(f"{len(chunks)} caption chunks")

    # 5. Write ASS subtitles
    accent_words = {w.strip() for w in args.accent_words.split(",") if w.strip()}
    write_ass(
        chunks,
        ass_path,
        font=args.font,
        accent_hex=args.accent,
        accent_words=accent_words,
    )

    # 6. Find keyword pops and render emoji PNGs
    pops = find_keyword_pops(segments)
    print(f"{len(pops)} keyword pops")
    emoji_files: dict[str, Path] = {}
    for pop in pops:
        emoji = pop["emoji"]
        if emoji in emoji_files:
            continue
        fname = f"emoji_{ord(emoji[0]):x}.png"
        out = ASSETS / fname
        if not out.exists():
            render_emoji_png(emoji, out, size=200)
        emoji_files[emoji] = out

    # 6b. Punch-zoom timestamps + brand-logo mentions
    punch_words = {w.strip().lower() for w in args.punch_words.split(",") if w.strip()}
    if args.punch_times:
        punch_times = sorted(float(t) for t in args.punch_times.split(",") if t.strip())
        print(f"{len(punch_times)} punch zooms (manual/beat-synced)")
    else:
        punch_times = find_punch_times(segments, punch_words)
        print(f"{len(punch_times)} punch zooms")

    # Brand logos: each shown at its spoken moment (synced), fixed display height. Each logo gets the
    # lowest row not already taken by another logo whose display window overlaps in time, so any number
    # of logos that land close together ("GPT, Gemini, Claude") stack on distinct rows instead of
    # hiding each other. Rows that never collide reuse row 0.
    from PIL import Image as _Image

    TARGET_H, DWELL = 220, 2.0
    brand_overlays: list[dict] = []
    for mention in find_brand_mentions(segments):
        logo_path = ASSETS / mention["file"]
        if not logo_path.exists():
            print(f"  ! missing brand logo: {logo_path.name} (skipping)")
            continue
        start = mention["spoken"]
        if start >= duration - 0.3:
            continue
        end = min(duration, start + DWELL)
        with _Image.open(logo_path) as im:
            base_w = max(40, int(TARGET_H * im.width / im.height))
        # smallest row free of any time-overlapping logo already placed
        busy = {o["row"] for o in brand_overlays if o["start"] < end and start < o["end"]}
        row = 0
        while row in busy:
            row += 1
        brand_overlays.append({"path": logo_path, "start": start, "end": end, "base_w": base_w, "row": row})
    print(f"{len(brand_overlays)} brand overlays")

    # 6b-bis. Story epuree (--clean): strip every insert/incrustation, keep zooms + captions + watermark.
    #         Zeroing pops/emoji/brand_overlays here means no extra ffmpeg inputs get added below and the
    #         pop-sound block (gated on brand_overlays) is skipped automatically. Blur (bg_blur) untouched.
    if args.clean:
        pops = []
        emoji_files = {}
        brand_overlays = []
        print("  --clean: story epuree (zooms + sous-titres + watermark + flou ; sans logos/emoji/pops/barre)")

    # 6c. Optional background replacement (RVM matting -> blurred background) BEFORE the montage
    #     chain, so subtitles / zoom / logos all sit on top of the new background. Matting runs on
    #     the sharp original (best segmentation); the result becomes the video source for the render.
    render_source = src
    if args.bg_blur is not None:
        from rvm_matte import probe_video, matte as rvm_matte, compose as rvm_compose

        work_rvm = ROOT / "work_rvm"
        work_rvm.mkdir(exist_ok=True)
        pha = work_rvm / "pha.mp4"
        bg_replaced = work / "bg_replaced.mp4"
        vw, vh, vfps = probe_video(src)
        if args.skip_matte and pha.exists():
            print(f"Reusing matte: {pha.name}")
        else:
            rvm_matte(src, pha, vw, vh, vfps, downsample=0.25)
        rvm_compose(src, pha, bg_replaced, args.bg_blur)
        render_source = bg_replaced
        print(f"Background replaced (blur {args.bg_blur}) -> {bg_replaced.name}")

    # 7. Build ffmpeg command
    inputs: list[str] = ["-i", str(render_source)]
    pop_inputs_order: list[str] = []  # ordered list of emojis matching pops
    for pop in pops:
        emoji = pop["emoji"]
        if emoji in emoji_files:
            inputs += ["-i", str(emoji_files[emoji])]
            pop_inputs_order.append(emoji)
    for brand in brand_overlays:
        # Loop the still logo across the whole timeline so its frame `t` tracks the global timeline,
        # which the pop scale=eval=frame expression relies on.
        inputs += ["-loop", "1", "-t", f"{duration:.3f}", "-r", "30", "-i", str(brand["path"])]

    fc = build_filter_complex(
        ass_path,
        pops,
        emoji_files,
        duration,
        args.handle,
        accent_hex=args.accent,
        punch_times=punch_times,
        brand_overlays=brand_overlays,
        progress_bar=(not args.no_progress_bar) and not args.clean,
    )

    # 7b. Play a little 'pop' sound at each brand-logo appearance, summed onto the original audio
    #     (normalize=0 so the voice stays at full level and the pop just adds on top).
    audio_map = "0:a?"
    if brand_overlays and not args.no_logo_pop_sound:
        pop_wav = ensure_pop_sound(ASSETS / "pop.wav")
        pop_index = 1 + len(pop_inputs_order) + len(brand_overlays)
        inputs += ["-i", str(pop_wav)]
        times = [b["start"] for b in brand_overlays]
        a_parts = []
        if len(times) == 1:
            a_parts.append(f"[{pop_index}:a]adelay={int(times[0] * 1000)}:all=1[pd0]")
            mix_in = "[0:a][pd0]"
        else:
            splits = "".join(f"[ps{i}]" for i in range(len(times)))
            a_parts.append(f"[{pop_index}:a]asplit={len(times)}{splits}")
            for i, t in enumerate(times):
                a_parts.append(f"[ps{i}]adelay={int(t * 1000)}:all=1[pd{i}]")
            mix_in = "[0:a]" + "".join(f"[pd{i}]" for i in range(len(times)))
        a_parts.append(f"{mix_in}amix=inputs={len(times) + 1}:normalize=0:duration=first[aout]")
        fc = fc + ";" + ";".join(a_parts)
        audio_map = "[aout]"

    # 7c. YouTube Short mode: add ducked background music + animated subscribe button overlay.
    #     Music is sidechain-compressed by the voice signal, so it ducks down whenever Wassim talks
    #     and rises again on pauses — the music never covers the voice. The subscribe button slides
    #     up from below with an ease-out-back bounce on the last `subscribe_lead_time` seconds.
    if args.youtube_short:
        music_path = Path(args.music).expanduser().resolve()
        sub_path = Path(args.subscribe_asset).expanduser().resolve()
        if not music_path.exists():
            print(
                f"  ! music file not found: {music_path} — run fetch_music.py first or pass --music PATH",
                file=sys.stderr,
            )
            sys.exit(2)
        if not args.no_subscribe_button and not sub_path.exists():
            print(
                f"  ! subscribe button not found: {sub_path} — run make_subscribe_button.py first",
                file=sys.stderr,
            )
            sys.exit(2)

        # ---- Audio: voice + music with sidechain ducking ----
        music_in_idx = len(inputs) // 2  # next input slot (inputs is flat: -i path -i path ...)
        # Actually count how many input pairs we already added by counting "-i" occurrences.
        music_in_idx = sum(1 for x in inputs if x == "-i")
        inputs += ["-i", str(music_path)]
        if not args.no_subscribe_button:
            sub_in_idx = sum(1 for x in inputs if x == "-i")
            inputs += [
                "-loop",
                "1",
                "-t",
                f"{duration:.3f}",
                "-r",
                "30",
                "-i",
                str(sub_path),
            ]

        voice_label = audio_map if audio_map.startswith("[") else "[0:a]"
        # Build the ducking chain. sidechaincompress takes (signal_to_compress, sidechain_signal).
        # - threshold low-ish so soft speech still triggers ducking
        # - ratio 8:1 gives a clear -8 dB drop when voice peaks above threshold
        # - attack 5ms / release 250ms = music drops quickly when Wassim starts, recovers smoothly on pauses
        # - amix normalize=0 + makeup level keeps the voice at full original loudness
        a_yt = []
        a_yt.append(f"[{music_in_idx}:a]volume={args.music_volume:.3f}[mvol]")
        a_yt.append(f"{voice_label}asplit=2[va][vb]")
        a_yt.append(
            f"[mvol][va]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=250:makeup=1[mducked]"
        )
        a_yt.append(f"[vb][mducked]amix=inputs=2:normalize=0:duration=first[aout_yt]")
        fc = fc + ";" + ";".join(a_yt)
        audio_map = "[aout_yt]"

        # ---- Video: animated subscribe button overlay on the last seconds ----
        # Skipped entirely when --no-subscribe-button: ducked music stays, [vout] is left untouched.
        if not args.no_subscribe_button:
            # Resize the button to a clean width (keep aspect ratio).
            btn_w = 620
            # Read source dims to scale height proportionally — fall back to known asset size if read fails.
            try:
                from PIL import Image as _Image2

                with _Image2.open(sub_path) as _im:
                    ratio = _im.height / _im.width
            except Exception:
                ratio = 212.0 / 752.0
            btn_h = int(btn_w * ratio)

            start_btn = max(0.0, duration - args.subscribe_lead_time)
            slide_dur = 0.5  # seconds the slide-up takes
            y_off = 1920  # below the screen
            y_on = 1300  # final resting position (above watermark @ h-150=1770)

            # Ease-out-back on p = clip((t-start)/slide_dur, 0, 1):
            #   q = p-1 ; ease = 1 + c3*q^3 + c1*q^2   (c1=1.70158, c3=2.70158)
            # p=0 -> ease=0 (button is at y_off), p=1 -> ease=1 (resting), with an overshoot mid-flight.
            c1, c3 = 1.70158, 2.70158
            p = f"clip((t-{start_btn:.3f})/{slide_dur}\\,0\\,1)"
            q = f"({p}-1)"
            ease = f"(1+{c3:.5f}*{q}*{q}*{q}+{c1:.5f}*{q}*{q})"
            y_expr = f"({y_off}+({y_on}-{y_off})*{ease})"

            # Re-route the current [vout] label: rename it to [vpre_sub], then overlay the subscribe button on top.
            # build_filter_complex always emits a single [vout] as the video sink; the audio chain above
            # only added [aout]/[aout_yt] labels so [vout] is still unique in fc here. We unconditionally
            # rename it so the subscribe overlay can produce the new [vout].
            last_vout = fc.rfind("[vout]")
            if last_vout < 0:
                print("  ! expected [vout] label in filter_complex but none found", file=sys.stderr)
                sys.exit(2)
            fc = fc[:last_vout] + "[vpre_sub]" + fc[last_vout + len("[vout]") :]
            v_sub_parts = []
            v_sub_parts.append(f"[{sub_in_idx}:v]scale={btn_w}:{btn_h}[sub_scaled]")
            v_sub_parts.append(
                f"[vpre_sub][sub_scaled]overlay=x='(W-w)/2':y='{y_expr}':"
                f"enable='between(t,{start_btn:.3f},{duration:.3f})'[vout]"
            )
            fc = fc + ";" + ";".join(v_sub_parts)

    out_path = Path(args.output).expanduser().resolve()
    cmd = (
        ["ffmpeg", "-y"]
        + inputs
        + [
            "-filter_complex",
            fc,
            "-map",
            "[vout]",
            "-map",
            audio_map,
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-movflags",
            "+faststart",
            str(out_path),
        ]
    )
    run(cmd)
    try:
        print(f"\n✅ Output: {out_path}")
    except UnicodeEncodeError:
        print(f"\n[OK] Output: {out_path}")


if __name__ == "__main__":
    main()
