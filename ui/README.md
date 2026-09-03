# FileSorter UI (React + Vite + TypeScript)

The new frontend for the desktop app, in development as the migration of
the legacy vanilla UI under `../web/` proceeds.

## Stack

- React 19 + Vite 6 + TypeScript (strict)
- No UI framework — plain CSS with the design tokens from `../web/css/themes.css`
- Self-hosted fonts (Inter / Space Grotesk / JetBrains Mono) copied from
  `../web/assets/fonts/` into `src/assets/fonts/`

## Layout

| Path | Purpose |
| --- | --- |
| `src/protocol.ts` | Wire types mirroring `app/protocol.py` (keep in sync) |
| `src/transport.ts` | Bridge to pywebview; deterministic mock for the browser |
| `src/store.ts` | Typed external store + phase machine + actions |
| `src/i18n.ts` | String lookup / template helpers |
| `src/generated/strings.ts` | **Generated** mirror of `app/i18n.py` for the mock |
| `src/components/` | Screens: Header, FolderPicker, CategoryGrid, AnalysisModal, OperationPanel, Toasts |
| `scripts/export_i18n.py` | Regenerates `src/generated/strings.ts` |

## Commands

```bash
npm install          # once
npm run dev          # vite dev server (browser preview uses the mock)
npm run build        # tsc typecheck + production build -> dist/
```

## Regenerating the string mirror

Translations live only in `app/i18n.py`. After editing them:

```bash
python ui/scripts/export_i18n.py
```

## Desktop vs. browser

Inside pywebview, `transport.ts` calls the real Python API. In a plain
browser the mock returns a deterministic sample folder/report and simulates
sort/undo events so the full flow is explorable; the UI states clearly that
this is preview data. Folder picking, analysis, sorting and undo all run
against real files only in the desktop runtime (`python main_web.py`).
