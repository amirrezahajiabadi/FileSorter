# Rules & Workflow Guidelines

## Git & Release Policy

1. **Always Commit & Push**:
   - Immediately after completing any changes requested by the user, stage all modified files, commit with a clean conventional commit message, and push to GitHub (`origin main`).

2. **Releases & Tags (When applicable)**:
   - When a change represents a new feature, notable fix, version upgrade, or when requested by the user:
     - Update version in `app/constants.py`, `app/i18n.py`, `installer.nsi`, `ui/package.json`, `ui/src/transport.ts`.
     - Regenerate strings mirror: `python ui/scripts/export_i18n.py`.
     - Update `docs/CHANGELOG.md`.
     - Validate with `python tools/check_version_consistency.py --tag v<VERSION>`.
     - Ensure all tests pass with `pytest`.
     - Create an annotated git tag (`vX.Y.Z`) and push both the commit and tag to trigger the automatic GitHub Actions release workflow.
