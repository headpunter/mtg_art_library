"""
mpcautofill.py — query the MPC AutoFill API for card art.

Flow:
  1. POST /2/editorSearch/  — batch name lookup → list of card identifiers per name
  2. POST /2/cards/         — resolve identifiers to full card objects
  3. Caller picks the best result per name (sort by priority, apply preferences)

Preferred sources
-----------------
Pass a list of source key strings (the `source` field in card objects, e.g.
"Chilli_Axe", "NoobToob") as `preferred_sources`. Cards whose source matches
any entry are sorted to the front, in the order they appear in the list.
This is the hook for "highlight artists I prefer" — wire it up in the future
by reading a user-configured list from library config or a preferences file.
"""
from __future__ import annotations

import time
from typing import Any

import requests

BASE = "https://mpcautofill.com"

_DEFAULT_FILTER: dict[str, Any] = {
    "filterSettings": {
        "minimumDPI": 300,
        "maximumDPI": 10_000,
        "minimumSize": 0,
        "maximumSize": 10_000_000_000,
        "includesTags": [],
        "excludesTags": [],
        "languages": [],
    },
    "searchTypeSettings": {
        "fuzzySearch": True,
        "filterCardbacks": False,
    },
    "sourceSettings": {
        "sources": [],       # empty = all sources enabled
    },
}

_HEADERS = {"User-Agent": "MTG-Art-Library/1.0"}


def search_cards(
    names: list[str],
    preferred_sources: list[str] | None = None,
    search_settings: dict | None = None,
    timeout: int = 30,
    between_requests: float = 0.5,
) -> dict[str, list[dict]]:
    """
    Look up a list of card names on MPC AutoFill.

    Returns a dict mapping each input name to a ranked list of card objects
    (best first). Cards from preferred_sources are sorted to the top.

    Each card object contains at minimum:
        identifier    — Google Drive file ID (for sourceType "Google Drive")
        name          — card name
        source        — source key  (e.g. "Chilli_Axe")
        sourceName    — human-readable source name
        sourceType    — "Google Drive" | "AWS S3" | "Local File"
        dpi           — int
        priority      — int (higher = better)
        extension     — "jpg" | "png" etc.
        smallThumbnailUrl / mediumThumbnailUrl
    """
    settings = search_settings or _DEFAULT_FILTER
    queries = [{"query": n, "cardType": "CARD"} for n in names]

    # ── step 1: get identifiers ──────────────────────────────────────────
    r1 = requests.post(
        f"{BASE}/2/editorSearch/",
        json={"queries": queries, "searchSettings": settings},
        headers=_HEADERS,
        timeout=timeout,
    )
    r1.raise_for_status()
    id_map: dict[str, dict] = r1.json().get("results", {})
    # id_map: { "Sol Ring": { "CARD": ["id1","id2",...], ... }, ... }

    all_ids: list[str] = list(dict.fromkeys(
        ident
        for name_results in id_map.values()
        for ident in name_results.get("CARD", [])
    ))

    if not all_ids:
        return {n: [] for n in names}

    time.sleep(between_requests)

    # ── step 2: fetch full card objects ──────────────────────────────────
    r2 = requests.post(
        f"{BASE}/2/cards/",
        json={"cardIdentifiers": all_ids},
        headers=_HEADERS,
        timeout=timeout,
    )
    r2.raise_for_status()
    cards_by_id: dict[str, dict] = r2.json().get("results", {})

    # ── step 3: map back to input names, rank ────────────────────────────
    out: dict[str, list[dict]] = {}
    for name in names:
        ids = _find_ids(id_map, name)
        cards = [cards_by_id[i] for i in ids if i in cards_by_id]
        out[name] = _rank(cards, preferred_sources)

    return out


def get_sources(timeout: int = 15) -> dict[str, dict]:
    """Return all available sources keyed by their string key."""
    r = requests.get(f"{BASE}/2/sources/", headers=_HEADERS, timeout=timeout)
    r.raise_for_status()
    raw = r.json().get("results", {})
    # Normalise: the API may return { "1": {...}, "2": {...} } (pk-keyed)
    return {v.get("key", k): v for k, v in raw.items()}


# ── helpers ──────────────────────────────────────────────────────────────────

def _find_ids(id_map: dict, name: str) -> list[str]:
    """Case-insensitive lookup in the editorSearch result map."""
    name_lower = name.lower()
    for key, results in id_map.items():
        if key.lower() == name_lower:
            return results.get("CARD", [])
    return []


def _rank(cards: list[dict], preferred: list[str] | None) -> list[dict]:
    """Sort by preferred sources first, then by API priority descending."""
    if not preferred:
        return sorted(cards, key=lambda c: -c.get("priority", 0))

    pref_set = {s.lower() for s in preferred}
    pref_order = {s.lower(): i for i, s in enumerate(preferred)}

    def key(c: dict):
        src = (c.get("source") or "").lower()
        if src in pref_set:
            return (0, pref_order[src], -c.get("priority", 0))
        return (1, 0, -c.get("priority", 0))

    return sorted(cards, key=key)


def best_drive_card(cards: list[dict]) -> dict | None:
    """Return the highest-ranked Google Drive card, or None."""
    return next((c for c in cards if c.get("sourceType") == "Google Drive"), None)
