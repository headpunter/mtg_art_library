#!/usr/bin/env bash
# Launch the MTG Art Library web UI.
cd "$(dirname "$0")"
exec python3 webapp/app.py "$@"
