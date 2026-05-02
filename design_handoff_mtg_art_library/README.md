# Handoff: MTG Art Library — Flask App

## Overview

A personal local web app (Flask, runs at `localhost`, opened in a browser) for managing a curated library of Magic: The Gathering card art and using it to build print orders for MakePlayingCards.com (MPC). The app wraps existing Python CLI tools (Scryfall fetch, realesrgan-ncnn-vulkan upscale, bleed addition, library indexing) into a UI.

The app has **two top-level tabs**:
- **Library** — curate the art library over time (occasional use)
- **Build** — paste a decklist, assemble a print order from library art (frequent use)

The original design brief is included as `original_design_brief.md` — read it for full domain context, vocabulary, file structure, and the existing `library.json` schema.

## About the Design Files

The files in this bundle (`MTG Art Library.html`, `styles.css`, `sketches.jsx`, `midfi.jsx`) are **design references created in HTML/JSX**. They are prototypes showing the intended look, structure, and behavior — **not production code to copy directly**.

Your task is to **recreate these designs in the target environment**, which the brief specifies:

> **Flask + vanilla JS** — no React, no build step, no npm. Plain HTML/CSS/JS. The developer will implement in Jinja2 templates.

So: use the JSX files as a structural and visual reference, but implement in **Jinja2 templates + plain HTML/CSS/JS**. The CSS in `styles.css` can be lifted nearly as-is (it's already plain CSS, no preprocessing). The component structure in `midfi.jsx` and `sketches.jsx` should be translated to Jinja2 partials.

## Fidelity

**Mid-fidelity** for the chosen direction. Colors, typography, spacing, and component structure are final and should be matched exactly. The card art is shown as striped placeholder backgrounds in the design — in production, you'll render real PNG thumbnails from the library.

The "01 · Sketchy ideation" section in the design canvas is exploratory only — it shows alternatives that were considered. **Implement only the mid-fi mockups (section 02).**

## Screens / Views

### 1. Library (Grid view) — `/library` or `/library?view=grid`

**Purpose:** Browse all cards in the library at a glance. Image-forward like Steam/itch.

**Layout:**
- App bar (top, 44px tall): logo mark, app title "art library", tabs (Library | Build), right-aligned meta string ("142 cards · 800 dpi · 2192×2992")
- Body: 2-column flex
  - Sidebar (220px fixed width, left): filter nav
  - Main (flex 1): toolbar at top, scrollable card grid below

**Sidebar sections:**
- "Library" group: All cards, Recently added, Multiple printings, Custom art (each with a count)
- "Tags" group: dynamic list of user tags (e.g. `futurama`, `mpcfill`) with colored square + count
- "System" group: Jobs, Settings

**Toolbar:**
- Search input (left, max 360px wide, has search icon)
- Segmented control: Grid / List view toggle
- Segmented control: Sort: Recent (placeholder for sort options)
- Spacer
- Primary "+ Add Card" button (right)

**Card grid:**
- `display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 14px; padding: 18px;`
- Each card (`<LibraryCard>`):
  - Aspect ratio 488/680 (matches MTG card art proportions)
  - Full-bleed art (will be the cached 200×280 thumbnail in production)
  - Top-right badge `×N` if more than 1 printing exists
  - Bottom-left tag strip (small monospace pills) if the card has tags
  - Below art: card name (12px, weight 600, ellipsis-truncated), small subline showing `N printings` and `· custom` if applicable
  - Hover: border lightens, `transform: translateY(-2px)`
  - Processing state: accent-purple border, gradient overlay on art, "upscaling…" pill at bottom-left, progress bar at very bottom

### 2. Library (List view) — `/library?view=list`

**Layout:** Same chrome as grid view (app bar, sidebar, toolbar). Main content area becomes a dense list.

**List rows:**
- Grid template: `32px 1.4fr 1fr 80px 90px 24px`
- Columns: thumb-mini (22×30 striped placeholder), Card name + slug (mono small), Default printing (mono), Printings count (mono), Added date (mono), `›` chevron
- Header row: 10px uppercase letterspaced labels
- Hover row: `background: var(--bg-2)`

### 3. Add Card drawer — slides in from right over Library

**Trigger:** "+ Add Card" button.

**Layout:** 380px wide, anchored top/right/bottom, `box-shadow: -8px 0 30px rgba(0,0,0,0.3)`. The library remains visible to the left (helps spot duplicates).

**Contents:**
- Header: "Add Card" title + close (✕) button
- Tabs (segmented control, full-width): "From Scryfall" / "From file"
- **Scryfall tab:**
  - Card-name input (autocomplete from Scryfall in production)
  - Label "Top 5 printings · non-foil first"
  - 5 result rows: 50×~70 thumb, set name + set code + collector number + price. Foil-only printings get a yellow `foil-only` pill and dimmed treatment
  - Click a result → kicks off background job, drawer can stay open or close, the new card appears in the library grid in `processing` state
- **File tab** (not mocked but spec'd):
  - Drop zone or file picker
  - Card-name input + tag input
  - System auto-detects bleed vs face-only
  - "Process" button kicks off background job
- Footer help block (mono, dim): shows the job pipeline `fetch → upscale 4× → bleed (mirror) → save`

### 4. Card detail page — `/card/<slug>`

**Trigger:** Click any card in Library.

**Layout:** App bar + sidebar replaced by 2-column split:
- Left (320px, `var(--bg-2)` background): hero art + meta
- Right (flex 1): printings list + "add another printing" panel

**Left panel:**
- Breadcrumb: `‹ Library / All cards`
- Hero art (full aspect ratio 488/680)
- Card name (h2, 22px bold)
- Slug + printings count (mono, 11px, dim)
- Key-value grid (12px): type, cmc, added, last edit, disk-size
- Buttons: "+ Add printing", "Delete card" (ghost)

**Right panel:**
- Section header: "Printings" + segmented control (Cards / Compact)
- Printing cards (one per printing):
  - Grid: `60px 1fr auto`
  - Thumb (60×~84), printing name + meta (set code/num, bleed method, source, tags, added date), action buttons
  - Default printing: highlighted with accent-purple border, faint accent background, "default" pill on the name
  - Actions: "Set default" (only if not default), "Bleed ▾" (dropdown: mirror / edge / black / white), "Re-process", "Delete" (red)
- "Add another printing" zone at bottom: dashed border box with two buttons (From Scryfall / From file)

### 5. Build view — `/build`

**Purpose:** Paste a decklist, assemble a print order.

**Layout:** App bar + 2-column split (no sidebar):
- Left pane (360px, `var(--bg-2)`): paste + stats
- Right pane (flex 1): parsed table + sticky footer

**Paste pane:**
- Section label: "Decklist" (mono uppercase)
- Large textarea (mono 12px, flex 1, min-height 240px)
- Stats grid (4 columns): unique / in lib / pick / missing — each tile shows a big mono number + a 9px uppercase letterspaced label, colored (ink / green / yellow / red)
- "Re-parse" button
- Footer hint block listing the supported formats (`1 Sol Ring`, `1x Sol Ring`, `Sol Ring`, `1 Sol Ring (cmm) 366`, `// comments skipped`)

**Parsed table:**
- Sticky header: Qty / Card / Printing / (action)
- Each row tinted by status:
  - 🟢 ok (in library, default selected): subtle green tint `rgba(80,180,120,0.10)`
  - 🟡 warn (multiple printings, user should pick): subtle yellow tint `rgba(220,180,80,0.10)`
  - 🔴 bad (not in library): subtle red tint `rgba(230,95,95,0.10)`
- Hover: tint goes to ~0.18 alpha
- Cells:
  - **Qty** (40px, mono, right-aligned): `2×`
  - **Card**: 8px status dot + name (weight 500). Optional sub-line for hints ("pinned by decklist") or tag pill. Optional inline `<JobStrip>` showing 4-stage progress when a job is running on this card.
  - **Printing** (240px wide): the **Tiles selector** (chosen variant) — a row of 4 mini thumbs (22×30) representing available printings, the selected one outlined in accent-purple with a tiny `★` badge bottom-right, mono `code num` text to the right. Other variants exist (Pill / Stepper / Thumb) in the design's Tweaks but Tiles is the chosen one.
  - **Action** (90px, right): "Edit" (ghost) for green/yellow rows, "Find" (primary, accent-purple) for red rows. Clicking Find expands an inline picker showing the top 5 Scryfall printings — pick one → background job → row turns green.

**Build footer (sticky bottom):**
- Summary chips (mono, 11px): total / unique / ok / pick / miss with their respective colors
- Format picker (segmented): "MPC PNG" / "Autofill XML" / "9-up PDF"
- Primary "Build →" button. Disabled when missing > 0; when disabled, label becomes "Fix N first".

### 6. Build output (after Build clicked)

Not fully mocked, but should: show inline progress (same `<JobStrip>` pattern), then a download link when ready. Output written to `~/exports/<deckname>/`.

## Interactions & Behavior

- **Tab switch (Library ↔ Build):** standard route navigation. URL changes.
- **Card click in Library:** navigate to `/card/<slug>`.
- **Add Card drawer:** opens with slide-in transition; backdrop is the unmodified library; closes on ✕ or Esc. Posts to a job-start endpoint, then drawer closes (or stays for adding more).
- **Background jobs:** every slow action (upscale ~5–30s) returns a `job_id`. The UI polls `/jobs/<id>` ~every 500ms. Job state: `{stage: 'fetch'|'upscale'|'bleed'|'save'|'done'|'error', pct: 0–100, message?}`.
- **Job display — INLINE ONLY** on whatever element triggered the job (the card tile, the table row, or the printing card on detail page). **No toasts, no global queue panel.** A `<JobStrip>` shows the 4 stages with done/active/todo states.
- **Status colors carry meaning** — at-a-glance scan of the table tells you what's left to do.
- **Decklist parsing:** live as you type, debounced ~300ms. Re-parse button forces immediately. Status counts update in stats panel.
- **Printing selector (Tiles variant):** click a tile to set selection. Hover any tile to preview the art (large floating thumb). The default printing's tile is shown first, with a star.
- **Format picker:** mutually exclusive segments. Build button text doesn't change with format.

## State Management

**Server-side (Flask + library.json):**
- `library.json` is the source of truth. Read on each request (file is small).
- Background jobs run in a thread pool. Job state kept in-memory (dict keyed by job_id). Lost on restart — that's fine.

**Client-side (vanilla JS):**
- Library page: fetched once on load. Polling only for cards in `processing` state.
- Build page: decklist text in a textarea (persist to `localStorage` so refresh doesn't lose it). Parsed result is server-computed (POST decklist → JSON of rows). Selected printings per row tracked in client memory until Build is clicked.
- Card detail: fetched on route load. Optimistic UI for "set default" (server rewrite + revert on error).

**Endpoints (suggested):**
- `GET /library` (HTML) / `GET /api/library` (JSON)
- `GET /card/<slug>` (HTML) / `GET /api/card/<slug>` (JSON)
- `POST /api/scryfall/search?q=<name>` → top 5 printings
- `POST /api/jobs/add-card` body: `{slug, scryfall_id, bleed}` → `{job_id}`
- `POST /api/jobs/add-file` multipart upload → `{job_id}`
- `POST /api/jobs/reprocess` body: `{slug, printing_id}` → `{job_id}`
- `GET /api/jobs/<id>` → job state
- `POST /api/parse-decklist` body: `{text}` → array of parsed rows with status/printings
- `POST /api/build` body: `{rows: [{slug, printing_id, qty}], format: 'png'|'xml'|'pdf'}` → `{job_id}`
- Static: `/thumbs/<slug>/<printing>.png` (200×280, generated on demand)

## Design Tokens

All defined as CSS custom properties in `styles.css`:

### Colors

```
--bg:         #14171c   (app background)
--bg-2:       #1b1f26   (sidebar / panels)
--bg-3:       #232831   (raised surfaces, inputs)
--bg-4:       #2c323d   (button hover, highest)
--line:       #2f3641   (subtle dividers)
--line-2:     #3a4150   (stronger borders)

--ink:        #e7ebf1   (primary text)
--ink-2:      #aab2c0   (secondary text)
--ink-3:      #6e7889   (tertiary, captions)
--ink-4:      #4a5161   (disabled)

/* Status (used as both row tint and dot/text) */
--ok:         #6dd49a   (in library)
--ok-bg:      rgba(80, 180, 120, 0.10)
--ok-bg-strong: rgba(80, 180, 120, 0.18)   (hover)

--warn:       #e6c266   (pick a printing)
--warn-bg:    rgba(220, 180, 80, 0.10)
--warn-bg-strong: rgba(220, 180, 80, 0.18)

--bad:        #e57777   (missing)
--bad-bg:     rgba(230, 95, 95, 0.10)
--bad-bg-strong: rgba(230, 95, 95, 0.18)

/* Single accent (default printing, primary CTA, active job) */
--accent:     #8a7cff
--accent-dim: #5a4fb8
```

### Spacing

No formal scale — use 2/4/6/8/10/12/14/16/18/22/28 px increments. Card grid gap 14px, page padding 18px, panel padding 12–18px.

### Typography

```
--sans: "Inter", -apple-system, "Segoe UI", system-ui, sans-serif;
--mono: "JetBrains Mono", "SF Mono", ui-monospace, "Menlo", monospace;
```

- App body: 13px Inter
- Card name: 12px, weight 600
- Section labels: 10px uppercase, letter-spacing 0.08em, weight 600, --ink-3
- Mono text (set codes, slugs, file paths, stats): 10–11px JetBrains Mono
- Hero card name: 22px, weight 700
- Stat numbers: 18px, weight 600, mono

### Radii

```
--r:    6px   (buttons, inputs, small cards)
--r-lg: 10px  (used sparingly)
8px           (LibraryCard, larger panels)
3–5px         (chips, tags, mini-thumbs)
```

### Shadows

- Drawer: `box-shadow: -8px 0 30px rgba(0,0,0,0.3)`
- Cards: no shadow at rest, just border. Border lightens on hover.

## Assets

- **No bundled images.** All card art is generated/stored at runtime (the canonical 2192×2992 PNGs in `art/<slug>/<printing>.png`, plus 200×280 cached thumbnails generated on demand).
- **Logo mark:** the `⌬` glyph in a gradient square in the design — feel free to replace with a real SVG if you have one. Brief says "MTG-adjacent aesthetic welcome but not required".
- **Icons used:** search (lens + handle), grid (2×2 squares), list (3 horizontal lines), plus (+), close (✕). All inline SVG with `stroke: currentColor`. Designs use 11–14px stroke-width 2–2.5.
- **Fonts:** Inter and JetBrains Mono — load from Google Fonts CDN or self-host:
  ```html
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
  ```

## UX decisions made (and why)

- **Add Card → drawer** (not modal, not inline). Drawer keeps the library visible so duplicates are spottable and modal felt heavy for a solo tool. Inline panel was rejected because it shifts the grid every time it opens.
- **Card edit → dedicated page** (`/card/<slug>`). Per the brief; URL is shareable/refreshable, gives printings room to breathe.
- **Build table → not collapsible per-card.** Decklists are 60–100 rows; per-row collapse adds UI weight. Density toggle handles long lists better.
- **Job progress → inline only.** No toasts, no global jobs panel. The thing that triggered the job shows the job.
- **Status → tinted rows + small dot.** Tints carry the signal at a glance; dots reinforce for a11y. No emoji.
- **Tabs over split-pane.** Library and Build are different mental modes (curate vs print) — tabs avoid context bleed.
- **Printing selector → Tiles.** Chosen after exercising 4 variants (Pill / Tiles / Stepper / Thumb) via the design's Tweaks panel. Tiles wins for visual affordance — you can see the alternatives without expanding a menu.

## Files

In this bundle:

- `original_design_brief.md` — the full design brief (read first for domain context)
- `MTG Art Library.html` — root file. Open this to view the design. Lays out three sections on a pannable canvas: sketchy ideation (skip), mid-fi mockups (the spec), flow & components (read for high-level structure)
- `styles.css` — **all production-relevant CSS**. Lift this nearly as-is into the Flask app's `static/css/`
- `midfi.jsx` — the mid-fi React components. Use as a structural reference for translating to Jinja2 partials. Components map: `<AppBar>`, `<Sidebar>`, `<LibraryToolbar>`, `<LibraryCard>`, `<LibraryRow>`, `<AddDrawer>`, `<CardDetail>`, `<BuildView>`, `<ParsedRow>`, `<PrintingSelectorTiles>`, `<JobStrip>`
- `sketches.jsx` — exploratory low-fi alternatives. Skip when implementing
- `design-canvas.jsx`, `tweaks-panel.jsx` — viewer scaffolding only, not part of the app

### Suggested Flask project structure

```
mtg-art-library/
├── app.py                 # Flask routes
├── jobs.py                # background-thread job runner
├── library.py             # CLI module (already exists)
├── bleed.py               # CLI module (already exists)
├── scryfall.py            # search + fetch
├── library.json           # the index
├── art/<slug>/*.png       # canonical art (already exists)
├── thumbs/<slug>/*.png    # 200×280 cache (generated)
├── exports/<deckname>/    # Build output
├── static/
│   ├── css/styles.css     # lifted from this bundle
│   └── js/
│       ├── library.js     # grid/list, search, filters, job polling
│       ├── build.js       # paste, parse, table, build
│       └── card.js        # card detail interactions
└── templates/
    ├── base.html          # app bar + sidebar shell
    ├── library.html
    ├── card.html
    ├── build.html
    └── partials/
        ├── library_card.html
        ├── parsed_row.html
        ├── printing_card.html
        ├── add_drawer.html
        └── job_strip.html
```

## Implementation order (suggested)

1. Project scaffold, `base.html`, route stubs, `styles.css` integrated
2. Library grid view reading from `library.json` + thumb generation
3. Add Card drawer + Scryfall search proxy + first job (fetch → upscale → bleed → save)
4. Job polling + inline `<JobStrip>` (proves the whole loop)
5. Library list view, search, filters
6. Card detail page + printings management (set default, re-process, change bleed, delete)
7. Add-from-file flow
8. Build view: paste, parse endpoint, table with status colors, Tiles printing selector
9. Inline "Find" for missing cards (red rows) reuses Add Card flow
10. Build output: PNG bundle, Autofill XML, 9-up PDF
11. Polish: hover thumbs, keyboard nav, error states

Good luck. Reach out if anything in `styles.css` needs interpretation — it's commented by section.
