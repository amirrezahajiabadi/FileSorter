# 📜 Changelog

All notable changes to **FileSorter** are documented here, newest first.

The format follows the spirit of [Keep a Changelog](https://keepachangelog.com/)
— versions are listed by release, and every entry names the modules, tests and
verification behind it. No dependencies beyond the Python standard library were
added in any version since v3.7.0 (`tkinterdnd2`, optional) and v5.0.0
(`pywebview`, the only runtime dependency).

---

## [6.1.2] — 2026

### Fixed
- **Minute-long freeze on duplicate results.** Rendering a duplicate scan
  computed a full group re-filter *inside every file row* — O(n²) per render —
  and mounted an unbounded `<li>` per duplicate, so a drive-wide scan with
  thousands of identical files locked the page for minutes (reproduced live:
  25,000 rows, tab unresponsive for minutes). The duplicates panel now hoists
  the per-group keeper count out of the row loop, caps each group at 150
  rendered rows with a paged "show more" control, and pages groups (60 per
  load).
- **Undo preview froze on huge sorts.** `UndoModal` rendered every moved file
  name (25k+ rows after a drive sort); it now caps each category at 400 rows
  with a "… and N more" note.
- **Per-file events still re-rendered the whole tree.** The service coalescer
  (v6.1.1) bounded wire traffic, but the browser handled each `item` frame
  individually — up to three full store updates per file. `store.ts` now
  batches item/watch events client-side and applies them in one update per
  ~120 ms tick, so a burst of N files costs one render instead of ~3N
  (25,000-file sort: 239 ms worst stall before → sub-100 ms after).
- **No way to pick a folder without a native dialog.** The headless service
  `browse_folder()` returns `null` and the old UI silently did nothing;
  clicking browse now falls back to an inline typed-path field, so any
  transport can select any folder (not just the recent list).
- **Error events left panels on eternal spinners.** A failed disk/cleanup job
  only reset the sort state; `error` now clears every operation flag
  (duplicates, disk scan, cleanup, empty-bin).

### Verification
- 251 Python tests pass (1 skip); `tsc` strict and `vite build` clean.
- Live on the real service: 25,000-file analysis, sort and duplicate scan all
  stream with no main-thread stall over 110 ms; opening a 25,000-row
  duplicate result renders instantly (1,400 DOM nodes vs ~200,000 before),
  paging adds 150 rows per ~125 ms click, and per-row toggles land in ~70 ms.

---

## [6.1.1] — 2026

### Fixed
- **UI freeze on large folders.** Sorting or scanning a folder with thousands of
  files used to push one event per file straight to the UI bridge, and the log
  panel grew a DOM row per file — on a 20,000-file sort the page froze for
  tens of seconds at a time. Now `BaseApi.push_event()` (`app/api.py`)
  coalesces high-frequency kinds: monotonic counters (`progress`,
  `space_progress`, `dup_progress`, `clean_progress`) deliver latest-wins,
  per-file rows (`item`, `watch_item`) accumulate and flush together, and
  terminal events always land after the ticks they follow. The log list is
  capped at the latest 250 lines instead of growing without bound.
- Verified live with a real 8,000-file sort: main-thread stalls dropped from
  **40,507 ms to 90 ms max**, zero gaps over 200 ms, all 8,000 files sorted
  correctly. 14 new coalescer tests; total **251 passed, 1 skipped**; `tsc`
  strict and `vite build` clean.

## [6.1.0] — 2026

### Added
- **System-Wide Cleanup.** The Junk Cleaner gains a **System-wide** section and the **Recycle Bin**:
  - Windows Temp (`C:/Windows/Temp`) now flows through the same scan/whitelist machinery as user junk, with unreadable sub-directories skipped silently and per-file deletions that need elevation reported and kept — the honest partial-result pattern from the drive scans.
  - A new Recycle Bin block queries the shell (`SHQueryRecycleBinW`) for its real item count and size and empties it behind the existing two-step armed confirm (`SHEmptyRecycleBinW`), labeled in the app's language.
- Zero new dependencies (`app/cleanup.py`, 9 new tests); live-verified against a real bin holding 27 items / 2.1 GB (queried, not emptied).

## [6.0.0] — 2026

### Added
- **Always-On Background Mode.** The headless service now runs as a real background utility:
  - `python main_web.py --headless --tray` keeps it under a **Windows system-tray icon** (`app/tray.py`) — a native WinForms NotifyIcon driven through pythonnet (already required by the windowed app, so still zero new dependencies) with *open in browser*, a *start with Windows* toggle, and a clean *quit*; the icon labels follow the app's saved language.
  - `python main_web.py --autostart on|off|status` (`app/autostart.py`) manages the silent run-at-login entry in the HKCU Run key — launched via pythonw from source, or the packaged exe when frozen — so the service and its scheduled tasks come up by themselves at boot, no admin rights.
- Verified live: the real HKCU entry round-tripped on→off cleanly and a tray-mode service served requests through the full icon message pump. 25 new tests; zero new dependencies; the windowed app is untouched.

## [5.9.0] — 2026

### Added
- **Scheduled Tasks.** The headless service now runs its own scan utilities on a timer:
  - A daemon tick loop (`app/tasks.py`) fires due tasks and a new **Scheduled** header panel adds, pauses and deletes tasks for three kinds — junk check, disk-space scan and duplicate scan — each on its own interval (30 min to weekly), with **Run now** and a session **Recent runs** history.
  - Tasks persist in the settings file, run one at a time with a lock guard, and stream completion back over SSE (`sched_event`) so the panel updates live.
- Verified live: a daily cleanup task ran on demand and reported a real 11,537-file / 2.3 GB junk scan over the service. 11 new tests; zero new dependencies.

## [5.8.0] — 2026

### Added
- **Drive-Wide Duplicate Scanning.** The Duplicates panel now lists your real drives and can scan a whole drive for content-identical files — the same two-phase hashing as the per-folder scan, walking unreadable system dirs silently, with a **Cancel scan** button that stops at the next file boundary and shows partial results (`app/duplicates.py` gains a `cancel_event`, shared with the disk scan).
- Verified live: a folder scan found 3 groups / 14 extra copies / 1.1 MB, and a cancelled whole-drive scan reported honestly. 4 new tests; zero new dependencies.

## [5.7.0] — 2026

### Added
- **Drive-Wide Disk Analysis.** The Storage panel now lists your real drives (letter, free/total, usage bar) and can scan an entire drive, not just a folder: walked end-to-end with unreadable system directories skipped silently, streamed over the same typed protocol (`space_progress`), with a **Cancel scan** button — the walk stops at the next file boundary and shows the honest partial results marked as cancelled (`app/disk_scan.py`: `list_drives()` + a `cancel_event` for `scan_space`).
- Live-verified against a real 221.8 GB drive scan. 7 new tests; zero new dependencies.

## [5.6.0] — 2026

### Added
- **Headless Service.** The app's brain now runs with no window at all: `python main_web.py --headless` serves the same React UI and the same JSON vocabulary over a loopback HTTP server (`app/service.py`) — JSON-RPC via `POST /api` plus a Server-Sent Events stream on `/events` for live progress, protected by a per-run API token injected into the page, so no other local process or webpage can drive the sorter.
- The windowed app keeps the pywebview bridge, now a thin subclass of the shared `BaseApi` (`app/api.py`). The browser preview can now run against the real backend, and this is the foundation the roadmap's drive-wide scans, scheduled runs, always-on watch and AI module build on. 13 new tests; zero new dependencies.

## [5.5.0] — 2026

### Added
- **Smart Rules.** Sort by what a file *is called*, not only its type: ordered `{keywords → category}` rules match whole words in the filename stem (unicode-aware, so `فاکتور` matches «فاکتور-۱۴۰۳.pdf» the same way `invoice` matches `Invoice-2024.pdf`), and a matching rule wins over the extension fallback.
- Rules flow through analysis, dry-run, the real sort and Watch mode alike (`app/sorter.py` → `AppController` → watcher), and are edited in a new Settings → Smart Rules tab with reordering. A rule whose target category gets deleted deactivates itself instead of erroring. 22 new tests; the browser demo sample gained `invoice-2024.pdf`/«فاکتور-1403.pdf» files so the re-routing is visible live.

## [5.4.0] — 2026

### Added
- **Junk Cleaner.** A new panel that scans well-known *user-scope* junk locations (user temp, crash dumps, Chrome/Edge/Firefox caches, thumbnail cache) and shows exactly how much space each holds. Locations are checked by default with per-row selection; deletion is a two-step armed confirm and the backend deletes only what its own scan flagged (`app/cleanup.py`, 12 tests) — files in use by an app are reported and kept.

### Fixed
- A real desktop bug where duplicate/disk scans never emitted their terminal done event, leaving those panels stuck on the "scanning" state in the packaged app.

## [5.3.0] — 2026

### Added
- **Disk Space Analysis.** A new utility panel (Storage) that walks any folder and shows what's actually eating the disk: total files/bytes, a per-category bar breakdown with live percentages, and a largest-files table. Scans stream through the typed JSON protocol (`space_progress` / `space_done`) so the UI stays responsive on big folders; pure-stdlib walk (`app/disk_scan.py`), 8 new tests.

## [5.2.0] — 2026

### Added
- **Duplicate Finder.** A new utility panel that scans a folder for files with identical content using two-phase hashing (size → first 64KB → full sha256) so large folders stay fast. Each duplicate group keeps one copy by default — you tick the copies to remove (the last keeper is always locked) and delete behind a two-step armed confirmation. The backend only ever deletes paths its own last scan flagged (`app/duplicates.py`), 10 new tests.

## [5.1.0] — 2026

### Added
- **Watch Mode (auto-sort folders).** Pick folders (browse, or watch the currently selected one) and while Watch is on, a background poller moves newly appeared files into the right category folder the moment they show up — duplicates are skipped, locked files are retried with a quiet backoff, and every decision lands in a live activity feed with per-folder counters. Watch list is persisted across restarts (watcher itself runs while the app is open — a headless service is the planned FastAPI-stage follow-up). Pure-stdlib polling (`app/watcher.py`), 11 new tests.

## [5.0.0] — 🎉 Web-only official release

### Added / Changed
- The old Tkinter UI (`main.py`, `app/ui/`, `app/themes.py`) is removed entirely — `main_web.py` + the React frontend is the only interface.
- A typed JSON wire protocol shared by the Python core and the frontend (`app/protocol.py` ⟷ `ui/src/protocol.ts`).
- The vanilla `web/` frontend retired in favor of the React rebuild (`ui/`, Vite + TypeScript).
- Honest fixes to the v4.2 screens (full undo data, truthful results actions, no fake cancel, no fake drag & drop).
- Category names/icons persisted across restarts; a release pipeline that builds the React frontend into the shipped `.exe`.

## [4.2.0] — 2026

### Added
- First *real* Web UI screen (Phase 3 of [ROADMAP.md](ROADMAP.md), still parallel to the Tkinter app — run with `python main_web.py`, requires `pip install pywebview`). Features include: real folder picker, Sort (copy/move mode), duplicate handling (skip/rename/overwrite), Dry Run preview, Undo, Settings (categories), recent folders, theme toggle (dark/light), bilingual support (fa/en), self-hosted fonts (no CDN dependency), toast notifications, sorting animations, and Persian date formatting — all wired to the actual `AppController`.

## [4.1.1] — 2026

### Changed
- No user-facing changes. Finalized the web UI's visual identity: **"Sorting Line"** — a distinct design deliberately grounded in what the app does (files moving into labeled bins), not a port of the Tkinter look. Replaced the auto-generated palette from v4.1.0 with a hand-authored one (colors no longer need to match Tkinter), and self-hosted three font families (Space Grotesk, Inter, JetBrains Mono) so the app doesn't depend on internet access to render its own UI.

## [4.1.0] — 2026

### Changed
- No user-facing changes. Added the `web/` folder structure for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)): a placeholder page, base styles, and — most importantly — `scripts/generate_theme_css.py`, which generates the web frontend's dark/light color palette directly from `app/themes.py` so the two can never drift out of sync. Verified pixel-for-pixel against the real theme colors.

