"""Unit tests for app.sorter — pure logic, no Tkinter required.

Run with:
    pytest
"""

from pathlib import Path

import pytest

from app.sorter import get_category, analyze_folder, plan_sort, category_for_file, match_rule_category, build_suggestions, format_size
from app.constants import DEFAULT_CATEGORIES
from app.i18n import STRINGS


# ══════════════════════════════════════════════════════════════════
#  get_category
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("suffix, expected", [
    (".jpg", "images"),
    (".JPG", "images"),   # case-insensitive
    (".py", "code"),
    (".pdf", "documents"),
    (".csv", "documents"),  # csv belongs to documents, not data
    (".json", "data"),
    (".zip", "archives"),
    (".unknownext", "others"),
    ("", "others"),
])
def test_get_category(suffix, expected):
    assert get_category(suffix, DEFAULT_CATEGORIES) == expected


def test_get_category_respects_custom_categories():
    custom = {"memes": [".jpg", ".png"], "others": []}
    assert get_category(".jpg", custom) == "memes"
    assert get_category(".pdf", custom) == "others"


def test_csv_not_duplicated_across_categories():
    """Ensure .csv only appears in one category (documents), not data."""
    all_exts = []
    for exts in DEFAULT_CATEGORIES.values():
        all_exts.extend(exts)
    assert all_exts.count(".csv") == 1, f".csv appears {all_exts.count('.csv')} times; expected exactly once"


# ══════════════════════════════════════════════════════════════════
#  format_size
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("value, expected", [
    (0, "0.0 B"),
    (512, "512.0 B"),
    (1536, "1.5 KB"),
    (1024 * 1024, "1.0 MB"),
    (1024 * 1024 * 1024, "1.0 GB"),
])
def test_format_size(value, expected):
    assert format_size(value) == expected


# ══════════════════════════════════════════════════════════════════
#  analyze_folder
# ══════════════════════════════════════════════════════════════════

def test_analyze_folder_counts_and_categorizes(tmp_path):
    (tmp_path / "photo.jpg").write_bytes(b"x")
    (tmp_path / "notes.txt").write_bytes(b"x")
    (tmp_path / "script.py").write_bytes(b"x")
    (tmp_path / "mystery.xyz").write_bytes(b"x")

    report = analyze_folder(tmp_path, DEFAULT_CATEGORIES)

    assert report["total"] == 4
    assert report["by_category"]["images"] == 1
    assert report["by_category"]["documents"] == 1
    assert report["by_category"]["code"] == 1
    assert report["by_category"]["others"] == 1
    assert report["unknown_extensions"] == [".xyz"]


def test_analyze_folder_ignores_existing_sorted_output(tmp_path):
    (tmp_path / "keep.jpg").write_bytes(b"x")
    sorted_dir = tmp_path / "sorted" / "images"
    sorted_dir.mkdir(parents=True)
    (sorted_dir / "already_sorted.jpg").write_bytes(b"x")

    report = analyze_folder(tmp_path, DEFAULT_CATEGORIES)

    # Only the top-level file should be counted, not the one already in sorted/
    assert report["total"] == 1


def test_analyze_folder_flags_large_files(tmp_path):
    big_file = tmp_path / "big.bin"
    big_file.write_bytes(b"0" * (101 * 1024 * 1024))  # 101 MB > 100 MB threshold

    report = analyze_folder(tmp_path, DEFAULT_CATEGORIES)

    assert len(report["large_files"]) == 1
    assert report["large_files"][0][0] == "big.bin"


def test_analyze_folder_empty_directory(tmp_path):
    report = analyze_folder(tmp_path, DEFAULT_CATEGORIES)

    assert report["total"] == 0
    assert report["by_category"] == {}
    assert report["large_files"] == []
    assert report["old_files"] == []
    assert report["unknown_extensions"] == []


# ══════════════════════════════════════════════════════════════════
#  build_suggestions
# ══════════════════════════════════════════════════════════════════

@pytest.mark.parametrize("lang", ["fa", "en"])
def test_build_suggestions_empty_report_has_no_suggestions(lang):
    report = {
        "large_files": [], "old_files": [],
        "unknown_extensions": [], "by_category": {},
    }
    assert build_suggestions(report, STRINGS[lang]) == []


@pytest.mark.parametrize("lang", ["fa", "en"])
def test_build_suggestions_flags_large_and_old_files(lang):
    report = {
        "large_files": [("a.bin", 200_000_000)],
        "old_files": [("b.txt", 400)],
        "unknown_extensions": [],
        "by_category": {},
    }
    suggestions = build_suggestions(report, STRINGS[lang])
    assert len(suggestions) == 2


