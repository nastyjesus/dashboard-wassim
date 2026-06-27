#!/usr/bin/env python3
"""Assemble le reel Instagram à partir d'un montage déjà rendu (story_finale.mp4).

Pipeline (post-traitement, aucune reprise du filter-graph de montage.py) :
  [carte intro dorée]  ->  [facecam monté + bouton S'abonner IG slide-up]  ->  [carte outro dorée]
  + lit de musique chill duckée par la voix sur TOUTE la durée (la musique gonfle sous les cartes,
    baisse sous la voix).

Le bouton 'S'abonner' IG (gradient) slide-up avec un overshoot ease-out-back sur les dernières
secondes du facecam — exactement comme le bouton YouTube du mode --youtube-short, mais version IG.

Usage :
  python make_ig_reel.py --core story_finale.mp4 --out reel_ig.mp4 \
      --intro-card assets/ig_intro_card.png --outro-card assets/ig_outro_card.png \
      --follow assets/follow_button.png --music assets/music_chill.mp3
"""

from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
ASSETS = ROOT / "assets"


def _probe_duration(src: Path) -> float:
    out = subprocess.check_output(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration",
         "-of", "default=noprint_wrappers=1:nokey=1", str(src)]
    )
    return float(out.strip())


def main() -> None:
    ap = argparse.ArgumentParser(description="Assemble the Instagram reel (gold cards + IG follow CTA + ducked music)")
    ap.add_argument("--core", required=True, help="Montage déjà rendu (ex. story_finale.mp4)")
    ap.add_argument("--out", default="reel_ig.mp4", help="Sortie reel IG")
    ap.add_argument("--intro-card", default=str(ASSETS / "ig_intro_card.png"))
    ap.add_argument("--outro-card", default=str(ASSETS / "ig_outro_card.png"))
    ap.add_argument("--follow", default=str(ASSETS / "follow_button.png"))
    ap.add_argument("--music", default=str(ASSETS / "music_chill.mp3"))
    ap.add_argument("--music-volume", type=float, default=0.14, help="Volume musique avant ducking (0..1)")
    ap.add_argument("--intro-dur", type=float, default=2.2, help="Durée carte intro (s)")
    ap.add_argument("--outro-dur", type=float, default=4.5, help="Durée carte outro (s)")
    ap.add_argument("--follow-lead-time", type=float, default=4.0,
                    help="Secondes avant la fin du facecam où le bouton S'abonner slide-up")
    ap.add_argument("--no-follow-button", action="store_true", help="Garder la musique duckée mais pas le bouton")
    args = ap.parse_args()

    core = Path(args.core).expanduser().resolve()
    intro = Path(args.intro_card).expanduser().resolve()
    outro = Path(args.outro_card).expanduser().resolve()
    follow = Path(args.follow).expanduser().resolve()
    music = Path(args.music).expanduser().resolve()
    out_path = Path(args.out).expanduser().resolve()

    for label, p in [("core", core), ("intro-card", intro), ("outro-card", outro), ("music", music)]:
        if not p.exists():
            print(f"  ! {label} introuvable : {p}", file=sys.stderr)
            sys.exit(2)
    use_follow = not args.no_follow_button
    if use_follow and not follow.exists():
        print(f"  ! bouton follow introuvable : {follow} — lance make_follow_button.py", file=sys.stderr)
        sys.exit(2)

    core_dur = _probe_duration(core)
    intro_dur = args.intro_dur
    outro_dur = args.outro_dur
    full_dur = intro_dur + core_dur + outro_dur
    print(f"Durées : intro {intro_dur:.2f}s + core {core_dur:.2f}s + outro {outro_dur:.2f}s = {full_dur:.2f}s")

    # ---- Inputs ----
    inputs: list[str] = ["-i", str(core)]                                              # 0
    inputs += ["-loop", "1", "-t", f"{intro_dur:.3f}", "-r", "30", "-i", str(intro)]   # 1
    inputs += ["-loop", "1", "-t", f"{outro_dur:.3f}", "-r", "30", "-i", str(outro)]   # 2
    follow_idx = None
    if use_follow:
        follow_idx = 3
        inputs += ["-loop", "1", "-t", f"{core_dur:.3f}", "-r", "30", "-i", str(follow)]  # 3
    music_idx = sum(1 for x in inputs if x == "-i")
    inputs += ["-stream_loop", "-1", "-i", str(music)]                                  # music
    sil_intro_idx = sum(1 for x in inputs if x == "-i")
    inputs += ["-f", "lavfi", "-t", f"{intro_dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]
    sil_outro_idx = sum(1 for x in inputs if x == "-i")
    inputs += ["-f", "lavfi", "-t", f"{outro_dur:.3f}", "-i", "anullsrc=r=48000:cl=stereo"]

    # ---- Video ----
    fc: list[str] = []
    fc.append("[1:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
              "setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.3[iv]")
    fc.append("[0:v]scale=1080:1920,setsar=1,fps=30,format=yuv420p[cv0]")
    fc.append(f"[2:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
              f"setsar=1,fps=30,format=yuv420p,fade=t=out:st={max(0.0, outro_dur - 0.4):.3f}:d=0.4[ov]")

    if use_follow:
        # Dimensions bouton (ratio réel du PNG).
        try:
            from PIL import Image as _Image
            with _Image.open(follow) as im:
                ratio = im.height / im.width
        except Exception:
            ratio = 212.0 / 792.0
        btn_w = 640
        btn_h = int(btn_w * ratio)
        start_btn = max(0.0, core_dur - args.follow_lead_time)
        slide_dur = 0.5
        y_off, y_on = 1920, 1300  # même position de repos que le bouton YouTube
        c1, c3 = 1.70158, 2.70158
        p = f"clip((t-{start_btn:.3f})/{slide_dur}\\,0\\,1)"
        q = f"({p}-1)"
        ease = f"(1+{c3:.5f}*{q}*{q}*{q}+{c1:.5f}*{q}*{q})"
        y_expr = f"({y_off}+({y_on}-{y_off})*{ease})"
        fc.append(f"[{follow_idx}:v]scale={btn_w}:{btn_h}[fb]")
        fc.append(f"[cv0][fb]overlay=x='(W-w)/2':y='{y_expr}':"
                  f"enable='gte(t,{start_btn:.3f})'[cv]")
        core_v = "[cv]"
    else:
        core_v = "[cv0]"

    fc.append(f"[iv]{core_v}[ov]concat=n=3:v=1:a=0[vout]")

    # ---- Audio : voix (silence|core|silence) + musique duckée sur toute la durée ----
    fc.append("[0:a]aformat=sample_rates=48000:channel_layouts=stereo[ca]")
    fc.append(f"[{sil_intro_idx}:a][ca][{sil_outro_idx}:a]concat=n=3:v=0:a=1[voice]")
    fc.append(f"[{music_idx}:a]aformat=sample_rates=48000:channel_layouts=stereo,"
              f"volume={args.music_volume:.3f},atrim=0:{full_dur:.3f},asetpts=N/SR/TB[mv]")
    fc.append("[voice]asplit=2[vc1][vc2]")
    fc.append("[mv][vc1]sidechaincompress=threshold=0.03:ratio=8:attack=5:release=250:makeup=1[mduck]")
    fc.append("[vc2][mduck]amix=inputs=2:normalize=0:duration=first[aout]")

    filtergraph = ";".join(fc)
    cmd = (
        ["ffmpeg", "-y"]
        + inputs
        + [
            "-filter_complex", filtergraph,
            "-map", "[vout]", "-map", "[aout]",
            "-t", f"{full_dur:.3f}",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "20",
            "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
            str(out_path),
        ]
    )
    print("$ ffmpeg ... (assemblage reel IG)")
    subprocess.run(cmd, check=True)
    try:
        print(f"\n✅ Reel IG : {out_path}")
    except UnicodeEncodeError:
        print(f"\n[OK] Reel IG : {out_path}")


if __name__ == "__main__":
    main()
