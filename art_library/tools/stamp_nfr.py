#!/usr/bin/env python3
"""
stamp_nfr.py — Test harness for NOT FOR RESALE stamp on proxy card art.

Reads art from the library, stamps copies with "NOT FOR RESALE" text, and
writes them to an output folder for visual review.  Does NOT touch originals.

Usage:
    python tools/stamp_nfr.py                   # first 30 printings
    python tools/stamp_nfr.py --slug sol_ring    # specific card
    python tools/stamp_nfr.py --limit 10         # fewer cards
    python tools/stamp_nfr.py --no-scryfall      # skip API; assume modern frame
    python tools/stamp_nfr.py --outdir ~/Desktop/nfr_test

Output filenames encode the frame group so you can compare at a glance:
    sol_ring__cmm_366__modern_bordered.jpg
    forest__ust_215__no_border.jpg
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow required: pip install Pillow")

sys.path.insert(0, str(Path(__file__).parent))
from library import Library, library_root


# ── font ──────────────────────────────────────────────────────────────────────
# LiberationSans-Bold is a clean condensed sans that reads similarly to the
# legal-line font WotC uses on modern cards.  Add better candidates above it
# if you have something closer (Matrix Bold, Friz Quadrata, etc.).
FONT_CANDIDATES = [
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "C:/Windows/Fonts/arialbd.ttf",
]

NFR_TEXT = "NOT FOR RESALE"


# ── frame-group parameters ────────────────────────────────────────────────────
# y_frac          vertical centre of text as fraction of image height
# font_size_frac  font size as fraction of image width
# text_color      RGBA tuple for the stamp text
# bar             if True, draw a semi-transparent backing bar first
# bar_color       RGBA for bar fill
# bar_h_frac      bar height as fraction of image height
#
# At the canonical 2192×2992 size:
#   font_size_frac 0.014 → ~30px tall text
#   y_frac 0.967         → centres text ~95px from the bottom edge
#                          (well inside the card's bottom border strip)
#
# Tweak y_frac and font_size_frac first if placement looks off.

FRAME_PARAMS: dict[str, dict] = {
    # ── standard modern frame (M15 / 2003 / 1997 / Future Sight) ──────────
    # Black border present; white text sits in the black strip at the bottom.
    "modern_bordered": {
        "y_frac":         0.967,
        "font_size_frac": 0.014,
        "text_color":     (255, 255, 255, 210),
        "bar":            False,
    },
    # ── white-bordered cards (Revised, 4th–7th Edition, some Unlimited) ───
    # The strip is cream/white so use dark text instead.
    "white_bordered": {
        "y_frac":         0.967,
        "font_size_frac": 0.014,
        "text_color":     (40, 40, 40, 210),
        "bar":            False,
    },
    # ── borderless / full-art / extended-art ──────────────────────────────
    # No dedicated black strip; add a semi-transparent bar over the art.
    "no_border": {
        "y_frac":         0.967,
        "font_size_frac": 0.013,
        "text_color":     (255, 255, 255, 230),
        "bar":            True,
        "bar_color":      (0, 0, 0, 155),
        "bar_h_frac":     0.042,
    },
    # ── Alpha / Beta / Unlimited (1993 frame) ─────────────────────────────
    # Black border but rounded corners and shorter text box — nudge up slightly.
    "alpha": {
        "y_frac":         0.963,
        "font_size_frac": 0.014,
        "text_color":     (255, 255, 255, 210),
        "bar":            False,
    },
}


# ── Scryfall frame lookup with disk cache ─────────────────────────────────────

_CACHE_PATH = Path(__file__).parent / ".nfr_frame_cache.json"


def _load_cache() -> dict:
    if _CACHE_PATH.exists():
        try:
            return json.loads(_CACHE_PATH.read_text())
        except Exception:
            return {}
    return {}


def _save_cache(cache: dict) -> None:
    _CACHE_PATH.write_text(json.dumps(cache, indent=2))


def fetch_frame_data(scryfall_id: str, cache: dict) -> dict:
    """Return frame metadata for a Scryfall ID.  Falls back to modern defaults."""
    if scryfall_id in cache:
        return cache[scryfall_id]
    try:
        import urllib.request
        url = f"https://api.scryfall.com/cards/{scryfall_id}"
        with urllib.request.urlopen(url, timeout=10) as r:
            data = json.loads(r.read())
        result = {
            "frame":        data.get("frame", "2015"),
            "frame_effects": data.get("frame_effects", []),
            "border_color": data.get("border_color", "black"),
            "full_art":     data.get("full_art", False),
        }
        cache[scryfall_id] = result
        time.sleep(0.1)  # stay within Scryfall rate limits
        return result
    except Exception as e:
        print(f"    [warn] Scryfall lookup failed ({scryfall_id}): {e}")
        return {"frame": "2015", "frame_effects": [], "border_color": "black", "full_art": False}


def classify_frame(fd: dict) -> str:
    """Map Scryfall frame metadata to one of our four treatment groups."""
    border  = fd.get("border_color", "black")
    effects = fd.get("frame_effects", [])
    frame   = fd.get("frame", "2015")
    full_art = fd.get("full_art", False)

    if border == "borderless":
        return "no_border"
    if full_art or "fullart" in effects:
        return "no_border"
    if "extendedart" in effects:
        return "no_border"
    if frame == "1993":
        return "alpha"
    if border == "white":
        return "white_bordered"
    return "modern_bordered"


# ── rendering ─────────────────────────────────────────────────────────────────

def _best_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def apply_nfr(img: Image.Image, frame_group: str) -> Image.Image:
    """Return a new RGBA composite with the NFR text stamped on."""
    p = FRAME_PARAMS.get(frame_group, FRAME_PARAMS["modern_bordered"])
    w, h = img.size
    font_px = max(12, int(w * p["font_size_frac"]))
    y_mid   = int(h * p["y_frac"])

    base    = img.copy().convert("RGBA")
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw    = ImageDraw.Draw(overlay)
    font    = _best_font(font_px)

    # Measure text so we can centre it
    bbox = draw.textbbox((0, 0), NFR_TEXT, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x  = (w - tw) // 2
    y  = y_mid - th // 2

    # Optional backing bar for borderless / full-art cards
    if p.get("bar"):
        bar_h  = int(h * p.get("bar_h_frac", 0.042))
        bar_y0 = y_mid - bar_h // 2
        draw.rectangle([(0, bar_y0), (w, bar_y0 + bar_h)], fill=p["bar_color"])

    draw.text((x, y), NFR_TEXT, font=font, fill=p["text_color"])
    return Image.alpha_composite(base, overlay).convert("RGB")


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--slug",        help="Only process this card slug")
    ap.add_argument("--limit",       type=int, default=30,
                    help="Max printings to process (default 30)")
    ap.add_argument("--outdir",      help="Output folder (default: nfr_test_output/ next to library root)")
    ap.add_argument("--no-scryfall", action="store_true",
                    help="Skip Scryfall lookup; treat everything as modern bordered")
    args = ap.parse_args()

    lib    = Library.load()
    outdir = Path(args.outdir) if args.outdir else lib.root.parent / "nfr_test_output"
    outdir.mkdir(parents=True, exist_ok=True)

    cache     = _load_cache()
    processed = 0
    skipped   = 0

    target_cards = (
        {args.slug: lib.cards[args.slug]} if args.slug and args.slug in lib.cards
        else lib.cards
    )
    if args.slug and args.slug not in lib.cards:
        sys.exit(f"Slug not found in library: {args.slug}")

    for slug, card in target_cards.items():
        if processed >= args.limit:
            break
        for pid, printing in card.printings.items():
            if processed >= args.limit:
                break

            art_path = lib.root / "art" / slug / f"{pid}.png"
            if not art_path.exists():
                skipped += 1
                continue

            # Determine frame treatment
            if args.no_scryfall or not printing.scryfall_id:
                frame_group = "modern_bordered"
                label = "modern_bordered [assumed]"
            else:
                fd = fetch_frame_data(printing.scryfall_id, cache)
                frame_group = classify_frame(fd)
                label = (f"{frame_group}  "
                         f"[frame={fd['frame']} border={fd['border_color']}"
                         f"{' full_art' if fd['full_art'] else ''}"
                         f"{(' fx=' + ','.join(fd['frame_effects'])) if fd['frame_effects'] else ''}]")

            print(f"  {slug}/{pid}  →  {label}")

            try:
                img     = Image.open(art_path)
                stamped = apply_nfr(img, frame_group)
                out_name = f"{slug}__{pid}__{frame_group}.jpg"
                stamped.save(outdir / out_name, "JPEG", quality=92)
                processed += 1
            except Exception as e:
                print(f"    [error] {slug}/{pid}: {e}")

    _save_cache(cache)
    print(f"\n{'─'*50}")
    print(f"Stamped : {processed} images  →  {outdir}")
    if skipped:
        print(f"Skipped : {skipped} (no art file on disk)")
    print(f"\nTunable constants are at the top of stamp_nfr.py:")
    print(f"  FRAME_PARAMS[group]['y_frac']          vertical position")
    print(f"  FRAME_PARAMS[group]['font_size_frac']   text size")
    print(f"  FRAME_PARAMS[group]['text_color']       RGBA")


if __name__ == "__main__":
    main()
