#!/usr/bin/env python
"""Fail when the release version has drifted apart.

``app.constants.APP_VERSION`` is the single source of truth: the exe's Windows
version resource, the UI, the installer and the About line all read it (the
frozen build takes it straight from there, see FileSorter.spec). But a few
files necessarily carry their *own* copy — a ``package.json``, an NSIS
``!define``, a generated string table — and those are exactly the copies that
silently go stale during a release.

Run it in CI and locally before tagging:

    python tools/check_version_consistency.py
    python tools/check_version_consistency.py --tag v6.2.0

Exit code 1 lists every mismatch; the release workflow refuses to build on it.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")


def collect_mismatches(app_version: str = None, repo: Path = ROOT) -> list[str]:
    """Return one human-readable line per version disagreement.

    ``app_version`` defaults to ``app.constants.APP_VERSION``; pass another
    value to ask "what would break if I set the version to X?".
    """
    if app_version is None:
        from app.constants import APP_VERSION as app_version  # noqa: F811

    problems: list[str] = []

    def compare(label: str, value: str, source: str) -> None:
        if value != app_version:
            problems.append(f"{label}: {value!r} != APP_VERSION {app_version!r}  ({source})")

    # ── ui/package.json ────────────────────────────────────────────
    pkg_path = repo / "ui" / "package.json"
    try:
        compare("ui/package.json", json.loads(_read(pkg_path))["version"], str(pkg_path))
    except Exception as exc:
        problems.append(f"ui/package.json: unreadable ({exc})")

    # ── transport.ts (browser-mock build) ──────────────────────────
    ts_path = repo / "ui" / "src" / "transport.ts"
    match = re.search(r"SAMPLE_VERSION\s*=\s*['\"]([^'\"]+)['\"]", _read(ts_path))
    if match:
        compare("ui/src/transport.ts SAMPLE_VERSION", match.group(1), str(ts_path))
    else:
        problems.append(f"ui/src/transport.ts: SAMPLE_VERSION not found ({ts_path})")

    # ── installer.nsi ──────────────────────────────────────────────
    nsi_path = repo / "installer.nsi"
    match = re.search(r'!define\s+APP_VERSION\s+"([^"]+)"', _read(nsi_path))
    if match:
        compare("installer.nsi APP_VERSION", match.group(1), str(nsi_path))
    else:
        problems.append(f"installer.nsi: !define APP_VERSION not found ({nsi_path})")

    # ── generated string table (must be regenerated after a bump) ──
    strings_path = repo / "ui" / "src" / "generated" / "strings.ts"
    text = _read(strings_path)
    occurrences = text.count(app_version)
    if occurrences < 2:
        problems.append(
            f"ui/src/generated/strings.ts: mentions {app_version!r} {occurrences}x, "
            f"expected 2 (en + fa dev_line) — regenerate with "
            f"`python ui/scripts/export_i18n.py`  ({strings_path})"
        )

    return problems


def check_tag(tag: str, app_version: str) -> list[str]:
    """A release tag (``v6.2.0``) must name the version the app reports."""
    normalised = tag[1:] if tag.startswith("v") else tag
    if normalised != app_version:
        return [
            f"release tag {tag!r} does not match APP_VERSION {app_version!r} — "
            f"the exe would claim a version the release isn't named after"
        ]
    return []


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--tag", default=None,
                        help="release tag to validate too, e.g. v6.2.0")
    parser.add_argument("--app-version", default=None,
                        help="override APP_VERSION (used by the tests)")
    args = parser.parse_args(argv)

    from app.constants import APP_VERSION

    target = args.app_version or APP_VERSION
    problems = collect_mismatches(target)
    if args.tag:
        problems += check_tag(args.tag, target)

    print(f"APP_VERSION = {APP_VERSION}" + (f" (checking against {target})" if target != APP_VERSION else ""))
    if problems:
        print(f"\nVERSION DRIFT — {len(problems)} problem(s):")
        for line in problems:
            print(f"  - {line}")
        return 1

    print("OK — every copy of the version agrees"
          + (f" and matches tag {args.tag}." if args.tag else "."))
    return 0


if __name__ == "__main__":
    sys.exit(main())
