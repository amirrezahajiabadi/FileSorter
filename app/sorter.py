"""Core sorting logic: categorizing files, scanning folders, building
smart-suggestion reports, and human-readable size formatting.

Pure functions only — no Tkinter here — so this module is easy to unit
test in isolation (see tests/test_sorter.py).
"""

import time
from pathlib import Path

from app.constants import LARGE_FILE_THRESHOLD, OLD_FILE_DAYS


def get_category(suffix: str, categories: dict) -> str:
    """Return the category name for a given file extension."""
    suffix = suffix.lower()
    for category, extensions in categories.items():
        if suffix in extensions:
            return category
    return "others"


def analyze_folder(base_dir: Path, categories: dict) -> dict:
    """Scan folder and return an analysis report with smart suggestions."""
    now = time.time()
    result = {
        "total": 0,
        "by_category": {},
        "large_files": [],
        "old_files": [],
        "unknown_extensions": set(),
        "total_size": 0,
        "suggestions": []
    }

    target_dir = base_dir / "sorted"

    for file in base_dir.rglob("*"):
        if target_dir in file.parents:
            continue
        if not file.is_file():
            continue

        result["total"] += 1
        size = file.stat().st_size
        result["total_size"] += size

        category = get_category(file.suffix, categories)
        result["by_category"][category] = result["by_category"].get(category, 0) + 1

        if size > LARGE_FILE_THRESHOLD:
            result["large_files"].append((file.name, size))

        age_days = (now - file.stat().st_mtime) / 86400
        if age_days > OLD_FILE_DAYS:
            result["old_files"].append((file.name, int(age_days)))

        if category == "others" and file.suffix:
            result["unknown_extensions"].add(file.suffix.lower())

    result["unknown_extensions"] = sorted(result["unknown_extensions"])
    return result


def build_suggestions(report: dict, T: dict) -> list:
    """Turn a raw analysis report into localized human-readable suggestions."""
    suggestions = []

    if report["large_files"]:
        suggestions.append(T["suggestion_large"].format(n=len(report["large_files"])))

    if report["old_files"]:
        suggestions.append(T["suggestion_old"].format(n=len(report["old_files"])))

    if report["unknown_extensions"]:
        exts = ", ".join(report["unknown_extensions"][:5])
        suggestions.append(T["suggestion_unknown"].format(exts=exts))

    others_count = report["by_category"].get("others", 0)
    if others_count > 5:
        suggestions.append(T["suggestion_others"].format(n=others_count))

    return suggestions


def format_size(bytes_val: float) -> str:
    """Convert bytes to a human-readable size string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} TB"
