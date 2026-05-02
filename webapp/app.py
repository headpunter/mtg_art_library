"""
app.py — Flask web UI for the MTG art library.

Run:
    python app.py [--port 5000] [--lib /path/to/library/root]

Then open http://localhost:5000 in your browser.

This file currently implements the Library view (Half 1). Build view comes next.
"""
from __future__ import annotations

import argparse
import sys
from io import BytesIO
from pathlib import Path

from flask import (Flask, abort, jsonify, redirect, render_template,
                   request, send_file, url_for)
from PIL import Image

# Make the tools/ package importable
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from library import Library, Printing, normalize_name, normalize_printing_id  # noqa: E402
import scryfall  # noqa: E402
from add_card import ingest_scryfall, ingest_file  # noqa: E402

import jobs  # noqa: E402

app = Flask(__name__)
app.config["JSON_SORT_KEYS"] = False
app.config["MAX_CONTENT_LENGTH"] = 200 * 1024 * 1024  # 200MB upload cap

LIB_ROOT_OVERRIDE: Path | None = None


# ---------- helpers ----------

def get_lib() -> Library:
    return Library.load(LIB_ROOT_OVERRIDE)


def card_summary(slug: str, card) -> dict:
    """Compact dict representation for the library grid."""
    default = card.default
    default_path = None
    if default and default in card.printings:
        p = get_lib().file_path(slug, default)
        if p.exists():
            default_path = f"{slug}/{default}"
    return {
        "slug": slug,
        "name": card.name,
        "default": default,
        "default_thumb": default_path,
        "printings_count": len(card.printings),
    }


# ---------- pages ----------

@app.route("/")
def home():
    return redirect(url_for("library_view"))


@app.route("/library")
def library_view():
    lib = get_lib()
    cards = sorted(
        [card_summary(slug, c) for slug, c in lib.cards.items()],
        key=lambda x: x["name"].lower(),
    )
    return render_template(
        "library.html",
        cards=cards,
        total_printings=sum(len(c.printings) for c in lib.cards.values()),
        canonical_dpi=lib.canonical_dpi,
        canonical_w=lib.canonical_size[0],
        canonical_h=lib.canonical_size[1],
    )


# ---------- card detail / API ----------

@app.route("/api/card/<slug>")
def api_card(slug):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card:
        abort(404)
    return jsonify({
        "slug": slug,
        "name": card.name,
        "default": card.default,
        "printings": {
            pid: {**p.to_dict(), "id": pid,
                  "exists": lib.file_path(slug, pid).exists()}
            for pid, p in card.printings.items()
        },
    })


@app.route("/api/card/<slug>/default", methods=["POST"])
def api_set_default(slug):
    lib = get_lib()
    if slug not in lib.cards:
        abort(404)
    new_default = request.json.get("printing_id")
    if new_default not in lib.cards[slug].printings:
        return jsonify({"error": "no such printing"}), 400
    lib.cards[slug].default = new_default
    lib.save()
    return jsonify({"ok": True, "default": new_default})


@app.route("/api/card/<slug>/printing/<pid>", methods=["DELETE"])
def api_delete_printing(slug, pid):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card or pid not in card.printings:
        abort(404)
    # remove file
    p = lib.file_path(slug, pid)
    if p.exists():
        p.unlink()
    del card.printings[pid]
    if card.default == pid:
        card.default = next(iter(card.printings), None)
    if not card.printings:
        # no printings left, drop the card entirely + remove dir
        del lib.cards[slug]
        d = lib.file_path(slug, "x").parent
        if d.exists() and not any(d.iterdir()):
            d.rmdir()
    lib.save()
    return jsonify({"ok": True})


@app.route("/thumb/<path:rel>")
def thumb(rel: str):
    """Serve a 200×280 thumbnail of art/<rel>.png. Generated on demand & cached."""
    lib = get_lib()
    src = (lib.root / "art" / rel).with_suffix(".png")
    if not src.exists():
        abort(404)
    cache = lib.root / ".thumbs" / (rel + ".jpg")
    if cache.exists() and cache.stat().st_mtime > src.stat().st_mtime:
        return send_file(cache, mimetype="image/jpeg")
    img = Image.open(src)
    img.thumbnail((300, 420), Image.LANCZOS)
    cache.parent.mkdir(parents=True, exist_ok=True)
    cache.parent.joinpath(Path(rel).parent).mkdir(parents=True, exist_ok=True)
    img.convert("RGB").save(cache, "JPEG", quality=85)
    return send_file(cache, mimetype="image/jpeg")


