"""Temp / cache cleanup: find and delete well-known junk files.

Scans a fixed set of *user-scope* junk locations (no admin rights
needed): the user temp folder, crash dumps, browser caches, and the
Windows thumbnail cache. System-wide locations (the Windows Temp folder,
other users' profiles) are deliberately excluded — cleaning those needs
elevation and belongs to the headless-service stage, not this panel.

Safety model mirrors app/duplicates.py exactly:
  1. scan_junk() only *looks*: it resolves the known locations that
     exist on this machine and totals the bytes/files each contains.
  2. The controller records the exact file list as a deletion
     whitelist; delete_junk() then removes only whitelisted paths.
     A compromised or mistaken UI can never delete arbitrary files.

Deletion is best-effort per file (like a temp cleaner): locked/in-use
files raise OSError and are counted as failures, never retried here.

Progress flows through the same on_event(kind, payload) contract used
everywhere else: ("clean_progress", {"phase": "scanning"|"deleting",
"location": str, "processed": int, "files": int, "bytes": int}).
This module is UI-free and safe to call from any thread.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Callable, Dict, List, Optional, Set

ProgressEvent = Callable[[str, dict], None]

# Location ids are wire-stable; display names come from the UI's i18n
# tables (cleanup_loc_* keys), never from Python.
LOCATION_IDS = ("user_temp", "crash_dumps", "chrome_cache",
                "edge_cache", "firefox_cache", "thumbnails")

_EMIT_EVERY = 200  # throttle progress events: one per N files


def _localappdata() -> Optional[Path]:
    la = os.environ.get("LOCALAPPDATA")
    return Path(la) if la else None


def known_locations() -> List[dict]:
    """Resolve which known junk locations exist on this machine.

    Returns [{"id": str, "dirs": [str, ...]}, ...] — each location may
    map to several real folders (one per Firefox profile, for example).
    Locations that don't exist here are omitted entirely.
    """
    la = _localappdata()
    temp = os.environ.get("TEMP")
    out: List[dict] = []

    def add(loc_id: str, dirs: List[Path]) -> None:
        real = [str(d) for d in dirs if d and d.is_dir()]
        if real:
            out.append({"id": loc_id, "dirs": real})

    if temp:
        add("user_temp", [Path(temp)])
    if la:
        add("crash_dumps", [la / "CrashDumps"])
        add("chrome_cache", [la / "Google" / "Chrome" / "User Data" / "Default" / "Cache"])
        add("edge_cache", [la / "Microsoft" / "Edge" / "User Data" / "Default" / "Cache"])
        firefox = sorted((la / "Mozilla" / "Firefox" / "Profiles").glob("*/cache2")) \
            if (la / "Mozilla" / "Firefox" / "Profiles").is_dir() else []
        add("firefox_cache", list(firefox))
        add("thumbnails", [la / "Microsoft" / "Windows" / "Explorer"])
    return out


# ── Scanning ─────────────────────────────────────────────────────

def _iter_junk_files(location: dict):
    """Yield files under every dir of `location` that count as junk.

    For the thumbnail-cache location only thumbcache_*.db files count
    (the Explorer folder also holds non-junk state); every other
    location is junk wholesale, recursively. Files inside a dir are
    yielded without any ordering guarantee.
    """
    thumbnails = location["id"] == "thumbnails"
    for d in location["dirs"]:
        base = Path(d)
        if thumbnails:
            # Only loose thumbcache_*.db files, not the folder's state.
            for p in base.glob("thumbcache_*.db"):
                if p.is_file():
                    yield p
            continue
        for dirpath, _dirnames, filenames in os.walk(base):
            for name in filenames:
                yield Path(dirpath) / name


def scan_junk(
    locations: Optional[List[dict]] = None,
    on_event: Optional[ProgressEvent] = None,
    want_paths: bool = False,
) -> dict:
    """Total up the junk under every known (or given) location. Read-only.

    Emits ("clean_progress", {"phase": "scanning", "location": id,
    "processed": int, "files": int, "bytes": int}) per location.
    Returns {"locations": [{"id", "files", "bytes"}], "total_files",
    "total_bytes"} — with want_paths=True the same dict additionally
    carries "paths": {loc_id: [str, ...]}, the exact file list found
    (the deletion whitelist the controller records).
    """
    if locations is None:
        locations = known_locations()

    totals: List[dict] = []
    paths_by_loc: Dict[str, List[str]] = {}
    total_files = total_bytes = 0

    for loc in locations:
        files = bytes_ = 0
        processed = 0
        loc_paths: List[str] = [] if want_paths else None
        for path in _iter_junk_files(loc):
            try:
                bytes_ += path.stat().st_size
            except OSError:
                continue  # vanished mid-walk — not our problem
            files += 1
            processed += 1
            if want_paths:
                loc_paths.append(str(path))
            if on_event and processed % _EMIT_EVERY == 0:
                on_event("clean_progress", {
                    "phase": "scanning",
                    "location": loc["id"],
                    "processed": processed,
                    "files": files,
                    "bytes": bytes_,
                })
        if on_event:
            on_event("clean_progress", {
                "phase": "scanning",
                "location": loc["id"],
                "processed": processed,
                "files": files,
                "bytes": bytes_,
            })
        totals.append({"id": loc["id"], "files": files, "bytes": bytes_})
        if want_paths:
            paths_by_loc[loc["id"]] = loc_paths
        total_files += files
        total_bytes += bytes_

    totals.sort(key=lambda t: t["bytes"], reverse=True)
    result = {"locations": totals, "total_files": total_files,
              "total_bytes": total_bytes}
    if want_paths:
        result["paths"] = paths_by_loc
    return result


# ── Deletion (whitelisted) ───────────────────────────────────────

def delete_junk(paths: List[str], allowed: Set[Path]) -> dict:
    """Delete the given files — only ones in `allowed` (the whitelist a
    recent scan recorded). Anything else is a no-op failure.

    Returns {"deleted": [str, ...], "failed": [{"path", "error"}],
    "freed_bytes": int}. Best-effort per file: locked files fail and
    are reported, the rest still get cleaned.
    """
    allowed = {p.resolve() for p in allowed}
    deleted: List[str] = []
    failed: List[dict] = []
    freed = 0

    for raw in paths:
        try:
            path = Path(raw).resolve()
        except OSError:
            failed.append({"path": raw, "error": "bad path"})
            continue
        if path not in allowed:
            failed.append({"path": raw, "error": "not flagged by last scan"})
            continue
        try:
            size = path.stat().st_size
            path.unlink()
            deleted.append(raw)
            freed += size
        except OSError as e:
            failed.append({"path": raw, "error": str(e)})

    return {"deleted": deleted, "failed": failed, "freed_bytes": freed}
