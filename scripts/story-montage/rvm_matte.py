"""Standalone RobustVideoMatting (RVM) test: cut out the speaker and place them on a
blurred version of their own background. CPU-only friendly.

Usage:
    python rvm_matte.py --input <video.mp4> --output rvm_test.mp4 [--blur 20] [--skip-matte]

Two stages, kept separate on purpose:
  1) RVM inference  -> work_rvm/pha.mp4 (alpha matte).  Slow on CPU.
  2) ffmpeg compose -> blurred original behind the matted speaker.  Cheap, re-runnable.

We run our own frame-by-frame inference loop (ffmpeg pipe in -> RVM -> ffmpeg pipe out)
instead of RVM's bundled convert_video, because that helper passes the frame rate to PyAV
as a string and crashes on PyAV >= 14. Compositing uses the ORIGINAL frame as foreground:
since the background behind is just a blurred copy of the same scene, edge colours match and
the usual matting halo is essentially invisible — so RVM's decontaminated foreground isn't needed.

--skip-matte reuses an existing pha.mp4 so you can retune --blur without paying for stage 1 again.
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def run(cmd: list[str]) -> None:
    print("$", " ".join(cmd))
    subprocess.run(cmd, check=True)


def probe_video(src: Path) -> tuple[int, int, float]:
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(src),
        ]
    ).decode().split()
    width, height, rate = int(out[0]), int(out[1]), out[2]
    fps = float(Fraction(rate))
    return width, height, fps


def matte(src: Path, pha_path: Path, width: int, height: int, fps: float, downsample: float) -> None:
    import numpy as np
    import torch

    try:
        torch.set_num_threads(max(1, (os.cpu_count() or 6) - 2))
    except Exception:
        pass

    print(f"Loading RVM (mobilenetv3) ... threads={torch.get_num_threads()}")
    model = torch.hub.load("PeterL1n/RobustVideoMatting", "mobilenetv3", trust_repo=True).eval()

    # ffmpeg decodes the source to raw RGB frames on stdout ...
    dec = subprocess.Popen(
        ["ffmpeg", "-v", "error", "-i", str(src), "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
        stdout=subprocess.PIPE,
    )
    # ... and a second ffmpeg encodes the grayscale alpha we feed on its stdin.
    enc = subprocess.Popen(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "rawvideo", "-pix_fmt", "gray", "-s", f"{width}x{height}", "-r", f"{fps:.5f}",
            "-i", "-",
            "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "12",
            str(pha_path),
        ],
        stdin=subprocess.PIPE,
    )

    frame_bytes = width * height * 3
    rec = [None] * 4  # RVM recurrent state, persists across frames
    n = 0
    print("Running matting (slow part on CPU) ...")
    with torch.no_grad():
        while True:
            buf = dec.stdout.read(frame_bytes)
            if len(buf) < frame_bytes:
                break
            arr = np.frombuffer(buf, np.uint8).reshape(height, width, 3).copy()
            src_t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0).float().div(255.0)
            fgr, pha, *rec = model(src_t, *rec, downsample_ratio=downsample)
            pha_u8 = pha[0, 0].clamp(0, 1).mul(255).round().byte().numpy()
            enc.stdin.write(pha_u8.tobytes())
            n += 1
            if n % 30 == 0:
                print(f"  {n} frames", flush=True)

    dec.stdout.close()
    enc.stdin.close()
    dec.wait()
    enc.wait()
    print(f"Matte written: {pha_path.name} ({n} frames)")


def compose(original: Path, pha: Path, out_path: Path, blur_sigma: float) -> None:
    # Split original: one copy gets blurred (background), the other becomes the keyed foreground.
    fc = (
        f"[0:v]split=2[bg0][fg0];"
        f"[bg0]gblur=sigma={blur_sigma}[bg];"
        f"[fg0][1:v]alphamerge[fg];"
        f"[bg][fg]overlay=format=auto,format=yuv420p[out]"
    )
    run(
        [
            "ffmpeg", "-y",
            "-i", str(original),
            "-i", str(pha),
            "-filter_complex", fc,
            "-map", "[out]",
            "-map", "0:a?",
            "-c:v", "libx264", "-crf", "20", "-preset", "medium",
            "-c:a", "aac", "-b:a", "128k",
            "-movflags", "+faststart",
            str(out_path),
        ]
    )


def main() -> None:
    ap = argparse.ArgumentParser(description="RVM background-blur test")
    ap.add_argument("--input", required=True, help="Source video")
    ap.add_argument("--output", default="rvm_test.mp4", help="Output file")
    ap.add_argument("--blur", type=float, default=20.0, help="Background blur sigma")
    ap.add_argument("--downsample", type=float, default=0.25, help="RVM downsample ratio (0.25 ~ 1080p)")
    ap.add_argument("--skip-matte", action="store_true", help="Reuse existing work_rvm/pha.mp4")
    args = ap.parse_args()

    src = Path(args.input).expanduser().resolve()
    if not src.exists():
        print(f"Input not found: {src}", file=sys.stderr)
        sys.exit(1)

    work = ROOT / "work_rvm"
    work.mkdir(exist_ok=True)
    pha = work / "pha.mp4"

    width, height, fps = probe_video(src)
    print(f"{width}x{height} @ {fps:.3f} fps")

    if args.skip_matte and pha.exists():
        print(f"Reusing existing matte: {pha.name}")
    else:
        matte(src, pha, width, height, fps, args.downsample)

    out_path = Path(args.output).expanduser().resolve()
    compose(src, pha, out_path, args.blur)
    try:
        print(f"\n[OK] Output: {out_path}")
    except UnicodeEncodeError:
        print(f"\nOutput: {out_path}")


if __name__ == "__main__":
    main()