@app.route("/full/<path:rel>")
def full(rel: str):
    """Serve the full art file (heavy, only on click)."""
    lib = get_lib()
    src = (lib.root / "art" / rel).with_suffix(".png")
    if not src.exists():
        abort(404)
    return send_file(src, mimetype="image/png")


# ---------- ingestion endpoints ----------

@app.route("/api/scryfall/search")
def api_scryfall_search():
    """Autocomplete card names. Uses Scryfall's /cards/autocomplete endpoint."""
    q = request.args.get("q", "").strip()
    if len(q) < 2:
        return jsonify({"results": []})
    try:
        import requests
        r = requests.get("https://api.scryfall.com/cards/autocomplete",
                         params={"q": q},
                         headers={"User-Agent": "MTG-Art-Library/1.0"},
                         timeout=10)
        r.raise_for_status()
        return jsonify({"results": r.json().get("data", [])[:10]})
    except Exception as e:
        return jsonify({"results": [], "error": str(e)})


@app.route("/api/scryfall/printings")
def api_scryfall_printings():
    """
    For a given exact card name, fetch all printings and return the top 5 by
    non-foil USD price, with foil-only treatments deprioritized.
    """
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    try:
        import requests
        # Use Scryfall search syntax: !"exact name" unique:prints
        r = requests.get("https://api.scryfall.com/cards/search",
                         params={"q": f'!"{name}" unique:prints', "order": "usd"},
                         headers={"User-Agent": "MTG-Art-Library/1.0"},
                         timeout=15)
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    out = []
    for c in data:
        finishes = c.get("finishes", [])
        foil_only = "nonfoil" not in finishes
        prices = c.get("prices", {})
        usd = prices.get("usd")
        usd_foil = prices.get("usd_foil")
        # Use non-foil price; fall back to foil price if non-foil missing
        try:
            price_val = float(usd) if usd else (float(usd_foil) if usd_foil else 0.0)
        except (TypeError, ValueError):
            price_val = 0.0
        out.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "set": c.get("set"),
            "set_name": c.get("set_name"),
            "collector_number": c.get("collector_number"),
            "frame": c.get("frame"),
            "border_color": c.get("border_color"),
            "released_at": c.get("released_at"),
            "image_normal": (c.get("image_uris") or {}).get("normal")
                or (c.get("card_faces", [{}])[0].get("image_uris", {}) or {}).get("normal"),
            "price": price_val,
            "foil_only": foil_only,
        })

    # Sort: foil-only goes to bottom; within each group, descending price
    out.sort(key=lambda x: (x["foil_only"], -x["price"]))
    top = out[:5]
    full_count = len(out)
    return jsonify({"top": top, "total": full_count})


@app.route("/api/ingest/scryfall", methods=["POST"])
def api_ingest_scryfall():
    """Kick off Scryfall ingestion as a background job."""
    body = request.json or {}
    name = body.get("name")
    set_code = body.get("set")
    num = body.get("num")
    bleed = body.get("bleed")
    make_default = bool(body.get("make_default"))
    if not name:
        return jsonify({"error": "name required"}), 400

    def run(job):
        job.update("Looking up card on Scryfall...")
        lib = get_lib()
        job.update("Downloading PNG...")
        # ingest_scryfall is one synchronous call; re-emit progress inside it
        # by patching... easier: just call it. Could add progress callbacks later.
        job.update("Upscaling and processing...")
        slug, pid = ingest_scryfall(
            lib, name, set_code, num,
            bleed_method=bleed, make_default=make_default,
        )
        lib.save()
        return {"slug": slug, "printing_id": pid}

    label = f"Adding {name}" + (f" ({set_code} {num})" if set_code else "")
    job = jobs.submit(label, run)
    return jsonify(job.to_dict())


