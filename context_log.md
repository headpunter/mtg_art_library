# Context Log

Rolling notes from Claude Code sessions. Updated at end of sessions or on request.
Read this at the start of a new session to pick up context fast.

---

## Session: 2026-05-06

**Context log created. Investigated Build Deck rendering failure.**

### Bugs found and fixed (already on master from a May 4 laptop session)

1. **`parseTimer` TDZ error** (`7203733`) — `let parseTimer = null` was declared *after* the init block in `build.js`, but `parseDeck()` (which reads `parseTimer`) was called synchronously from inside that block. JavaScript `let` temporal dead zone threw a `ReferenceError` on startup. Fix: moved declaration before the init block.

2. **Stale browser-cached `build.js`** (`5faa468`) — after removing MPC AutoFill, browsers with cached old `build.js` would crash on init (`btnFetchMissing` and `findPaneTabs` are null in the current HTML). Fix: git-hash cache-busting (`?v={{ ver }}`) added to all static asset URLs in `base.html` and `build.html`.

3. **Visible error surfacing** (`ce4e425`, `93aba22`) — parse/render errors were swallowed silently. Now shown in-UI so debugging is easier.

4. **Back-to-top button** (`7203733`) — added to all pages, appears after scrolling 400px.

### Also done this session
- Added `context_log.md` to the repo (this file) — commit `eeb1f65`
- Answered question about cross-session visibility: Claude Code sessions can't see each other, but can read GitHub commit history and this file

---

## Session: 2026-05-04

**Branch:** `claude/implement-todo-item-UhA1Z` → merged to `master`

### What was done

1. **`tools/library_inspect.py`** — created  
   New CLI audit tool. Implements the TODO from README "what's coming next".  
   Five modes: `--missing`, `--orphans`, `--duplicates`, `--sizes`, `--all`.  
   Exits non-zero if issues found (CI-friendly).

2. **Saved decklists + Art grid view** — added to Build page  
   - `SavedDeck` dataclass in `library.py`; stored under `decklists` key in `library.json`  
   - API: `GET/POST /api/decklists`, `GET/PUT/DELETE /api/decklists/<key>`  
   - Left aside: name input + Save button, list of saved decks loads on page init  
   - Clicking a saved deck loads its text into the textarea and auto-parses  
   - **Art grid view**: Table/Art toggle after parsing; one tile per unique card  
   - Clicking a tile opens a **printing picker** showing all library printings for that card  
   - Missing cards show "Find art →" button that switches to Table view and opens the find pane

3. **Removed MPC AutoFill live-search** — entire feature stripped  
   Reason: no public API, requires self-hosted Django backend, art only accessible via hundreds of GB of Drive downloads.  
   **What was deleted:**
   - `tools/mpcautofill.py`
   - `webapp/templates/settings.html` + `webapp/static/settings.js`
   - Settings nav link from `base.html`
   - `/api/settings`, `/api/mpcautofill/*`, `/api/ingest/mpcautofill-*` routes
   - `preferred_sources` and `autofill_url` fields from `Library` dataclass
   - "Fetch missing from MPC AutoFill" button + find pane tab  
   **What stayed:** XML import/ingest (Drive IDs from MPCFill XML), "Autofill XML" export format, `tools/build_autofill_xml.py`, `tools/import_mpcfill.py`, `tools/download_drive.py`

4. **Enlarged art previews** in Build view  
   Find pane: card width 120 → 300px, max-height 340 → 480px  
   Printing picker: thumb 52 → 160px, max-height 320 → 480px

### Architecture reminders
- `library.json` is the single source of truth (no database). All Python dataclasses serialize to it.
- Thumbnails served via `/thumb/<slug>/<pid>` — no static files for art.
- Background jobs use threading + polling via `/api/job/<id>`.
- Scryfall is the only external art source now (MPC AutoFill removed).
- DFC cards: front as `{pid}.png`, back as `{pid}_b.png`. `Printing.is_dfc` flag.

---

## Session: 2026-05-03 (previous session, reconstructed from commits)

Commits were made by `headpunter` with `Co-Authored-By: Claude Sonnet 4.6` — worked interactively but committed manually.

### Features added (roughly in order)

- **MPC AutoFill bulk ingest** — `tools/mpcautofill.py`, `tools/download_drive.py`, bulk ingest endpoint, "Fetch N missing" button in Build aside. *Later removed in 2026-05-04 session.*

- **Settings page** — preferred art sources, configurable AutoFill backend URL. *Later removed in 2026-05-04 session.*

