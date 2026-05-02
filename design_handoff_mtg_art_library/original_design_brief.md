# MTG Art Library — Flask App Design Brief

## What this is

A personal local web app (Flask, runs at localhost, opened in a browser) for
managing a curated library of Magic: The Gathering card art and using it to
build print orders. It wraps a set of existing Python CLI tools into a UI.

This brief is for designing the UI/UX. A developer will implement it from your
designs. Please produce mockups, a component breakdown, and a page flow.

---

## Background & motivation

The user prints proxy MTG cards via MakePlayingCards.com (MPC). Card art from
Scryfall is low resolution and lacks the "bleed" area MPC requires. The CLI
tools in this project handle:

- Downloading card art from Scryfall
- Upscaling via realesrgan-ncnn-vulkan (local GPU, a 3090)
- Adding bleed at 800 DPI / 2192×2992px (the canonical "finished" size)
- Saving to a local library indexed in library.json

The user also has custom AI-generated art (Futurama-themed MTG cards, for
example) that can be imported into the library from local files.

The web app replaces the need to type CLI commands for routine tasks.

---

## The two halves of the app

### Half 1: Library Manager

**Purpose:** Curate the art library over time. Used occasionally (when a new
set drops, when adding custom art, when building a new preferred printing).
Not used every time you print.

**What it needs to do:**
- Show all cards in the library (searchable, browseable)
- For each card: show how many printings are stored, which is the default
- Hover or click a card to see a thumbnail of its default art
- Add a new card from Scryfall:
  - Type card name → autocomplete from Scryfall
  - Show the top 5 most expensive non-foil printings to choose from
    (foil-only printings should be deprioritized/marked since their art
    renders oddly as proxies)
  - Clicking a printing kicks off a background job: fetch → upscale → add bleed → save
  - Show job progress inline (Fetching... Upscaling... Saving... Done)
- Add a card from a local file (custom art):
  - Drop or browse for image file(s)
  - Assign a card name and a tag (e.g. "futurama", "mpcfill")
  - System auto-detects if image has bleed already or is face-only
  - Background job: resize/upscale as needed → add bleed → save
- Edit a card already in library:
  - Change default printing
  - Delete a printing
  - Change bleed method (mirror / edge / black / white) per-printing
  - Re-process (re-run upscaler on an existing printing)

### Half 2: Deck Builder

**Purpose:** Take a decklist, assemble a print order using library art.
Used every time the user wants to print a deck or proxy set.

**What it needs to do:**
- Big paste area for a decklist (standard MTG format, see examples below)
- "Parse" button
- After parsing, show a table — one row per unique card:
  - Qty | Card Name | Status indicator | Printing selector | Action
  - Status colors:
    - 🟢 Green: card is in library, default printing auto-selected
    - 🟡 Yellow: card in library, multiple printings available, user should pick
    - 🔴 Red: card not in library at all
  - For green/yellow: dropdown of available printings from the library
  - For red: button/inline panel showing the top 5 Scryfall printings (non-foil
    preferred) — user picks one to ingest, which kicks off a background job
  - Hover/click on a row: show a thumbnail of the currently selected art
- Summary bar at the bottom (X cards, Y green, Z red)
- "Build" button with a format picker:
  - MPC PNG bundle (folder of 2192×2992 PNGs ready to upload to mpc.com)
  - MPC Autofill XML (XML manifest for the MPC Autofill browser tool)
  - 9-up PDF (3×3 grid per page for home printing)
- Building kicks off a background job, shows progress, gives download link when done

---

## Technical constraints the designer should know

- **Local only** — no auth, no accounts, single user. Keep UI clean, not enterprise-y.
- **Flask + vanilla JS** — no React, no build step, no npm. Plain HTML/CSS/JS.
  The developer will implement in Jinja2 templates.
- **Background jobs** — slow operations (upscale takes ~5-30 sec per card) run
  in background threads. UI polls a job status endpoint. Every slow action needs
  a visible progress state.
- **library.json** is the data source — the app reads/writes a JSON file.
  No database. Card art lives on disk as PNG files.
- **Thumbnails** — the canonical art files are 2192×2992 (~10MB). The app
  generates and caches small thumbnails (200×280) on demand. Thumbnails are not
  shown inline in the table by default — they appear on hover or click (for
  performance).
- **Running the app** — user double-clicks `run.bat` (Windows) or `run.sh`
  (Linux), which starts Flask and optionally opens a browser tab. The developer
  will handle this, but the design should assume a browser context.

---

## Decklist format examples

The parser handles these formats (mix and match in one paste):

```
1 Sol Ring
1x Lightning Bolt
Counterspell
1 Sol Ring (cmm) 366       ← specific set + collector number
// Sideboard               ← skipped
# comment                  ← skipped
```

---

## Existing file structure (for context)

```
~/Documents/projects/mtg-art-library/
├── art/
│   ├── sol_ring/
│   │   ├── cmm_366.png           ← finished art (2192×2992, 800 DPI, with bleed)
│   │   └── custom_futurama.png   ← custom AI-generated art
│   └── lightning_bolt/
│       └── lea_161.png
├── library.json                  ← the index
└── tools/                        ← the CLI modules (library.py, bleed.py, etc.)
```

library.json structure:
```json
{
  "version": 1,
  "canonical_dpi": 800,
  "canonical_size": [2192, 2992],
  "default_bleed": "mirror",
  "cards": {
    "sol_ring": {
      "name": "Sol Ring",
      "default": "cmm_366",
      "printings": {
        "cmm_366": {
          "source": "scryfall",
          "scryfall_id": "...",
          "set": "cmm",
          "collector_number": "366",
          "bleed": "mirror",
          "added": "2026-05-02"
        },
        "custom_futurama": {
          "source": "file",
          "tag": "futurama",
          "bleed": "mirror",
          "added": "2026-05-02"
        }
      }
    }
  }
}
```

---

## What we want from Claude (design)

1. **Page flow diagram** — how Library and Build views connect, what modals/panels exist
2. **Wireframes or mockups** for:
   - Library view (card grid, search, add card panel)
   - Card detail / edit panel (printings list, default selector, re-process)
   - Build view (decklist paste, parsed table, status colors, printing selector)
   - Build output panel (format picker, progress, download)
3. **Component list** — what reusable UI components exist (card row, printing
   dropdown, job progress indicator, thumbnail hover, etc.)
4. **Color/tone direction** — this is a personal tool for a Magic player. Dark
   theme preferred (easier on the eyes for long sessions). MTG-adjacent aesthetic
   is welcome but not required. Clean and functional over flashy.
5. **Any UX decisions you'd make** — e.g. should "Add Card" be a modal or a
   sidebar? Should the Build table be collapsible per-card? Should job progress
   be a toast or inline? We want your judgment on these.

When done, bring the design output back and the developer (another Claude
instance) will implement it as a Flask app using the existing CLI tools as
the backend engine.

---

## Vocabulary / domain terms

- **Printing** — a specific version of a card (e.g. Sol Ring from Commander
  Masters set #366). One card can have many printings.
- **Slug** — the filesystem-safe card name (e.g. "sol_ring", "urzas_saga")
- **Bleed** — the extra border area around a card required by MPC for printing
- **MPC** — MakePlayingCards.com, the print-on-demand service used
- **MPCFill / MPC Autofill** — a browser tool that auto-fills an MPC order from
  an XML manifest
- **Upscaler** — realesrgan-ncnn-vulkan, a local CLI tool that uses the GPU to
  upscale images 4× with AI
- **Canonical size** — 2192×2992px at 800 DPI — every finished art file in the
  library is this exact size
