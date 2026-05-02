"""
build_mpc.py — assemble a zip of 2192×2992 PNGs for MPC upload.

Each unique card gets one PNG named <slug>__<printing_id>.png.
A manifest.txt lists qty per file so you know how many to enter in the MPC UI.
"""
from __future__ import annotations

import shutil
import zipfile
from pathlib import Path
from typing import Any

from library import Library


def build_png_bundle(
    lib: Library,
    rows: list[dict[str, Any]],
    out_dir: Path,
    job=None,
) -> Path:
    """
    Copy art files for each row into out_dir, write a manifest, then zip.

    rows: [{"slug": str, "printing_id": str, "qty": int, "name": str}]
    Returns the path to the created zip file.
    """
    total = len(rows)
    for i, row in enumerate(rows, 1):
        slug = row["slug"]
        pid = row["printing_id"]
        name = row.get("name", slug)

        if job:
            job.update(f"Copying {name} ({i}/{total})…")

        src = lib.file_path(slug, pid)
        if not src.exists():
            raise FileNotFoundError(
                f"Art file missing: {src}\n"
                "Re-ingest this card or pick a different printing."
            )
        shutil.copy2(src, out_dir / f"{slug}__{pid}.png")

    # Manifest so the user knows how many copies to enter in the MPC UI
    lines = [
        "# MPC PNG Bundle — one file per unique card",
        "# Set quantity manually in the MPC upload UI",
        "#",
        "# qty\tfilename\tcard_name",
    ]
    for row in rows:
        lines.append(
            f"{row.get('qty', 1)}\t{row['slug']}__{row['printing_id']}.png"
            f"\t{row.get('name', row['slug'])}"
        )
    (out_dir / "manifest.txt").write_text("\n".join(lines), encoding="utf-8")

    if job:
        job.update("Zipping…")

    zip_path = out_dir.with_suffix(".zip")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as zf:
        for f in sorted(out_dir.iterdir()):
            zf.write(f, f.name)

    if job:
        job.update("Done.")

    return zip_path
