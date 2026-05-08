"""
import_mpcfill.py — parse an MPCFill XML order file into card entries.

MPCFill XML structure:
    <order>
      <fronts>
        <card>
          <id>Google Drive file ID (ignored)</id>
          <slots>0</slots>            ← or comma-separated: 100,101,102
          <name>Card Name [SET] {NUM}.jpg</name>
          <query>card name query</query>
        </card>
        ...
      </fronts>
    </order>

Slot count = quantity of that card.
Entries with query starting with 't:' are tokens and are skipped by default.
"""
from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass


@dataclass
class MpcFillEntry:
    qty: int
    name: str                    # parsed card name, ready for library lookup
    set_code: str | None
    collector_num: str | None
    original_name: str           # raw filename (no extension)
    drive_id: str | None = None  # Google Drive file ID from <id> element
    back_drive_id: str | None = None   # Drive ID of the back face (DFC)
    back_name: str | None = None       # parsed name of the back face


# ── filename parsing regexes ───────────────────────────────────────────
_EXT      = re.compile(r'\.(jpe?g|png|webp)$', re.IGNORECASE)
_SET_RE   = re.compile(r'\[([A-Z0-9]{2,6})\]')
_NUM_RE   = re.compile(r'\{([A-Z0-9★\-]+)\}')
_BRACKET  = re.compile(r'\s*\[[^\]]*\]')
_BRACE    = re.compile(r'\s*\{[^}]*\}')
_PAREN    = re.compile(r'\s*\([^)]*\)')
_TRAIL_N  = re.compile(r'\s*\(\d+\)\s*$')
_UND_APOS = re.compile(r"_([a-z])")   # Garruk_s → Garruk's


def _parse_filename(filename: str) -> tuple[str, str | None, str | None]:
    """
    Extract (card_name, set_code, collector_num) from an MPCFill filename.

    Examples:
        "Sol Ring (Volkan Baga) [BLC] {129}.jpg"         → ("Sol Ring", "BLC", "129")
        "Arcane Signet (Borderless Dani Pendergast).jpg"  → ("Arcane Signet", None, None)
        "Garruk_s Uprising (Showcase Wisnu Tan).jpg"      → ("Garruk's Uprising", None, None)
        "The Ur-Dragon.jpg"                               → ("The Ur-Dragon", None, None)
        "Betor, Kin to All [TDM] {172} (1).jpg"          → ("Betor, Kin to All", "TDM", "172")
    """
    name = _EXT.sub('', filename)

    # Capture set/num before stripping brackets
    sm = _SET_RE.search(name)
    nm = _NUM_RE.search(name)
    set_code     = sm.group(1) if sm else None
    collector_num = nm.group(1) if nm else None

    # Strip decorators in order: trailing (1), [SET], {NUM}, (artist/variant)
    name = _TRAIL_N.sub('', name)
    name = _BRACKET.sub('', name)
    name = _BRACE.sub('', name)
    name = _PAREN.sub('', name)

    # Restore apostrophes encoded as underscores: Garruk_s → Garruk's
    name = _UND_APOS.sub(r"'\1", name)

    return name.strip(), set_code, collector_num


def _count_slots(slots_text: str) -> int:
    """Count comma-separated slot entries."""
    return len([s for s in slots_text.split(',') if s.strip()])


def parse_mpcfill_xml(
    xml_text: str,
    skip_tokens: bool = False,
) -> tuple[list[MpcFillEntry], int, str | None]:
    """
    Parse an MPCFill XML string.

    Returns (entries, tokens_skipped, cardback_drive_id).
    Back-face DFC data is embedded in each entry's back_drive_id / back_name.
    """
    root = ET.fromstring(xml_text)
    fronts = root.find('fronts')
    if fronts is None:
        return [], 0, None

    # Build back-face lookup: first slot of each back card -> (drive_id, filename)
    backs_el = root.find('backs')
    back_by_slot: dict[str, tuple[str | None, str]] = {}
    if backs_el is not None:
        for card in backs_el.findall('card'):
            slots    = (card.findtext('slots') or '').strip()
            back_id  = (card.findtext('id')    or '').strip() or None
            back_fn  = (card.findtext('name')  or '').strip()
            for s in slots.split(','):
                s = s.strip()
                if s:
                    back_by_slot[s] = (back_id, back_fn)

    cardback_id = (root.findtext('cardback') or '').strip() or None

    entries: list[MpcFillEntry] = []
    tokens_skipped = 0

    for card in fronts.findall('card'):
        query    = (card.findtext('query') or '').strip()
        filename = (card.findtext('name')  or '').strip()
        slots    = (card.findtext('slots') or '').strip()
        drive_id = (card.findtext('id')    or '').strip() or None

        if skip_tokens and query.startswith('t:'):
            tokens_skipped += _count_slots(slots)
            continue

        qty = _count_slots(slots)
        if qty == 0 or not filename:
            continue

        name, set_code, collector_num = _parse_filename(filename)
        if not name:
            continue

        # Check first slot for a back-face entry
        first_slot = slots.split(',')[0].strip()
        back_drive_id, back_name = None, None
        if first_slot in back_by_slot:
            back_drive_id, back_fn = back_by_slot[first_slot]
            back_name, _, _ = _parse_filename(back_fn)

        entries.append(MpcFillEntry(
            qty=qty,
            name=name,
            set_code=set_code,
            collector_num=collector_num,
            original_name=_EXT.sub('', filename),
            drive_id=drive_id,
            back_drive_id=back_drive_id,
            back_name=back_name,
        ))

    return entries, tokens_skipped, cardback_id


def entries_to_decklist(entries: list[MpcFillEntry]) -> str:
    """Convert parsed entries to standard MTG decklist text."""
    lines = []
    for e in entries:
        line = f"{e.qty} {e.name}"
        if e.set_code and e.collector_num:
            line += f" ({e.set_code}) {e.collector_num}"
        lines.append(line)
    return '\n'.join(lines)
