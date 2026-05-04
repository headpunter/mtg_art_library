# MTG Art Library

A personal, curated library of upscaled, print-ready Magic card art. Build it
once by ingesting your favorite printings (from Scryfall, MPCFill, custom
generations, whatever), then generate MPC uploads, MPCFill XML, or print-at-home
PDFs from any decklist using your library art.

## Layout

```
~/Documents/projects/mtg-art-library/
├── art/
│   ├── sol_ring/
│   │   ├── cmm_366.png        # 2192×2992 finished file (800 DPI w/ bleed)
│   │   └── custom_futurama.png
│   └── lightning_bolt/
│       └── lea_161.png
├── library.json               # the index
└── tools/
    ├── library.py             # shared core (paths, schema, name normalization)
    ├── bleed.py               # bleed application
    ├── scryfall.py            # Scryfall API wrapper
    ├── upscaler.py            # realesrgan-ncnn-vulkan wrapper
    ├── decklist.py            # decklist parsing
    ├── add_card.py            # ingestion CLI
    ├── library_inspect.py     # audit: missing files, orphans, duplicates, size check
    ├── build_mpc.py           # decklist + library → zip of MPC-ready PNGs
    ├── build_autofill_xml.py  # decklist + library → MPC AutoFill XML
    └── build_pdf.py           # decklist + library → 9-up PDF for home printing
```

Every file in `art/` is at the canonical size (2192×2992, 800 DPI, with
mirror bleed by default), no exceptions. Build scripts later just pluck files
out by slug.

## One-time setup

1. **Install Python deps:**
   ```
   pip install requests Pillow
   ```

2. **Download `realesrgan-ncnn-vulkan`:**
   - Get the latest release zip from
     https://github.com/xinntao/Real-ESRGAN/releases
   - Extract somewhere like `C:\tools\realesrgan\`
   - The folder will contain `realesrgan-ncnn-vulkan.exe` and a `models/` subfolder

3. **Set environment variables (Windows PowerShell):**
   ```powershell
   [Environment]::SetEnvironmentVariable('REALESRGAN_BIN',
     'C:\tools\realesrgan\realesrgan-ncnn-vulkan.exe', 'User')
   [Environment]::SetEnvironmentVariable('MTG_ART_LIBRARY',
     "$env:USERPROFILE\Documents\projects\mtg-art-library", 'User')
   ```
   Restart your terminal after this.

4. **Test it:**
   ```
   python tools/add_card.py --scryfall "Sol Ring"
   ```
   First run takes a minute (~60s) per card; the upscaler initializes once.
   Subsequent cards run in ~3-5 seconds each on a 3090.

## Usage

### Add a single card

```
python tools/add_card.py --scryfall "Sol Ring"
python tools/add_card.py --scryfall "Sol Ring" --set cmm --num 366 --make-default
python tools/add_card.py --scryfall "Plains" --set unh --num 174 --bleed black
```

### Add a custom or pre-made image

```
python tools/add_card.py --file ~/Downloads/sol_ring_mpcfill.png --as "Sol Ring" --tag mpcfill_v1
python tools/add_card.py --file ~/gemini/sol_ring.png --as "Sol Ring" --tag futurama
```

The script auto-detects whether the input is face-only or has bleed already,
and skips upscaling if the input is already large enough. Use `--has-bleed` /
`--no-bleed` to override the detection.

### Bulk ingest from a decklist

```
python tools/add_card.py --decklist mydeck.txt --skip-existing
```

Reads each line, fetches the indicated printing (or default), and saves it.
Per-card overrides in the decklist (`1 Sol Ring (cmm) 366`) are honored. Saves
after each card so you can interrupt and resume.

## Configuration

| Env var          | What it does                              | Default |
|------------------|-------------------------------------------|---------|
| `MTG_ART_LIBRARY` | library root path                        | `~/Documents/projects/mtg-art-library` |
| `REALESRGAN_BIN`  | path to realesrgan-ncnn-vulkan executable | (must be set) |
| `REALESRGAN_MODEL`| upscaler model name                      | `realesrgan-x4plus` |
| `REALESRGAN_SCALE`| upscale factor                           | `4` |

For mostly-anime/illustration art, set `REALESRGAN_MODEL=realesrgan-x4plus-anime`.

### Inspect / audit the library

```
python tools/library_inspect.py               # summary (cards, printings, disk usage)
python tools/library_inspect.py --missing     # printings with no art file on disk
python tools/library_inspect.py --orphans     # art files not referenced by the index
python tools/library_inspect.py --duplicates  # duplicate Scryfall IDs across printings
python tools/library_inspect.py --sizes       # files not at canonical dimensions
python tools/library_inspect.py --all         # run all checks; exits non-zero if issues found
```
