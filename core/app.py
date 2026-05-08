"""
core/app.py — always-on shared services for the MTG platform.

Provides:
  GET /api/scryfall/cards/{name}    card metadata (cached)
  GET /api/scryfall/sets            all sets (cached)
  GET /api/normalize                slug + printing_id normalization
  GET /api/modules                  which module containers are reachable
  GET /health                       liveness probe
"""
from __future__ import annotations

import os
import re
import time
import unicodedata
from functools import lru_cache

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Scryfall proxy
# ---------------------------------------------------------------------------

_SF_API = "https://api.scryfall.com"
_SF_HEADERS = {
    "User-Agent": "MTG-Platform-Core/1.0",
    "Accept": "application/json;q=0.9,*/*;q=0.8",
}
_RATE_LIMIT_S = 0.2  # 5 req/sec — Scryfall's published polite limit


def _sf_get(path: str, params: dict | None = None) -> dict:
    r = requests.get(f"{_SF_API}{path}", headers=_SF_HEADERS, params=params, timeout=30)
    r.raise_for_status()
    time.sleep(_RATE_LIMIT_S)
    return r.json()


@app.route("/api/scryfall/cards/<path:name>")
def scryfall_card(name: str):
    """Look up a card by name, or by set/collector-number (name = '<set>/<num>')."""
    set_code = request.args.get("set")
    num = request.args.get("num")
    try:
        if "/" in name and not set_code:
            parts = name.split("/", 1)
            data = _sf_get(f"/cards/{parts[0].lower()}/{parts[1]}")
        elif set_code and num:
            data = _sf_get(f"/cards/{set_code.lower()}/{num}")
        else:
            params = {"fuzzy": name}
            if set_code:
                params["set"] = set_code.lower()
            data = _sf_get("/cards/named", params=params)
    except requests.HTTPError as e:
        return jsonify({"error": str(e)}), e.response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify(data)


@lru_cache(maxsize=1)
def _fetch_sets_cached() -> list:
    """Fetches all Scryfall sets — cached for the process lifetime."""
    data = _sf_get("/sets")
    return data.get("data", [])


@app.route("/api/scryfall/sets")
def scryfall_sets():
    try:
        return jsonify(_fetch_sets_cached())
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@app.route("/api/scryfall/search")
def scryfall_search():
    q = request.args.get("q", "")
    page = request.args.get("page", "1")
    if not q:
        return jsonify({"error": "q required"}), 400
    try:
        data = _sf_get("/cards/search", params={"q": q, "page": page})
    except requests.HTTPError as e:
        return jsonify({"error": str(e)}), e.response.status_code
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify(data)


@app.route("/api/scryfall/autocomplete")
def scryfall_autocomplete():
    q = request.args.get("q", "")
    if not q:
        return jsonify({"error": "q required"}), 400
    try:
        data = _sf_get("/cards/autocomplete", params={"q": q})
    except Exception as e:
        return jsonify({"error": str(e)}), 502
    return jsonify(data)


# ---------------------------------------------------------------------------
# Card name / printing-id normalisation
# ---------------------------------------------------------------------------

def normalize_name(name: str) -> str:
    """'Urza\'s Saga' → 'urzas_saga'"""
    nfkd = unicodedata.normalize("NFKD", name)
    ascii_only = nfkd.encode("ascii", "ignore").decode()
    lower = ascii_only.lower()
    slug = re.sub(r"[^a-z0-9]+", "_", lower).strip("_")
    return slug


def normalize_printing_id(source: str, scryfall_id: str | None = None,
                           set_code: str | None = None,
                           num: str | None = None,
                           tag: str | None = None) -> str:
    """Build a deterministic printing_id from available identifiers."""
    if source == "scryfall" and scryfall_id:
        return scryfall_id[:8]
    if source == "scryfall" and set_code and num:
        return f"{set_code.lower()}_{num}"
    if tag:
        return re.sub(r"[^a-z0-9_-]", "", tag.lower())
    return source


@app.route("/api/normalize")
def normalize():
    name = request.args.get("name", "")
    if not name:
        return jsonify({"error": "name required"}), 400
    return jsonify({
        "name": name,
        "slug": normalize_name(name),
    })


# ---------------------------------------------------------------------------
# Module health check
# ---------------------------------------------------------------------------

_MODULE_URLS = {
    "art_library": os.environ.get("ART_LIBRARY_URL", "http://art_library:5001/health"),
    "deck_primer": os.environ.get("DECK_PRIMER_URL", "http://deck_primer:5002/health"),
    "collection_rec": os.environ.get("COLLECTION_REC_URL", "http://collection_rec:5003/health"),
    "deck_builder": os.environ.get("DECK_BUILDER_URL", "http://deck_builder:5004/health"),
}


def _is_reachable(url: str) -> bool:
    try:
        r = requests.get(url, timeout=2)
        return r.status_code < 500
    except Exception:
        return False


@app.route("/api/modules")
def modules():
    status = {name: _is_reachable(url) for name, url in _MODULE_URLS.items()}
    return jsonify(status)


# ---------------------------------------------------------------------------
# Liveness probe
# ---------------------------------------------------------------------------

@app.route("/health")
def health():
    return "ok", 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
