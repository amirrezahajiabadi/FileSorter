"""Core sorting logic: categorizing files, scanning folders, building
smart-suggestion reports, and human-readable size formatting.

Pure functions only — no GUI imports here — so this module is easy to unit
test in isolation (see tests/test_sorter.py). It also owns `iter_files`, the
single one-stat-per-file tree walk shared by the analysis, the sort planner
and the disk-space scanner, so every scanner pays the same (minimal) cost.
"""

import os
import re
import time
from pathlib import Path

from app.constants import LARGE_FILE_THRESHOLD, OLD_FILE_DAYS

# The sorter's own output folder. Never scanned, never planned, never
# counted — a re-run must only ever look at the user's loose files.
OUTPUT_DIR_NAME = "sorted"


def iter_files(base_dir: Path, exclude: Path | None = None):
    """Yield ``(path, stat_result)`` for every file under `base_dir`.

    Uses os.scandir rather than os.walk + path.stat() so each directory is
    read once and each entry is stat'd exactly once: os.walk already scandirs
    internally but hides the cached stat, so pairing it with path.stat() cost
    one extra metadata syscall per file (the single biggest cost when
    analysing tens of thousands of files, and much worse on a slow drive).

    `exclude` (the sorter's own output directory) is pruned from the walk
    instead of being filtered per file, so its whole subtree is never
    descended into. Unreadable directories and entries that vanish mid-walk
    are skipped silently, matching the scanners in disk_scan/duplicates.

    Directory symlinks are not followed, so a cyclic link can never trap the
    walk in an infinite loop.
    """
    stack = [base_dir]
    while stack:
        current = stack.pop()
        try:
            entries = os.scandir(current)
        except OSError:
            continue  # unreadable directory — not our problem
        with entries:
            for entry in entries:
                try:
                    if entry.is_dir(follow_symlinks=False):
                        child = Path(entry.path)
                        if exclude is None or child != exclude:
                            stack.append(child)
                    elif entry.is_file():
                        yield Path(entry.path), entry.stat()
                except OSError:
                    continue  # vanished / locked mid-walk — skip it


def _require_dir(base_dir: Path) -> Path:
    """Normalize and validate a scan root, raising on a missing folder.

    Both analyze_folder and plan_sort refuse a path that is not a directory
    rather than silently reporting "0 files": a typo or a deleted folder must
    surface as an error, exactly like disk_scan.scan_space does.
    """
    base_dir = Path(base_dir)
    if not base_dir.is_dir():
        raise FileNotFoundError(f"folder not found: {base_dir}")
    return base_dir


def get_category(suffix: str, categories: dict) -> str:
    """Return the category name for a given file extension."""
    suffix = suffix.lower()
    for category, extensions in categories.items():
        if suffix in extensions:
            return category
    return "others"


def _stem_tokens(name: str) -> set:
    """Lowercased whole-word tokens of a file's stem (no extension).

    Splits on anything that is not a letter/digit, so dashes, dots,
    spaces and underscores are all separators and Persian words work
    the same as English ones ("faktor-1403.pdf" -> {"faktor", "1403"}).
    """
    stem = Path(name).stem
    return {t for t in re.split(r"[^\w]+|_+", stem.casefold()) if t}


def match_rule_category(name: str, categories: dict, rules: list) -> str | None:
    """Return the category of the first smart rule whose keyword appears as a
    whole word in the file's stem, or None if no rule matches.

    Rules are checked in order (first match wins). A rule whose target
    category no longer exists in `categories` is skipped, so deleting a
    category silently deactivates the rules that pointed at it.
    """
    if not rules:
        return None
    tokens = _stem_tokens(name)
    if not tokens:
        return None
    for rule in rules:
        if not isinstance(rule, dict):
            continue
        cat = rule.get("category")
        if cat not in categories:
            continue  # inactive rule — category was deleted
        for kw in rule.get("keywords") or []:
            if kw and str(kw).casefold() in tokens:
                return cat
    return None


def category_for_file(name: str, suffix: str, categories: dict, rules: list) -> str:
    """Category a file belongs to: first matching smart rule (by filename),
    then the extension-based fallback."""
    rule_cat = match_rule_category(name, categories, rules)
    if rule_cat is not None:
        return rule_cat
    return get_category(suffix, categories)


def analyze_folder(base_dir: Path, categories: dict, rules: list = None) -> dict:
    """Scan folder and return an analysis report with smart suggestions.

    rules: optional smart rules — a matching rule overrides the
    extension-based category for that file (see match_rule_category).
    """
    base_dir = _require_dir(base_dir)
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

    for file, st in iter_files(base_dir, exclude=base_dir / OUTPUT_DIR_NAME):
        # One stat per file (see iter_files) — the previous implementation
        # stat'd twice and lost the whole report if the file went away
        # between the two calls.
        size = st.st_size
        result["total"] += 1
        result["total_size"] += size

        category = category_for_file(file.name, file.suffix, categories, rules)
        result["by_category"][category] = result["by_category"].get(category, 0) + 1

        if size > LARGE_FILE_THRESHOLD:
            result["large_files"].append((file.name, size))

        age_days = (now - st.st_mtime) / 86400
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


def plan_sort(base_dir: Path, categories: dict, duplicate_mode: str = "skip", rules: list = None) -> list:
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
    base_dir = _require_dir(base_dir)
    target_dir = base_dir / OUTPUT_DIR_NAME
    reserved = set()
    plan = []

    # The plan holds one row per file, so collecting the sources first costs
    # nothing extra — but it also fixes the order duplicates are resolved in
    # (Path ordering, as before), so rename suffixes are deterministic and the
    # dry-run preview can never disagree with the real sort.
    sources = sorted(
        path for path, _stat in iter_files(base_dir, exclude=target_dir)
    )

    for file in sources:
        category = category_for_file(file.name, file.suffix, categories, rules)
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
