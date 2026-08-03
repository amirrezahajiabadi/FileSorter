# Web Frontend (structure preview — v4.1)

This is the folder structure for the planned UI overhaul (Phase 3 of
[ROADMAP.md](../ROADMAP.md)). **`index.html` here is a placeholder, not a
real screen yet** — it only proves the theming approach works. Real
screens (folder picker, Settings, Analysis, etc.) get built here starting
at v4.2.

## Structure

```
web/
├── index.html          # placeholder — proves theme-vars.css works
├── css/
│   ├── theme-vars.css  # AUTO-GENERATED — do not edit by hand, see below
│   └── base.css        # hand-written resets, typography, layout primitives
└── js/
    └── app.js          # placeholder — Phase 3 will add pywebview.api calls here
```

## Theme colors: single source of truth

`css/theme-vars.css` is generated from `app/themes.py`'s `THEMES` dict —
the exact same colors the Tkinter app uses — so the two can never
silently drift apart. **Never hand-edit `theme-vars.css`.**

If you change a color in `app/themes.py`, regenerate it:

```bash
python scripts/generate_theme_css.py
```

Switching themes in HTML/CSS is just setting an attribute:

```html
<html data-theme="dark">   <!-- dark mode -->
<html>                     <!-- light mode (default) -->
```

Every other stylesheet should reference colors only via the CSS custom
properties this generates (`var(--bg)`, `var(--accent)`, etc.) — never a
hardcoded hex value — so theme switching keeps working automatically as
new screens get added.

## Previewing right now

```bash
# any static file server works, e.g.:
python -m http.server --directory web 8000
```

Then open `http://localhost:8000` in a browser. (Phase 3 will load this
through PyWebView instead of a browser — see `poc/webview_poc.py` for
that wiring pattern.)
