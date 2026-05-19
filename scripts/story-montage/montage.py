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
Style: Story,{font},66,&H00FFFFFF,&H00FFFFFF,&H00000000,&H80000000,1,0,0,0,100,100,0,0,1,5,2,2,60,60,260,1

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


def group_words(segments: list[dict], max_words: int = 3, max_chars: int = 22) -> list[dict]:
    """Group words into short chunks for dynamic story-style captions."""
    chunks = []
    for seg in segments:
        words = seg["words"] or []
        if not words:
            chunks.append({"start": seg["start"], "end": seg["end"], "text": seg["text"]})
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
                }
            )
    return chunks


def fmt_time(t: float) -> str:
    h = int(t // 3600)
    m = int((t % 3600) // 60)
    s = t - h * 3600 - m * 60
    return f"{h:01d}:{m:02d}:{s:05.2f}"


def write_ass(chunks: list[dict], out_ass: Path, font: str = "DejaVu Sans") -> None:
    lines = [ASS_HEADER_TEMPLATE.format(font=font)]
    for ch in chunks:
        start = fmt_time(ch["start"])
        end = fmt_time(ch["end"])
        # Pop-in animation: scale 70 -> 100 over 120ms
        text = ch["text"].replace("\n", " ").upper()
        text_ass = "{\\fad(120,80)\\t(0,120,\\fscx100\\fscy100)\\fscx70\\fscy70}" + text
        lines.append(f"Dialogue: 0,{start},{end},Story,,0,0,0,,{text_ass}")
    out_ass.write_text("\n".join(lines), encoding="utf-8")


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


def render_emoji_png(emoji: str, out_path: Path, size: int = 200) -> None:
    """Render a single emoji glyph to a transparent PNG (best-effort font discovery)."""
    from PIL import Image, ImageDraw, ImageFont

    candidate_fonts = [
        "/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf",
        "/System/Library/Fonts/Apple Color Emoji.ttc",
        "C:\\Windows\\Fonts\\seguiemj.ttf",
        "/usr/share/fonts/google-noto-color-emoji-fonts/NotoColorEmoji.ttf",
    ]
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
            # Pillow can draw color emoji via embedded_color
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
        # Fallback: white circle with the unicode codepoint, ugly but visible
        draw.ellipse((10, 10, size - 10, size - 10), fill=(255, 200, 0, 230))
    img.save(out_path)


def build_filter_complex(
    chunks_ass: Path,
    pops: list[dict],
    emoji_files: dict[str, Path],
    duration: float,
    handle: str,
) -> str:
    """Build the ffmpeg filter graph: subtitles + overlays + progress bar + watermark + zoom."""
    fc = []
    last_label = "[0:v]"

    # 1. Subtitles (.ass burned-in)
    fc.append(f"{last_label}ass='{chunks_ass.as_posix()}'[v1]")
    last_label = "[v1]"

    # 2. Progress bar (white rectangle that grows). We draw a thin top bar.
    # Width grows from 40 to 1040 over `duration` seconds, height 8 px at y=40.
    fc.append(
        f"{last_label}drawbox=x=40:y=40:w='40+(t/{duration})*1000':h=8:color=white@0.95:t=fill[v2]"
    )
    last_label = "[v2]"

    # 3. Background pill for progress bar (subtle)
    fc.append(
        f"{last_label}drawbox=x=40:y=40:w=1000:h=8:color=white@0.25:t=fill[v3]"
    )
    last_label = "[v3]"

    # 4. Handle watermark bottom-left
    safe_handle = handle.replace("'", r"\'").replace(":", r"\:")
    fc.append(
        f"{last_label}drawtext=text='{safe_handle}':fontcolor=white@0.85:fontsize=34:"
        f"box=1:boxcolor=black@0.35:boxborderw=14:x=50:y=h-130[v4]"
    )
    last_label = "[v4]"

    # 5. Ensure output is 1080x1920 (defensive — most phone videos already are)
    fc.append(f"{last_label}scale=1080:1920,setsar=1[v5]")
    last_label = "[v5]"

    # 6. Emoji overlays (top-right area, alternating slightly)
    if pops and emoji_files:
        # Add inputs and overlays
        input_index = 1  # input 0 is the main video
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

    # Rename last label to [vout]
    fc[-1] = fc[-1].rsplit("[", 1)[0] + "[vout]"
    return ";".join(fc)


def main():
    ap = argparse.ArgumentParser(description="Story SEO montage")
    ap.add_argument("--input", required=True, help="Source video path")
    ap.add_argument("--output", default="story_finale.mp4", help="Output file")
    ap.add_argument("--handle", default="@wassim.seo", help="Watermark handle")
    ap.add_argument("--model", default="small", help="faster-whisper model size")
    ap.add_argument("--skip-transcribe", action="store_true", help="Reuse existing transcript.json")
    ap.add_argument("--font", default="DejaVu Sans", help="Subtitle font name")
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

    # 4. Group into short chunks for dynamic captions
    chunks = group_words(segments)
    print(f"{len(chunks)} caption chunks")

    # 5. Write ASS subtitles
    write_ass(chunks, ass_path, font=args.font)

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

    # 7. Build ffmpeg command
    inputs: list[str] = ["-i", str(src)]
    pop_inputs_order: list[str] = []  # ordered list of emojis matching pops
    for pop in pops:
        emoji = pop["emoji"]
        if emoji in emoji_files:
            inputs += ["-i", str(emoji_files[emoji])]
            pop_inputs_order.append(emoji)

    fc = build_filter_complex(ass_path, pops, emoji_files, duration, args.handle)

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
            "0:a?",
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
    print(f"\n✅ Output: {out_path}")


if __name__ == "__main__":
    main()
