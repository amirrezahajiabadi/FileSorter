# PyWebView Proof of Concept (v4.0)

This is **not part of the shipped app**. It's a throwaway validation script
for the UI overhaul planned in [ROADMAP.md](../ROADMAP.md) (Phase 2, v4.0):
confirming that PyWebView can actually talk to `app/controller.py` before
any real screens get built on top of it.

It does not affect `python main.py` (the real app) in any way — it's a
completely separate entry point.

## What it proves

- A Python ⟷ HTML/JS bridge works (JS can call Python methods and get
  results back)
- That bridge can call the **real** `AppController` from v3.9.0 — not a
  mock — proving the controller extraction was genuinely reusable outside
  Tkinter, not just in theory
- PyInstaller can bundle PyWebView without import errors

## What it does NOT prove yet

- Whether it looks/feels good — this has zero styling effort, it's just
  wiring
- Whether it works well *as a packaged Windows .exe* specifically — the
  automated testing for this PoC ran on Linux, which lacks a webview
  rendering backend (GTK/Qt) entirely, so the window itself was never
  actually opened during automated testing. On Windows, PyWebView uses the
  pre-installed Edge WebView2 engine instead, which needs to be verified
  manually (see below) — that's the one thing only a real Windows machine
  can confirm.

## How to run it

```bash
pip install pywebview
python poc/webview_poc.py
```

A window should open with three buttons and a text field.

## Manual test checklist

1. **Ping Python** — click it. You should see `Python received: 'hello from JS'`
   in the output box. This confirms the JS → Python → JS round trip works.
2. **Get App Version** — should show the real version from `app/constants.py`
   (e.g. `App version: 4.0.0`).
3. **Get Categories** — should show the real category/extension mapping from
   your `~/.filesorter_settings.json` (or the defaults if you haven't
   customized them).
4. **Analyze Folder** — paste a real folder path (e.g. your Downloads
   folder) into the text field and click it. You should see a real JSON
   report — the same kind of data the Tkinter Analysis window shows,
   proving this isn't a fake/mocked call.
5. Close the window normally (no crash, no hang).

If all 5 work, the technical foundation for the UI overhaul is confirmed
solid, and Phase 2 can move on to v4.1 (designing the real frontend
structure).
