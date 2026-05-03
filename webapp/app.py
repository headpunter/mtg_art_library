"""
app.py — Flask web UI for the MTG art library.

Run:
    python app.py [--port 5000] [--lib /path/to/library/root]

Then open http://localhost:5000 in your browser.

This file currently implements the Library view (Half 1). Build view comes next.
"""
from __future__ import annotations

import argparse
import io
import sys
from io import BytesIO

# On Windows the default stdout/stderr encoding is cp1252 which cannot encode
# many Unicode characters that appear in MTG card text (e.g. → in oracle text).
# Reconfigure both streams to UTF-8 so print() and traceback.print_exc() work.
for _s in (sys.stdout, sys.stderr):
    if hasattr(_s, "reconfigure"):
        try:
            _s.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
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
    all_styles = sorted({s for p in card.printings.values() for s in p.styles})
    return {
        "slug": slug,
        "name": card.name,
        "default": default,
        "default_thumb": default_path,
        "printings_count": len(card.printings),
        "styles": all_styles,
    }


# ---------- pages ----------

@app.route("/")
def home():
    return redirect(url_for("library_view"))


@app.route("/library")
def library_view():
    from collections import Counter
    lib = get_lib()
    cards = sorted(
        [card_summary(slug, c) for slug, c in lib.cards.items()],
        key=lambda x: x["name"].lower(),
    )
    # Count distinct cards per style for sidebar display
    style_card_counts: dict[str, int] = Counter(
        s
        for c in lib.cards.values()
        for p in c.printings.values()
        for s in p.styles
    )
    all_styles = sorted(style_card_counts.items())   # [(style, count), ...]
    return render_template(
        "library.html",
        cards=cards,
        total_printings=sum(len(c.printings) for c in lib.cards.values()),
        canonical_dpi=lib.canonical_dpi,
        canonical_w=lib.canonical_size[0],
        canonical_h=lib.canonical_size[1],
        all_styles=all_styles,
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


@app.route("/api/scryfall/token-printings")
def api_scryfall_token_printings():
    """Return all Scryfall printings of a named token card."""
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400
    try:
        import requests
        r = requests.get("https://api.scryfall.com/cards/search",
                         params={"q": f'!"{name}" t:token', "unique": "prints",
                                 "order": "released"},
                         headers={"User-Agent": "MTG-Art-Library/1.0"},
                         timeout=15)
        r.raise_for_status()
        data = r.json().get("data", [])
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    out = []
    for c in data:
        out.append({
            "id": c.get("id"),
            "name": c.get("name"),
            "set": c.get("set"),
            "set_name": c.get("set_name"),
            "collector_number": c.get("collector_number"),
            "released_at": c.get("released_at"),
            "image_normal": (c.get("image_uris") or {}).get("normal")
                or (c.get("card_faces", [{}])[0].get("image_uris", {}) or {}).get("normal"),
        })

    return jsonify({"printings": out, "total": len(out)})


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


# ---------- settings ----------

_sources_cache: list | None = None
_sources_cache_ts: float = 0.0
_SOURCES_TTL = 3600.0  # re-fetch once per hour


@app.route("/settings")
def settings_view():
    return render_template("settings.html")


@app.route("/api/settings", methods=["GET"])
def api_get_settings():
    lib = get_lib()
    return jsonify({
        "preferred_sources": lib.preferred_sources,
        "autofill_url": lib.autofill_url,
    })


@app.route("/api/settings", methods=["POST"])
def api_post_settings():
    lib = get_lib()
    body = request.json or {}
    if "preferred_sources" in body:
        ps = body["preferred_sources"]
        if not isinstance(ps, list):
            return jsonify({"error": "preferred_sources must be a list"}), 400
        lib.preferred_sources = [str(s).strip() for s in ps if str(s).strip()]
    if "autofill_url" in body:
        lib.autofill_url = str(body["autofill_url"]).strip().rstrip("/")
    lib.save()
    return jsonify({"ok": True, "preferred_sources": lib.preferred_sources,
                    "autofill_url": lib.autofill_url})


@app.route("/api/mpcautofill/search")
def api_mpcautofill_search():
    """
    Search MPC AutoFill for a single card name.
    Results are ranked: preferred sources first (in order), then by API priority.
    Each result includes preferredRank (0-based index, or null) so the UI can
    badge preferred sources without needing to re-fetch settings separately.
    """
    name = request.args.get("name", "").strip()
    if not name:
        return jsonify({"error": "name required"}), 400

    lib = get_lib()
    if not lib.autofill_url:
        return jsonify({"unconfigured": True, "results": []})

    preferred = lib.preferred_sources
    pref_index = {s.lower(): i for i, s in enumerate(preferred)}

    try:
        from mpcautofill import search_cards
        results = search_cards([name], preferred_sources=preferred or None,
                               base_url=lib.autofill_url)
        cards = results.get(name, [])
    except Exception as exc:
        return jsonify({"error": str(exc)}), 502

    out = []
    for c in cards:
        src_lower = (c.get("source") or "").lower()
        out.append({
            "identifier":    c.get("identifier"),
            "name":          c.get("name"),
            "source":        c.get("source"),
            "sourceName":    c.get("sourceName") or c.get("source"),
            "sourceType":    c.get("sourceType"),
            "dpi":           c.get("dpi"),
            "extension":     (c.get("extension") or "jpg").lstrip("."),
            "thumbnailUrl":  c.get("mediumThumbnailUrl") or c.get("smallThumbnailUrl"),
            "preferredRank": pref_index.get(src_lower),   # None = not preferred
        })

    return jsonify({"results": out, "total": len(out)})


@app.route("/api/ingest/mpcautofill-card", methods=["POST"])
def api_ingest_mpcautofill_card():
    """Ingest a specific card art from MPC AutoFill by Google Drive file ID."""
    body = request.json or {}
    name       = body.get("name")
    identifier = body.get("identifier")
    extension  = (body.get("extension") or "jpg").lstrip(".")
    source     = body.get("source") or "unknown"
    make_default = bool(body.get("make_default", True))

    if not name or not identifier:
        return jsonify({"error": "name and identifier required"}), 400

    def run(job):
        from download_drive import download_drive_file
        from add_card import ingest_file

        lib = get_lib()
        staging = lib.root / ".upload_staging"
        staging.mkdir(exist_ok=True)

        tmp = staging / f"mpcautofill_{identifier}.{extension}"

        job.update(f"Downloading {name}…")
        download_drive_file(identifier, tmp)

        job.update(f"Processing {name}…")
        slug, pid = ingest_file(
            lib, tmp, name,
            tag=f"mpcautofill_{source}",
            make_default=make_default,
        )
        lib.save()

        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass

        return {"slug": slug, "printing_id": pid}

    job = jobs.submit(f"Adding {name} (MPC AutoFill · {source})", run)
    return jsonify(job.to_dict())


@app.route("/api/mpcautofill/sources")
def api_mpcautofill_sources():
    """Return available MPC AutoFill sources (cached 1 h)."""
    import time
    global _sources_cache, _sources_cache_ts
    lib = get_lib()
    if not lib.autofill_url:
        return jsonify({"sources": [], "error": "MPC AutoFill backend not configured"})
    if _sources_cache is None or time.time() - _sources_cache_ts > _SOURCES_TTL:
        try:
            from mpcautofill import get_sources
            raw = get_sources(base_url=lib.autofill_url)
            _sources_cache = sorted(
                [
                    {
                        "key":         v.get("key", k),
                        "name":        v.get("name", k),
                        "description": v.get("description", ""),
                    }
                    for k, v in raw.items()
                ],
                key=lambda x: x["name"].lower(),
            )
            _sources_cache_ts = time.time()
        except Exception as exc:
            return jsonify({"error": str(exc)}), 502
    return jsonify({"sources": _sources_cache})


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
        normalize_name=normalize_name,
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


@app.route("/api/card/<slug>/printing/<pid>/styles", methods=["POST"])
def api_update_styles(slug: str, pid: str):
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card or pid not in card.printings:
        abort(404)
    raw = (request.json or {}).get("styles", [])
    # Normalise: lowercase, strip, deduplicate, drop empties
    styles = list(dict.fromkeys(
        s.strip().lower() for s in raw if isinstance(s, str) and s.strip()
    ))
    card.printings[pid].styles = styles
    lib.save()
    return jsonify({"ok": True, "styles": styles})


@app.route("/api/card/<slug>/refresh-metadata", methods=["POST"])
def api_refresh_card_metadata(slug: str):
    """
    Re-fetch Scryfall metadata for a card and update related_tokens (and any
    other metadata fields) without re-downloading or re-processing the image.
    Works on the first Scryfall-sourced printing found on the card.
    """
    lib = get_lib()
    card = lib.cards.get(slug)
    if not card:
        abort(404)

    # Find a Scryfall printing to use as the source of truth
    scryfall_printing = next(
        (p for p in card.printings.values() if p.source == "scryfall" and p.set and p.collector_number),
        None,
    )
    if not scryfall_printing:
        return jsonify({"error": "No Scryfall-sourced printing found on this card"}), 400

    def run(job):
        import scryfall as sf
        lib2 = get_lib()
        c = lib2.cards[slug]
        job.update("Fetching metadata from Scryfall…")
        card_json = sf.fetch_card(
            c.name,
            set_code=scryfall_printing.set,
            num=scryfall_printing.collector_number,
        )
        tokens = sf.related_token_names(card_json)
        c.related_tokens = tokens
        lib2.save()
        return {"related_tokens": tokens}

    job = jobs.submit(f"Refresh metadata: {card.name}", run)
    return jsonify(job.to_dict())


@app.route("/api/library/refresh-metadata", methods=["POST"])
def api_refresh_all_metadata():
    """Bulk-refresh Scryfall metadata for all cards that have a Scryfall printing."""
    lib = get_lib()
    targets = [
        (slug, card)
        for slug, card in lib.cards.items()
        if any(p.source == "scryfall" and p.set and p.collector_number
               for p in card.printings.values())
    ]

    def run(job):
        import scryfall as sf
        lib2 = get_lib()
        total = len(targets)
        updated, failed = 0, 0

        for i, (slug, _) in enumerate(targets, 1):
            card = lib2.cards.get(slug)
            if not card:
                continue
            p = next(
                (pr for pr in card.printings.values()
                 if pr.source == "scryfall" and pr.set and pr.collector_number),
                None,
            )
            if not p:
                continue
            job.update(f"[{i}/{total}] {card.name}…")
            try:
                card_json = sf.fetch_card(card.name, set_code=p.set, num=p.collector_number)
                card.related_tokens = sf.related_token_names(card_json)
                updated += 1
            except Exception as exc:
                failed += 1
                job.update(f"[{i}/{total}] {card.name} — failed: {exc}")

        lib2.save()
        return {"updated": updated, "failed": failed, "total": total}

    job = jobs.submit(f"Refresh metadata for {len(targets)} cards", run)
    return jsonify(job.to_dict())


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


@app.route("/api/ingest/mpcautofill-bulk", methods=["POST"])
def api_ingest_mpcautofill_bulk():
    """
    Batch-ingest card art from MPC AutoFill for a list of card names.

    Body: { "names": [...], "make_default": true, "preferred_sources": [...] }

    preferred_sources is an ordered list of MPC AutoFill source keys
    (e.g. ["Chilli_Axe", "NoobToob"]) that are sorted to the front when
    multiple art options exist for a card.  Pass [] or omit for default ranking.
    """
    body = request.json or {}
    names: list[str] = body.get("names", [])
    make_default: bool = bool(body.get("make_default", True))
    preferred: list[str] = body.get("preferred_sources", [])

    if not names:
        return jsonify({"error": "no names provided"}), 400
    if len(names) > 500:
        return jsonify({"error": "too many names (max 500)"}), 400

    def run(job):
        from mpcautofill import search_cards, best_drive_card
        from download_drive import download_drive_file
        from add_card import ingest_file

        lib = get_lib()
        staging = lib.root / ".upload_staging"
        staging.mkdir(exist_ok=True)

        total = len(names)
        ok, missing, failed = [], [], []

        job.update(f"Querying MPC AutoFill for {total} card{'s' if total != 1 else ''}…")
        effective_preferred = preferred or lib.preferred_sources or None
        try:
            results = search_cards(names, preferred_sources=effective_preferred)
        except Exception as exc:
            raise RuntimeError(f"MPC AutoFill API error: {exc}") from exc

        for i, name in enumerate(names, 1):
            cards = results.get(name, [])
            card = best_drive_card(cards)

            if not card:
                missing.append(name)
                job.update(f"[{i}/{total}] {name} — no Drive art found")
                continue

            file_id = card["identifier"]
            ext = (card.get("extension") or "jpg").lstrip(".")
            tmp = staging / f"mpcautofill_{file_id}.{ext}"

            try:
                job.update(f"[{i}/{total}] Downloading {name}…")
                download_drive_file(file_id, tmp)

                job.update(f"[{i}/{total}] Processing {name}…")
                lib2 = get_lib()
                tag = f"mpcautofill_{card.get('source', 'unknown')}"
                slug, pid = ingest_file(
                    lib2, tmp, name,
                    tag=tag,
                    make_default=make_default,
                )
                lib2.save()
                ok.append({"name": name, "slug": slug, "pid": pid})
            except Exception as exc:
                failed.append({"name": name, "error": str(exc)})
                job.update(f"[{i}/{total}] {name} — failed: {exc}")
            finally:
                try:
                    tmp.unlink(missing_ok=True)
                except OSError:
                    pass

        summary = f"Done — {len(ok)} added"
        if missing:
            summary += f", {len(missing)} not found"
        if failed:
            summary += f", {len(failed)} failed"
        job.update(summary)
        return {"ok": ok, "missing": missing, "failed": failed}

    job = jobs.submit(f"MPC AutoFill bulk ingest ({len(names)} cards)", run)
    return jsonify(job.to_dict())


@app.route("/api/ingest/scryfall-pinned", methods=["POST"])
def api_ingest_scryfall_pinned():
    """
    Batch-ingest a list of cards from Scryfall using explicit set+collector number.

    Body: { "entries": [{"name": "Sol Ring", "set": "cmm", "num": "366"}, ...] }

    Only entries with both set and num are meaningful — the caller should
    filter those before sending.
    """
    body = request.json or {}
    entries: list[dict] = body.get("entries", [])
    if not entries:
        return jsonify({"error": "no entries provided"}), 400
    if len(entries) > 500:
        return jsonify({"error": "too many entries (max 500)"}), 400

    def run(job):
        lib = get_lib()
        total = len(entries)
        ok, failed = [], []

        for i, e in enumerate(entries, 1):
            name = e.get("name", "")
            set_code = e.get("set")
            num = e.get("num")
            job.update(f"[{i}/{total}] {name} ({set_code} {num})…")
            try:
                slug, pid = ingest_scryfall(
                    lib, name, set_code, num, make_default=True,
                )
                lib.save()
                ok.append({"name": name, "slug": slug, "printing_id": pid})
            except Exception as exc:
                failed.append({"name": name, "error": str(exc)})

        summary = f"Done — {len(ok)} added"
        if failed:
            summary += f", {len(failed)} failed"
        job.update(summary)
        return {"ok": ok, "failed": failed}

    job = jobs.submit(f"Auto-fetch {len(entries)} pinned printings", run)
    return jsonify(job.to_dict())


@app.route("/api/import-mpcfill-xml", methods=["POST"])
def api_import_mpcfill_xml():
    """Parse an MPCFill XML order and return a standard decklist string."""
    import xml.etree.ElementTree as _ET

    xml_text = request.get_data(as_text=True)
    if not xml_text.strip():
        return jsonify({"error": "no XML provided"}), 400

    try:
        from import_mpcfill import parse_mpcfill_xml, entries_to_decklist
        entries, tokens_skipped, _cb = parse_mpcfill_xml(xml_text)
        return jsonify({
            "decklist": entries_to_decklist(entries),
            "unique": len(entries),
            "total_qty": sum(e.qty for e in entries),
            "tokens_skipped": tokens_skipped,
            "entries": [
                {
                    "qty": e.qty,
                    "name": e.name,
                    "set_code": e.set_code,
                    "collector_num": e.collector_num,
                }
                for e in entries
            ],
        })
    except _ET.ParseError as exc:
        return jsonify({"error": f"Invalid XML: {exc}"}), 400
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/ingest/mpcfill-xml-art", methods=["POST"])
def api_ingest_mpcfill_xml_art():
    """Download and ingest card art for every entry in an MPCFill XML that has a Drive ID."""
    import xml.etree.ElementTree as _ET

    xml_text = request.get_data(as_text=True)
    if not xml_text.strip():
        return jsonify({"error": "no XML provided"}), 400

    try:
        from import_mpcfill import parse_mpcfill_xml
        entries, _, _cb = parse_mpcfill_xml(xml_text, skip_tokens=True)
    except _ET.ParseError as exc:
        return jsonify({"error": f"Invalid XML: {exc}"}), 400

    # Only entries that have a Google Drive file ID
    downloadable = [e for e in entries if e.drive_id]
    skipped_no_id = len(entries) - len(downloadable)

    if not downloadable:
        return jsonify({"error": "No Google Drive file IDs found in XML"}), 400

    def run(job):
        from download_drive import download_drive_file
        from add_card import ingest_file
        from library import Printing
        from library import normalize_printing_id

        lib = get_lib()
        staging = lib.root / ".upload_staging"
        staging.mkdir(exist_ok=True)

        ok, failed = [], []
        total = len(downloadable)

        for i, e in enumerate(downloadable, 1):
            job.update(f"[{i}/{total}] {e.name}…")
            tmp = staging / f"xmlart_{e.drive_id}.jpg"
            try:
                download_drive_file(e.drive_id, tmp)
                slug, pid = ingest_file(
                    lib, tmp, e.name,
                    tag="mpcfill_xml",
                    make_default=True,
                )
                # If this entry has a back face, download and save it
                if e.back_drive_id and e.back_name:
                    tmp_back = staging / f"xmlart_{e.back_drive_id}.jpg"
                    try:
                        download_drive_file(e.back_drive_id, tmp_back)
                        back_img_path = lib.back_file_path(slug, pid)
                        from PIL import Image
                        from bleed import apply_bleed
                        img = Image.open(tmp_back).convert("RGBA")
                        finished = apply_bleed(img, lib.canonical_dpi, lib.default_bleed)
                        back_img_path.parent.mkdir(parents=True, exist_ok=True)
                        finished.save(back_img_path, "PNG",
                                      dpi=(lib.canonical_dpi, lib.canonical_dpi))
                        # Update printing with DFC info
                        card = lib.cards.get(slug)
                        if card and pid in card.printings:
                            card.printings[pid].is_dfc = True
                            card.printings[pid].back_name = e.back_name
                    finally:
                        try:
                            tmp_back.unlink(missing_ok=True)
                        except OSError:
                            pass
                lib.save()
                ok.append({"name": e.name, "slug": slug, "printing_id": pid,
                           "dfc": bool(e.back_drive_id)})
            except Exception as exc:
                failed.append({"name": e.name, "error": str(exc)})
            finally:
                try:
                    tmp.unlink(missing_ok=True)
                except OSError:
                    pass

        return {
            "ok": ok,
            "failed": failed,
            "skipped_no_id": skipped_no_id,
        }

    job = jobs.submit(f"Ingest art from XML ({len(downloadable)} cards)", run)
    return jsonify({**job.to_dict(), "total": len(downloadable), "skipped_no_id": skipped_no_id})


@app.route("/api/build/pdf-layouts")
def api_pdf_layouts():
    """Return available PDF layout options."""
    from build_pdf import LAYOUTS
    return jsonify({
        "layouts": [{"key": k, "name": v.name} for k, v in LAYOUTS.items()],
        "default": "letter_9up",
    })


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
            "set_code": g["set_code"],
            "collector_num": g["collector_num"],
            "status": status,
            "printings": printings,
            "selected": selected,
        })

    # Collect tokens needed: aggregate from all non-missing cards in library
    # but exclude any token the user already listed in the decklist itself.
    decklist_slugs = {row["slug"] for row in rows}

    tokens_map: dict[str, list[str]] = {}   # token_name -> [producer names]
    for row in rows:
        if row["status"] == "missing":
            continue
        card = lib.cards.get(row["slug"])
        if not card:
            continue
        for tok in card.related_tokens:
            tok_slug = normalize_name(tok)
            if tok_slug in decklist_slugs:
                continue  # already in the decklist, don't flag it
            tokens_map.setdefault(tok, []).append(row["name"])

    tokens_needed = [
        {
            "name": tok,
            "slug": normalize_name(tok),
            "produced_by": producers,
            "in_library": normalize_name(tok) in lib.cards,
        }
        for tok, producers in sorted(tokens_map.items())
    ]

    return jsonify({"rows": rows, "stats": stats, "tokens_needed": tokens_needed})


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
    if fmt not in ("png", "xml", "pdf"):
        return jsonify({"error": "invalid format"}), 400

    from datetime import datetime as _dt

    def run(job):
        lib = get_lib()
        ts = _dt.now().strftime("%Y%m%d_%H%M%S")

        if fmt == "xml":
            from build_autofill_xml import build_autofill_xml
            out_path = lib.root / "exports" / f"{ts}_autofill.xml"
            cardback_key = body.get("cardback_key") or None
            result_path = build_autofill_xml(lib, rows, out_path,
                                             cardback_key=cardback_key, job=job)
            label = "autofill.xml"
        elif fmt == "pdf":
            from build_pdf import build_pdf
            layout_key = body.get("layout", "letter_9up")
            out_path = lib.root / "exports" / f"{ts}_{layout_key}.pdf"
            result_path = build_pdf(lib, rows, out_path, layout_key=layout_key, job=job)
            label = result_path.name
        else:
            out_dir = lib.root / "exports" / ts
            out_dir.mkdir(parents=True, exist_ok=True)
            from build_mpc import build_png_bundle
            result_path = build_png_bundle(lib, rows, out_dir, job)
            label = result_path.name

        mime = (
            "application/xml" if fmt == "xml"
            else "application/pdf" if fmt == "pdf"
            else "application/zip"
        )
        return {
            "file_path": str(result_path),
            "download_url": f"/api/build-download/{job.id}",
            "filename": label,
            "mime": mime,
        }

    _fmt_labels = {"png": "MPC PNG", "xml": "AutoFill XML", "pdf": "9-up PDF"}
    job = jobs.submit(f"Build {_fmt_labels.get(fmt, fmt)} ({len(rows)} cards)", run)
    return jsonify(job.to_dict())


