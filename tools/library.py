"""
library.py — shared core for the MTG art library

Library layout (rooted at $LIBRARY_ROOT, default ~/Documents/projects/mtg-art-library):
    art/
        sol_ring/
            cmm_366.png         # finished file (2192x2992 @ 800 DPI, with bleed)
            2xm_318.png
            custom_futurama.png
        lightning_bolt/
            lea_161.png
            ...
    library.json                # the index

library.json schema:
    {
      "version": 1,
      "canonical_dpi": 800,
      "canonical_size": [2192, 2992],
      "default_bleed": "mirror",
      "cards": {
        "sol_ring": {
          "name": "Sol Ring",
          "default": "cmm_366",
          "printings": {
            "cmm_366": {
              "source": "scryfall",
              "scryfall_id": "abc-123-...",
              "set": "cmm",
              "collector_number": "366",
              "bleed": "mirror",
              "added": "2026-05-02"
            },
            "custom_futurama": {
              "source": "custom",
              "tag": "futurama",
              "bleed": "mirror",
              "added": "2026-05-02"
            }
          }
        }
      }
    }
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from datetime import date
from pathlib import Path
from typing import Any

# ----- canonical sizing (shared with add_bleed pipeline) -----

CANONICAL_DPI = 800
FACE_INCHES = (2.5, 3.5)
BLEED_INCHES = 0.12

def dimensions_for_dpi(dpi: int):
    """Return (face_w, face_h, total_w, total_h, bleed_px) for given DPI."""
    fw = round(FACE_INCHES[0] * dpi)
    fh = round(FACE_INCHES[1] * dpi)
    bp = round(BLEED_INCHES * dpi)
    return fw, fh, fw + 2 * bp, fh + 2 * bp, bp

CANONICAL_FACE_W, CANONICAL_FACE_H, CANONICAL_W, CANONICAL_H, CANONICAL_BLEED = \
    dimensions_for_dpi(CANONICAL_DPI)


# ----- paths -----

DEFAULT_ROOT = Path(os.environ.get(
    "MTG_ART_LIBRARY",
    str(Path.home() / "Documents" / "projects" / "mtg-art-library")
))

def library_root(override: Path | None = None) -> Path:
    return override or DEFAULT_ROOT

def art_dir(root: Path) -> Path:
    return root / "art"

def index_path(root: Path) -> Path:
    return root / "library.json"


# ----- name normalization -----

# "Urza's Saga" -> "urzas_saga"
# "Fire // Ice" -> "fire_ice"
# "Æther Vial"  -> "aether_vial"
# "Lim-Dûl's Vault" -> "lim_duls_vault"
NAME_FIXUPS = {
    "æ": "ae", "Æ": "ae",
    "â": "a", "à": "a", "á": "a", "ä": "a",
    "ê": "e", "è": "e", "é": "e", "ë": "e",
    "î": "i", "ì": "i", "í": "i", "ï": "i",
    "ô": "o", "ò": "o", "ó": "o", "ö": "o",
    "û": "u", "ù": "u", "ú": "u", "ü": "u",
    "û": "u", "Û": "u", "ñ": "n",
}

def normalize_name(name: str) -> str:
    """Convert a card name to a stable, filesystem-safe slug."""
    s = name.strip()
    for old, new in NAME_FIXUPS.items():
        s = s.replace(old, new)
    s = s.lower()
    s = s.replace(" // ", "_")
    # strip apostrophes/quotes entirely (Urza's -> Urzas, not Urza_s)
    s = re.sub(r"['\u2019\u2018`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "_", s)
    s = re.sub(r"_+", "_", s).strip("_")
    return s


def normalize_printing_id(set_code: str | None, collector_num: str | None,
                           tag: str | None = None) -> str:
    """Build a stable id for a particular printing or custom variant."""
    if set_code and collector_num:
        return f"{set_code.lower()}_{re.sub(r'[^a-z0-9]+', '', collector_num.lower())}"
    if tag:
        return f"custom_{re.sub(r'[^a-z0-9]+', '_', tag.lower()).strip('_')}"
    raise ValueError("Need either (set, num) or tag to build a printing id.")


# ----- index dataclasses -----

@dataclass
class Printing:
    source: str               # "scryfall" | "mpcfill" | "custom" | "file"
    bleed: str = "mirror"     # "mirror" | "edge" | "black" | "white"
    scryfall_id: str | None = None
    set: str | None = None
    collector_number: str | None = None
    tag: str | None = None
    added: str = ""           # ISO date
    styles: list[str] = field(default_factory=list)  # user-defined style labels

    def to_dict(self) -> dict[str, Any]:
        d = {"source": self.source, "bleed": self.bleed, "added": self.added}
        for k in ("scryfall_id", "set", "collector_number", "tag"):
            v = getattr(self, k)
            if v is not None:
                d[k] = v
        if self.styles:
            d["styles"] = list(self.styles)
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Printing":
        kwargs = {k: d.get(k) for k in
                  ("source", "bleed", "scryfall_id", "set",
                   "collector_number", "tag", "added")}
        kwargs["styles"] = d.get("styles") or []
        return cls(**kwargs)


@dataclass
class Card:
    name: str                              # display name "Sol Ring"
    default: str | None = None             # default printing_id
    printings: dict[str, Printing] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "default": self.default,
            "printings": {k: p.to_dict() for k, p in self.printings.items()},
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Card":
        return cls(
            name=d["name"],
            default=d.get("default"),
            printings={k: Printing.from_dict(v) for k, v in d.get("printings", {}).items()},
        )


@dataclass
class Library:
    root: Path
    canonical_dpi: int = CANONICAL_DPI
    canonical_size: tuple[int, int] = (CANONICAL_W, CANONICAL_H)
    default_bleed: str = "mirror"
    cards: dict[str, Card] = field(default_factory=dict)  # slug -> Card

    @classmethod
    def load(cls, root: Path | None = None) -> "Library":
        root = library_root(root)
        ip = index_path(root)
        if not ip.exists():
            return cls(root=root)
        data = json.loads(ip.read_text(encoding="utf-8"))
        return cls(
            root=root,
            canonical_dpi=data.get("canonical_dpi", CANONICAL_DPI),
            canonical_size=tuple(data.get("canonical_size", [CANONICAL_W, CANONICAL_H])),
            default_bleed=data.get("default_bleed", "mirror"),
            cards={k: Card.from_dict(v) for k, v in data.get("cards", {}).items()},
        )

    def save(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        art_dir(self.root).mkdir(exist_ok=True)
        data = {
            "version": 1,
            "canonical_dpi": self.canonical_dpi,
            "canonical_size": list(self.canonical_size),
            "default_bleed": self.default_bleed,
            "cards": {k: v.to_dict() for k, v in sorted(self.cards.items())},
        }
        index_path(self.root).write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- high-level lookup ---

    def get_card(self, name_or_slug: str) -> Card | None:
        slug = normalize_name(name_or_slug)
        return self.cards.get(slug)

    def file_path(self, card_slug: str, printing_id: str) -> Path:
        return art_dir(self.root) / card_slug / f"{printing_id}.png"

    def add_printing(self, card_name: str, printing_id: str, printing: Printing,
                     make_default: bool = False) -> Card:
        slug = normalize_name(card_name)
        if not printing.added:
            printing.added = date.today().isoformat()
        card = self.cards.get(slug)
        if card is None:
            card = Card(name=card_name)
            self.cards[slug] = card
        card.printings[printing_id] = printing
        if make_default or card.default is None:
            card.default = printing_id
        return card

    def resolve_printing(self, card_name: str, printing_override: str | None = None
                         ) -> tuple[str, str, Printing] | None:
        """Returns (slug, printing_id, Printing) or None if not in library."""
        card = self.get_card(card_name)
        if not card:
            return None
        slug = normalize_name(card_name)
        pid = printing_override or card.default
        if not pid or pid not in card.printings:
            # try fuzzy on overrides like "cmm 366" -> "cmm_366"
            if printing_override:
                norm = re.sub(r"[^a-z0-9]+", "_", printing_override.lower()).strip("_")
                if norm in card.printings:
                    pid = norm
                else:
                    return None
            else:
                return None
        return slug, pid, card.printings[pid]
