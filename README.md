# 📁 File Sorter

> Organize your files. Reclaim your disk. Keep it running in the background.

A bilingual (فارسی / English) Windows desktop utility that sorts files into categorized
folders and helps you keep your disk clean — duplicate finder, disk-space analysis,
junk cleaner, scheduled scans, system-tray background mode, and more. Built with a
Python core and a React frontend; **zero runtime dependencies beyond `pywebview`**.

[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)
[![Build & Release](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/release.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/release.yml)
![Python](https://img.shields.io/badge/Python-3.8+-4B8BBE?logo=python&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6)
![License](https://img.shields.io/badge/License-MIT-green)

**Developed by [Theamirreza](https://github.com/amirrezahajiabadi)** 🧡

---

## ✨ Features

### Core sorting
- **Smart Analysis** — full report before sorting: file counts, total size, category breakdown, and suggestions (large files, old files, unknown extensions)
- **Dry Run preview** — see exactly what a sort would do before anything is touched
- **Copy or Move** — safe copy by default; irreversible moves are always confirmed
- **Duplicate handling** — Skip (default), Rename (keeps both), or Overwrite
- **Undo last sort** — one click reverses the previous sort
- **Real progress** — live percentage + file counter during Sort and Undo

### Utility suite
| Utility | What it does |
| --- | --- |
| 🔍 **Duplicate Finder** | Finds content-identical files (two-phase hashing) in any folder or a whole drive, deletes the copies you pick behind a two-step confirm |
| 📊 **Disk Analysis** | Shows what's eating your disk — per-category totals, size bars, largest files; scans folders or entire drives with a cancel button |
| 🗑 **Junk Cleaner** | Finds and removes temp files & caches (user temp, crash dumps, browser caches, thumbnail cache, Windows Temp), plus a **Recycle Bin** status/empty |
| 🧠 **Smart Rules** | Sorts by file *name*, not just extension — `invoice`/`فاکتور` → "Invoices"; unicode-aware whole-word matching, editable in Settings |
| 👀 **Watch Mode** | Auto-sorts newly arrived files in watched folders, live activity feed |
| ⏰ **Scheduled Tasks** | Runs junk, disk and duplicate scans on a timer on the headless service — per-task intervals, Run now, recent-runs history |
| 🪟 **Background Mode** | System-tray icon + **start with Windows** (`--autostart`) — the service is always on |

### Experience
- **Bilingual** — full Persian and English, toggle anytime
- **Dark / Light themes** — tuned palettes, every element legible in both
- **Self-hosted fonts** — no CDN, works fully offline
- Animated sorting line, toasts, Persian date formatting, recent folders, persisted settings

---

## 🚀 Quick Start (run from source)

**Requirements:** Python 3.8+, Node.js (only to build the frontend), Windows.

```bash
git clone https://github.com/amirrezahajiabadi/FileSorter.git
cd FileSorter

pip install -r requirements.txt   # pywebview (only runtime dependency)
cd ui
npm install
npm run build                     # -> ui/dist/  (the React frontend)
cd ..

python main_web.py                # launch the desktop app
```

### Run as a background utility

```bash
python main_web.py --headless                        # local service, no window
python main_web.py --headless --tray                 # service + system-tray icon
python main_web.py --headless --port 9000 --token dev  # custom port / API token
python main_web.py --autostart on|off|status         # run at login (Windows)
```

Prefer an installer? Download the latest `FileSorter_Setup.exe` from the
[Releases](https://github.com/amirrezahajiabadi/FileSorter/releases) page.

---

## 🗂 Project Structure

```
FileSorter/
├── main_web.py                  # entry point (desktop window / headless service / tray)
├── app/                         # Python core (stdio-only; UI-free business logic)
│   ├── constants.py             # APP_VERSION, defaults, thresholds
│   ├── protocol.py              # typed JSON wire contract (events, state, plans)
│   ├── controller.py            # AppController — all business logic
│   ├── sorter.py                # pure sorting logic (categories, smart rules)
│   ├── i18n.py                  # fa/en translations
│   ├── settings_manager.py      # ~/.filesorter_settings.json persistence
│   ├── api.py                   # BaseApi — shared window/web bridge
│   ├── service.py               # headless HTTP/SSE service
│   ├── disk_scan.py             # drive & folder space analysis
│   ├── duplicates.py            # duplicate finder (two-phase hashing)
│   ├── cleanup.py               # junk cleaner + recycle bin (ctypes)
│   ├── watcher.py               # watch-mode poller
│   ├── tasks.py                 # scheduled-task daemon
│   ├── tray.py                  # WinForms tray icon (pythonnet)
│   └── autostart.py             # HKCU run-at-login registration
├── ui/                          # React + Vite + TypeScript frontend (see ui/README.md)
│   └── src/
│       ├── components/          # Header, panels, modals, toasts…
│       ├── store.ts             # typed store + phase machine
│       ├── transport.ts         # pywebview bridge + browser mock
│       ├── protocol.ts          # wire types (mirror of app/protocol.py)
│       └── generated/strings.ts # generated mirror of app/i18n.py
├── tests/                       # 14 pytest suites (230+ tests)
├── .github/workflows/           # CI (tests.yml) + Build & Release (release.yml)
├── FileSorter.spec              # PyInstaller build config
├── installer.nsi                # NSIS installer script
├── build_installer.md           # full build & installer guide
├── requirements.txt
├── CHANGELOG.md                 # complete version history
├── ROADMAP.md                   # long-term direction & ideas
└── README.md
```

---

## 🧪 Testing

```bash
pip install pytest
pytest
```

**230+ tests** cover the pure logic (`sorter.py`), the controller, the wire
protocol, every utility (disk scan, duplicates, cleanup, watcher, tasks, tray,
autostart) and the headless service RPC over real HTTP. The same suite runs
automatically on every push and pull request via
[GitHub Actions](.github/workflows/tests.yml) — see the badge at the top.

The frontend additionally typechecks with strict TypeScript and builds clean:
`cd ui && npm run build`.

---

## 🛠 Building the Installer (Windows)

```bash
pip install -r requirements.txt
pip install pyinstaller
cd ui && npm install && npm run build && cd ..   # -> ui/dist/

pyinstaller FileSorter.spec                        # -> dist/FileSorter.exe
makensis installer.nsi                             # -> dist/FileSorter_Setup.exe (optional)
```

The full step-by-step guide (including the NSIS installer) lives in
[`build_installer.md`](build_installer.md).

### Releasing a new version

Pushing a version tag builds the `.exe` and publishes a GitHub Release
automatically — no manual builds:

```bash
git tag v6.1.0
git push origin v6.1.0
```

The tag must match `v` + three dot-separated numbers exactly (e.g. `v5.0.0`).

---

## 📚 Documentation

- **[CHANGELOG.md](CHANGELOG.md)** — complete version history, v1.0.0 → v6.1.0
- **[ROADMAP.md](ROADMAP.md)** — long-term direction: AI-powered analysis, desktop-utility scope, and smaller ideas
- **[ui/README.md](ui/README.md)** — frontend structure, commands, i18n workflow

## 🤝 Contributing

1. Fork the repo and create a feature branch (`feature/…`)
2. Keep changes focused — one concern per PR (the project's discipline)
3. Add tests for new logic; run `pytest` before opening the PR
4. Commits in English, descriptive, pointing at the *why*

Contributions of any size — a fixed typo, a new test, a whole feature — are welcome.

---

## 📄 License

[MIT](LICENSE) — free to use and modify.