# FileSorter v2 — Flagship Desktop Edition

The primary, canonical edition of FileSorter built on **Tauri 2 + Rust + React 19**: a ~6 MB binary, sub-second startup, zero UI freezing, and full desktop feature parity.

---

## ⚡ Shipped Capabilities (Phase 1 Roadmap)

- **Smart File Organizer:** Parallel folder scanning, rule matching, dry-run previews, and collision-free sorting (`sorted/<category>/`).
- **Smart Keyword Rules:** Custom filename token matching rules prioritizing specific categories before standard file extension fallbacks.
- **Junk & Cache Cleaner:** Safe user-scope purging of temporary files, browser caches (Chrome, Edge, Firefox), crash dumps, and Explorer thumbnail DBs.
- **3-Stage Duplicate Finder:** Size matching → 64 KB prefix hash → full SHA-256 chunked hashing with persistent hash cache and quarantine support.
- **Disk Space Analyzer:** Visual capacity inspection of system storage volumes (C:, D:) alongside folder-level category breakdowns and top largest files.
- **Background Watch Mode:** Continuous folder monitoring (e.g. `Downloads`, `Desktop`) with automatic, instant organization of arriving files.
- **Automated Task Scheduler:** Periodic background daemon running routine junk cleanups or folder sorts on user-defined intervals.
- **Smart Batch Renamer:** Powerful bulk file renamer with RegEx substitution, prefixes, suffixes, sequential numbering, and case normalization.
- **Image Studio:** Bulk image optimization and format conversion (WebP, JPEG, PNG) with dimension clamping and live size reduction metrics.
- **PDF Studio:** Convert image collections into PDF documents or extract all pages as high-resolution images.
- **Complete Journaled Undo:** Crash-resistant atomic journal in `%APPDATA%\FileSorterV2\undo` allows one-click rollback of any operation.
- **Liquid Glass Design System:** 4 crafted themes (Midnight Dark, Crystal Light, Cyber Aurora, Ruby Sunset), accessible focus states (`:focus-visible`), and self-hosted Manrope variable typography.
- **Interactive Onboarding:** 4-step guided tour introducing new users to the engine, theme selection, and core features.
- **Integrated Auto-Update:** Built-in release check against GitHub API with one-click download and upgrade.

---

## 🚀 Run and Build

```bash
cd v2
npm install
npm run tauri dev      # Development run with live reload
npm run tauri build    # Release build + NSIS installer
```

Outputs:
- `src-tauri/target/release/filesorter2.exe` — standalone portable executable (~6.5 MB)
- `src-tauri/target/release/bundle/nsis/FileSorter_6.6.0_x64-setup.exe` — Windows installer (~2.4 MB)

---

## 🧪 Tests

```bash
cd src-tauri
cargo test     # 22 unit tests passing
```

---

## 🏗️ Architecture

```
src-tauri/src/
|-- categories.rs    categories, smart rules, settings persistence
|-- cleanup_ops.rs   junk and cache cleaner (safe user-scope cleaning)
|-- disk_ops.rs      system drive enumeration and capacity query
|-- dupes.rs         three-stage duplicate pipeline + persistent cache
|-- execute.rs       plan execution + duplicate quarantine
|-- image_ops.rs     native image optimization and format conversion
|-- pdf_ops.rs       native PDF creation and page extraction
|-- plan.rs          smart rules matching and pure destination planning
|-- rename_ops.rs    batch renamer engine with journaled undo
|-- schedule_ops.rs  background daemon running periodic automated tasks
|-- undo.rs          atomic journal + reverse replay
|-- update_ops.rs    GitHub releases auto-update checker
|-- walk.rs          fast directory traversal with StopFlag
|-- watch_ops.rs     background directory monitor and auto-sorter
`-- lib.rs           Tauri 2 commands and event wiring
```

Every long operation runs on its own background thread and streams progress events (`scan-progress`, `sort-done`, `watch-event`, `scheduled-task-done`), ensuring the webview never blocks.
