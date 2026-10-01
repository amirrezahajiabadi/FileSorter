# Build Guide — FileSorter

## Step 1 — Install dependencies

```bash
pip install -r requirements.txt
pip install pyinstaller
cd ui
npm install
```

## Step 2 — Build the frontend (React UI)

```bash
cd ui
npm run build        # -> ui/dist/
```

The desktop app serves this build at runtime. Skip nothing — the frozen app
bundles `ui/dist` as data, so a stale frontend ships as a stale frontend.

## Step 3 — Build the app

```bash
python -m PyInstaller --clean --noconfirm FileSorter.spec
```

`FileSorter.spec` is the **single build recipe** — never build with a hand-rolled
`pyinstaller` command line. The spec owns the hidden imports, the bundled
frontend, the app icon and the Windows version resource, and everything that
needs to stay in sync with the app lives in that one place.

What it produces and why:

| Setting | Value | Reason |
| --- | --- | --- |
| Layout | **onedir** (`dist/FileSorter/` = `FileSorter.exe` + `_internal/`) | Starts like a native app. A onefile build unpacks every DLL to `%TEMP%` on each launch, which costs a visible pause and fails on locked-down machines. |
| UPX | **off** | Packed DLLs must be decompressed on every start, and packed binaries are the single largest source of antivirus false positives. |
| `optimize` | **2** | Ships bytecode with docstrings/asserts stripped: smaller archive, faster import. |
| `excludes` | short, documented list | Each entry is a hidden-import risk — `tools/smoke_test_build.py` is what proves the list is still safe. |
| Icon | `assets/icon.ico` | Generated from the app's own folder mark by `tools/make_icon.py`. |
| Version resource | `app.constants.APP_VERSION` | The exe's Details tab, the installer and the About line all follow the one version. |

Output: `dist/FileSorter/` — ship the whole folder, never the bare exe.

## Step 4 — Verify the build

```bash
python tools/smoke_test_build.py
```

This runs the real executable: the onedir layout, the version resource Windows
shows in the file's Details tab, `--autostart status` (console I/O from a
windowed binary), and the headless JSON-RPC + SSE service including its token
auth. It exits non-zero on the first shippable-blocking problem, so run it
before tagging. The release workflow runs the same script and refuses to publish
a build that fails it.

## Step 5 — Create a proper installer (optional)

Download and install **NSIS** from https://nsis.sourceforge.io, then run:

```bash
makensis installer.nsi
```

This creates `dist/FileSorter_Setup.exe` — a proper Windows installer that:

- Installs to `%LOCALAPPDATA%\FileSorter` (per-user, no admin needed)
- Creates Desktop and Start Menu shortcuts (their icon comes from the exe)
- Adds an entry to Windows "Add or Remove Programs"
- Includes an uninstaller (removes the whole tree, `_internal/` included)

**Rebuild order after any code change:**

1. `npm run build` in `ui/`
2. `python -m PyInstaller --clean --noconfirm FileSorter.spec`
3. `python tools/smoke_test_build.py`
4. `makensis installer.nsi`

The version lives in `app/constants.py` and must agree with `installer.nsi`,
`ui/package.json` and the generated string table. Check it with:

```bash
python tools/check_version_consistency.py            # lists every drifted copy
python tools/check_version_consistency.py --tag v6.2.0   # also validates a release tag
```

The same check runs in CI (and in `pytest`), so a forgotten copy fails the build
instead of shipping.
