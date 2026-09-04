# 📁 File Sorter

[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)

A lightweight desktop application for automatically organizing files into categorized folders — with customizable rules, smart pre-sort analysis, full bilingual support, and Dark/Light themes.

**Developed by Theamirreza**

---

## ✨ Features

- Browse and select any folder with a single click
- **🕘 Recent folders** — quickly re-pick one of your last 8 sorted folders
- Sorts files into categories: `images`, `documents`, `videos`, `audio`, `archives`, `code`, `data`, `ebooks`, `executables`, `fonts`, `others`
- **⚙ Settings panel** — fully customize categories and file extensions
- **🔍 Smart Analysis** — see a full report before sorting: file counts, total size, category breakdown
- **📦 Copy or Move** — sorts by copying (default, safe) or optionally moving files, with a clear warning and confirmation before anything irreversible happens
- **🔁 Duplicate handling** — choose Skip (default), Rename (keeps both), or Overwrite when a destination file already exists
- **🔍 Dry Run preview** — see exactly what a sort would do (including duplicate resolution) before anything is touched
- **↩ Undo last sort** — reverses the previous sort: restores moved files, deletes copies made by the app (files overwritten as duplicates can't be restored)
- **👀 Watch Mode** — pick folders to auto-organize; while it's on, new files are moved into the right category folder the moment they appear, with a live activity feed
- **🔍 Duplicate Finder** — scan any folder for files with identical content (two-phase hashing: size → head → full sha256, so large folders stay fast). Every group keeps one copy by default; tick the copies you want gone and delete them after a two-step confirmation — the backend only ever deletes paths its own last scan flagged
- **📊 Disk Space Analysis** — see what's eating your disk before you sort: per-category totals with a size bar breakdown and the largest files in the folder
- **🗑 Junk Cleaner** — find and remove temp files & caches in one click: user temp, crash dumps, and Chrome/Edge/Firefox/thumbnail caches. Each location shows its reclaimable size; delete behind a two-step confirm, and the backend only ever removes files its own scan flagged (files in use by an app are kept automatically)
- **🧠 Smart Rules** — sort by file *name*, not just extension: keywords like `invoice`/`فاکتور` route matching files into a category of your choice (e.g. an "Invoices" folder) before the extension rule, whole-word matching that works for Persian and English filenames. Ordered rules are edited in Settings → Smart Rules; a rule whose category was deleted quietly deactivates
- **💡 Smart Suggestions** — flags large files (>100MB), old files (>1 year), and unknown extensions
- **🌐 Bilingual UI** — full Persian (فارسی) and English support, toggle anytime with one click
- **🎨 Dark / Light theme** — each mode has its own tuned color palette (Catppuccin Mocha-inspired dark mode) so every button and badge stays legible and "belongs" to that mode
- Real-time operation log with color-coded status messages
- Live counter for copied / skipped / error files
- **Real progress bar** during Sort and Undo — shows percentage and file count, not just a spinner
- Skips duplicate files safely (no overwriting)
- Preserves file metadata (`copy2`)
- Settings (categories, language, theme, recent folders) persisted across sessions (`~/.filesorter_settings.json`)
- Splash screen with fade-in/out animation

---

## 🚀 Getting Started

### Run from source

**Requirements:** Python 3.8+ and Node.js (only needed for building the frontend)

```bash
git clone https://github.com/amirrezahajiabadi/FileSorter.git
cd FileSorter
pip install -r requirements.txt
cd ui
npm install
npm run build          # -> ui/dist/  (the React frontend)
cd ..
python main_web.py
```

The app is a PyWebView window running a React + Vite + TypeScript
frontend (`ui/`) over a local HTTP server. The Python side is built
almost entirely on the standard library — pywebview is the only runtime
dependency. No internet access is needed at runtime: fonts are
self-hosted and everything runs locally.

### Download the installer (Windows)

Go to the [Releases](https://github.com/amirrezahajiabadi/FileSorter/releases) page and download the latest `FileSorter.exe`.
---

## 🗂 Project Structure

As of v3.1.0, the app is organized as a proper Python package instead of one large file:

```
FileSorter/
├── .github/
│   └── workflows/
│       ├── tests.yml             # CI — runs pytest on every push/PR
│       └── release.yml           # builds the frontend + .exe, publishes a Release on version tags
├── main_web.py                  # entry point — run this
├── app/
│   ├── constants.py              # APP_VERSION, default categories, thresholds
│   ├── protocol.py               # typed JSON wire contract (events, state, plans)
│   ├── settings_manager.py       # load/save ~/.filesorter_settings.json
│   ├── controller.py             # AppController — all business logic, UI-free
│   ├── sorter.py                 # pure sorting logic — get_category, analyze_folder...
│   └── i18n.py                   # STRINGS (fa/en translations)
├── tests/
│   ├── test_sorter.py            # pytest suite for app/sorter.py
│   ├── test_duplicate_handling.py # pytest suite for resolve_duplicate/plan_sort
│   ├── test_recent_folders.py    # pytest suite for the recent-folders helper
│   ├── test_controller.py        # pytest suite for AppController (sort/undo/settings)
│   ├── test_protocol.py          # pytest suite for the wire protocol round-trips
│   └── test_web_api.py           # pytest suite for main_web.py Api class
├── ui/                           # React UI (pywebview) — see ui/README.md
│   ├── src/
│   │   ├── components/            # Header, FolderPicker, modals, panels…
│   │   ├── store.ts               # Typed external store + phase machine
│   │   ├── transport.ts           # pywebview bridge + browser mock
│   │   ├── protocol.ts            # Wire types (mirror of app/protocol.py)
│   │   └── generated/strings.ts   # Generated mirror of app/i18n.py
│   ├── scripts/export_i18n.py     # Regenerates the strings mirror
│   └── package.json
└── requirements.txt

```
`app/sorter.py` has no UI dependency, so its logic is fully unit-tested — see [Running Tests](#-running-tests).

---

## 🧪 Running Tests

```bash
pip install pytest
pytest
```

Tests cover:
- `app/sorter.py` — categorization, folder analysis, suggestions, size formatting (pure logic, no UI dependency)
- `app/controller.py` — AppController (sort, undo, settings, analyze)
- `main_web.py` — Web UI API layer (bridges JS ↔ AppController)
- Duplicate handling and recent folders helpers

These same tests run automatically on every push and pull request via [GitHub Actions](.github/workflows/tests.yml) — see the badge at the top of this page.

---

## 🗂 Output Structure

```
your-folder/
└── sorted/
    ├── images/
    ├── documents/
    ├── videos/
    ├── audio/
    ├── archives/
    ├── code/
    ├── data/
    ├── ebooks/
    ├── executables/
    ├── fonts/
    └── others/
```

---

## 🛠 Build Executable (Windows)

```bash
pip install -r requirements.txt
pip install pyinstaller
cd ui && npm install && npm run build && cd ..   # -> ui/dist/
pyinstaller --onefile --windowed --clean --name "FileSorter" --add-data "ui/dist;ui/dist" main_web.py
```

The `.exe` will be in the `dist/` folder. See `build_installer.md` for the full step-by-step guide.

This manual build is mainly useful for local testing. For an official release, see below — it's automated.

---

## 🚀 Releasing a New Version

Pushing a version tag builds `FileSorter.exe` and publishes a GitHub Release automatically — no manual PyInstaller build or file upload needed.

```bash
git checkout main
git pull origin main
git tag v5.0.0
git push origin v5.0.0
```

**The tag must exactly match `v` + three dot-separated numbers** (e.g. `v5.0.0`) — anything else (`V.3.6`, `v3.6`, `version1`) will not trigger the [Build & Release workflow](.github/workflows/release.yml). Check progress under the repo's **Actions** tab; when it finishes, the new release with `FileSorter.exe` attached appears under **Releases**.

---

## 📌 Version History

> Looking for what's planned further out (AI features, a possible UI overhaul, expanding beyond file sorting)? See [ROADMAP.md](ROADMAP.md).

- **v6.1.0** — **System-Wide Cleanup.** The Junk Cleaner gains a **System-wide** section and the **Recycle Bin**: Windows Temp (`C:/Windows/Temp`) now flows through the same scan/whitelist machinery as user junk, with unreadable sub-directories skipped silently and per-file deletions that need elevation reported and kept — the honest partial-result pattern from the drive scans. A new Recycle Bin block queries the shell (`SHQueryRecycleBinW`) for its real item count and size and empties it behind the existing two-step armed confirm (`SHEmptyRecycleBinW`), labeled in the app's language. Zero new dependencies (`app/cleanup.py`, 9 new tests); live-verified against a real bin holding 27 items / 2.1 GB (queried, not emptied).

- **v6.0.0** — **Always-On Background Mode.** The headless service now runs as a real background utility: `python main_web.py --headless --tray` keeps it under a **Windows system-tray icon** (`app/tray.py`) — a native WinForms NotifyIcon driven through pythonnet (already required by the windowed app, so still zero new dependencies) with *open in browser*, a *start with Windows* toggle, and a clean *quit*; the icon labels follow the app's saved language. `python main_web.py --autostart on|off|status` (`app/autostart.py`) manages the silent run-at-login entry in the HKCU Run key — launched via pythonw from source, or the packaged exe when frozen — so the service and its scheduled tasks come up by themselves at boot, no admin rights. Verified live: the real HKCU entry round-tripped on→off cleanly and a tray-mode service served requests through the full icon message pump. 25 new tests; zero new dependencies; the windowed app is untouched.

- **v5.9.0** — **Scheduled Tasks.** The headless service now runs its own scan utilities on a timer: a daemon tick loop (`app/tasks.py`) fires due tasks and a new **Scheduled** header panel adds, pauses and deletes tasks for three kinds — junk check, disk-space scan and duplicate scan — each on its own interval (30 min to weekly), with **Run now** and a session **Recent runs** history. Tasks persist in the settings file, run one at a time with a lock guard, and stream completion back over SSE (`sched_event`) so the panel updates live. Verified live: a daily cleanup task ran on demand and reported a real 11,537-file / 2.3 GB junk scan over the service. 11 new tests; zero new dependencies.
- **v5.8.0** — **Drive-Wide Duplicate Scanning.** The Duplicates panel now lists your real drives and can scan a whole drive for content-identical files — the same two-phase hashing as the per-folder scan, walking unreadable system dirs silently, with a **Cancel scan** button that stops at the next file boundary and shows partial results (`app/duplicates.py` gains a `cancel_event`, shared with the disk scan). Verified live: a folder scan found 3 groups / 14 extra copies / 1.1 MB, and a cancelled whole-drive scan reported honestly. 4 new tests; zero new dependencies.
- **v5.7.0** — **Drive-Wide Disk Analysis.** The Storage panel now lists your real drives (letter, free/total, usage bar) and can scan an entire drive, not just a folder: walked end-to-end with unreadable system directories skipped silently, streamed over the same typed protocol (`space_progress`), with a **Cancel scan** button — the walk stops at the next file boundary and shows the honest partial results marked as cancelled (`app/disk_scan.py`: `list_drives()` + a `cancel_event` for `scan_space`). Live-verified against a real 221.8 GB drive scan. 7 new tests; zero new dependencies.
- **v5.6.0** — **Headless Service.** The app's brain now runs with no window at all: `python main_web.py --headless` serves the same React UI and the same JSON vocabulary over a loopback HTTP server (`app/service.py`) — JSON-RPC via `POST /api` plus a Server-Sent Events stream on `/events` for live progress, protected by a per-run API token injected into the page, so no other local process or webpage can drive the sorter. The windowed app keeps the pywebview bridge, now a thin subclass of the shared `BaseApi` (`app/api.py`). The browser preview can now run against the real backend, and this is the foundation the roadmap's drive-wide scans, scheduled runs, always-on watch and AI module build on. 13 new tests; zero new dependencies.
- **v5.5.0** — **Smart Rules.** Sort by what a file *is called*, not only its type: ordered `{keywords → category}` rules match whole words in the filename stem (unicode-aware, so `فاکتور` matches «فاکتور-۱۴۰۳.pdf» the same way `invoice` matches `Invoice-2024.pdf`), and a matching rule wins over the extension fallback. Rules flow through analysis, dry-run, the real sort and Watch mode alike (`app/sorter.py` → `AppController` → watcher), and are edited in a new Settings → Smart Rules tab with reordering. A rule whose target category gets deleted deactivates itself instead of erroring. 22 new tests; the browser demo sample gained `invoice-2024.pdf`/«فاکتور-1403.pdf» files so the re-routing is visible live.
- **v5.4.0** — **Junk Cleaner.** A new panel that scans well-known *user-scope* junk locations (user temp, crash dumps, Chrome/Edge/Firefox caches, thumbnail cache) and shows exactly how much space each holds. Locations are checked by default with per-row selection; deletion is a two-step armed confirm and the backend deletes only what its own scan flagged (`app/cleanup.py`, 12 tests) — files in use by an app are reported and kept. Also fixes a real desktop bug where duplicate/disk scans never emitted their terminal done event, leaving those panels stuck on the "scanning" state in the packaged app.
- **v5.3.0** — **Disk Space Analysis.** A new utility panel (Storage) that walks any folder and shows what's actually eating the disk: total files/bytes, a per-category bar breakdown with live percentages, and a largest-files table. Scans stream through the typed JSON protocol (`space_progress` / `space_done`) so the UI stays responsive on big folders; pure-stdlib walk (`app/disk_scan.py`), 8 new tests.
- **v5.2.0** — **Duplicate Finder.** A new utility panel that scans a folder for files with identical content using two-phase hashing (size → first 64KB → full sha256) so large folders stay fast. Each duplicate group keeps one copy by default — you tick the copies to remove (the last keeper is always locked) and delete behind a two-step armed confirmation. The backend only ever deletes paths its own last scan flagged (`app/duplicates.py`), 10 new tests.
- **v5.1.0** — **Watch Mode (auto-sort folders).** Pick folders (browse, or watch the currently selected one) and while Watch is on, a background poller moves newly appeared files into the right category folder the moment they show up — duplicates are skipped, locked files are retried with a quiet backoff, and every decision lands in a live activity feed with per-folder counters. Watch list is persisted across restarts (watcher itself runs while the app is open — a headless service is the planned FastAPI-stage follow-up). Pure-stdlib polling (`app/watcher.py`), 11 new tests.
- **v5.0.0** — 🎉 **Web-only official release.** The old Tkinter UI (`main.py`, `app/ui/`, `app/themes.py`) is removed entirely — `main_web.py` + the React frontend is the only interface. Also in this release: a typed JSON wire protocol shared by the Python core and the frontend (`app/protocol.py` ⟷ `ui/src/protocol.ts`); the vanilla `web/` frontend retired in favor of the React rebuild (`ui/`, Vite + TypeScript); honest fixes to the v4.2 screens (full undo data, truthful results actions, no fake cancel, no fake drag & drop); category names/icons persisted across restarts; and a release pipeline that builds the React frontend into the shipped `.exe`.

- **v4.2.0** — First *real* Web UI screen (Phase 3 of [ROADMAP.md](ROADMAP.md), still parallel to the Tkinter app — run with `python main_web.py`, requires `pip install pywebview`). Features include: real folder picker, Sort (copy/move mode), duplicate handling (skip/rename/overwrite), Dry Run preview, Undo, Settings (categories), recent folders, theme toggle (dark/light), bilingual support (fa/en), self-hosted fonts (no CDN dependency), toast notifications, sorting animations, and Persian date formatting — all wired to the actual `AppController`.
- **v4.1.1** — No user-facing changes. Finalized the web UI's visual identity: "Sorting Line" — a distinct design deliberately grounded in what the app does (files moving into labeled bins), not a port of the Tkinter look. Replaced the auto-generated palette from v4.1.0 with a hand-authored one (colors no longer need to match Tkinter — see `web/README.md` for why), and self-hosted three font families (Space Grotesk, Inter, JetBrains Mono) so the app doesn't depend on internet access to render its own UI.
- **v4.1.0** — No user-facing changes. Added the `web/` folder structure for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)): a placeholder page, base styles, and — most importantly — `scripts/generate_theme_css.py`, which generates the web frontend's dark/light color palette directly from `app/themes.py` so the two can never drift out of sync. Verified pixel-for-pixel against the real theme colors.
- **v4.0.0** — No user-facing changes. Added a throwaway PyWebView proof-of-concept (`poc/webview_poc.py`, not part of the shipped app) that confirms a real HTML/JS UI can drive the actual `AppController` — the technical foundation for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)). See `poc/README.md`.
- **v3.9.0** — Extracted all business logic (analyze, sort, undo, settings) into `app/controller.py`, a Tkinter-free `AppController` class. `app/ui/main_window.py` is now a thin adapter that builds widgets and translates controller events into UI updates — no functional changes, but this is the foundation for the planned UI overhaul (see [ROADMAP.md](ROADMAP.md)), since a future web-based UI can now drive the exact same logic without touching Tkinter. Added 17 new tests for `AppController` — sort/undo logic is now fully testable without any GUI dependency.
- **v3.8.0** — Replaced the indeterminate "spinning" progress bar with a real one during Sort and Undo: shows an actual percentage and "X / Y files" count, updated live as each file is processed
- **v3.7.1** — Fixed the Analysis window: when there were enough smart suggestions or categories to exceed the window's fixed height, the "Proceed with Sort" / "Cancel" buttons could get pushed out of view with no way to reach them. The content area now scrolls (mouse wheel supported) while those buttons stay permanently visible at the bottom.
- **v3.7.0** — Added drag & drop folder selection and a Recent Folders list (last 8, persisted). First release with a runtime dependency (`tkinterdnd2`, optional — the app still works without it, just without drag & drop)
- **v3.6.1** — Fixed a bug where sorting large or numerous files could silently stop after processing only a few (or one) file — background operations now communicate with the UI exclusively through a thread-safe queue instead of touching Tkinter directly from a worker thread, which turned out to be unreliable under load. Affects sorting, Undo, and the Dry Run preview.
- **v3.6.0** — Added an automated Build & Release workflow: pushing a version tag (e.g. `v5.0.0`) runs the tests, builds `FileSorter.exe`, and publishes a GitHub Release with the exe attached — no more manual PyInstaller builds or file uploads
- **v3.5.0** — Added duplicate-handling modes (Skip/Rename/Overwrite), a Dry Run preview that shows the exact planned outcome before sorting, and an Undo button that reverses the last sort. Preview and real execution now share one function (`plan_sort`) so they can never disagree.
- **v3.4.0** — Added an optional "Move instead of copy" mode in the Analysis window (unchecked/Copy by default), with a warning and a confirmation dialog before any irreversible move happens
- **v3.3.0** — Added GitHub Actions CI: `pytest` now runs automatically on every push and pull request to `main`, with a status badge in this README
- **v3.2.0** — Added a pytest suite for `app/sorter.py` (23 tests); fixed a few stray leftover comments from the v3.1.0 refactor; restored docs that had reverted to the old `file_sorter_app.py` filename during a merge
- **v3.1.0** — Refactored from a single 1200-line file into a proper package (`app/`, `app/ui/`) with clear module boundaries; entry point moved to `main.py`; no functional/UI changes
- **v3.0.0** — Bilingual UI (Persian/English), Dark/Light theme system with tuned palettes, full widget rebuild on toggle, settings now persist language & theme
- **v2.0.0** — Settings panel, Smart Analysis & Suggestions, modern light theme, more categories
- **v1.0.0** — Initial release: basic sorting, dark theme, splash screen

---

## 📄 License

MIT License — free to use and modify.
