"""decklist.py — parse a decklist file into entries."""
from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

LINE_RE = re.compile(
    r"""^\s*
        (?:(?P<qty>\d+)\s*[xX]?\s+)?
        (?P<name>[^()\[\]\n]+?)
        \s*
        (?:\(\s*(?P<set>[A-Za-z0-9]{2,6})\s*\)
           \s*(?P<num>[A-Za-z0-9\-★]+)?
        )?
        \s*(?:\*[^*]*\*)?\s*$
    """,
    re.VERBOSE,
)

SKIP_PREFIXES = ("#", "//", "sideboard", "maybeboard", "commander:", "deck:")


@dataclass
class DeckEntry:
    qty: int
    name: str
    set_code: str | None = None
    collector_num: str | None = None


def parse_decklist(path: Path) -> Iterator[DeckEntry]:
    with open(path, encoding="utf-8") as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            low = line.lower()
            if any(low.startswith(p) for p in SKIP_PREFIXES):
                continue
            m = LINE_RE.match(line)
            if not m:
                print(f"  ! could not parse: {line!r}", file=sys.stderr)
                continue
            name = m.group("name").strip().split(" // ")[0].strip()
            yield DeckEntry(
                qty=int(m.group("qty") or 1),
                name=name,
                set_code=m.group("set"),
                collector_num=m.group("num"),
            )
