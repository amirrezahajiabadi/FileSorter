# Build Guide — FileSorter

## Step 1 — Install dependencies

```bash
pip install -r requirements.txt
pip install pyinstaller
```

## Step 2 — Build the .exe

```bash
pyinstaller --onefile --windowed --clean --name "FileSorter" main_web.py
```

- `--onefile` → single .exe file (no extra DLLs)
- `--windowed` → no black terminal window behind the app
- `main_web.py` → builds the web UI version (with pywebview)
- Output: `dist/FileSorter.exe`

---

## Step 3 — Create a proper installer (optional)

Download and install **NSIS** from https://nsis.sourceforge.io

Then run:

```bash
makensis installer.nsi
```

This uses the `installer.nsi` script in the project root and creates
`dist/FileSorter_Setup.exe` — a proper Windows installer that:
- Installs the app to `%LOCALAPPDATA%\FileSorter` (no admin needed)
- Creates a Desktop shortcut
- Creates a Start Menu shortcut
- Adds to Windows "Add or Remove Programs"
- Includes an uninstaller

**Important:** After any code change, rebuild the exe before running makensis:
1. `pyinstaller --onefile --windowed --clean --name "FileSorter" main_web.py`
2. `makensis installer.nsi`

The version in `installer.nsi` is kept in sync with `app/constants.py` —
always update it to match when bumping the version.
