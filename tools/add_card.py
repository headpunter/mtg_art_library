#!/usr/bin/env python3
"""
add_card.py — ingest a card's art into the local library.

USAGE:
    # Single card from Scryfall (default printing, fuzzy match)
    python add_card.py --scryfall "Sol Ring"

    # Specific printing
    python add_card.py --scryfall "Sol Ring" --set cmm --num 366

    # Mark this printing as the default for the card
    python add_card.py --scryfall "Sol Ring" --set cmm --num 366 --make-default

    # From an existing image file (mpcfill download, gemini output, custom scan)
    python add_card.py --file /path/to/sol_ring.png --as "Sol Ring" --tag mpcfill_v1

    # From a decklist (mass ingest, uses default printing or per-line override)
    python add_card.py --decklist mydeck.txt

    # Override bleed method (default is library default = "mirror")
    python add_card.py --scryfall "Plains" --set unh --num 174 --bleed black

ENVIRONMENT:
    MTG_ART_LIBRARY    library root (default: ~/Documents/projects/mtg-art-library)
    REALESRGAN_BIN     path to realesrgan-ncnn-vulkan executable
    REALESRGAN_MODEL   model name (default: realesrgan-x4plus)
    REALESRGAN_SCALE   scale factor (default: 4)

EVERY ingest pipeline produces a finished file at canonical_size (2192x2992
@ 800 DPI by default), saved to art/<slug>/<printing_id>.png and indexed
in library.json. The intermediate Scryfall PNG and upscaled image are not kept.
"""
from __future__ import annotations

import argparse
import shutil
import sys
import tempfile
from pathlib import Path

from PIL import Image

from library import (
    Library, Printing, dimensions_for_dpi,
    normalize_name, normalize_printing_id,
)
from bleed import apply_bleed, detect_face_only
from decklist import parse_decklist
import scryfall
import upscaler


def ingest_scryfall(lib: Library, name: str, set_code: str | None = None,
                    num: str | None = None, bleed_method: str | None = None,
                    make_default: bool = False) -> tuple[str, str]:
    """Pull from Scryfall, upscale, bleed, save. Returns (slug, printing_id)."""
    print(f"  -> fetch: {name}" + (f" ({set_code} {num})" if set_code else ""))
    card_json = scryfall.fetch_card(name, set_code, num)
    real_name = card_json["name"]
    real_set = card_json["set"]
    real_num = card_json["collector_number"]
    pid = normalize_printing_id(real_set, real_num)

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        # Step 1: download raw scryfall png
        raw = td / "raw.png"
        img = scryfall.download_png(scryfall.png_url(card_json))
        img.save(raw, "PNG")
        print(f"    raw: {img.size}")

        # Step 2: upscale to ~4x
        up = td / "up.png"
        upscaler.upscale_file(raw, up)
        upscaled = Image.open(up)
        print(f"    upscaled: {upscaled.size}")

        # Step 3: bleed at canonical DPI
        method = bleed_method or lib.default_bleed
        finished = apply_bleed(upscaled, lib.canonical_dpi, method)
        print(f"    finished: {finished.size}")

        # Step 4: save into library
        slug = normalize_name(real_name)
        out_path = lib.file_path(slug, pid)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        finished.save(out_path, "PNG", dpi=(lib.canonical_dpi, lib.canonical_dpi))

    p = Printing(
        source="scryfall",
        scryfall_id=card_json.get("id"),
        set=real_set,
        collector_number=real_num,
        bleed=method,
    )
    lib.add_printing(real_name, pid, p, make_default=make_default)
    print(f"    OK {slug}/{pid}.png")
    return slug, pid


