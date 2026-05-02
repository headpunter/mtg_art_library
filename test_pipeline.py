"""
Test the library + ingestion pipeline end-to-end without network or real binary.
We monkey-patch scryfall.fetch_card / download_png and upscaler.upscale_file
to use synthetic images.
"""
import sys
import shutil
from pathlib import Path
from PIL import Image, ImageDraw

sys.path.insert(0, "/home/claude/mtg_art_library/tools")

import library
import scryfall
import upscaler
import bleed
from library import Library, normalize_name, normalize_printing_id, dimensions_for_dpi
import add_card

TEST_ROOT = Path("/tmp/test_library")
if TEST_ROOT.exists():
    shutil.rmtree(TEST_ROOT)
TEST_ROOT.mkdir(parents=True)


# ---- monkeypatches ----

FAKE_CARDS = {
    ("sol ring", None, None): {
        "id": "fake-sol-ring-cmm",
        "name": "Sol Ring",
        "set": "cmm",
        "collector_number": "366",
        "image_uris": {"png": "fake://sol-ring"},
    },
    ("lightning bolt", None, None): {
        "id": "fake-lb-lea",
        "name": "Lightning Bolt",
        "set": "lea",
        "collector_number": "161",
        "image_uris": {"png": "fake://lb"},
    },
    ("sol ring", "cmm", "366"): {
        "id": "fake-sol-ring-cmm",
        "name": "Sol Ring",
        "set": "cmm",
        "collector_number": "366",
        "image_uris": {"png": "fake://sol-ring-cmm"},
    },
    ("urza's saga", None, None): {
        "id": "fake-urza",
        "name": "Urza's Saga",
        "set": "mh2",
        "collector_number": "259",
        "image_uris": {"png": "fake://urza"},
    },
}

def fake_fetch_card(name, set_code=None, num=None):
    key = (name.lower(), set_code.lower() if set_code else None, num)
    if key in FAKE_CARDS:
        return FAKE_CARDS[key]
    # simulate fuzzy lookup
    for k, v in FAKE_CARDS.items():
        if k[0] == name.lower() and k[1] is None:
            return v
    raise RuntimeError(f"fake: no card {name}")

def fake_download_png(url):
    img = Image.new("RGBA", (745, 1040), (200, 30, 30))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 20, 725, 1020], fill=(0, 0, 0))
    d.rectangle([60, 90, 685, 540], fill=(40, 80, 200))
    d.text((60, 60), url, fill=(255, 255, 255))
    return img

def fake_upscale(input_path, output_path, scale=4, model="x", verbose=False):
    img = Image.open(input_path)
    new_size = (img.width * scale, img.height * scale)
    out = img.resize(new_size, Image.LANCZOS)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    out.save(output_path, "PNG")

scryfall.fetch_card = fake_fetch_card
scryfall.download_png = fake_download_png
upscaler.upscale_file = fake_upscale


# ---- run ingestion ----

print("=== Test 1: ingest from Scryfall by fuzzy name ===")
lib = Library.load(TEST_ROOT)
add_card.ingest_scryfall(lib, "Sol Ring", make_default=True)
lib.save()

print("\n=== Test 2: ingest specific printing ===")
add_card.ingest_scryfall(lib, "Sol Ring", "cmm", "366")
lib.save()

print("\n=== Test 3: ingest a card with apostrophe in name ===")
add_card.ingest_scryfall(lib, "Urza's Saga")
lib.save()

print("\n=== Test 4: ingest from a local file as custom art ===")
custom_img = Image.new("RGB", (1500, 2100), (50, 100, 50))  # face-only, mid-res
custom_path = TEST_ROOT / "custom.png"
custom_img.save(custom_path)
add_card.ingest_file(lib, custom_path, "Sol Ring", tag="futurama_v1")
lib.save()

print("\n=== Test 5: verify library structure ===")
print(f"\nlibrary.json:")
print((TEST_ROOT / "library.json").read_text())

print(f"\nart/ contents:")
for p in sorted((TEST_ROOT / "art").rglob("*")):
    if p.is_file():
        img = Image.open(p)
        print(f"  {p.relative_to(TEST_ROOT)} ({img.size})")

# Verify all finished files are at canonical size
fw, fh, tw, th, bp = dimensions_for_dpi(800)
print(f"\nCanonical size: {tw}x{th}")
all_correct = True
for p in (TEST_ROOT / "art").rglob("*.png"):
    img = Image.open(p)
    if img.size != (tw, th):
        print(f"  ✗ {p.name} is {img.size}, expected {tw}x{th}")
        all_correct = False
    else:
        print(f"  ✓ {p.name}")

if all_correct:
    print("\n✓ All finished files at canonical 2192x2992")
