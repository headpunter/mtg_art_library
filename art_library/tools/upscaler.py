"""
upscaler.py — wraps realesrgan-ncnn-vulkan as a subprocess.

Configuration: set the env var REALESRGAN_BIN to the absolute path of the
realesrgan-ncnn-vulkan executable. On Windows that's usually something like
C:\\tools\\realesrgan\\realesrgan-ncnn-vulkan.exe

Models that ship with realesrgan-ncnn-vulkan:
  - realesrgan-x4plus     (general, 4x — default)
  - realesrgan-x4plus-anime (anime/illustration optimized, 4x)
  - realesr-animevideov3  (anime video, 2x/3x/4x)
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

DEFAULT_MODEL = os.environ.get("REALESRGAN_MODEL", "realesrgan-x4plus")
DEFAULT_SCALE = int(os.environ.get("REALESRGAN_SCALE", "4"))


def find_binary() -> Path | None:
    """Look for realesrgan-ncnn-vulkan on PATH or via env var."""
    env = os.environ.get("REALESRGAN_BIN")
    if env:
        p = Path(env)
        if p.exists():
            return p
    for name in ("realesrgan-ncnn-vulkan", "realesrgan-ncnn-vulkan.exe"):
        found = shutil.which(name)
        if found:
            return Path(found)
    return None


def upscale_file(input_path: Path, output_path: Path,
                 scale: int = DEFAULT_SCALE,
                 model: str = DEFAULT_MODEL,
                 verbose: bool = False) -> None:
    """Run realesrgan-ncnn-vulkan on a single file, falling back to Pillow LANCZOS."""
    binary = find_binary()
    if not binary:
        _upscale_pil(input_path, output_path, scale)
        return

    output_path.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(binary),
        "-i", str(input_path),
        "-o", str(output_path),
        "-s", str(scale),
        "-n", model,
        "-f", "png",
    ]
    if verbose:
        print(f"  upscaler: {' '.join(cmd)}", file=sys.stderr)

    # ncnn-vulkan binary writes progress to stderr; capture and only show on error
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
        raise RuntimeError(f"upscaler failed (exit {res.returncode})")
    if verbose and res.stderr:
        print(res.stderr, file=sys.stderr)


def _upscale_pil(input_path: Path, output_path: Path, scale: int) -> None:
    """Pillow LANCZOS fallback used when realesrgan-ncnn-vulkan is not installed."""
    from PIL import Image
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.open(input_path).convert("RGBA")
    w, h = img.size
    img = img.resize((w * scale, h * scale), Image.LANCZOS)
    img.save(output_path, "PNG")