@app.route("/api/build-download/<jid>")
def api_build_download(jid: str):
    """Serve the zip produced by a completed build job."""
    j = jobs.get(jid)
    if not j or j.state != "done":
        abort(404)
    result = j.result or {}
    # support both old key ("zip_path") and new key ("file_path")
    file_path_str = result.get("file_path") or result.get("zip_path")
    if not file_path_str:
        abort(404)
    file_path = Path(file_path_str)
    if not file_path.exists():
        abort(404)
    dl_name = result.get("filename") or file_path.name
    mime = result.get("mime") or (
        "application/xml"  if file_path.suffix == ".xml"  else
        "application/pdf"  if file_path.suffix == ".pdf"  else
        "application/zip"
    )
    return send_file(file_path, as_attachment=True, download_name=dl_name, mimetype=mime)


# ---------- cardbacks ----------

@app.route("/api/cardbacks")
def api_cardbacks_list():
    lib = get_lib()
    result = []
    for key, cb in lib.cardbacks.items():
        result.append({
            "key": key,
            "name": cb.name,
            "source": cb.source,
            "is_default": key == lib.default_cardback,
            "thumb_url": f"/thumb/cardbacks/{key}",
        })
    return jsonify({"cardbacks": result, "default": lib.default_cardback})


@app.route("/api/cardbacks", methods=["POST"])
def api_cardbacks_add():
    """Add a cardback from an uploaded file."""
    from library import Cardback, normalize_name
    from datetime import datetime as _dt

    if "file" not in request.files:
        return jsonify({"error": "no file"}), 400
    f = request.files["file"]
    name = request.form.get("name", "").strip() or Path(f.filename).stem
    make_default = request.form.get("default", "").lower() in ("1", "true", "yes")

    key = normalize_name(name)
    lib = get_lib()
    staging = lib.root / ".upload_staging"
    staging.mkdir(exist_ok=True)
    tmp = staging / f"cb_{key}_{f.filename}"
    f.save(tmp)

    try:
        from PIL import Image
        img = Image.open(tmp).convert("RGB")
        out = lib.cardback_file_path(key)
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out, "PNG", dpi=(lib.canonical_dpi, lib.canonical_dpi))
    finally:
        try:
            tmp.unlink(missing_ok=True)
        except OSError:
            pass

    cb = Cardback(
        name=name,
        source="file",
        added=_dt.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    lib.cardbacks[key] = cb
    if make_default or not lib.default_cardback:
        lib.default_cardback = key
    lib.save()
    return jsonify({"key": key, "name": name, "is_default": lib.default_cardback == key})


@app.route("/api/cardbacks/<key>", methods=["DELETE"])
def api_cardbacks_delete(key: str):
    lib = get_lib()
    if key not in lib.cardbacks:
        return jsonify({"error": "not found"}), 404
    lib.cardbacks.pop(key)
    if lib.default_cardback == key:
        lib.default_cardback = next(iter(lib.cardbacks), None)
    img = lib.cardback_file_path(key)
    try:
        img.unlink(missing_ok=True)
    except OSError:
        pass
    lib.save()
    return jsonify({"ok": True})


@app.route("/api/cardbacks/<key>/set-default", methods=["POST"])
def api_cardbacks_set_default(key: str):
    lib = get_lib()
    if key not in lib.cardbacks:
        return jsonify({"error": "not found"}), 404
    lib.default_cardback = key
    lib.save()
    return jsonify({"ok": True, "default": key})


@app.route("/cardbacks")
def page_cardbacks():
    return render_template("cardbacks.html")


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
