"""Disk space analysis: what's actually taking up space in a folder.

Walks the tree once, buckets every file into a sort category (via the
same extension rules the sorter uses), and returns per-category totals
plus the largest files. Read-only — nothing here deletes or moves.

Progress is reported through the same on_event(kind, payload) contract
used by sort/duplicates: ("space_progress", {"phase", "processed",
"bytes"}). The walker can't know the file count up front, so the UI
shows live counters instead of a percentage. This module is UI-free
and safe to call from any thread.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, Dict, List, Optional

from app.sorter import get_category

TOP_N = 20  # how many largest files to report

ProgressEvent = Callable[[str, dict], None]


def scan_space(
    root: Path,
    categories: dict,
    on_event: Optional[ProgressEvent] = None,
    top_n: int = TOP_N,
) -> dict:
    """Scan `root` recursively and bucket sizes by sort category.

    Args:
        root: Folder to scan.
        categories: Category → extension-list map (see app.sorter).
        on_event: Optional callback for ("space_progress", {...}) events:
            {"phase": "scanning", "processed": int, "bytes": int}.
        top_n: How many largest files to return.

    Returns:
        {"by_category": {cat: {"files": int, "bytes": int}},
         "top_files": [{"path": str, "size": int}, ...] (desc by size),
         "files_scanned": int,
         "total_bytes": int}
    """
    root = Path(root)
    if not root.is_dir():
        raise FileNotFoundError(f"folder not found: {root}")

    by_category: Dict[str, Dict[str, int]] = {}
    top_files: List[Dict[str, int]] = []
    scanned = 0
    total_bytes = 0

    def emit(processed: int, bytes_so_far: int) -> None:
        if on_event:
            on_event(
                "space_progress",
                {"phase": "scanning", "processed": processed, "bytes": bytes_so_far},
            )

    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
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

    emit(scanned, total_bytes)  # final tick — exactly what was scanned
    return {
        "by_category": by_category,
        "top_files": top_files,
        "files_scanned": scanned,
        "total_bytes": total_bytes,
    }
