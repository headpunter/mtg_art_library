# MTG Art Library — Handoff to Claude Code

## What this project is

A local web app (Flask) for managing a personal library of upscaled, 
print-ready Magic: The Gathering card art, and using it to build MPC 
print orders, MPC Autofill XML, and 9-up PDFs.

## What's done

### tools/ — the CLI engine (complete, tested)
- `library.py` — library schema, load/save, name normalization, path helpers
- `bleed.py` — apply bleed to card images (mirror/edge/black/white methods)
- `scryfall.py` — Scryfall API wrapper (fetch card JSON, download PNG)
- `upscaler.py` — subprocess wrapper for realesrgan-ncnn-vulkan
- `decklist.py` — decklist parsing (handles all common MTG formats)
- `add_card.py` — ingestion CLI: Scryfall fetch → upscale → bleed → save to library

### webapp/ — Flask UI (partial, Library view only)
- `app.py` — Flask routes (Library view implemented, Build view stubs only)
- `jobs.py` — in-memory background job runner with threading
- `static/style.css` — dark theme CSS
- `static/app.js` — vanilla JS for Library view
- `templates/base.html` — base template with nav
- `templates/library.html` — Library view template

### docs
- `README.md` — setup instructions, usage, environment variables
- `design_brief.md` — full UI/UX spec for Claude Code to implement from

## What still needs building

### In webapp/:
- Build view (Half 2): decklist paste → parse → card table with status/dropdowns
- `templates/build.html`
- Build view routes in `app.py`
- Build view JS in `app.js`

### New tools/ scripts (not started):
- `build_mpc.py` — decklist + library → folder of 2192×2992 PNGs for MPC upload
- `build_mpcfill_xml.py` — decklist + library → XML for MPC Autofill browser tool
- `build_pdf.py` — decklist + library → 9-up PDF for home printing

### Missing from Library view:
- The "top 5 printings by price, non-foil preferred" Scryfall lookup
  (Scryfall endpoint: GET /cards/search?q=!"{name}"&unique=prints&order=usd&dir=desc)
- Foil-only printing detection (check card.finishes == ["foil"])

## Canonical spec

- **Finished art size:** 2192×2992 px at 800 DPI (with mirror bleed by default)
- **Face area:** 2000×2800 px (2.5" × 3.5" at 800 DPI)
- **Bleed:** 96 px each side (0.12" × 800 DPI)
- **Library root:** ~/Documents/projects/mtg-art-library/ (or MTG_ART_LIBRARY env var)
- **Art files:** art/<slug>/<printing_id>.png
- **Index:** library.json

## Environment variables

| Var | Default | What it does |
|-----|---------|-------------|
| MTG_ART_LIBRARY | ~/Documents/projects/mtg-art-library | library root |
| REALESRGAN_BIN | (must set) | path to realesrgan-ncnn-vulkan executable |
| REALESRGAN_MODEL | realesrgan-x4plus | upscaler model name |
| REALESRGAN_SCALE | 4 | upscale factor |

## Key design decisions

- **No database** — library.json is the source of truth
- **Vanilla JS only** — no React, no npm, no build step
- **Jinja2 templates** — standard Flask templating
- **Background threads** — slow ops (upscale ~5-30s/card) run in threads,
  UI polls /api/job/<id> every 2 seconds
- **Thumbnails on demand** — generate 200×280 thumbnails from finished art,
  cache them, serve on hover/click (not inline in tables)
- **Two views:** Library (curate) and Build (use)

## Decklist format supported

    1 Sol Ring
    1x Lightning Bolt
    Counterspell
    1 Sol Ring (cmm) 366    ← specific printing
    // Sideboard            ← skipped
    # comment               ← skipped

## To run (once Flask is installed)

    cd webapp/
    pip install flask requests Pillow
    python app.py

Opens at http://localhost:5000
