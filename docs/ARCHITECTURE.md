# Architecture

FileSorter is a Tauri 2 desktop application. The **Rust backend** owns every
filesystem operation; the **React frontend** is a thin, stateless view that calls
Tauri commands and listens to events.

```
┌────────────────────────────┐        invoke()        ┌─────────────────────────┐
│  React frontend (src/)     │ ─────────────────────► │  Rust backend           │
│  App.tsx + feature panels  │ ◄───────────────────── │  src-tauri/src/*.rs     │
└────────────────────────────┘   listen(<event>)      └─────────────────────────┘
```

Every long operation runs on its own background thread and streams progress
events (`scan-progress`, `sort-done`, `watch-event`, `scheduled-task-done`), so
the webview never blocks.

## Backend modules (`src-tauri/src/`)

| Module | Responsibility |
| --- | --- |
| `categories.rs` | Categories, smart keyword rules, settings persistence |
| `plan.rs` | Smart-rule matching and pure destination planning |
| `execute.rs` | Plan execution and duplicate quarantine |
| `walk.rs` | Fast directory traversal with a cancellable `StopFlag` |
| `dupes.rs` | Three-stage duplicate pipeline and persistent hash cache |
| `cleanup_ops.rs` | Junk and cache cleaner (safe user-scope cleaning) |
| `disk_ops.rs` | System drive enumeration and capacity query |
| `rename_ops.rs` | Batch renamer engine with journaled undo |
| `image_ops.rs` | Native image optimization and format conversion |
| `pdf_ops.rs` | Native PDF creation and page extraction |
| `schedule_ops.rs` | Background daemon for periodic automated tasks |
| `watch_ops.rs` | Background folder monitor and auto-sorter |
| `undo.rs` | Atomic journal and reverse replay |
| `update_ops.rs` | GitHub Releases auto-update checker |
| `paths.rs`, `lib.rs` | Shared paths, Tauri commands and event wiring |

Application state lives in `%APPDATA%\FileSorterV2\` (settings, duplicate hash
cache and the undo journal).

## Frontend (`src/`)

| Path | Purpose |
| --- | --- |
| `App.tsx` | Shell, navigation, and command wiring |
| `BatchRenamer.tsx` | Batch rename panel |
| `ImageStudio.tsx` | Image optimization panel |
| `PdfStudio.tsx` | PDF tools panel |
| `OnboardingModal.tsx` | First-run guided tour |
| `UpdateModal.tsx` | Update check and download UI |
| `i18n.ts` | Bilingual UI string table (English + Persian) with locale helpers |
| `types.ts` | Wire types shared with the backend |
| `index.css` | Design tokens, themes and layout |

The frontend never touches the filesystem directly: it passes paths picked via
the Tauri dialog plugin to backend commands and renders the events they emit.
