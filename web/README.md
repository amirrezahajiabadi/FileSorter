# Web Frontend — Design System (v4.1)

This is the folder structure and visual identity for the planned UI
overhaul (Phase 3 of [ROADMAP.md](../ROADMAP.md)). **`index.html` here is
a design preview, not a real screen yet** — it proves the visual identity
and theming mechanism work. Real screens (folder picker, Settings,
Analysis, etc.) get built here starting at v4.2.

## Design direction: "Sorting Line"

Deliberately not a port of the current Tkinter app's look — the goal was
a distinct identity, grounded in what the app actually does: files
moving along a line into labeled bins, like a sorting facility.

- **One accent color** (`--signal`, a warm safety-orange) used sparingly —
  for primary actions and progress, not scattered everywhere.
- **Each file category gets its own color** (`--cat-images`,
  `--cat-documents`, etc.) — functions like labeled bins on a sorting
  line, and stays the same in both themes so "images = blue" is always
  true.
- **The signature element** is the sorting-line progress indicator
  (`.sorting-line` in `index.html`) — colored file chips flowing along a
  track into category-colored bins, instead of a generic progress bar.
- **Typography**: Space Grotesk for headings/UI chrome, Inter for body
  text, JetBrains Mono for file paths and the operation log (which is
  deliberately styled like a ledger/manifest printout).

## Structure

```
web/
├── index.html            # design preview — proves the identity works, not a real screen yet
├── css/
│   ├── design-tokens.css  # hand-authored colors — see below, NOT auto-generated
│   ├── fonts.css          # @font-face declarations for the self-hosted fonts
│   └── base.css           # resets, typography, and every component style
├── fonts/                 # self-hosted .woff2 files — no CDN dependency,
│   │                        so the app renders correctly fully offline
│   └── licenses/          # OFL license text for each font family (required
│                             for redistribution — keep these alongside the fonts)
└── js/
    └── app.js             # theme toggle for now; Phase 3 adds pywebview.api calls
```

## Colors: hand-authored, not generated

Earlier (v4.1.0) `theme-vars.css` was auto-generated from `app/themes.py`,
porting the existing Tkinter colors 1:1. That generator (and its test)
have since been **removed** — once the decision was made to design a
genuinely distinct identity rather than reuse the old palette, keeping
that generator around would have been actively misleading (it would
imply the web colors still mirror Tkinter, which they intentionally no
longer do).

`design-tokens.css` is hand-authored instead. If you change a color,
edit it directly there. Every other stylesheet references colors only
via its CSS custom properties (`var(--bg)` → now `var(--ink)`,
`var(--accent)` → now `var(--signal)`, etc.) — never a hardcoded hex
value — so theme switching keeps working automatically as new screens
get added.

```html
<html data-theme="dark">   <!-- dark mode -->
<html data-theme="light">  <!-- light mode -->
```

## Fonts: self-hosted, not CDN-linked

All three families (Space Grotesk, Inter, JetBrains Mono) are Google
Fonts, downloaded and converted to `.woff2`, and referenced locally via
`css/fonts.css`. This matters for a desktop app specifically: it
shouldn't need internet access just to render its own UI correctly.
Only the weights actually used are included, to keep the footprint
small (~410 KB total for all three families).

Each family is licensed under the SIL Open Font License — the license
text lives in `fonts/licenses/` and must stay alongside the font files
if they're ever redistributed elsewhere.

## Previewing right now

```bash
# any static file server works, e.g.:
python -m http.server --directory web 8000
```

Then open `http://localhost:8000` in a browser and click the 🌙 button
to compare both themes. (Phase 3 will load this through PyWebView
instead of a browser — see `poc/webview_poc.py` for that wiring pattern.)
