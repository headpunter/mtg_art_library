"""scryfall.py — minimal Scryfall API wrapper for fetching card art."""
from __future__ import annotations

import time
from io import BytesIO

import requests
from PIL import Image

API = "https://api.scryfall.com"
HEADERS = {
    "User-Agent": "MTG-Art-Library/1.0",
    "Accept": "application/json;q=0.9,*/*;q=0.8",
}
RATE_LIMIT_S = 0.2  # 5 req/sec, polite


def _get(url: str, params: dict | None = None) -> dict:
    r = requests.get(url, headers=HEADERS, params=params, timeout=30)
    r.raise_for_status()
    time.sleep(RATE_LIMIT_S)
    return r.json()


def fetch_card(name: str, set_code: str | None = None,
               num: str | None = None) -> dict:
    """Look up a card on Scryfall. Returns card JSON."""
    if set_code and num:
        return _get(f"{API}/cards/{set_code.lower()}/{num}")
    params = {"fuzzy": name}
    if set_code:
        params["set"] = set_code.lower()
    return _get(f"{API}/cards/named", params=params)


_DFC_LAYOUTS = frozenset({
    "modal_dfc", "transform", "double_faced_token",
    "reversible_card", "art_series",
})


def is_dfc(card_json: dict) -> bool:
    return card_json.get("layout") in _DFC_LAYOUTS


def face_png_urls(card_json: dict) -> list[tuple[str, str]]:
    """Return [(face_name, png_url)] for each face that has an image."""
    if "image_uris" in card_json:
        return [(card_json["name"], card_json["image_uris"]["png"])]
    faces = []
    for face in card_json.get("card_faces") or []:
        if "image_uris" in face:
            faces.append((face["name"], face["image_uris"]["png"]))
    return faces


def png_url(card_json: dict) -> str:
    faces = face_png_urls(card_json)
    if faces:
        return faces[0][1]
    raise RuntimeError(f"No image_uris on {card_json.get('name')}")


def related_token_names(card_json: dict) -> list[str]:
    """Names of tokens this card can produce, from all_parts."""
    return [
        p["name"]
        for p in (card_json.get("all_parts") or [])
        if p.get("component") == "token"
    ]


def related_token_parts(card_json: dict) -> list[dict]:
    """Token entries from all_parts, each with name and direct Scryfall uri."""
    return [
        {"name": p["name"], "uri": p["uri"]}
        for p in (card_json.get("all_parts") or [])
        if p.get("component") == "token" and p.get("uri")
    ]


def fetch_by_uri(uri: str) -> dict:
    """Fetch any Scryfall object by its API URI."""
    return _get(uri)


def download_png(url: str) -> Image.Image:
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    time.sleep(RATE_LIMIT_S)
    return Image.open(BytesIO(r.content)).convert("RGBA")