## [4.0.0] — 2026

### Changed
- No user-facing changes. Added a throwaway PyWebView proof-of-concept (`poc/webview_poc.py`, not part of the shipped app) that confirms a real HTML/JS UI can drive the actual `AppController` — the technical foundation for the planned UI overhaul (Phase 2 of [ROADMAP.md](ROADMAP.md)).

## [3.9.0] — 2026

### Changed
- Extracted all business logic (analyze, sort, undo, settings) into `app/controller.py`, a Tkinter-free `AppController` class. `app/ui/main_window.py` is now a thin adapter that builds widgets and translates controller events into UI updates — no functional changes, but this is the foundation for the planned UI overhaul, since a future web-based UI can now drive the exact same logic without touching Tkinter. Added 17 new tests for `AppController` — sort/undo logic is now fully testable without any GUI dependency.

## [3.8.0] — 2026

### Changed
- Replaced the indeterminate "spinning" progress bar with a real one during Sort and Undo: shows an actual percentage and "X / Y files" count, updated live as each file is processed.

## [3.7.1] — 2026

### Fixed
- The Analysis window: when there were enough smart suggestions or categories to exceed the window's fixed height, the "Proceed with Sort" / "Cancel" buttons could get pushed out of view with no way to reach them. The content area now scrolls (mouse wheel supported) while those buttons stay permanently visible at the bottom.

