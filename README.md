# 📁 File Sorter

[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)

A lightweight desktop application for automatically organizing files into categorized folders — with customizable rules, smart pre-sort analysis, full bilingual support, and Dark/Light themes.

**Developed by Theamirreza**

---

## ✨ Features

- Browse and select any folder with a single click
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
- Skips duplicate files safely (no overwriting)
- Preserves file metadata (`copy2`)
- Settings (categories, language, theme) persisted across sessions (`~/.filesorter_settings.json`)
- Splash screen with fade-in/out animation

---

## 🚀 Getting Started

### Run from source

**Requirements:** Python 3.8+

```bash
git clone https://github.com/amirrezahajiabadi/FileSorter.git
cd FileSorter
python main.py
```

No third-party packages required — built entirely with the Python standard library.

### Download the installer (Windows)

Go to the [Releases](https://github.com/amirrezahajiabadi/FileSorter/releases) page and download the latest `FileSorter.exe`.

---

## 🗂 Project Structure

As of v3.1.0, the app is organized as a proper Python package instead of one large file:

```
FileSorter/
├── .github/
│   └── workflows/
│       └── tests.yml             # CI — runs pytest on every push/PR
├── main.py                      # entry point — run this
├── app/
│   ├── constants.py              # APP_VERSION, default categories, thresholds
│   ├── settings_manager.py       # load/save ~/.filesorter_settings.json
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
├── requirements.txt
├── build_installer.md
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

---

## 📌 Version History

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
