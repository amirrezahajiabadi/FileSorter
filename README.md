# 📁 File Sorter

> **Fast, modern native desktop file organizer & smart disk cleanup utility for Windows.**

[![Release](https://img.shields.io/github/v/release/amirrezahajiabadi/FileSorter?color=blue)](https://github.com/amirrezahajiabadi/FileSorter/releases/latest)
[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🌟 Flagship Edition: FileSorter v2 (Tauri 2 + Rust)

As of **v6.6.0 (Phase 1 Roadmap)**, the **Tauri 2 + Rust native application** located in `v2/` is the **primary, canonical flagship edition** of FileSorter.

- **Ultra-lightweight:** ~6 MB standalone binary (down from 27 MB+ Python bundles).
- **Sub-second startup:** Native zero-runtime initialization.
- **Pure Native Concurrency:** Scans, duplicate analysis, and file moves run asynchronously in Rust worker threads with zero UI blocking.
- **Liquid Glass Design System:** 4 crafted themes (Midnight Dark, Crystal Light, Cyber Aurora, Ruby Sunset), custom Manrope typography, and fluid spring animations.
- **First-run Onboarding:** Interactive welcome tour for seamless onboarding.
- **Auto-Update Engine:** In-app release checking and one-click upgrades.

> **Note on Python Edition (v1):** The legacy Python + PyWebView core has officially transitioned to **Maintenance Mode (LTS)**. It remains in the repository for backwards compatibility, but all new feature development occurs exclusively on the Tauri/Rust v2 codebase.

---

## ⚡ Core Feature Parity

- **📁 Smart File Organizer & Smart Rules:** Categorize loose files into clean folders by extension or custom filename keyword rules with dry-run preview and atomic journaled undo.
- **🗑️ Junk & Cache Cleaner:** Safely scan and purge temporary caches, crash dumps, and Explorer thumbnail databases without administrative prompts.
- **🔍 3-Stage Duplicate Finder:** Multi-threaded SHA-256 chunked hashing (file size → prefix hash → full content hash) with persistent cache and safe quarantine.
- **📊 Disk Space Analyzer:** Real-time volume statistics across system drives (C:, D:, etc.) with per-category breakdowns and top largest files.
- **👁️ Background Watch Mode:** Automatically monitor directories (e.g. `Downloads`, `Desktop`) and organize newly arriving files immediately.
- **⏰ Automated Scheduler:** Run routine junk cleanups or folder organizing tasks on configurable timer intervals.
- **✏️ Smart Batch Renamer:** Powerful multi-file renaming with regex, find & replace, prefixes/suffixes, and sequential numbering.
- **🖼️ Image Studio:** Bulk image optimization and format conversion (WebP, JPEG, PNG) with live size savings metrics.
- **📑 PDF Studio:** Compile image collections into PDF documents or extract all pages as high-resolution images.
- **↩ Complete Journaled Undo:** Atomic undo journal ensures any sorting, duplicate quarantine, or batch renaming operation can be rolled back instantly.

---

## 🚀 Download & Install

Download the latest native Windows installer or standalone portable executable from [**GitHub Releases**](https://github.com/amirrezahajiabadi/FileSorter/releases/latest):
- `FileSorter_Setup.exe` (NSIS Installer)
- `FileSorter_Portable.exe` (Standalone Portable Exe)

---

## 🛠️ Development

### Native Tauri 2 App (Primary)
```bash
cd v2
npm install
npm run tauri dev      # Run in development mode
npm run tauri build    # Build release binaries
```

### Run Tests
```bash
# Rust backend unit tests (22 tests)
cd v2/src-tauri && cargo test

# Python maintenance tests (270 tests)
pytest
```

---

## 📄 License

Distributed under the [MIT License](LICENSE).  
Developed with ❤️ by [HajAmir](https://github.com/amirrezahajiabadi).
