"""Disk space analysis: what's actually taking up space in a folder —
or a whole drive (v5.7.0).

Walks the tree once, buckets every file into a sort category (via the
same extension rules the sorter uses), and returns per-category totals
plus the largest files. Read-only — nothing here deletes or moves.

Progress is reported through the same on_event(kind, payload) contract
used by sort/duplicates: ("space_progress", {"phase", "processed",
"bytes"}). The walker can't know the file count up front, so the UI
shows live counters instead of a percentage. This module is UI-free
and safe to call from any thread.

Drive-wide scans (root = a drive root, e.g. C:) can take minutes, so
scan_space also accepts a cancel_event: when it gets set, the walk
stops at the next file boundary and returns the partial results with
"cancelled": True, so the UI can show what was found so far. Walking a
whole drive also means bumping into unreadable system directories
(System Volume Information, $Recycle.Bin, ...) — those are skipped
silently via os.walk's onerror hook.
"""

from __future__ import annotations

import os
import shutil
import string
import sys
from pathlib import Path
from typing import Callable, Dict, List, Optional

from app.sorter import get_category

TOP_N = 20  # how many largest files to report

ProgressEvent = Callable[[str, dict], None]


def list_drives() -> list:
    """Enumerate local drives (Windows): letter, root path, and disk
    usage (total/free bytes). Returns [] on non-Windows platforms.

    Windows drive letters are A:–Z:; a letter "exists" when its root
    path is accessible. Removable drives with no media are skipped
    automatically because their root doesn't exist.
    """
    if sys.platform != "win32":
        return []
    drives = []
    for letter in string.ascii_uppercase:
        root = Path(f"{letter}:\\")
        try:
            if not root.exists():
                continue
            usage = shutil.disk_usage(root)
        except OSError:
            continue
        drives.append(
            {
                "letter": letter,
                "path": str(root),
                "total": usage.total,
                "free": usage.free,
            }
        )
    return drives


def _skip_walk_error(_exc: OSError) -> None:
    """os.walk onerror hook: ignore unreadable directories instead of
    aborting the whole scan (common on drive roots: system folders,
    permissions)."""


def scan_space(
    root: Path,
    categories: dict,
    on_event: Optional[ProgressEvent] = None,
    top_n: int = TOP_N,
    cancel_event=None,
) -> dict:
    """Scan `root` recursively and bucket sizes by sort category.

    Args:
        root: Folder (or drive root) to scan.
        categories: Category → extension-list map (see app.sorter).
        on_event: Optional callback for ("space_progress", {...}) events:
            {"phase": "scanning", "processed": int, "bytes": int}.
        top_n: How many largest files to return.
        cancel_event: Optional threading.Event — when set, scanning stops
            at the next file boundary and returns the partial results
            with "cancelled": True.

    Returns:
        {"by_category": {cat: {"files": int, "bytes": int}},
         "top_files": [{"path": str, "size": int}, ...] (desc by size),
         "files_scanned": int,
         "total_bytes": int,
         "cancelled": bool}
    """
    root = Path(root)
    if not root.is_dir():
        raise FileNotFoundError(f"folder not found: {root}")

    by_category: Dict[str, Dict[str, int]] = {}
    top_files: List[Dict[str, int]] = []
    scanned = 0
    total_bytes = 0
    cancelled = False

    def emit(processed: int, bytes_so_far: int) -> None:
        if on_event:
            on_event(
                "space_progress",
                {"phase": "scanning", "processed": processed, "bytes": bytes_so_far},
            )

    for dirpath, _dirnames, filenames in os.walk(root, onerror=_skip_walk_error):
        for name in filenames:
            if cancel_event is not None and cancel_event.is_set():
                cancelled = True
                break
            path = Path(dirpath) / name
            try:
                size = path.stat().st_size
            except OSError:
                continue  # unreadable entry — not our problem
            scanned += 1
            total_bytes += size

            cat = get_category(path.suffix, categories)
            bucket = by_category.setdefault(cat, {"files": 0, "bytes": 0})
            bucket["files"] += 1
            bucket["bytes"] += size

            entry = {"path": str(path), "size": size}
            if len(top_files) < top_n:
                top_files.append(entry)
                top_files.sort(key=lambda e: e["size"], reverse=True)
            elif size > top_files[-1]["size"]:
                top_files[-1] = entry
                top_files.sort(key=lambda e: e["size"], reverse=True)

            if scanned % 128 == 0:
                emit(scanned, total_bytes)
        if cancelled:
            break

    emit(scanned, total_bytes)  # final tick — exactly what was scanned
    return {
        "by_category": by_category,
        "top_files": top_files,
        "files_scanned": scanned,
        "total_bytes": total_bytes,
        "cancelled": cancelled,
    }