- **Per-row Find panel** — tabbed pane (AutoFill + Scryfall). AutoFill tab later removed; Scryfall-only now.

- **Style tags on printings** — `Printing.styles: list[str]`, editable gold chips on card detail page. Library sidebar filters by style. API: `POST /api/card/<slug>/printing/<pid>/styles`

- **9-up PDF export** — `tools/build_pdf.py`. Five paper layouts (Letter, Legal, A4, Tabloid, A3). Pillow only (no new deps). Cut marks. Paper `<select>` in Build footer when PDF format active.

- **XML art ingest** — parse MPCFill XML, download Drive IDs directly via `download_drive.py`. "Ingest art from XML" button in Build aside. Still present.

- **Auto-fetch pinned printings** — when decklist specifies `(set) num` and it's missing, "Auto-fetch N pinned from Scryfall" button appears. One click downloads all. Still present.

- **Token tracking** — `Card.related_tokens` list in `library.json`. Scryfall `all_parts` used to find tokens. Build page shows "Tokens needed" panel with ✓/? status per token. "Find" on missing tokens opens find pane showing Scryfall token printings.

- **Token auto-fetch on Scryfall ingest** — when ingesting a card, auto-ingests its set-matched tokens via `all_parts` URIs. Existing tokens skipped.

- **Metadata refresh** — `POST /api/card/<slug>/refresh-metadata` (single card) and `POST /api/library/refresh-metadata` (bulk background job). Updates `related_tokens` without re-downloading art. "Refresh metadata" button on card detail; "Refresh all metadata" in library sidebar.

- **DFC support** — `Printing.is_dfc`, `Printing.back_name`, back face stored as `{pid}_b.png`. Auto-downloaded on Scryfall ingest.

- **Cardback library** — `Cardback` dataclass, stored under `cardbacks/` in art dir. `GET/POST /api/cardbacks`, delete, set-default. Cardback dropdown in Build footer (passed in XML build payload). `/cardbacks` page.

- **Section header filtering** in decklist parser — skips words like "Lands", "Creatures", "Instants" that Moxfield etc. emit between groups.

- **Library search + sidebar filters** — live name search, style-chip filter. Stats hero stays at top.

- **Windows compatibility fixes** — stdout/stderr reconfigured to UTF-8 at Flask startup; non-ASCII chars in print() calls replaced.

- **Pillow LANCZOS fallback** — `upscale_file()` falls back to PIL resize when `realesrgan-ncnn-vulkan` is not installed.

---

## Open questions / possible next work

- Art grid view "Find art →" for missing cards: currently switches to Table view and opens the find pane. Could stay in Art view with an overlay instead.
- `library_inspect.py --sizes` requires Pillow; not noted in README yet.
- No automated tests beyond `test_pipeline.py` (path was hardcoded to `/home/claude/...` — should use `PYTHONPATH=tools python test_pipeline.py` from repo root).
- The feature branch `claude/implement-todo-item-UhA1Z` still exists on remote — can be deleted.
- When making JS/CSS changes, remember to bump the `?v=` suffix in `base.html` and `build.html` — or rely on the git-hash approach already in place (check how `ver` is injected in app.py).

---

## Repo layout (key paths)

```
tools/
  library.py              # core dataclasses + Library load/save
  library_inspect.py      # audit CLI (--missing/--orphans/--duplicates/--sizes)
  add_card.py             # Scryfall ingest pipeline
  scryfall.py             # Scryfall API client
  build_mpc.py            # MPC PNG export
  build_autofill_xml.py   # MPCFill XML export (file:// URIs)
  build_pdf.py            # 9-up PDF export
  import_mpcfill.py       # parse MPCFill XML as decklist
  download_drive.py       # Google Drive file downloader (used by XML art ingest)
webapp/
  app.py                  # Flask routes
  templates/
    base.html             # nav, topbar
    build.html            # Build Deck page
    card.html             # card detail page
    library.html          # library grid page
    cardbacks.html        # cardbacks page
  static/
    build.js              # Build page JS
    app.js                # shared/global JS
    style.css             # all styles
library.json              # the index (in MTG_ART_LIBRARY root, not repo)
```

## Environment

- Library root: `$MTG_ART_LIBRARY` env var (default: `~/Documents/projects/mtg-art-library`)
- Dev server: `cd webapp && python app.py` (or `run.sh` / `run.bat` from repo root)
- Canonical art size: 2192×2992 px @ 800 DPI (with bleed)
- GitHub repo: `headpunter/mtg_art_library`
- Default branch: `master`
- Claude Code branch convention: `claude/<slug>`
