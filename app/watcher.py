"""WatchManager — watches folders and auto-sorts new files as they arrive.

Pure stdlib implementation (polling, no watchdog dependency): every poll
interval the manager snapshots the direct children of each watched
folder and moves any *new* file into the category folder its extension
maps to (get_category from app/sorter.py). Files already in category
subfolders are never touched — only loose files at the root are scanned.

Design mirrors AppController: no GUI imports, long-running work happens
on a thread the *caller* starts via start(), and every decision is
reported through an on_event(kind, payload) callback with kinds:

- ("watch_item", {...})  — once per file:
    {"folder", "name", "category",
     "action": "moved"|"skipped", "error"?: str}
- ("watch_error", {...}) — folder-level failure:
    {"folder", "message"}

The move logic itself (tick -> _process_folder) is synchronous and
public so tests can drive it without starting any threads.
"""

from __future__ import annotations

import shutil
import threading
import time
from pathlib import Path
from typing import Callable, Dict, List, Optional, Tuple

from app.sorter import get_category

DEFAULT_INTERVAL_SECONDS = 2.0

# fingerprint: name -> (mtime, size) — enough to notice a file replaced
Fingerprint = Tuple[float, int]
Snapshot = Dict[str, Fingerprint]


def snapshot_folder(path: Path) -> Snapshot:
    """Fingerprint the direct children of `path` that are files.

    Directories (including category folders and "sorted") are excluded:
    watch mode only organises loose files at the root of the folder.
    """
    result: Snapshot = {}
    try:
        for entry in path.iterdir():
            if entry.is_file():
                st = entry.stat()
                result[entry.name] = (st.st_mtime, st.st_size)
    except OSError:
        pass  # handled by the caller via is_dir checks / watch_error
    return result


class WatchManager:
    """Poll a set of folders and move newly appearing files to category dirs.

    Thread-safe enough for one watcher thread: folder list changes are
    guarded by a lock, and tick() snapshots the list under that lock.
    """

    # Failed moves are retried, but never more often than this many
    # seconds, so a locked file can't spam an error every poll.
    DEFAULT_RETRY_SECONDS = 10.0

    def __init__(
        self,
        get_categories: Callable[[], Dict[str, List[str]]],
        on_event: Optional[Callable[[str, object], None]] = None,
        interval: float = DEFAULT_INTERVAL_SECONDS,
        retry_delay: float = DEFAULT_RETRY_SECONDS,
    ):
        self._get_categories = get_categories
        self._on_event = on_event
        self._interval = interval
        self._retry_delay = retry_delay
        self._folders: List[str] = []
        self._known: Dict[str, Snapshot] = {}
        self._retrying: Dict[str, Dict[str, float]] = {}
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None

    # ── Public API ────────────────────────────────────────────────

    def update_folders(self, folders: List[str]) -> None:
        """Replace the watched-folder list (new folders start empty-known,
        so their *existing* loose files are organised on the next tick)."""
        with self._lock:
            self._folders = list(folders)
            self._known = {f: self._known.get(f, {}) for f in folders}

    @property
    def folders(self) -> List[str]:
        with self._lock:
            return list(self._folders)

    def start(self) -> None:
        """Start the polling thread (no-op if already running)."""
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(
            target=self._run, name="filesorter-watch", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """Stop the polling thread and wait briefly for it to exit."""
        self._stop.set()
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=self._interval + 1.0)
        self._thread = None

    def tick(self) -> None:
        """One full poll pass over every watched folder."""
        folders = self.folders
        categories = self._get_categories()
        for folder in folders:
            path = Path(folder)
            if not path.is_dir():
                self._emit_error(folder, "folder no longer exists")
                continue
            try:
                self._process_folder(path, categories)
            except Exception as exc:  # never kill the poll loop
                self._emit_error(folder, str(exc))

    # ── Internals ─────────────────────────────────────────────────

    def _run(self) -> None:
        while not self._stop.wait(self._interval):
            try:
                self.tick()
            except Exception:
                pass  # tick already guards per-folder failures

    def _process_folder(self, path: Path, categories: Dict[str, List[str]]) -> None:
        key = str(path)
        current = snapshot_folder(path)
        prev = self._known.get(key, {})
        retrying = self._retrying.setdefault(key, {})
        now = time.time()

        # Drop retry state for files that are gone (deleted or moved out
        # by the user) — nothing left to retry.
        for name in [n for n in retrying if n not in current]:
            del retrying[name]

        for name, fp in current.items():
            if name in prev:
                continue  # already sorted/skipped
            if name in retrying and now - retrying[name] < self._retry_delay:
                continue  # cooling down after a failed move
            action = self._handle_new_file(path, name, categories)
            if action == "error":
                retrying[name] = now
            else:
                retrying.pop(name, None)
                prev[name] = fp

        self._known[key] = {n: f for n, f in prev.items() if n in current}
        if not retrying:
            del self._retrying[key]

    def _handle_new_file(
        self, path: Path, name: str, categories: Dict[str, List[str]]
    ) -> None:
        source = path / name
        category = get_category(source.suffix.lower(), categories)
        dest = path / category / name

        def emit_item(action: str, **extra) -> None:
            if self._on_event:
                self._on_event(
                    "watch_item",
                    {"folder": str(path), "name": name, "category": category,
                     "action": action, **extra},
                )

        if dest.exists():
            emit_item("skipped")
            return "skipped"
        try:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(source), str(dest))
            emit_item("moved")
            return "moved"
        except Exception as exc:
            emit_item("error", error=str(exc))
            return "error"

    def _emit_error(self, folder: str, message: str) -> None:
        if self._on_event:
            self._on_event("watch_error", {"folder": folder, "message": message})
