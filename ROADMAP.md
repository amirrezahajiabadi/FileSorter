# 🗺 Roadmap

This is a living document for FileSorter's long-term direction — not a promise of
what ships next, just a place to write down ideas so they don't get lost between
sessions. Nothing here is scheduled; it gets pulled into an actual version only
when there's time and a clear design for it.

**Guiding principle:** slow and structured beats fast and messy. Every addition
should go through the same discipline the project already follows — one focused
concern per version, feature branch → PR → tests → merge. Looking "professional"
is a side effect of good structure, not a goal on its own.

---

## Where things stand

FileSorter is currently a solid, well-tested desktop file organizer: bilingual
UI, dark/light themes, a proper package structure, automated tests + CI, and
automated `.exe` releases on tag push. See [README.md](README.md#-version-history)
for the full version history.

The ideas below are about what comes *after* that foundation is fully settled.

---

## 1. UI/UX Overhaul

**Status:** ✅ complete — shipped as v5.0.0.

The interface moved from raw Tkinter to a React front end driven through
**PyWebView** — Python still drives the logic, but the UI itself is a real web
interface (much easier to make modern, animated, and genuinely good-looking).
The old Tkinter UI and the vanilla HTML/JS prototype were both removed once the
React rebuild (`ui/`) reached parity.

This choice wasn't isolated — it's also the stepping stone toward the FastAPI
stage: now that the UI talks to Python over a local JSON protocol
(`app/protocol.py`), putting that same logic behind a real FastAPI service is a
small step.

### Planned path: v3.7 → v5.0

Same discipline as always — one focused piece per version, nothing skipped ahead.
Version numbers below are for organization only and can shift. See
[README.md](README.md#-version-history) for exact details on completed versions.

**Phase 1 — UX polish (still on Tkinter)** ✅ complete
- ✅ **v3.7.0** — Drag & drop folder selection, plus a recent-folders list
- ✅ **v3.7.1** — Fixed the Analysis window overflowing off-screen with enough
  content (found during Phase 1 testing, not originally planned, but blocked
  everything else until fixed)
- ✅ **v3.8.0** — A real progress bar (percentage + file count) instead of the
  indeterminate one

**Phase 2 — Architecture prep (before any new UI code gets written)** ✅ complete
- ✅ **v3.9.0** — *The most important step.* Extracted `app/controller.py`
  (`AppController`): everything `main_window.py` used to do directly (start
  sort, undo, analyze, settings) now lives behind a clean class/API with zero
  Tkinter imports. This is what lets a future web UI drive the exact same
  logic without a rewrite of the app's brain.
- ✅ **v4.0.0** — Added a throwaway PyWebView proof of concept wired to the
  real `AppController`, running *alongside* the existing Tkinter UI (not
  replacing it). Confirmed the Python ⟷ JS bridge works and can drive real
  controller calls. (Removed in v5.0.0, superseded by `main_web.py`.)
- ✅ **v4.1.0 / v4.1.1** — Added the `web/` folder structure and finalized
  the visual identity: **"Sorting Line"** — a distinct design grounded in
  what the app does (files moving into labeled bins on a sorting line),
  not a port of the Tkinter look. Category colors, a warm safety-orange
  accent, Space Grotesk/Inter/JetBrains Mono typography (self-hosted, no
  CDN dependency), and a signature animated progress element. The design
  lives on in the React UI (`ui/`); the vanilla `web/` implementation was
  retired once the React migration reached parity.

**Phase 3 — New UI, screen by screen** ✅ complete
- ✅ **v4.2** — Main screen (folder picker, Sort button, log) in HTML/CSS/JS,
  wired to `AppController`. Runs via `python main_web.py`, parallel to the
  Tkinter app. Includes: folder picker, categories grid, sort (copy/move),
  duplicate handling (skip/rename/overwrite), analysis modal with charts,
  undo, settings (categories editor), recent folders, theme toggle,
  bilingual (fa/en), self-hosted fonts, toast notifications,
  sorting animations, Persian date formatting.
- ✅ **v4.3** — Settings screen (categories) — fully implemented in v4.2
- ✅ **v4.4** — Analysis screen + Dry Run + Move/duplicate-mode selection — fully implemented in v4.2
- ✅ **v4.5** — Undo, bilingual (fa/en), and dark/light — fully implemented in v4.2
- ✅ **v4.6** — Final polish: animations, visual details, full bilingual/theme
  testing — completed with toast notifications and self-hosted fonts
- ✅ **v5.0** — 🎉 Old Tkinter UI removed entirely; the React UI (`ui/`) is
  the only interface. Official major release.

Phase 1 is fully independent and was completed without blocking phases 2/3.
Phases 2 and 3 are sequential — skipping v3.9 would have meant pulling the
app's logic out of the middle of new UI code later instead of once, cleanly,
up front.

## 2. AI-Powered Photo Analysis

**Status:** idea stage.

Automatically group photos by face/content — similar to what phone galleries do
("group by person"). Not something to train from scratch; existing tools cover
this well:

- **Local/offline:** `face_recognition` (dlib-based) or `deepface`
- **Cloud API:** Azure Face API, Google Vision, AWS Rekognition — more accurate,
  but needs internet and has a cost

**Things to design around before starting, not after:**
- This meaningfully changes what FileSorter *is* — no longer a dependency-free
  stdlib-only app. The packaged `.exe` size and build complexity both jump.
- Face data is biometric data. Even fully offline and local, this deserves an
  explicit note in the app (and eventually a privacy note) once it's real —
  worth designing in from the start rather than bolting on later.
- Best fit as an **optional module**, not a default-on feature — likely the
  first real justification for splitting heavy logic behind a local service
  (see item 1/FastAPI) rather than bundling it directly into the main exe.

## 3. From File Sorter to Desktop Utility

**Status:** long-term direction, agreed but needs careful scoping.

The bigger vision: evolve from a single-purpose file organizer into a genuinely
useful, frequently-run Windows utility — closer to something like CCleaner or
PowerToys. Candidate features, roughly in order of how naturally they fit:

**Shipped so far:**
- ✅ **v5.6.0** — Headless Service: the whole app runs with no window — `python main_web.py --headless` serves the React UI plus the exact same JSON vocabulary over a loopback HTTP server (JSON-RPC `POST /api` + Server-Sent Events `/events`), auth-gated by a per-run token (`app/service.py`; windowed app is now a thin subclass of the shared `app/api.py`). The browser preview now drives the real backend. This is the foundation drive-wide scans, scheduled runs, always-on watch and the AI module build on; zero new dependencies, 13 tests.
- ✅ **v5.5.0** — Smart Rules: sort by filename, not just extension — ordered keyword→category rules beat the extension fallback (`invoice`/`فاکتور` → an "Invoices" folder), whole-word unicode matching, rules flow through analyze/plan/sort/watch and live in a Settings tab (`app/sorter.py` helpers, 22 tests). This is the seam a future content classifier will sit in.
- ✅ **v5.4.0** — Junk Cleaner: scans well-known user-scope junk locations (user temp, crash dumps, browser caches, thumbnail cache) and deletes what the user confirms — whitelisted to the scan's own results, two-step armed confirm, in-use files reported and kept (`app/cleanup.py`, 12 tests). Also fixed a desktop bug where dup/disk scans never emitted their done event.
- ✅ **v5.3.0** — Disk space analysis: walks a chosen folder and shows what's actually eating the disk — per-category totals with a bar breakdown and the largest files — streamed over the JSON protocol (`app/disk_scan.py`, 8 tests). Drive-wide scanning is the headless-service follow-up.
- ✅ **v5.2.0** — Duplicate Finder (per-folder): scans a chosen folder for content-identical files with two-phase hashing, groups them keeping one copy each, and deletes the selected copies behind a two-step confirm — deletion is whitelisted to the scan's own results (`app/duplicates.py`, 10 tests). Whole-drive scanning and scheduled cleanups are the headless-service follow-up.
- ✅ **v5.1.0** — Watch / auto-sort folders: pick folders and, while the app is open, newly arrived files are moved into their category folders automatically (stdlib polling, streamed over the JSON protocol; a headless always-on version is the FastAPI-stage follow-up).

- **Drive-wide duplicate scanning** (per-folder scanning shipped in v5.2.0; drive-wide + scheduled runs come with the headless service shipped in v5.6.0)
- **Drive-wide disk analysis** (per-folder analysis shipped in v5.3.0; drive-wide + scheduled runs come with the headless service shipped in v5.6.0)
- **System-wide cleanup** (user-scope junk cleaning shipped in v5.4.0; Windows Temp and other admin-scope locations come with the headless service shipped in v5.6.0)
- **Startup app management** — much less related to file sorting; lowest priority,
  most likely to dilute the app's identity if added too early

**Scope-creep guardrail:** before adding anything from this list, ask "does this
naturally extend what someone already expects from a file-sorting tool?" Duplicate
finding and disk analysis pass that test easily. Startup management does not — it's
a different category of tool wearing the same UI.

## 4. Smaller ideas worth keeping around

- **Content-based smart rules** — sort by more than extension, e.g. a PDF with
  "invoice" or "فاکتور" in the filename goes to a dedicated folder. A useful
  middle ground between plain extension rules and full AI analysis — much
  simpler to build, still genuinely smart.
- **Watch / Scheduled mode** (already noted earlier in planning) — monitor a
  folder and sort new files automatically in the background, using something
  like `watchdog`. This is arguably what turns the app from "something I open
  sometimes" into "something that's just always running and useful."
- **Sort history in SQLite** instead of a plain text log — a natural bridge to
  the SQL stage of the personal learning roadmap, and it enables a real
  "view past sorts" feature.

---

## Explicitly not decided yet

- Whether AI features ship in the main app or as a separate optional add-on/plugin
- Whether the desktop-utility features live in FileSorter itself or become a
  separate, related project
- Timeline — intentionally none. This file gets revisited when there's actual
  bandwidth to design the next piece properly, not on a schedule.
