"""Unit tests for app.sorter — pure logic, no Tkinter required.

Run with:
    pytest
"""

from pathlib import Path

import pytest

from app.sorter import get_category, analyze_folder, build_suggestions, format_size
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
