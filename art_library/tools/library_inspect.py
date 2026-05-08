#!/usr/bin/env python3
"""
library_inspect.py — inspect and audit the MTG art library.

USAGE:
    python library_inspect.py                   # summary only
    python library_inspect.py --missing         # printings with no art file on disk
    python library_inspect.py --orphans         # art files not referenced by the index
    python library_inspect.py --duplicates      # duplicate Scryfall IDs
    python library_inspect.py --sizes           # files not at canonical dimensions
    python library_inspect.py --all             # run all checks

ENVIRONMENT:
    MTG_ART_LIBRARY    library root (default: ~/Documents/projects/mtg-art-library)
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from library import Library, art_dir


def _fmt_bytes(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n} {unit}" if unit == "B" else f"{n / 1024:.1f} {unit}"
        n //= 1024


def print_summary(lib: Library) -> None:
    total_cards = len(lib.cards)
    total_printings = sum(len(c.printings) for c in lib.cards.values())
    total_cardbacks = len(lib.cardbacks)

    adir = art_dir(lib.root)
    art_files = [f for f in adir.rglob("*.png") if f.parent.name != "cardbacks"] \
        if adir.exists() else []
    total_bytes = sum(f.stat().st_size for f in art_files)

    print(f"Library: {lib.root}")
    print(f"  Cards:       {total_cards}")
    print(f"  Printings:   {total_printings}")
    print(f"  Files:       {len(art_files)}")
    print(f"  Disk usage:  {_fmt_bytes(total_bytes)}")
    if total_cardbacks:
        print(f"  Cardbacks:   {total_cardbacks}")


def check_missing(lib: Library) -> int:
    """Report index entries whose art file doesn't exist on disk."""
    missing: list[tuple[str, str, Path]] = []
    for slug, card in sorted(lib.cards.items()):
        for pid, p in card.printings.items():
            path = lib.file_path(slug, pid)
            if not path.exists():
                missing.append((card.name, pid, path))
            if p.is_dfc:
                back = lib.back_file_path(slug, pid)
                if not back.exists():
                    missing.append((card.name, f"{pid} (back)", back))

    if missing:
        print(f"\nMissing files ({len(missing)}):")
        for name, pid, path in missing:
            print(f"  {name}  [{pid}]")
            print(f"    {path}")
    else:
        print("\nMissing files: none")
    return len(missing)


def check_orphans(lib: Library) -> int:
    """Report art files on disk that aren't referenced by the index."""
    adir = art_dir(lib.root)
    if not adir.exists():
        print("\nOrphaned files: art directory does not exist")
        return 0

    known: set[Path] = set()
    for slug, card in lib.cards.items():
        for pid, p in card.printings.items():
            known.add(lib.file_path(slug, pid))
            if p.is_dfc:
                known.add(lib.back_file_path(slug, pid))

    orphans = [
        f for f in sorted(adir.rglob("*.png"))
        if f.parent.name != "cardbacks" and f not in known
    ]

    if orphans:
        print(f"\nOrphaned files ({len(orphans)}):")
        for f in orphans:
            print(f"  {f.relative_to(adir)}  ({_fmt_bytes(f.stat().st_size)})")
    else:
        print("\nOrphaned files: none")
    return len(orphans)


def check_duplicates(lib: Library) -> int:
    """Report Scryfall IDs that appear in more than one printing."""
    seen: dict[str, list[tuple[str, str]]] = {}
    for slug, card in sorted(lib.cards.items()):
        for pid, p in card.printings.items():
            if p.scryfall_id:
                seen.setdefault(p.scryfall_id, []).append((card.name, pid))

    dupes = {sid: entries for sid, entries in seen.items() if len(entries) > 1}
    if dupes:
        print(f"\nDuplicate Scryfall IDs ({len(dupes)}):")
        for sid, entries in sorted(dupes.items()):
            print(f"  {sid}:")
            for name, pid in entries:
                print(f"    {name}  [{pid}]")
    else:
        print("\nDuplicate Scryfall IDs: none")
    return len(dupes)


def check_sizes(lib: Library) -> int:
    """Report art files whose pixel dimensions differ from the canonical size."""
    from PIL import Image

    expected = tuple(lib.canonical_size)
    wrong: list[tuple[str, str, object]] = []

    for slug, card in sorted(lib.cards.items()):
        for pid in card.printings:
            path = lib.file_path(slug, pid)
            if not path.exists():
                continue
            try:
                with Image.open(path) as img:
                    if img.size != expected:
                        wrong.append((card.name, pid, img.size))
            except Exception as exc:
                wrong.append((card.name, pid, f"unreadable: {exc}"))

    if wrong:
        print(f"\nSize anomalies ({len(wrong)}) — expected {expected[0]}×{expected[1]}:")
        for name, pid, size in wrong:
            desc = f"{size[0]}×{size[1]}" if isinstance(size, tuple) else size
            print(f"  {name}  [{pid}]  {desc}")
    else:
        print(f"\nSize anomalies: none  (all files at {expected[0]}×{expected[1]})")
    return len(wrong)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Inspect and audit the MTG art library.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--root", type=Path,
                        help="Library root (overrides MTG_ART_LIBRARY env var)")
    parser.add_argument("--missing", action="store_true",
                        help="Show printings whose art file is absent from disk")
    parser.add_argument("--orphans", action="store_true",
                        help="Show art files on disk not referenced by the index")
    parser.add_argument("--duplicates", action="store_true",
                        help="Show Scryfall IDs that appear in multiple printings")
    parser.add_argument("--sizes", action="store_true",
                        help="Show files not at the canonical dimensions")
    parser.add_argument("--all", dest="all_checks", action="store_true",
                        help="Run all checks (missing, orphans, duplicates, sizes)")
    args = parser.parse_args()

    lib = Library.load(args.root)
    print_summary(lib)

    issues = 0
    run_all = args.all_checks
    if run_all or args.missing:
        issues += check_missing(lib)
    if run_all or args.orphans:
        issues += check_orphans(lib)
    if run_all or args.duplicates:
        issues += check_duplicates(lib)
    if run_all or args.sizes:
        issues += check_sizes(lib)

    if issues:
        sys.exit(1)


if __name__ == "__main__":
    main()
