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
    styles: list[str] = field(default_factory=list)
    is_dfc: bool = False      # has a back face stored as {pid}_b.png
    back_name: str | None = None  # display name of back face

    def to_dict(self) -> dict[str, Any]:
        d = {"source": self.source, "bleed": self.bleed, "added": self.added}
        for k in ("scryfall_id", "set", "collector_number", "tag"):
            v = getattr(self, k)
            if v is not None:
                d[k] = v
        if self.styles:
            d["styles"] = list(self.styles)
        if self.is_dfc:
            d["is_dfc"] = True
        if self.back_name:
            d["back_name"] = self.back_name
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Printing":
        kwargs = {k: d.get(k) for k in
                  ("source", "bleed", "scryfall_id", "set",
                   "collector_number", "tag", "added")}
        kwargs["styles"] = d.get("styles") or []
        kwargs["is_dfc"] = bool(d.get("is_dfc", False))
        kwargs["back_name"] = d.get("back_name")
        return cls(**kwargs)


@dataclass
class Cardback:
    name: str
    source: str = "file"     # "file" | "drive"
    tag: str | None = None
    drive_id: str | None = None
    added: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = {"name": self.name, "source": self.source, "added": self.added}
        if self.tag:      d["tag"]      = self.tag
        if self.drive_id: d["drive_id"] = self.drive_id
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Cardback":
        return cls(
            name=d["name"],
            source=d.get("source", "file"),
            tag=d.get("tag"),
            drive_id=d.get("drive_id"),
            added=d.get("added", ""),
        )


@dataclass
class SavedDeck:
    name: str
    text: str
    added: str = ""
    cardback_key: str = ""

    def to_dict(self) -> dict[str, Any]:
        d = {"name": self.name, "text": self.text, "added": self.added}
        if self.cardback_key:
            d["cardback_key"] = self.cardback_key
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "SavedDeck":
        return cls(
            name=d["name"], text=d["text"], added=d.get("added", ""),
            cardback_key=d.get("cardback_key", ""),
        )


@dataclass
class Card:
    name: str                              # display name "Sol Ring"
    default: str | None = None             # default printing_id
    printings: dict[str, Printing] = field(default_factory=dict)
    related_tokens: list[str] = field(default_factory=list)  # token names this card produces

    def to_dict(self) -> dict[str, Any]:
        d = {
            "name": self.name,
            "default": self.default,
            "printings": {k: p.to_dict() for k, p in self.printings.items()},
        }
        if self.related_tokens:
            d["related_tokens"] = list(self.related_tokens)
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Card":
        return cls(
            name=d["name"],
            default=d.get("default"),
            printings={k: Printing.from_dict(v) for k, v in d.get("printings", {}).items()},
            related_tokens=d.get("related_tokens") or [],
        )


@dataclass
class Library:
    root: Path
    canonical_dpi: int = CANONICAL_DPI
    canonical_size: tuple[int, int] = (CANONICAL_W, CANONICAL_H)
    default_bleed: str = "mirror"
    cards: dict[str, Card] = field(default_factory=dict)
    cardbacks: dict[str, Cardback] = field(default_factory=dict)  # key -> Cardback
    default_cardback: str | None = None
    decklists: dict[str, SavedDeck] = field(default_factory=dict)  # key -> SavedDeck

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
            cardbacks={k: Cardback.from_dict(v) for k, v in data.get("cardbacks", {}).items()},
            default_cardback=data.get("default_cardback"),
            decklists={k: SavedDeck.from_dict(v) for k, v in data.get("decklists", {}).items()},
        )

    def save(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)
        art_dir(self.root).mkdir(exist_ok=True)
        (art_dir(self.root) / "cardbacks").mkdir(exist_ok=True)
        data = {
            "version": 1,
            "canonical_dpi": self.canonical_dpi,
            "canonical_size": list(self.canonical_size),
            "default_bleed": self.default_bleed,
        }
        if self.cardbacks:
            data["cardbacks"] = {k: v.to_dict() for k, v in self.cardbacks.items()}
        if self.default_cardback:
            data["default_cardback"] = self.default_cardback
        if self.decklists:
            data["decklists"] = {k: v.to_dict() for k, v in self.decklists.items()}
        data["cards"] = {k: v.to_dict() for k, v in sorted(self.cards.items())}
        index_path(self.root).write_text(
            json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # --- high-level lookup ---

    def get_card(self, name_or_slug: str) -> Card | None:
        slug = normalize_name(name_or_slug)
        return self.cards.get(slug)

    def file_path(self, card_slug: str, printing_id: str) -> Path:
        return art_dir(self.root) / card_slug / f"{printing_id}.png"

    def back_file_path(self, card_slug: str, printing_id: str) -> Path:
        return art_dir(self.root) / card_slug / f"{printing_id}_b.png"

    def cardback_file_path(self, cardback_key: str) -> Path:
        return art_dir(self.root) / "cardbacks" / f"{cardback_key}.png"

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
