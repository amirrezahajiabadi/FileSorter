# 🗺 Roadmap

A living document for FileSorter's direction — not a promise of what ships
next, just a place to write down ideas so they don't get lost.

**Guiding principle:** slow and structured beats fast and messy. Every addition
goes through the same discipline — one focused concern per version, feature
branch → PR → tests → merge.

---

## Where things stand

FileSorter is a native Tauri 2 desktop app (Rust backend, React frontend) with
feature parity across sorting, junk cleanup, duplicate detection, disk analysis,
watch mode, scheduling, batch renaming, image/PDF tools and journaled undo. See
[CHANGELOG.md](CHANGELOG.md) for the version history and
[ARCHITECTURE.md](ARCHITECTURE.md) for the module map.

## 0. Phase 1 — Native Tauri transition & parity — ✅ complete

Shipped as v6.6.0:

- Tauri 2 + Rust declared as the only edition; the legacy Python core was
  retired.
- Core parity delivered: smart keyword rules, junk & cache cleaner, 3-stage
  duplicate finder, disk analyzer, background watch mode, task scheduler.
- Auto-update engine, four-theme Liquid Glass design system, first-run
  onboarding.

## 1. AI-powered photo analysis — 💡 idea stage

Automatically group photos by face/content, similar to phone galleries.

- **Local/offline:** ONNX Runtime or `ort` bindings running a small face
  embedding model — no network, no per-call cost.
- **Cloud API:** Azure Face, Google Vision, AWS Rekognition — more accurate, but
  needs internet and has a cost.
- Design around two things before starting: it meaningfully grows the bundled
  binary, and face data is biometric, so it needs an explicit privacy note and
  an opt-in, module-style boundary.

## 2. Deeper utility coverage

Candidate features, roughly in order of fit:

- **Startup app management** — least related to file sorting; only if the app's
  identity expands deliberately.
- **Deeper system cleanup** — admin-scope locations such as the Windows Update
  cache, behind an explicit elevation prompt.

**Scope-creep guardrail:** before adding anything from this list, ask "does this
naturally extend what someone already expects from a file-sorting tool?"

## 3. Smaller ideas worth keeping around

- **Sort history in SQLite** — replace the plain-text log with a queryable
  history and a "past sorts" view.
- **Watch mode refinements** — per-folder category overrides and quiet hours.
- **Update channel preference** — let users opt into pre-releases.

---

## Explicitly not decided yet

- Whether AI features ship in the main app or as a separate optional module
- Whether utility features live in FileSorter itself or become a related project
- Timeline — intentionally none.
