"""
build_pdf.py — render a multi-page 9-up (or N-up) PDF for home printing.

Each page is a PIL RGB image at `layout.dpi` DPI.  Card art is scaled to fill
its slot while preserving aspect ratio.  L-shaped cut marks are drawn at each
card corner in the gap/margin area so cards can be cut cleanly.

Adding a new paper size or grid is a one-liner in LAYOUTS — just supply a
Layout instance with the right dimensions and column/row counts.
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw

from library import Library


# ── layout definition ────────────────────────────────────────────────────────

@dataclass
class Layout:
    name: str          # display label shown in the UI
    paper_w: float     # inches
    paper_h: float     # inches
    cols: int
    rows: int
    dpi: int   = 300
    margin: float = 0.25    # page edge margin, inches
    gap: float    = 0.125   # gap between card slots, inches (space for cut marks)
    cut_marks: bool = True


LAYOUTS: dict[str, Layout] = {
    "letter_9up": Layout(
        name="Letter · 9-up (3×3)",
        paper_w=8.5,  paper_h=11.0,
        cols=3, rows=3,
    ),
    "legal_9up": Layout(
        name="Legal · 9-up (3×3)",
        paper_w=8.5,  paper_h=14.0,
        cols=3, rows=3,
        margin=0.375,
    ),
    "a4_9up": Layout(
        name="A4 · 9-up (3×3)",
        paper_w=8.27, paper_h=11.69,
        cols=3, rows=3,
    ),
    "tabloid_12up": Layout(
        name="Tabloid · 12-up (4×3)",
        paper_w=11.0, paper_h=17.0,
        cols=4, rows=3,
        margin=0.375,
    ),
    "a3_12up": Layout(
        name="A3 · 12-up (4×3)",
        paper_w=11.69, paper_h=16.54,
        cols=4, rows=3,
        margin=0.375,
    ),
}


# ── build entry point ─────────────────────────────────────────────────────────

def build_pdf(
    lib: Library,
    rows: list[dict[str, Any]],
    out_path: Path,
    layout_key: str = "letter_9up",
    job=None,
) -> Path:
    """
    Render rows to a multi-page PDF at the given layout.

    rows: [{"slug": str, "printing_id": str, "qty": int, "name": str}]
    Returns the path to the written PDF.
    """
    layout = LAYOUTS.get(layout_key)
    if layout is None:
        raise ValueError(f"Unknown layout '{layout_key}'. Valid: {list(LAYOUTS)}")

    dpi = layout.dpi

    # ── page geometry (pixels) ──────────────────────────────────────────────
    pw = round(layout.paper_w * dpi)
    ph = round(layout.paper_h * dpi)
    mx = round(layout.margin * dpi)        # page margin x & y
    gx = round(layout.gap * dpi)           # gap between columns
    gy = round(layout.gap * dpi)           # gap between rows

    cols, nrows = layout.cols, layout.rows

    # Slot size: the rectangle each card is placed within
    slot_w = (pw - 2 * mx - (cols  - 1) * gx) // cols
    slot_h = (ph - 2 * mx - (nrows - 1) * gy) // nrows

    # ── expand by quantity ──────────────────────────────────────────────────
    card_list: list[dict] = []
    for row in rows:
        card_list.extend([row] * row.get("qty", 1))

    if not card_list:
        raise ValueError("No cards to render.")

    cards_per_page = cols * nrows
    total_pages = math.ceil(len(card_list) / cards_per_page)

    # ── render pages ────────────────────────────────────────────────────────
    page_images: list[Image.Image] = []

    for page_idx in range(total_pages):
        if job:
            job.update(f"Rendering page {page_idx + 1}/{total_pages}…")

        page = Image.new("RGB", (pw, ph), (255, 255, 255))
        draw = ImageDraw.Draw(page)

        batch = card_list[page_idx * cards_per_page:(page_idx + 1) * cards_per_page]

        for cell_idx, row in enumerate(batch):
            col_i = cell_idx % cols
            row_i = cell_idx // cols

            # Top-left of this slot
            sx = mx + col_i * (slot_w + gx)
            sy = mx + row_i * (slot_h + gy)

            src = lib.file_path(row["slug"], row["printing_id"])
            if not src.exists():
                raise FileNotFoundError(
                    f"Art file missing: {src}\n"
                    "Re-ingest this card or pick a different printing."
                )

            art = Image.open(src).convert("RGB")

            # Scale to fit slot, maintain aspect ratio
            aw, ah = art.size
            scale = min(slot_w / aw, slot_h / ah)
            nw = round(aw * scale)
            nh = round(ah * scale)
            art = art.resize((nw, nh), Image.LANCZOS)

            # Centre in slot
            ax = sx + (slot_w - nw) // 2
            ay = sy + (slot_h - nh) // 2

            page.paste(art, (ax, ay))

            if layout.cut_marks:
                _draw_cut_marks(draw, ax, ay, nw, nh, dpi)

        page_images.append(page)

    # ── write PDF ───────────────────────────────────────────────────────────
    if job:
        job.update("Writing PDF…")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    page_images[0].save(
        str(out_path),
        format="PDF",
        save_all=True,
        append_images=page_images[1:],
        resolution=dpi,
    )
    return out_path


# ── cut marks ────────────────────────────────────────────────────────────────

def _draw_cut_marks(
    draw: ImageDraw.ImageDraw,
    ax: int, ay: int,
    aw: int, ah: int,
    dpi: int,
    mark_len: float = 0.09,   # inches
    gap: float = 0.018,        # inches — space between art edge and mark start
) -> None:
    """Draw L-shaped cut marks at all four corners of the card art."""
    ml = round(mark_len * dpi)   # mark length in px
    mg = round(gap * dpi)        # gap in px
    color = (160, 160, 160)

    corners = [
        (ax,      ay,      -1, -1),   # top-left
        (ax + aw, ay,      +1, -1),   # top-right
        (ax,      ay + ah, -1, +1),   # bottom-left
        (ax + aw, ay + ah, +1, +1),   # bottom-right
    ]

    for (cx, cy, dx, dy) in corners:
        # Horizontal arm: extends in dx direction from the corner
        hx0 = cx + dx * mg
        hx1 = cx + dx * (mg + ml)
        draw.line([(hx0, cy), (hx1, cy)], fill=color, width=1)

        # Vertical arm: extends in dy direction from the corner
        vy0 = cy + dy * mg
        vy1 = cy + dy * (mg + ml)
        draw.line([(cx, vy0), (cx, vy1)], fill=color, width=1)