def ingest_file(lib: Library, source_file: Path, card_name: str,
                tag: str, bleed_method: str | None = None,
                already_has_bleed: bool | None = None,
                make_default: bool = False) -> tuple[str, str]:
    """Ingest a local image file. Skips upscaling if image is already large."""
    print(f"  -> file: {source_file.name} as {card_name!r}")
    img = Image.open(source_file).convert("RGBA")
    print(f"    input: {img.size}")
    pid = normalize_printing_id(None, None, tag=tag)

    fw, fh, tw, th, bp = dimensions_for_dpi(lib.canonical_dpi)

    # If user didn't say, auto-detect
    if already_has_bleed is None:
        # close to total dims = already has bleed, treat that way
        already_has_bleed = not detect_face_only(img, lib.canonical_dpi)
        print(f"    detected: {'has bleed' if already_has_bleed else 'face-only'}")

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        # Decide whether to upscale: if input is < 2x face size, run it through
        face_compare = max(fw, fh)
        long_edge = max(img.size)
        if long_edge < face_compare * 0.9:
            # need upscaling
            raw = td / "raw.png"
            img.save(raw, "PNG")
            up = td / "up.png"
            upscaler.upscale_file(raw, up)
            img = Image.open(up)
            print(f"    upscaled: {img.size}")

        if already_has_bleed:
            # resize the whole thing to canonical full size
            finished = img.resize((tw, th), Image.LANCZOS).convert("RGB")
        else:
            method = bleed_method or lib.default_bleed
            finished = apply_bleed(img, lib.canonical_dpi, method)

        slug = normalize_name(card_name)
        out_path = lib.file_path(slug, pid)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        finished.save(out_path, "PNG", dpi=(lib.canonical_dpi, lib.canonical_dpi))

    p = Printing(
        source="file",
        tag=tag,
        bleed=bleed_method or lib.default_bleed,
    )
    lib.add_printing(card_name, pid, p, make_default=make_default)
    print(f"    OK {slug}/{pid}.png")
    return slug, pid


def main():
    ap = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--scryfall", metavar="NAME", help="card name to fetch from scryfall")
    src.add_argument("--file", type=Path, help="local image file to ingest")
    src.add_argument("--decklist", type=Path, help="decklist file, ingest each card")

    ap.add_argument("--set", help="set code (with --scryfall)")
    ap.add_argument("--num", help="collector number (with --scryfall)")
    ap.add_argument("--as", dest="card_name", help="card name (with --file)")
    ap.add_argument("--tag", help="tag for custom/file-sourced art (with --file)",
                    default="custom")
    ap.add_argument("--bleed", choices=["mirror", "edge", "black", "white"], default=None)
    ap.add_argument("--make-default", action="store_true",
                    help="set this printing as the card's default")
    ap.add_argument("--has-bleed", dest="already_bleed",
                    action="store_true", default=None,
                    help="(with --file) input already has bleed, just resize")
    ap.add_argument("--no-bleed", dest="already_bleed",
                    action="store_false",
                    help="(with --file) input is face-only, add bleed")
    ap.add_argument("--lib", type=Path, default=None,
                    help="library root override")
    ap.add_argument("--skip-existing", action="store_true",
                    help="skip cards that are already in the library")
    args = ap.parse_args()

    lib = Library.load(args.lib)

    if args.scryfall:
        slug = normalize_name(args.scryfall)
        if args.skip_existing and slug in lib.cards:
            print(f"  -- {args.scryfall} already in library, skipping")
            return
        ingest_scryfall(lib, args.scryfall, args.set, args.num,
                        bleed_method=args.bleed, make_default=args.make_default)

    elif args.file:
        if not args.card_name:
            ap.error("--file requires --as NAME")
        ingest_file(lib, args.file, args.card_name, tag=args.tag,
                    bleed_method=args.bleed,
                    already_has_bleed=args.already_bleed,
                    make_default=args.make_default)

    elif args.decklist:
        failures = []
        for entry in parse_decklist(args.decklist):
            slug = normalize_name(entry.name)
            if args.skip_existing and slug in lib.cards:
                # if the deck specifies a printing we don't have, still ingest
                if entry.set_code and entry.collector_num:
                    pid = normalize_printing_id(entry.set_code, entry.collector_num)
                    if pid in lib.cards[slug].printings:
                        print(f"  -- {entry.name} ({entry.set_code} {entry.collector_num}) already in library")
                        continue
                else:
                    print(f"  -- {entry.name} already in library")
                    continue
            try:
                ingest_scryfall(lib, entry.name, entry.set_code,
                                entry.collector_num, bleed_method=args.bleed)
                lib.save()  # save after each card so a crash doesn't lose progress
            except Exception as e:
                print(f"    FAIL: {e}", file=sys.stderr)
                failures.append((entry.name, str(e)))

        if failures:
            print(f"\n{len(failures)} failures:")
            for n, e in failures:
                print(f"  - {n}: {e}")

    lib.save()
    print(f"\nLibrary: {len(lib.cards)} unique cards in {lib.root}")


if __name__ == "__main__":
    main()
