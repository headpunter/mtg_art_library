@echo off
REM Launch the MTG Art Library web UI.
REM Reads MTG_ART_LIBRARY and REALESRGAN_BIN env vars set during install.
cd /d "%~dp0"
python webapp\app.py %*
