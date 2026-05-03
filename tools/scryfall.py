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


def png_url(card_json: dict) -> str:
    if "image_uris" in card_json:
        return card_json["image_uris"]["png"]
    for face in card_json.get("card_faces") or []:
        if "image_uris" in face:
            return face["image_uris"]["png"]
    raise RuntimeError(f"No image_uris on {card_json.get('name')}")


def related_token_names(card_json: dict) -> list[str]:
    """Names of tokens this card can produce, from all_parts."""
    return [
        p["name"]
        for p in (card_json.get("all_parts") or [])
        if p.get("component") == "token"
    ]


def download_png(url: str) -> Image.Image:
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    time.sleep(RATE_LIMIT_S)
    return Image.open(BytesIO(r.content)).convert("RGBA")
