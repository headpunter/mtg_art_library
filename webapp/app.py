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
