"""Hash-based duplicate detection for the Duplicate Finder tool.

Strategy: two-phase hashing so large folders stay fast.
  1. Walk the folder, bucket files by exact size (zero-byte files are
     skipped — trivially "duplicates" but pure noise).
  2. Only size-buckets with 2+ files are candidates: hash the first
     CHUNK of each candidate and re-bucket by (size, head-hash).
  3. Only head-buckets with 2+ files get a full sha256 — the expensive
     pass runs only over near-misses, not every file.

Deletion safety: the controller only deletes paths that appeared in the
*last* scan (a whitelist), so a compromised/mistaken UI can never ask
the backend to remove arbitrary files.

Progress is reported through the same on_event(kind, payload) contract
used by sort/undo: ("dup_progress", {"phase", "processed", "total"}).
This module is UI-free and safe to call from any thread.
"""

from __future__ import annotations

import hashlib
import os
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set, Tuple

CHUNK = 64 * 1024  # head-hash window (64 KB)

ProgressEvent = Callable[[str, dict], None]

# ── Scanning ─────────────────────────────────────────────────────


def _sha256(path: Path) -> str:
    """Full-file sha256, streamed in CHUNK-sized reads."""
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            block = f.read(CHUNK)
            if not block:
                break
            h.update(block)
    return h.hexdigest()


def scan_duplicates(root: Path, on_event: Optional[ProgressEvent] = None) -> dict:
    """Find groups of files with identical content under `root`.

    Args:
        root: Folder to scan recursively.
        on_event: Optional callback for ("dup_progress", {...}) events:
            {"phase": "listing" | "hashing",
             "processed": int, "total": int}

    Returns:
        {"groups": [{"id": short_hash, "size": int,
                     "files": [{"path": str, "size": int}, ...]}],
         "wasted_bytes": int,   # bytes reclaimable by deleting all
                                # but one copy of every group
         "files_scanned": int}
        groups only contain 2+ files.
    """
    def emit(phase: str, processed: int, total: int) -> None:
        if on_event:
            on_event("dup_progress", {"phase": phase, "processed": processed, "total": total})

    root = Path(root)

    # ── Phase 1: list files, bucket by size ─────────────────────
    by_size: Dict[int, List[Tuple[Path, int]]] = {}
    scanned = 0
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            path = Path(dirpath) / name
            try:
                size = path.stat().st_size
            except OSError:
                continue  # unreadable entry — not our problem
            scanned += 1
            if size > 0:  # zero-byte files are noise, never "duplicates"
                by_size.setdefault(size, []).append((path, size))

    candidates: List[Tuple[Path, int]] = []
    for entries in by_size.values():
        if len(entries) > 1:
            candidates.extend(entries)

    emit("listing", 0, len(candidates))
    if not candidates:
        return {"groups": [], "wasted_bytes": 0, "files_scanned": scanned}

    # ── Phase 2: head-hash each candidate, re-bucket ────────────
    head_buckets: Dict[Tuple[int, str], List[Tuple[Path, int]]] = {}
    for path, size in candidates:
        try:
            with open(path, "rb") as f:
                head = f.read(CHUNK)
        except OSError:
            continue
        head_buckets.setdefault((size, hashlib.sha256(head).hexdigest()), []).append((path, size))

    to_hash: List[Tuple[Path, int]] = []
    for entries in head_buckets.values():
        if len(entries) > 1:
            to_hash.extend(entries)

    emit("hashing", 0, len(to_hash))
    if not to_hash:
        return {"groups": [], "wasted_bytes": 0, "files_scanned": scanned}

    # ── Phase 3: full hash only the near-misses ─────────────────
    full_buckets: Dict[str, List[Tuple[Path, int]]] = {}
    processed = 0
    for path, size in to_hash:
        try:
            digest = _sha256(path)
        except OSError:
            continue
        full_buckets.setdefault(digest, []).append((path, size))
        processed += 1
        emit("hashing", processed, len(to_hash))

    groups = []
    wasted = 0
    for digest, entries in full_buckets.items():
        if len(entries) < 2:
            continue
        entries.sort(key=lambda e: str(e[0]))  # deterministic order
        wasted += sum(size for _path, size in entries[1:])
        groups.append({
            "id": digest[:12],
            "size": entries[0][1],
            "files": [{"path": str(p), "size": s} for p, s in entries],
        })
    groups.sort(key=lambda g: g["size"], reverse=True)

    return {"groups": groups, "wasted_bytes": wasted, "files_scanned": scanned}


# ── Deletion (whitelisted) ───────────────────────────────────────

def delete_files(paths: List[str], allowed: Set[Path]) -> dict:
    """Delete the given files — but only ones in `allowed` (the paths a
    recent scan flagged as duplicates). Anything else is a no-op failure.

    Returns {"deleted": [str, ...], "failed": [{"path", "error"}, ...]}.
    """
    deleted: List[str] = []
    failed: List[dict] = []
    for raw in paths:
        path = Path(raw)
        if path not in allowed:
            failed.append({"path": raw, "error": "not flagged as a duplicate by the last scan"})
            continue
        try:
            if path.is_file():
                path.unlink()
                deleted.append(raw)
            else:
                failed.append({"path": raw, "error": "no longer exists"})
        except OSError as exc:
            failed.append({"path": raw, "error": str(exc)})
    return {"deleted": deleted, "failed": failed}
