# Build & Release Guide

## Prerequisites

- **Node.js 22+** with npm
- **Rust stable** toolchain (`rustup default stable`)
- **Tauri 2 Windows prerequisites:** Microsoft C++ Build Tools and WebView2
  (preinstalled on Windows 10/11)

## Development build

```bash
npm install
npm run tauri dev
```

The Vite dev server runs on `http://localhost:1420`; Tauri opens the desktop
window against it with hot reload.

## Production build

```bash
npm run tauri build
```

This runs `tsc && vite build` for the frontend and a release Rust build, then
bundles the NSIS installer.

Outputs:

| Artifact | Path |
| --- | --- |
| Portable executable | `src-tauri/target/release/filesorter2.exe` |
| Installer | `src-tauri/target/release/bundle/nsis/FileSorter_<version>_x64-setup.exe` |

## Tests

```bash
cd src-tauri && cargo test     # Rust backend unit tests
npm run build                  # TypeScript typecheck + frontend build
```

## Release process

The version must agree in three places before a tag is pushed:

1. `package.json` → `version`
2. `src-tauri/tauri.conf.json` → `version`
3. `src-tauri/Cargo.toml` → `version`

Then:

1. Add an entry to [CHANGELOG.md](CHANGELOG.md).
2. Commit the version bump.
3. Create and push an annotated tag — this triggers
   [`.github/workflows/release.yml`](../.github/workflows/release.yml), which
   re-checks version/tag consistency, runs `cargo test`, builds the app and
   uploads `FileSorter_Setup.exe` and `FileSorter_Portable.exe` to a GitHub
   Release.

```bash
git tag -a v6.8.0 -m "v6.8.0"
git push origin main --follow-tags
```

The tag (without the `v`) must equal the version in all three files; the
workflow fails otherwise. No repository secrets are required — the built-in
`GITHUB_TOKEN` creates the release.
