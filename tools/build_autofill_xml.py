"""
build_autofill_xml.py — generate an MPC AutoFill XML from a build selection.

Produces the same XML schema that MPCFill uses, with file:// URIs pointing at
local art files. Load it directly into the MPC AutoFill desktop app (v2+) or
substitute Google Drive file IDs for manual upload workflows.
"""
from __future__ import annotations

import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any

from library import Library

# MPC order bracket sizes (cards per bracket tier)
_BRACKETS = [18, 36, 55, 72, 90, 108, 126, 144, 162, 180,
             198, 216, 234, 396, 504, 612]


def _bracket(n: int) -> int:
    for b in _BRACKETS:
        if n <= b:
            return b
    return _BRACKETS[-1]


def build_autofill_xml(
    lib: Library,
    rows: list[dict[str, Any]],
    out_path: Path,
    cardstock: str = "(S30) Standard Smooth",
    foil: bool = False,
    cardback_key: str | None = None,
    job=None,
) -> Path:
    """
    Generate an MPC AutoFill XML referencing local art files via file:// URIs.

    rows: [{"slug": str, "printing_id": str, "qty": int, "name": str}]
    cardback_key: key into lib.cardbacks (or None to use library default)
    Returns the path to the written XML file.
    """
    total_qty = sum(row.get("qty", 1) for row in rows)
    bracket = _bracket(total_qty)

    root = ET.Element("order")

    details = ET.SubElement(root, "details")
    ET.SubElement(details, "quantity").text = str(total_qty)
    ET.SubElement(details, "bracket").text   = str(bracket)
    ET.SubElement(details, "stock").text     = cardstock
    ET.SubElement(details, "foil").text      = "true" if foil else "false"

    fronts = ET.SubElement(root, "fronts")
    backs_entries: list[tuple[str, Any, str, str]] = []  # (slots_str, p, back_name, back_uri)

    slot = 0
    total = len(rows)

    for i, row in enumerate(rows, 1):
        slug = row["slug"]
        pid  = row["printing_id"]
        qty  = row.get("qty", 1)
        name = row.get("name", slug)

        if job:
            job.update(f"Processing {name} ({i}/{total})…")

        src = lib.file_path(slug, pid)
        if not src.exists():
            raise FileNotFoundError(
                f"Art file missing: {src}\n"
                "Re-ingest this card or pick a different printing."
            )

        card = lib.cards.get(slug)
        p    = card.printings.get(pid) if card else None

        if p and p.set and p.collector_number:
            file_name = f"{name} [{p.set.upper()}] {{{p.collector_number}}}.jpg"
        else:
            file_name = f"{name}.jpg"

        slots_str = ",".join(str(slot + j) for j in range(qty))

        card_el = ET.SubElement(fronts, "card")
        ET.SubElement(card_el, "id").text     = src.as_uri()
        ET.SubElement(card_el, "slots").text  = slots_str
        ET.SubElement(card_el, "name").text   = file_name
        ET.SubElement(card_el, "query").text  = name.lower()

        # Collect back-face entries for DFC cards
        if p and p.is_dfc:
            back_src = lib.back_file_path(slug, pid)
            if back_src.exists():
                back_display = p.back_name or (name + " (back)")
                backs_entries.append((slots_str, p, back_display, back_src.as_uri()))

        slot += qty

    # Write backs section for DFCs
    if backs_entries:
        backs_el = ET.SubElement(root, "backs")
        for slots_str, p, back_display, back_uri in backs_entries:
            if p.set and p.collector_number:
                back_fn = f"{back_display} [{p.set.upper()}] {{{p.collector_number}}}.jpg"
            else:
                back_fn = f"{back_display}.jpg"
            card_el = ET.SubElement(backs_el, "card")
            ET.SubElement(card_el, "id").text    = back_uri
            ET.SubElement(card_el, "slots").text = slots_str
            ET.SubElement(card_el, "name").text  = back_fn
            ET.SubElement(card_el, "query").text = back_display.lower()

    # Write cardback
    cb_key = cardback_key or lib.default_cardback
    if cb_key and cb_key in lib.cardbacks:
        cb_path = lib.cardback_file_path(cb_key)
        if cb_path.exists():
            ET.SubElement(root, "cardback").text = cb_path.as_uri()

    if job:
        job.update("Writing XML…")

    tree = ET.ElementTree(root)
    ET.indent(tree, space="    ")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tree.write(out_path, encoding="utf-8", xml_declaration=True)

    return out_path