@pytest.mark.parametrize("lang", ["fa", "en"])
def test_build_suggestions_flags_many_others(lang):
    report = {
        "large_files": [], "old_files": [], "unknown_extensions": [],
        "by_category": {"others": 6},
    }
    suggestions = build_suggestions(report, STRINGS[lang])
    assert len(suggestions) == 1


# ══════════════════════════════════════════════════════════════════
#  Smart rules (filename keywords -> category)
# ══════════════════════════════════════════════════════════════════


RULES_CATS = {"documents": [".pdf"], "images": [".jpg"], "invoices": [], "others": []}


def test_match_rule_simple_keyword():
    rules = [{"keywords": ["invoice"], "category": "invoices"}]
    assert match_rule_category("Invoice-2024.pdf", RULES_CATS, rules) == "invoices"
    assert match_rule_category("invoice_final.pdf", RULES_CATS, rules) == "invoices"
    assert match_rule_category("invoice.pdf", RULES_CATS, rules) == "invoices"


def test_match_rule_persian_keyword():
    rules = [{"keywords": ["فاکتور"], "category": "invoices"}]
    assert match_rule_category("فاکتور-۱۴۰۳.pdf", RULES_CATS, rules) == "invoices"
    # Persian digit token does not contain the keyword
    assert match_rule_category("رسید.pdf", RULES_CATS, rules) is None


def test_match_rule_whole_word_only():
    """'art' must not match 'cartoon' — keywords match whole stem words."""
    rules = [{"keywords": ["art"], "category": "invoices"}]
    assert match_rule_category("cartoon.jpg", RULES_CATS, rules) is None
    assert match_rule_category("art.jpg", RULES_CATS, rules) == "invoices"


def test_match_rule_first_rule_wins():
    rules = [
        {"keywords": ["holiday"], "category": "images"},
        {"keywords": ["holiday"], "category": "invoices"},  # same keyword, later
    ]
    assert match_rule_category("holiday-2023.jpg", RULES_CATS, rules) == "images"


def test_match_rule_skips_missing_target_category():
    rules = [{"keywords": ["invoice"], "category": "deleted_cat"}]
    assert match_rule_category("invoice.pdf", RULES_CATS, rules) is None


def test_match_rule_empty_or_malformed():
    assert match_rule_category("invoice.pdf", RULES_CATS, []) is None
    assert match_rule_category("invoice.pdf", RULES_CATS, None) is None
    assert match_rule_category("invoice.pdf", RULES_CATS, [{"keywords": []}]) is None
    assert match_rule_category("invoice.pdf", RULES_CATS, ["junk"]) is None


def test_category_for_file_rule_beats_extension():
    rules = [{"keywords": ["invoice"], "category": "invoices"}]
    # .pdf maps to documents by extension, but the rule routes it to invoices
    assert category_for_file("invoice.pdf", ".pdf", RULES_CATS, rules) == "invoices"
    assert category_for_file("letter.pdf", ".pdf", RULES_CATS, rules) == "documents"
    assert category_for_file("invoice.jpg", ".jpg", RULES_CATS, rules) == "invoices"


def _write(base: Path, rel: str, content: bytes = b"x") -> Path:
    f = base / rel
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_bytes(content)
    return f


def test_plan_sort_respects_rules(tmp_path):
    _write(tmp_path, "invoice-2024.pdf")
    _write(tmp_path, "letter.pdf")
    _write(tmp_path, "invoice_scan.jpg")
    rules = [{"keywords": ["invoice", "فاکتور"], "category": "invoices"}]
    plan = plan_sort(tmp_path, RULES_CATS, rules=rules)
    by_name = {p["name"]: p["category"] for p in plan}
    assert by_name["invoice-2024.pdf"] == "invoices"
    assert by_name["invoice_scan.jpg"] == "invoices"
    assert by_name["letter.pdf"] == "documents"
    assert all(p["category"] in RULES_CATS for p in plan)


def test_analyze_folder_respects_rules(tmp_path):
    _write(tmp_path, "invoice-2024.pdf")
    _write(tmp_path, "letter.pdf")
    rules = [{"keywords": ["invoice"], "category": "invoices"}]
    report = analyze_folder(tmp_path, RULES_CATS, rules=rules)
    assert report["by_category"]["invoices"] == 1
    assert report["by_category"]["documents"] == 1
    # without rules the invoice goes to documents by extension
    plain = analyze_folder(tmp_path, RULES_CATS)
    assert plain["by_category"].get("invoices", 0) == 0
    assert plain["by_category"]["documents"] == 2


def test_plan_sort_no_rules_unchanged(tmp_path):
    _write(tmp_path, "invoice-2024.pdf")
    plan = plan_sort(tmp_path, RULES_CATS)
    assert plan[0]["category"] == "documents"
