# Context Log

Rolling notes from Claude Code sessions. Updated at end of sessions or on request.
Read this at the start of a new session to pick up context fast.

---

## Session: 2026-05-06 (continued — second session)

### Features added

1. **Parallel art ingest** (`731f690`) — already in log above but implemented this session:
   - XML art: 8-worker parallel Google Drive downloads → sequential ingest
   - Scryfall pinned: 6-worker ThreadPoolExecutor with `threading.Lock` on lib mutations

2. **All table rows clickable + unified Find Pane** (`121edb2`) — clicking any row opens the find pane showing:
   - Library thumbnails (selectable, selected tile gets ✓ badge + gold border)
   - All Scryfall printings grouped: Special treatments / Standard / Foil-only
   - Active row highlighted with gold left-border inset shadow

3. **All Scryfall printings shown** (`f46664b`) — removed the [:5] cap; follows pagination for >175 results; sorts release-date descending within tier groups

4. **Scryfall printings prioritized by treatment** (`1f4d019`) — tier sort: borderless+showcase → showcase → extended art → borderless → full art → retro → etched → standard. Treatment badge shown on each featured card. Three display groups: Special treatments / Standard printings / Foil only.

5. **Basic land filtering** (`a2e8658`) — if `type_line` contains "Basic Land", only full arts and showcases returned. Note shown in panel.

6. **Per-deck cardback setting** (`4b9fba6`) — `deckCardbackSel` in the aside is now styled and visible. Saved deck items show the chosen cardback name below the deck name. Save/load/build all wire through `cardback_key`.

### Open / known issues
- Multiple orphaned Flask processes accumulate if you restart without killing by PID. Use `Get-NetTCPConnection -LocalPort 5000` + `Stop-Process` in PowerShell to kill all before restarting.
- `tools/library.py` and `webapp/app.py` have unstaged changes from a remote commit pulled mid-session (`3cabf1f` — added CLAUDE.md). Check `git diff` before committing if those files appear modified.

---

## Session: 2026-05-06 (earlier)

**Investigated Build Deck rendering failure. Updated this log.**

### Bugs found and fixed (landed on master from a May 4 laptop/phone session)

1. **`parseTimer` TDZ error** (`7203733`) — `let parseTimer = null` was declared *after* the init block in `build.js`, but `parseDeck()` (which reads `parseTimer`) was called synchronously from inside that block. JavaScript `let` temporal dead zone threw a `ReferenceError` on startup. Fix: moved declaration before the init block.

2. **Stale browser-cached `build.js`** (`5faa468`) — after removing MPC AutoFill, browsers with cached old `build.js` would crash on init (`btnFetchMissing` and `findPaneTabs` are null in the current HTML). Fix: git-hash cache-busting (`?v={{ ver }}`) added to all static asset URLs in `base.html` and `build.html`. Also added `no-store` response header for the HTML pages themselves (`4aa23d7`).

3. **Visible error surfacing** (`ce4e425`, `93aba22`) — parse/render errors were swallowed silently. Now shown in-UI.

4. **`build.js` refactor + fail-fast stale-page detection** (`77b9219`) — if JS detects the page HTML is stale (key elements missing), it shows an error banner and stops rather than throwing cryptically.

### Also done this session
- Added `context_log.md` to the repo (`eeb1f65`)
- Updated log with current state (`0626abb`, this entry)

---

## Session: 2026-05-04 — Major Build Page Overhaul (from laptop/phone session)

Large batch of commits landed on master between context log creation and this update.

### Build page UI — current state

**All table rows are now clickable** (`121edb2`) — clicking any row opens a unified **Find Pane** at the top of the right panel. The Find Pane has two sections:

1. **In your library** — horizontal thumbnail strip of printings already in the library. Click a tile to select it for the build. Selected tile shows a checkmark badge. Selection is reflected immediately in the inline thumbnail strip in the table row.

2. **All Scryfall printings** — grouped results below:
   - *Special treatments* (featured / alternate art)
   - *Standard printings*
   - *Foil only*
   - For basic lands, only full arts & showcases shown (`a2e8658`)
   - Click any card to download + ingest it (background job, progress shown inline)

**Printing column in table** (`927e553`) — replaced the `<select>` dropdown with an inline horizontal thumbnail strip:
- Single printing: static label
- Multiple printings: scrollable strip of image tiles with set labels; click to select

**Row click behavior:**
- Click row → open Find Pane for that row (row gets gold left-border highlight)
- Click same row again → close Find Pane
- Click different row → switch Find Pane to new row

**Scryfall results** (`f46664b`, `1f4d019`) — now shows ALL printings (not just top 5), grouped by treatment, with featured prints prioritized.

### Parallelized ingest (`731f690`)

**XML art ingest** — 8-worker `ThreadPoolExecutor` for Google Drive downloads (phase 1), then single-threaded sequential ingest (phase 2, library not thread-safe). Single `lib.save()` at end.

