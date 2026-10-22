# Rules & Workflow Guidelines

## Project Shape

FileSorter is a single Tauri 2 desktop application — no other edition exists.

- `src/` — React 19 + TypeScript frontend (Vite)
- `src-tauri/` — Rust backend, commands and Tauri configuration
- `docs/` — architecture, build guide, roadmap, changelog

## Git & Release Policy

1. **Always Commit & Push**:
   - Immediately after completing any changes requested by the user, stage all modified files, commit with a clean conventional commit message, and push to GitHub (`origin main`).

2. **Releases & Tags (When applicable)**:
   - When a change represents a new feature, notable fix, version upgrade, or when requested by the user:
     - Update the version in `package.json`, `src-tauri/tauri.conf.json` and `src-tauri/Cargo.toml` — all three must match.
     - Update `docs/CHANGELOG.md`.
     - Ensure `npm run build` and `cd src-tauri && cargo test` pass.
     - Create an annotated git tag (`vX.Y.Z`) and push both the commit and tag to trigger the automatic GitHub Actions release workflow.