## [3.7.0] — 2026

### Added
- Drag & drop folder selection and a Recent Folders list (last 8, persisted). First release with a runtime dependency (`tkinterdnd2`, optional — the app still works without it, just without drag & drop).

## [3.6.1] — 2026

### Fixed
- A bug where sorting large or numerous files could silently stop after processing only a few (or one) file — background operations now communicate with the UI exclusively through a thread-safe queue instead of touching Tkinter directly from a worker thread, which turned out to be unreliable under load. Affects sorting, Undo, and the Dry Run preview.

## [3.6.0] — 2026

### Added
- An automated Build & Release workflow: pushing a version tag (e.g. `v5.0.0`) runs the tests, builds `FileSorter.exe`, and publishes a GitHub Release with the exe attached — no more manual PyInstaller builds or file uploads.

## [3.5.0] — 2026

### Added
- Duplicate-handling modes (Skip/Rename/Overwrite), a Dry Run preview that shows the exact planned outcome before sorting, and an Undo button that reverses the last sort. Preview and real execution now share one function (`plan_sort`) so they can never disagree.

## [3.4.0] — 2026

### Added
- An optional "Move instead of copy" mode in the Analysis window (unchecked/Copy by default), with a warning and a confirmation dialog before any irreversible move happens.

## [3.3.0] — 2026

### Added
- GitHub Actions CI: `pytest` now runs automatically on every push and pull request to `main`, with a status badge in the README.

## [3.2.0] — 2026

### Changed
- Added a pytest suite for `app/sorter.py` (23 tests); fixed a few stray leftover comments from the v3.1.0 refactor; restored docs that had reverted to the old `file_sorter_app.py` filename during a merge.

## [3.1.0] — 2026

### Changed
- Refactored from a single 1200-line file into a proper package (`app/`, `app/ui/`) with clear module boundaries; entry point moved to `main.py`; no functional/UI changes.

## [3.0.0] — 2026

### Added
- Bilingual UI (Persian/English), Dark/Light theme system with tuned palettes, full widget rebuild on toggle, settings now persist language & theme.

## [2.0.0] — 2026

### Added
- Settings panel, Smart Analysis & Suggestions, modern light theme, more categories.

## [1.0.0] — 2025

### Added
- Initial release: basic sorting, dark theme, splash screen.