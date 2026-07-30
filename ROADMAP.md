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

**Status:** agreed direction, not started.

Move the interface from raw Tkinter to an HTML/CSS/JS front end, most likely via
**PyWebView** or **Eel** — Python still drives the logic, but the UI itself is a
real web interface (easier to make modern, animated, and genuinely good-looking
without fighting Tkinter's limitations).

This choice isn't isolated — it's also a stepping stone toward item 2 below and
toward the FastAPI stage of the personal learning roadmap: once the UI talks to
Python over a local interface instead of directly calling Tkinter widgets, it's
a much smaller step to eventually put that same logic behind a real FastAPI
service.

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
