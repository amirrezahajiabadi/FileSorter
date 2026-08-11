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

**Status:** in progress — Phases 1 and 2 complete, Phase 3 underway (see below).

Move the interface from raw Tkinter to an HTML/CSS/JS front end, most likely via
**PyWebView** or **Eel** — Python still drives the logic, but the UI itself is a
real web interface (easier to make modern, animated, and genuinely good-looking
without fighting Tkinter's limitations).

This choice isn't isolated — it's also a stepping stone toward item 2 below and
toward the FastAPI stage of the personal learning roadmap: once the UI talks to
Python over a local interface instead of directly calling Tkinter widgets, it's
a much smaller step to eventually put that same logic behind a real FastAPI
service.

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

**Phase 2 — Architecture prep (before any new UI code gets written)** — in progress
- ✅ **v3.9.0** — *The most important step.* Extracted `app/controller.py`
  (`AppController`): everything `main_window.py` used to do directly (start
  sort, undo, analyze, settings) now lives behind a clean class/API with zero
  Tkinter imports. This is what lets a future web UI drive the exact same
  logic without a rewrite of the app's brain.
- ✅ **v4.0.0** — Added `poc/webview_poc.py`: a throwaway PyWebView window
  wired to the real `AppController`, running *alongside* the existing
  Tkinter UI (not replacing it). Confirmed the Python ⟷ HTML/JS bridge
  works and can drive real controller calls — see `poc/README.md` for the
  manual test checklist (the actual window rendering needs to be verified
  on Windows, since the automated testing environment has no GTK/Qt
  backend to open a real window with).
- ✅ **v4.1.0 / v4.1.1** — Added the `web/` folder structure and finalized
  the visual identity: **"Sorting Line"** — a distinct design grounded in
  what the app does (files moving into labeled bins on a sorting line),
  not a port of the Tkinter look. Category colors, a warm safety-orange
  accent, Space Grotesk/Inter/JetBrains Mono typography (self-hosted, no
  CDN dependency), and a signature animated progress element. See
  `web/README.md` for the full rationale.

**Phase 3 — New UI, screen by screen**
- ✅ **v4.2** — Main screen (folder picker, Sort button, log) in HTML/CSS/JS,
  wired to `AppController`. Runs via `python main_web.py`, parallel to the
  Tkinter app. Move mode, duplicate handling, and Settings aren't wired
  into this screen yet.
- ⬜ **v4.3** — Settings screen (categories)
- ⬜ **v4.4** — Analysis screen + Dry Run + Move/duplicate-mode selection
- ⬜ **v4.5** — Undo, bilingual (fa/en), and dark/light in the new UI
- ⬜ **v4.6** — Final polish: animations, visual details, full bilingual/theme
  testing
- ⬜ **v5.0** — 🎉 Old Tkinter UI removed entirely; the new UI is the only
  interface. Official major release.

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

- **Duplicate file finder** across a whole drive (not just one folder)
- **Disk space analysis** — what's actually taking up space
- **Temp/cache cleanup**
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
