# Web Frontend — FileSorter

The new web-based UI for FileSorter, built with HTML/CSS/JS and served via
[PyWebView](https://pywebview.flowrl.com/). This is the **main shipped UI**
that replaces the old Tkinter interface.

## How to run

```bash
pip install pywebview
python main_web.py
```

## Architecture

```
main_web.py          Python adapter (Api class) — bridges JS ↔ AppController
web/
├── index.html       Main page — all modals, layout, structure
├── css/
│   ├── themes.css   Light/dark theme CSS variables
│   └── main.css     Layout, components, modals, responsive
├── js/
│   ├── data.js      Category metadata (icons, display names per language)
│   ├── state.js     Simple state management (subscribe/notify pattern)
│   ├── utils.js     Helpers (formatSize, escapeHtml, translation wrapper)
│   └── app.js       Main app: pywebview bridge, event handlers, rendering
└── assets/
    ├── fonts/       Self-hosted fonts (Inter, Space Grotesk, JetBrains Mono)
    └── icons/       (reserved for future use)
```

## Communication flow

```
User action → JS function → pywebview.api.<method>(...)
    → Python Api class → AppController
    → events emitted via window.onSortEvent({kind, payload})
    → JS handler updates UI
```

All business logic lives in `app/controller.py` — this frontend never
touches the filesystem or does any sorting itself.

## Design

The visual identity is "Sorting Line" — files moving along a line into
labeled category bins, with a purple/teal accent theme. This is intentionally
distinct from the old Tkinter look.

- **Theme:** Light/dark via `data-theme` attribute on `<html>`
- **Language:** RTL Persian (fa) / LTR English (en) via `data-lang` attribute
- **Typography:** Space Grotesk (headings), Inter (body), JetBrains Mono (paths/code) — all self-hosted in `assets/fonts/` (no CDN dependency)
- **Responsive:** Adapts to narrow windows down to 480px