@app.route("/api/ingest/file", methods=["POST"])
def api_ingest_file():
    """Ingest one or more uploaded files."""
    card_name = request.form.get("name")
    tag = request.form.get("tag", "custom")
    bleed = request.form.get("bleed") or None
    make_default = request.form.get("make_default") == "1"
    files = request.files.getlist("files")
    if not card_name:
        return jsonify({"error": "name required"}), 400
    if not files:
        return jsonify({"error": "no files"}), 400

    # Save uploads to a temp staging area so the background job can read them
    staging = (LIB_ROOT_OVERRIDE or get_lib().root) / ".upload_staging"
    staging.mkdir(parents=True, exist_ok=True)

    saved_paths = []
    for i, f in enumerate(files):
        if not f.filename:
            continue
        ext = Path(f.filename).suffix.lower()
        if ext not in (".png", ".jpg", ".jpeg", ".webp"):
            continue
        target = staging / f"{tag}_{i}_{f.filename}"
        f.save(target)
        saved_paths.append(target)

    if not saved_paths:
        return jsonify({"error": "no usable images"}), 400

    def run(job):
        results = []
        for i, p in enumerate(saved_paths):
            sub_tag = tag if len(saved_paths) == 1 else f"{tag}_{i+1}"
            job.update(f"Processing {p.name} ({i+1}/{len(saved_paths)})...")
            lib = get_lib()
            slug, pid = ingest_file(
                lib, p, card_name,
                tag=sub_tag, bleed_method=bleed,
                make_default=make_default and i == 0,
            )
            lib.save()
            results.append({"slug": slug, "printing_id": pid})
            try:
                p.unlink()
            except OSError:
                pass
        return {"items": results}

    job = jobs.submit(f"Adding {len(saved_paths)} file(s) for {card_name}", run)
    return jsonify(job.to_dict())


@app.route("/api/job/<jid>")
def api_job(jid):
    j = jobs.get(jid)
    if not j:
        abort(404)
    return jsonify(j.to_dict())


@app.route("/api/jobs")
def api_jobs():
    return jsonify({"jobs": [j.to_dict() for j in jobs.list_recent()]})


# ---------- build view ----------

@app.route("/card/<slug>")
def card_detail(slug: str):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card:
        abort(404)
    default_thumb = None
    if card.default and card.default in card.printings:
        p = lib.file_path(slug, card.default)
        if p.exists():
            default_thumb = f"{slug}/{card.default}"
    exists = {pid: lib.file_path(slug, pid).exists() for pid in card.printings}
    return render_template(
        "card.html",
        slug=slug,
        card=card,
        default_thumb=default_thumb,
        exists=exists,
        canonical_dpi=lib.canonical_dpi,
        canonical_w=lib.canonical_size[0],
        canonical_h=lib.canonical_size[1],
    )


@app.route("/api/card/<slug>", methods=["DELETE"])
def api_delete_card(slug: str):
    import shutil
    lib = get_lib()
    if slug not in lib.cards:
        abort(404)
    art_folder = lib.file_path(slug, "x").parent
    if art_folder.exists():
        shutil.rmtree(art_folder, ignore_errors=True)
    del lib.cards[slug]
    lib.save()
    return jsonify({"ok": True})


@app.route("/api/card/<slug>/printing/<pid>/bleed", methods=["POST"])
def api_update_bleed(slug: str, pid: str):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card or pid not in card.printings:
        abort(404)
    new_bleed = (request.json or {}).get("bleed")
    if new_bleed not in ("mirror", "edge", "black", "white"):
        return jsonify({"error": "invalid bleed method"}), 400
    card.printings[pid].bleed = new_bleed
    lib.save()
    return jsonify({"ok": True, "bleed": new_bleed})


@app.route("/api/card/<slug>/printing/<pid>/reprocess", methods=["POST"])
def api_reprocess_printing(slug: str, pid: str):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card or pid not in card.printings:
        abort(404)
    p = card.printings[pid]
    if p.source != "scryfall":
        return jsonify({"error": "only Scryfall-sourced printings can be re-processed"}), 400

    def run(job):
        lib2 = get_lib()
        c = lib2.cards[slug]
        pr = c.printings[pid]
        job.update("Re-downloading from Scryfall…")
        slug_out, pid_out = ingest_scryfall(
            lib2, c.name,
            set_code=pr.set, collector_num=pr.collector_number,
            bleed_method=pr.bleed,
            make_default=(c.default == pid),
        )
        lib2.save()
        return {"slug": slug_out, "printing_id": pid_out}

    job = jobs.submit(f"Re-processing {card.name} / {pid}", run)
    return jsonify(job.to_dict())


