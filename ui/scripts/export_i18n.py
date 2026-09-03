"""Regenerate ui/src/generated/strings.ts from app/i18n.py.

Keeps the browser mock's string table identical to the Python source of
truth — edit translations in app/i18n.py, then run:

    python ui/scripts/export_i18n.py
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # src/
sys.path.insert(0, str(ROOT))

from app.i18n import STRINGS  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src" / "generated" / "strings.ts"

header = (
    "// GENERATED FILE — do not edit by hand.\n"
    "// Mirrors app/i18n.py; regenerate with:\n"
    "//   python ui/scripts/export_i18n.py\n"
    "import type { LangCode } from '../protocol';\n\n"
)

body = "export const STRINGS_MIRROR: Record<LangCode, Record<string, string>> = " + json.dumps(
    {lang: STRINGS[lang] for lang in ("en", "fa")},
    ensure_ascii=True,
    indent=2,
) + ";\n"

OUT.write_text(header + body, encoding="utf-8")
print(f"wrote {OUT}")
