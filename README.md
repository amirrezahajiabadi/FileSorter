# 📁 FileSorter

> **Fast, native Windows file organizer & smart disk cleanup utility.** Built with Tauri 2, Rust and React 19 — a ~6 MB binary with sub-second startup.

[![Release](https://img.shields.io/github/v/release/amirrezahajiabadi/FileSorter?color=blue)](https://github.com/amirrezahajiabadi/FileSorter/releases/latest)
[![Tests](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml/badge.svg)](https://github.com/amirrezahajiabadi/FileSorter/actions/workflows/tests.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## ✨ Features

- **📁 Smart File Organizer** — categorize loose files into clean folders by extension or custom filename keyword rules, with dry-run preview and atomic journaled undo.
- **🗑️ Junk & Cache Cleaner** — safely scan and purge temporary caches, browser caches, crash dumps and Explorer thumbnail databases without administrative prompts.
- **🔍 3-Stage Duplicate Finder** — size matching → 64 KB prefix hash → full chunked SHA-256, with a persistent hash cache and safe quarantine.
- **📊 Disk Space Analyzer** — real-time volume statistics across system drives with per-category breakdowns and the largest files.
- **👁️ Background Watch Mode** — monitor folders (e.g. `Downloads`, `Desktop`) and organize newly arriving files immediately.
- **⏰ Automated Scheduler** — run routine junk cleanups or folder sorts on configurable intervals.
- **✏️ Smart Batch Renamer** — regex find & replace, prefixes/suffixes, sequential numbering and case normalization.
- **🖼️ Image Studio** — bulk image optimization and format conversion (WebP, JPEG, PNG) with live size savings.
- **📑 PDF Studio** — compile images into PDFs or extract pages as high-resolution images.
- **↩️ Complete Journaled Undo** — every sort, quarantine and rename can be rolled back instantly.
- **🎨 Liquid Glass Design System** — four themes (Midnight Dark, Crystal Light, Cyber Aurora, Ruby Sunset), accessible focus states and self-hosted Manrope typography.
- **🔄 Integrated Auto-Update** — in-app release check against GitHub with one-click upgrade.

---

## 🚀 Download

Grab the latest installer or standalone executable from [**GitHub Releases**](https://github.com/amirrezahajiabadi/FileSorter/releases/latest):

- `FileSorter_Setup.exe` — NSIS installer (per-user)
- `FileSorter_Portable.exe` — standalone portable executable

---

## 🛠️ Development

Requirements: **Node.js 22+**, **Rust (stable)**, and the [Tauri 2 prerequisites](https://tauri.app/start/prerequisites/) for Windows (WebView2 + MSVC build tools).

```bash
npm install
npm run tauri dev      # run the desktop app with live reload
npm run tauri build    # release build + NSIS installer
```

Build outputs:

- `src-tauri/target/release/filesorter2.exe` — portable executable
- `src-tauri/target/release/bundle/nsis/FileSorter_<version>_x64-setup.exe` — installer

### Tests

```bash
cd src-tauri && cargo test     # Rust backend unit tests
npm run build                  # TypeScript typecheck + frontend build
```

---

## 🏗️ Project Structure

```
.
├── src/                 React + TypeScript frontend (Vite)
│   ├── App.tsx          screens, layout and command wiring
│   ├── i18n.ts          UI strings
│   ├── types.ts         shared wire types
│   └── assets/fonts/    self-hosted Manrope
├── src-tauri/           Rust backend (Tauri 2)
│   ├── src/             one module per feature area
│   ├── capabilities/    window permissions
│   └── icons/           app icons
├── docs/                architecture, build guide, roadmap, changelog
└── .github/workflows/   CI (frontend build + cargo test) and tagged releases
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module map and [docs/BUILD.md](docs/BUILD.md) for the full build and release guide.

---

## 📄 License

Distributed under the [MIT License](LICENSE).
Developed with ❤️ by [HajAmir](https://github.com/amirrezahajiabadi).