@app.route("/build")
def build_view():
    return render_template("build.html")


@app.route("/api/parse-decklist", methods=["POST"])
def api_parse_decklist():
    """Parse a decklist text and cross-reference against the library."""
    text = (request.json or {}).get("text", "")
    lib = get_lib()

    from collections import OrderedDict
    from decklist import parse_decklist_text

    entries = list(parse_decklist_text(text))

    # Deduplicate: group by (slug, pinned_printing_id)
    groups: dict = OrderedDict()
    for e in entries:
        slug = normalize_name(e.name)
        pinned_pid = None
        if e.set_code and e.collector_num:
            pinned_pid = normalize_printing_id(e.set_code, e.collector_num)
        key = (slug, pinned_pid)
        if key not in groups:
            groups[key] = {
                "qty": 0, "name": e.name, "slug": slug,
                "set_code": e.set_code, "collector_num": e.collector_num,
            }
        groups[key]["qty"] += e.qty

    rows = []
    stats = {"total_qty": 0, "unique": 0, "ok": 0, "pick": 0, "missing": 0}

    for (slug, pinned_pid), g in groups.items():
        stats["total_qty"] += g["qty"]
        stats["unique"] += 1
        card = lib.cards.get(slug)

        if card is None:
            status = "missing"
            stats["missing"] += 1
            printings = []
            selected = None
        else:
            printings = [
                {**p.to_dict(), "id": pid, "exists": lib.file_path(slug, pid).exists()}
                for pid, p in card.printings.items()
            ]
            if pinned_pid and pinned_pid in card.printings:
                selected = pinned_pid
                status = "ok"
                stats["ok"] += 1
            elif len(card.printings) <= 1:
                selected = card.default
                status = "ok"
                stats["ok"] += 1
            else:
                selected = card.default
                status = "pick"
                stats["pick"] += 1

        rows.append({
            "qty": g["qty"],
            "name": g["name"],
            "slug": slug,
            "status": status,
            "printings": printings,
            "selected": selected,
        })

    return jsonify({"rows": rows, "stats": stats})


@app.route("/api/build", methods=["POST"])
def api_build():
    """Kick off a build job (currently only MPC PNG bundle)."""
    body = request.json or {}
    rows = body.get("rows", [])
    fmt = body.get("format", "png")

    if not rows:
        return jsonify({"error": "no rows"}), 400
    if fmt not in ("png", "xml", "pdf"):
        return jsonify({"error": "invalid format"}), 400
    if fmt != "png":
        return jsonify({"error": f"Format '{fmt}' is not yet implemented."}), 400

    from datetime import datetime as _dt

    def run(job):
        lib = get_lib()
        ts = _dt.now().strftime("%Y%m%d_%H%M%S")
        out_dir = lib.root / "exports" / ts
        out_dir.mkdir(parents=True, exist_ok=True)

        from build_mpc import build_png_bundle
        zip_path = build_png_bundle(lib, rows, out_dir, job)
        return {
            "zip_path": str(zip_path),
            "download_url": f"/api/build-download/{job.id}",
        }

    job = jobs.submit(f"Build MPC PNG ({len(rows)} cards)", run)
    return jsonify(job.to_dict())


@app.route("/api/build-download/<jid>")
def api_build_download(jid: str):
    """Serve the zip produced by a completed build job."""
    j = jobs.get(jid)
    if not j or j.state != "done":
        abort(404)
    zip_path_str = (j.result or {}).get("zip_path")
    if not zip_path_str:
        abort(404)
    zip_path = Path(zip_path_str)
    if not zip_path.exists():
        abort(404)
    return send_file(zip_path, as_attachment=True, download_name=zip_path.name)


# ---------- entry point ----------

def main():
    global LIB_ROOT_OVERRIDE
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=5000)
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--lib", type=Path, default=None)
    ap.add_argument("--debug", action="store_true")
    args = ap.parse_args()

    LIB_ROOT_OVERRIDE = args.lib
    lib = get_lib()
    print(f"Library root: {lib.root}")
    print(f"Cards in library: {len(lib.cards)}")
    print(f"Server: http://{args.host}:{args.port}/")
    app.run(host=args.host, port=args.port, debug=args.debug,
            use_reloader=args.debug)


if __name__ == "__main__":
    main()
