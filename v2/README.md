# FileSorter v2

A complete rewrite of FileSorter on **Tauri 2 + Rust**: a ~6 MB binary (down
from 27 MB), sub-second start-up, no Python<->Web bridge and no lag.

## Features (MVP)
- Fast, parallel folder scanning (the `ignore` crate; a batch roughly every ~150 ms to the UI)
- Three-stage duplicate analysis: size -> 64 KB prefix hash -> full SHA-256, with a persistent cache (a re-scan only hashes changed files)
- Sorting into `sorted/<category>/` with `name (2).ext` naming - never overwrites
- Moves via rename within a volume (instant), copy + verify + delete across volumes
- Atomic undo journal in `%APPDATA%\FileSorterV2\undo` - crash-resistant, one-click undo
- Locked files are skipped and reported; the app never crashes
- Dark glassmorphism UI, self-hosted Manrope font

## Run and build
```bash
cd v2
npm install
npm run tauri dev      # development run
npm run tauri build    # release build + NSIS installer
npm run tauri build -- --no-bundle   # exe only
```

Outputs:
- `src-tauri/target/release/filesorter2.exe` - standalone binary (~6.1 MB)
- `src-tauri/target/release/bundle/nsis/FileSorter_2.0.0_x64-setup.exe` - installer (~2.1 MB)

## Tests
```bash
cd src-tauri && cargo test     # 16 core tests (walk/plan/dupes/undo/categories)
cargo clippy --all-targets     # zero warnings
```

## Architecture
```
src-tauri/src/
|-- categories.rs   categories + settings (atomic settings.json)
|-- walk.rs         walk with StopFlag and time-batched delivery
|-- dupes.rs        three-stage hash pipeline + JSON cache
|-- plan.rs         plan building (pure, no filesystem access)
|-- execute.rs      plan execution + duplicate quarantine
`-- undo.rs         atomic journal + reverse replay
```
Every long operation runs on its own thread and reports progress to the UI
through events (`scan-progress`, `sort-done`, ...); the webview never blocks.

Version 1 (Python) remains untouched at the repository root so v2 stays fully
in step with it.