**Scryfall pinned batch** — 6-worker `ThreadPoolExecutor` with a `threading.Lock` protecting library mutations. Single `lib.save()` at end.

---

## Session: 2026-05-04 — Earlier (Claude Code session on this machine)

**Branch:** `claude/implement-todo-item-UhA1Z` → merged to `master`

### What was done

1. **`tools/library_inspect.py`** — created. CLI audit tool from README TODO.
   Five modes: `--missing`, `--orphans`, `--duplicates`, `--sizes`, `--all`. Exits non-zero if issues found.

2. **Saved decklists + Art grid view** — added to Build page
   - `SavedDeck` dataclass in `library.py`; stored under `decklists` key in `library.json`
   - API: `GET/POST /api/decklists`, `GET/PUT/DELETE /api/decklists/<key>`
   - Left aside: name input + Save button, list of saved decks, click to load + auto-parse
   - **Art grid view**: Table/Art toggle after parsing; one tile per card; click tile → printing picker panel

3. **Removed MPC AutoFill live-search** — entire feature stripped
   - Deleted: `tools/mpcautofill.py`, `webapp/templates/settings.html`, `webapp/static/settings.js`
   - Removed: Settings nav link, `/api/settings`, `/api/mpcautofill/*`, `/api/ingest/mpcautofill-*` routes, `preferred_sources`/`autofill_url` from `Library`
   - Kept: XML import/ingest (Drive IDs), "Autofill XML" export, `tools/build_autofill_xml.py`, `tools/import_mpcfill.py`, `tools/download_drive.py`

4. **Enlarged art previews** — find pane card width 120→300px; printing picker thumb 52→160px

---

## Session: 2026-05-03 (previous, reconstructed from commits)

Headpunter + Claude working interactively; headpunter committed manually.

- **Style tags on printings** — `Printing.styles: list[str]`, gold chips on card detail. Library sidebar style filter. `POST /api/card/<slug>/printing/<pid>/styles`
- **9-up PDF export** — `tools/build_pdf.py`. Five layouts (Letter, Legal, A4, Tabloid, A3). Pillow only.
- **XML art ingest** — parse MPCFill XML, download Drive IDs. Still present.
- **Auto-fetch pinned printings** — `(set) num` in decklist + missing → "Auto-fetch N pinned from Scryfall" button
- **Token tracking** — `Card.related_tokens`, "Tokens needed" panel in Build, Find button for missing tokens
- **Token auto-fetch on ingest** — ingesting a card auto-ingests set-matched tokens via `all_parts`
- **Metadata refresh** — `POST /api/card/<slug>/refresh-metadata` + bulk `/api/library/refresh-metadata`
- **DFC support** — `Printing.is_dfc`, back face as `{pid}_b.png`
- **Cardback library** — `Cardback` dataclass, `/cardbacks` page, dropdown in Build footer for XML
- **Section header filtering** — skips Moxfield/Archidekt section words (Lands, Creatures, etc.)
- **Library search + sidebar filters** — live name search, style-chip filter
- **Windows compat** — UTF-8 stdout/stderr reconfigure; non-ASCII print() replacements
- **Pillow LANCZOS fallback** — `upscale_file()` falls back when `realesrgan-ncnn-vulkan` not installed

---

## Architecture reminders

- `library.json` is the single source of truth (no database). All Python dataclasses serialize to it.
- Thumbnails served via `/thumb/<slug>/<pid>` — no static files for art.
- Background jobs use threading + polling via `/api/job/<id>`.
- Scryfall is the only external art source (MPC AutoFill removed).
- DFC cards: front as `{pid}.png`, back as `{pid}_b.png`. `Printing.is_dfc` flag.
- Library mutations are NOT thread-safe — parallel code uses a Lock and defers `lib.save()` to the end.

---

## Open questions / possible next work

- **Art grid "Find art" UX** — missing card's "Find art →" button switches to Table view. Could stay in Art view with an overlay instead.
- **Token ingest on single-card Find** — when user ingests a card via the find pane, related tokens are NOT auto-ingested (only happens on library metadata refresh or batch ingest). Could be a UX improvement.
- **`library_inspect.py --sizes` requires Pillow** — not documented in README.
- **No automated tests** — `test_pipeline.py` exists but has a hardcoded path. Run with `PYTHONPATH=tools python test_pipeline.py` from repo root.
- **Stale branch** — `claude/implement-todo-item-UhA1Z` still exists on remote; can be deleted.

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
  app.py                  # Flask routes (~1260 lines)
  templates/
    base.html             # nav, topbar, back-to-top button
    build.html            # Build Deck page
    card.html             # card detail page
    library.html          # library grid page
    cardbacks.html        # cardbacks page
  static/
    build.js              # Build page JS (~1005 lines)
    app.js                # shared/global JS (filter, drawer, job tray, back-to-top)
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
- Static asset cache-busting: `?v={{ ver }}` where `ver` is injected via Flask `context_processor` as the current git HEAD hash
