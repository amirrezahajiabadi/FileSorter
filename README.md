# 📁 File Sorter

[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)

A lightweight desktop application for automatically organizing files into categorized folders — with customizable rules, smart pre-sort analysis, full bilingual support, and Dark/Light themes.

**Developed by Theamirreza**

---

## ✨ Features

- Browse and select any folder with a single click, or **drag & drop a folder** onto the window
- **🕘 Recent folders** — quickly re-pick one of your last 8 sorted folders
- Sorts files into categories: `images`, `documents`, `videos`, `audio`, `archives`, `code`, `data`, `ebooks`, `executables`, `fonts`, `others`
- **⚙ Settings panel** — fully customize categories and file extensions
- **🔍 Smart Analysis** — see a full report before sorting: file counts, total size, category breakdown
- **📦 Copy or Move** — sorts by copying (default, safe) or optionally moving files, with a clear warning and confirmation before anything irreversible happens
- **🔁 Duplicate handling** — choose Skip (default), Rename (keeps both), or Overwrite when a destination file already exists
- **🔍 Dry Run preview** — see exactly what a sort would do (including duplicate resolution) before anything is touched
- **↩ Undo last sort** — reverses the previous sort: restores moved files, deletes copies made by the app (files overwritten as duplicates can't be restored)
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

**Requirements:** Python 3.8+

```bash
git clone https://github.com/amirrezahajiabadi/FileSorter.git
cd FileSorter
pip install -r requirements.txt
python main.py
```

The app is built mostly with the Python standard library. The one dependency,
[`tkinterdnd2`](https://pypi.org/project/tkinterdnd2/), enables drag & drop —
it's optional: without it, the app runs the same, just without drag & drop.

### Download the installer (Windows)

Go to the [Releases](https://github.com/amirrezahajiabadi/FileSorter/releases) page and download the latest `FileSorter.exe`.

### Preview the in-progress Web UI

```bash
pip install pywebview
python main_web.py
```

This is a **separate, parallel** entry point — `main.py` (the Tkinter app
above) is still the real, shipped app. See [ROADMAP.md](ROADMAP.md) for
where this is headed and `web/README.md` for the design system.

---

## 🗂 Project Structure

As of v3.1.0, the app is organized as a proper Python package instead of one large file:

```
FileSorter/
├── .github/
│   └── workflows/
│       ├── tests.yml             # CI — runs pytest on every push/PR
│       └── release.yml           # builds .exe + publishes a Release on version tags
├── main.py                      # entry point — run this
├── main_web.py                  # Web UI entry point (in progress, parallel to main.py — see ROADMAP.md)
├── app/
│   ├── constants.py              # APP_VERSION, default categories, thresholds
│   ├── settings_manager.py       # load/save ~/.filesorter_settings.json
│   ├── controller.py             # AppController — all business logic, zero Tkinter
│   ├── sorter.py                 # pure sorting logic (no UI) — get_category, analyze_folder...
│   ├── i18n.py                   # STRINGS (fa/en) + language helpers
│   ├── themes.py                 # THEMES (dark/light) + ttk styling
│   └── ui/
│       ├── splash.py             # startup splash screen
│       ├── settings_window.py    # category/extension editor
│       ├── analysis_window.py    # pre-sort report window
│       ├── preview_window.py     # dry-run preview window
│       └── main_window.py        # FileSorterApp — the main window
├── tests/
│   └── test_sorter.py            # pytest suite for app/sorter.py
│   └── test_duplicate_handling.py # pytest suite for resolve_duplicate/plan_sort
│   └── test_recent_folders.py    # pytest suite for the recent-folders helper
│   └── test_controller.py        # pytest suite for AppController (sort/undo/settings)
├── requirements.txt
├── build_installer.md
├── README.md
├── web/                          # Phase 3 UI overhaul lives here — see web/README.md
│   ├── index.html                 # design preview ("Sorting Line" identity) — not a real screen yet
│   ├── css/
│   │   ├── design-tokens.css      # hand-authored colors, see web/README.md
│   │   ├── fonts.css               # @font-face for the self-hosted fonts
│   │   └── base.css
│   ├── fonts/                      # self-hosted .woff2 fonts + OFL licenses
│   └── js/
│       └── app.js
└── poc/                          # throwaway experiments for the roadmap (not shipped)
    ├── webview_poc.py             # v4.0 — PyWebView + AppController proof of concept
    └── README.md
```

`app/sorter.py` has no Tkinter dependency, so its logic is fully unit-tested — see [Running Tests](#-running-tests).

---

## 🧪 Running Tests

```bash
pip install pytest
pytest
```

Tests cover `app/sorter.py` (categorization, folder analysis, suggestions, size formatting) since it's pure logic with no UI dependency.

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
pip install pyinstaller
pyinstaller --onefile --windowed --clean --name "FileSorter" main.py
```

The `.exe` will be in the `dist/` folder.

This manual build is mainly useful for local testing. For an official release, see below — it's automated.

---

## 🚀 Releasing a New Version

Pushing a version tag builds `FileSorter.exe` and publishes a GitHub Release automatically — no manual PyInstaller build or file upload needed.

```bash
git checkout main
git pull origin main
git tag v3.6.0
git push origin v3.6.0
```

**The tag must exactly match `v` + three dot-separated numbers** (e.g. `v3.6.0`) — anything else (`V.3.6`, `v3.6`, `version1`) will not trigger the [Build & Release workflow](.github/workflows/release.yml). Check progress under the repo's **Actions** tab; when it finishes, the new release with `FileSorter.exe` attached appears under **Releases**.

---

## 📌 Version History

> Looking for what's planned further out (AI features, a possible UI overhaul, expanding beyond file sorting)? See [ROADMAP.md](ROADMAP.md).

- **v4.2.0** — First *real* Web UI screen (Phase 3 of [ROADMAP.md](ROADMAP.md), still parallel to the Tkinter app — run with `python main_web.py`, requires `pip install pywebview`). Real folder picker, real Sort (copy mode), recent folders, and theme toggle — all live, wired to the actual `AppController`, with progress and log updates pushed to the page in real time as files are processed. Move mode, duplicate handling, Dry Run, Undo, and Settings are not in this screen yet — planned for v4.3/v4.4.
- **v4.1.1** — No user-facing changes. Finalized the web UI's visual identity: "Sorting Line" — a distinct design deliberately grounded in what the app does (files moving into labeled bins), not a port of the Tkinter look. Replaced the auto-generated palette from v4.1.0 with a hand-authored one (colors no longer need to match Tkinter — see `web/README.md` for why), and self-hosted three font families (Space Grotesk, Inter, JetBrains Mono) so the app doesn't depend on internet access to render its own UI.
- **v4.1.0** — No user-facing changes. Added the `web/` folder structure for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)): a placeholder page, base styles, and — most importantly — `scripts/generate_theme_css.py`, which generates the web frontend's dark/light color palette directly from `app/themes.py` so the two can never drift out of sync. Verified pixel-for-pixel against the real theme colors.
- **v4.0.0** — No user-facing changes. Added a throwaway PyWebView proof-of-concept (`poc/webview_poc.py`, not part of the shipped app) that confirms a real HTML/JS UI can drive the actual `AppController` — the technical foundation for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)). See `poc/README.md`.
- **v3.9.0** — Extracted all business logic (analyze, sort, undo, settings) into `app/controller.py`, a Tkinter-free `AppController` class. `app/ui/main_window.py` is now a thin adapter that builds widgets and translates controller events into UI updates — no functional changes, but this is the foundation for the planned UI overhaul (see [ROADMAP.md](ROADMAP.md)), since a future web-based UI can now drive the exact same logic without touching Tkinter. Added 17 new tests for `AppController` — sort/undo logic is now fully testable without any GUI dependency.
- **v3.8.0** — Replaced the indeterminate "spinning" progress bar with a real one during Sort and Undo: shows an actual percentage and "X / Y files" count, updated live as each file is processed
- **v3.7.1** — Fixed the Analysis window: when there were enough smart suggestions or categories to exceed the window's fixed height, the "Proceed with Sort" / "Cancel" buttons could get pushed out of view with no way to reach them. The content area now scrolls (mouse wheel supported) while those buttons stay permanently visible at the bottom.
- **v3.7.0** — Added drag & drop folder selection and a Recent Folders list (last 8, persisted). First release with a runtime dependency (`tkinterdnd2`, optional — the app still works without it, just without drag & drop)
- **v3.6.1** — Fixed a bug where sorting large or numerous files could silently stop after processing only a few (or one) file — background operations now communicate with the UI exclusively through a thread-safe queue instead of touching Tkinter directly from a worker thread, which turned out to be unreliable under load. Affects sorting, Undo, and the Dry Run preview.
- **v3.6.0** — Added an automated Build & Release workflow: pushing a version tag (e.g. `v3.6.0`) runs the tests, builds `FileSorter.exe`, and publishes a GitHub Release with the exe attached — no more manual PyInstaller builds or file uploads
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
