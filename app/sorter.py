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


def resolve_duplicate(dest: Path, mode: str, reserved: set) -> tuple:
    """Decide what should happen to a destination path that may collide.

    This is the single source of truth for duplicate handling, used by
    both the dry-run preview (plan_sort) and the real sort (run_sort) —
    so the preview can never show something different from what actually
    happens.

    Args:
        dest: The destination path a file would normally be copied/moved to.
        mode: One of "skip", "rename", "overwrite".
        reserved: A set of Paths already claimed during this run (so two
            different source files that collide on the same category
            don't get assigned the same renamed destination).

    Returns:
        A (action, final_dest) tuple where action is one of:
        "ok" (no conflict), "skip", "rename", or "overwrite".
    """
    if dest not in reserved and not dest.exists():
        reserved.add(dest)
        return "ok", dest

    if mode == "skip":
        return "skip", dest

    if mode == "overwrite":
        reserved.add(dest)
        return "overwrite", dest

    # mode == "rename": find the first free "name (1).ext", "name (2).ext", ...
    stem, suffix = dest.stem, dest.suffix
    i = 1
    candidate = dest
    while candidate in reserved or candidate.exists():
        candidate = dest.with_name(f"{stem} ({i}){suffix}")
        i += 1
    reserved.add(candidate)
    return "rename", candidate


def plan_sort(base_dir: Path, categories: dict, duplicate_mode: str = "skip") -> list:
    """Compute what a real sort would do, without touching the filesystem.

    Args:
        base_dir: The folder to sort.
        categories: Category -> extensions mapping.
        duplicate_mode: "skip", "rename", or "overwrite" (see resolve_duplicate).

    Returns:
        A list of dicts, one per file found, each with:
        source (full Path), final_dest (full Path), name, category,
        action ("ok"/"skip"/"rename"/"overwrite"), and final_name (the
        name it would actually be saved as).
    """
    target_dir = base_dir / "sorted"
    reserved = set()
    plan = []

    for file in sorted(base_dir.rglob("*")):
        if target_dir in file.parents:
            continue
        if not file.is_file():
            continue

        category = get_category(file.suffix, categories)
        dest = target_dir / category / file.name
        action, final_dest = resolve_duplicate(dest, duplicate_mode, reserved)

        plan.append({
            "source": file,
            "final_dest": final_dest,
            "name": file.name,
            "category": category,
            "action": action,
            "final_name": final_dest.name,
        })

    return plan
