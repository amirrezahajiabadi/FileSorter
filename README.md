# 📁 File Sorter (v6.3.0)

> **High-Performance Desktop File Organizer & Disk Reclamation Suite**  
> *Fast, lightweight desktop file organizer and smart disk cleanup suite*

[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)
[![Build & Release](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/release.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/release.yml)
![Version](https://img.shields.io/badge/Version-6.3.0-blue.svg)
![Python](https://img.shields.io/badge/Python-3.8+-4B8BBE?logo=python&logoColor=white)
![Rust](https://img.shields.io/badge/Rust-Tauri_2.0-DEA584?logo=rust&logoColor=white)
![React](https://img.shields.io/badge/React-18_TypeScript-61DAFB?logo=react&logoColor=black)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green.svg)

**Developed by [HajAmir (Theamirreza)](https://github.com/amirrezahajiabadi)** 🧡

---

## 🌟 What's New in v6.3.0

- 🌐 **English-Only UI:** Clean, unified internationalized interface across both the React desktop frontend and Tauri v2 frontend.
- ✨ **Typography Overhaul:** Streamlined font stack centered on Manrope, Inter, Space Grotesk, and JetBrains Mono with optimized asset bundles.
- 🧹 **Codebase Simplification:** Cleaned up bilingual toggles, string tables, and category metadata for leaner runtime performance.
- 🧪 **Full Test Coverage:** 270+ automated tests passing with 100% version consistency validation.

---

## ✨ Key Features

### 🗂️ Core File Organization
- **Smart Analysis & Dry Run:** Full report before moving any file: counts, sizes, category breakdown, and suggestions.
- **Copy or Move:** Safe copy by default; irreversible moves always require confirmation.
- **Collision Protection:** Rename (e.g. `file (1).ext`), skip, or overwrite policies prevent accidental data loss.
- **One-Click Undo:** Full rollback of the previous sort operation using journaled path records.
- **Custom Categories & Smart Rules:** Extensible file extension rules and Unicode-aware keyword matching (e.g. `invoice`).

### 🔍 System & Disk Utilities
- **Content-Identical Duplicate Finder:** Two-phase hashing (quick prefix + full SHA-256) detects duplicates across folders and drives with bulk-selection and trash management.
- **Disk Space Analysis:** Visual inspection of space consumed by file types and oversized files.
- **Junk Cleaner:** Recovers gigabytes from user temp, crash dumps, thumbnail caches, and Windows temp files, plus native Recycle Bin management.
- **Watch Mode & Daemon:** Background folder monitoring with instant sorting on new file arrivals.
- **System Tray & Autostart:** Seamless integration into Windows startup (`--autostart`) with headless JSON-RPC + SSE architecture.

---

## 🚀 Quick Start

### Option A: Run Native Tauri 2 (Recommended for maximum speed)
```bash
# Clone the repository
git clone https://github.com/amirrezahajiabadi/FileSorter.git
cd FileSorter/v2

# Install dependencies and launch desktop app
npm install
npm run tauri dev
```

### Option B: Run Python Core + React Web UI
```bash
cd FileSorter
pip install -r requirements.txt

# Build UI
cd ui
npm install
npm run build
cd ..

# Launch Desktop App
python main_web.py
```

### Background Headless Service
```bash
python main_web.py --headless                        # Headless local service
python main_web.py --headless --tray                 # Service + System Tray icon
python main_web.py --autostart on|off|status         # Run at Windows startup
```

---

## 🗂️ Repository Structure

```
FileSorter/
├── app/                         # Python business logic & service core
│   ├── controller.py            # Central coordinator for sort/scan/undo
│   ├── sorter.py                # Pure sorting logic & category matcher
│   ├── duplicates.py            # SHA-256 duplicate detection engine
│   ├── disk_scan.py             # Folder and drive analyzer
│   ├── cleanup.py               # System junk cleaner & recycle bin
│   └── service.py               # Headless JSON-RPC + SSE loopback server
├── v2/                          # Native Tauri 2.0 + Rust architecture
│   ├── src-tauri/               # Rust native backend
│   │   ├── src/categories.rs    # Category persistence & matching
│   │   ├── src/dupes.rs         # Multithreaded duplicate scanner
│   │   ├── src/plan.rs          # Collision-safe plan generator
│   │   ├── src/walk.rs          # Fast parallel directory walker
│   │   └── src/undo.rs          # Journal-backed undo engine
│   └── src/                     # React + TypeScript frontend
│       ├── App.tsx              # Craft UI with dual-theme & tabs
│       └── index.css            # Tactile micro-animations & craft design tokens
├── ui/                          # React + PyWebView frontend
├── tests/                       # 16 pytest test suites (280+ tests)
├── tools/                       # Build validation & version consistency tools
├── .github/                     # GitHub Actions CI/CD workflows & issue templates
├── docs/                        # Complete technical documentation & changelog
│   ├── CHANGELOG.md             # Complete version changelog
│   ├── ROADMAP.md               # Architecture roadmap
│   └── build_installer.md       # NSIS installer build guide
├── FileSorter.spec              # PyInstaller onedir packaging specification
├── installer.nsi                # NSIS installer script
└── requirements.txt             # Python dependencies
```

---

## 🧪 Testing & Validation

```bash
# Python Backend Test Suite (280+ tests)
pytest -v

# Rust Tauri Engine Tests (16 unit tests)
cd v2/src-tauri
cargo test

# Version Consistency Verification
python tools/check_version_consistency.py --tag v6.2.0
```

---

## 📦 Releases & GitHub Actions CI/CD

Pre-compiled standalone executables and NSIS installers are published automatically upon pushing a semantic version tag:

```bash
git tag v6.2.0
git push origin v6.2.0
```

GitHub Actions executes the full validation matrix, creates the optimized frozen package, and attaches release assets directly to [GitHub Releases](https://github.com/amirrezahajiabadi/FileSorter/releases).

---

## 🤝 Contributing

1. Fork the repository
2. Create a focused feature branch (`git checkout -b feature/amazing-feature`)
3. Ensure all tests pass (`pytest` and `cargo test`)
4. Commit your changes with descriptive messages (`git commit -m 'feat: add amazing feature'`)
5. Push to your branch and open a Pull Request

---

## 📄 License

Distributed under the [MIT License](LICENSE).
