"""
download_drive.py — download a public Google Drive file by file ID.

Google's download mechanism has two layers:
  1. drive.usercontent.google.com — newer, bypasses most confirmations
  2. drive.google.com/uc — legacy fallback with cookie-based confirmation

If the response comes back as text/html the file is inaccessible (private,
quota exceeded, or removed) and we raise a clear error.
"""
from __future__ import annotations

from pathlib import Path

import requests

_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; MTG-Art-Library/1.0)"}


def download_drive_file(file_id: str, dest: Path, timeout: int = 120) -> Path:
    """
    Download a public Google Drive file to dest.

    Tries the usercontent domain first (better for large files), falls back
    to the legacy /uc endpoint with confirmation-cookie handling.
    """
    dest.parent.mkdir(parents=True, exist_ok=True)

    # Primary: usercontent.google.com — works for most public files
    url = (
        "https://drive.usercontent.google.com/download"
        f"?id={file_id}&export=download&authuser=0&confirm=t"
    )
    try:
        with requests.get(url, headers=_HEADERS, stream=True, timeout=timeout) as resp:
            resp.raise_for_status()
            ct = resp.headers.get("Content-Type", "")
            if "text/html" not in ct:
                _stream_to(resp, dest)
                return dest
    except requests.RequestException:
        pass

    # Fallback: legacy endpoint with confirmation cookie
    return _download_legacy(file_id, dest, timeout)


def _download_legacy(file_id: str, dest: Path, timeout: int) -> Path:
    session = requests.Session()
    url = f"https://drive.google.com/uc?export=download&id={file_id}"

    resp = session.get(url, headers=_HEADERS, stream=True, timeout=timeout)
    resp.raise_for_status()

    token = next(
        (v for k, v in resp.cookies.items() if k.startswith("download_warning")),
        None,
    )
    if token:
        resp = session.get(
            f"https://drive.google.com/uc?export=download&confirm={token}&id={file_id}",
            headers=_HEADERS, stream=True, timeout=timeout,
        )
        resp.raise_for_status()

    ct = resp.headers.get("Content-Type", "")
    if "text/html" in ct:
        raise RuntimeError(
            f"Google Drive returned HTML for file {file_id}. "
            "The file may be private, deleted, or over its download quota."
        )

    _stream_to(resp, dest)
    return dest


def _stream_to(resp: requests.Response, dest: Path) -> None:
    with open(dest, "wb") as fh:
        for chunk in resp.iter_content(chunk_size=65_536):
            if chunk:
                fh.write(chunk)
