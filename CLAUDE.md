# MTG Art Library — Claude Code Instructions

## Start of every session
1. Read `context_log.md` — it has session history, architecture notes, open questions, and repo layout.
2. Run `git log --oneline -10` to see recent commits since the log was last updated.

## End of every session (or when asked)
1. Update `context_log.md` — prepend a new session entry at the top (below the header) with:
   - Date
   - What was done (features, bugs fixed, decisions made)
   - Any new open questions or things left incomplete
2. Commit and push `context_log.md` to master.

## Key facts

- **Library root:** `$MTG_ART_LIBRARY` env var (default: `~/Documents/projects/mtg-art-library`). Not in the repo.
- **Dev server:** `cd webapp && python app.py` (or `run.sh` / `run.bat` from repo root)
- **Single source of truth:** `library.json` — no database. Python dataclasses serialize to it.
- **Library mutations are NOT thread-safe.** Parallel code uses a Lock; defer `lib.save()` to end of job.
- **Static assets use `?v={{ ver }}` cache-busting** (git HEAD hash injected via Flask context_processor). Bump this manually if the context_processor isn't running (e.g. static-file server).
- **Branch convention:** `claude/<slug>` for feature branches.
- **Default branch:** `master`
