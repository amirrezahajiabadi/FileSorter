"""BaseApi — the shared adapter between any frontend and AppController.

This is the single vocabulary the React UI speaks. Both concrete
frontends subclass it:

- ``main_web.Api`` (windowed pywebview app): overrides ``browse_folder``
  with the native dialog and ``_push`` with ``evaluate_js``.
- ``app.service.ServiceApi`` (headless local service): keeps the
  headless ``browse_folder`` (no dialog → None) and overrides ``_push``
  to fan out to Server-Sent Event subscribers.

The transport layer in the frontend (``ui/src/transport.ts``) mirrors
these method names one-to-one, so the same React bundle drives both
frontends unchanged.

High-frequency kinds (per-file "item" rows, "progress" counters) are
coalesced by ``push_event`` before they reach ``_push``: "last" kinds
keep only the newest payload (counters), "batch" kinds accumulate
every payload and flush them together (log rows). A sort of 20,000
files then costs a handful of UI round-trips per second instead of one
per file, which is what kept freezing the UI.
"""

import threading
import time

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.controller import AppController
from app.i18n import STRINGS
from app.protocol import plan_item_wire
from app.tasks import TaskScheduler
from app.watcher import WatchManager

TASK_HISTORY_LIMIT = 20

# Kinds that stream once per file / per directory during a sort, undo or
# scan. Delivering each one separately saturates the UI bridge (evaluate_js
# round-trips in the windowed app, SSE frames in the service) and freezes
# the page on folders with many files. Coalescing modes:
#   "last"  — only the newest payload matters (monotonic counters).
#   "batch" — every payload is a distinct log row; accumulate and flush
#             them together so no row is lost but the rate is bounded.
COALESCE_LAST_KINDS = {"progress", "space_progress", "dup_progress", "clean_progress"}
COALESCE_BATCH_KINDS = {"item", "watch_item"}
# Terminal events must never beat the buffered progress ticks they follow,
# or the UI would see "done" before the last counter update.
COALESCE_FLUSH_BEFORE = {"done", "dup_done", "space_done", "clean_done", "sched_done", "error"}
COALESCE_INTERVAL = 0.12  # seconds — flushes at most ~8 event bursts/sec


class BaseApi:
    """Everything the UI can ask the Python core to do.

    Long-running operations (sort, undo, scans) return immediately and
    stream progress via ``_push(kind, payload)`` — the subclass decides
    how those events reach the page.
    """

    def __init__(self):
        self.controller = AppController()
        # Coalescing buffer for push_event(); fields must exist before the
        # WatchManager below starts wiring callbacks into it.
        self._coalesced = {}
        self._coalesce_lock = threading.Lock()
        self._coalesce_timer = None
        self._scan_lock = threading.Lock()
        self._scan_cancel = None  # threading.Event for the active disk/dup scan
        self._scan_kind = None
        self._operation_lock = threading.Lock()
        self._sort_running = False
        self._cleanup_running = False
        self._task_history = []  # ring of recent scheduled-run reports
        self.watch_manager = WatchManager(
            get_categories=lambda: self.controller.categories,
            on_event=self.push_event,
            get_rules=lambda: self.controller.smart_rules,
        )
        self.watch_manager.update_folders(self.controller.watch_folders)
        self.task_scheduler = TaskScheduler(
            get_tasks=lambda: self.controller.tasks,
            run_job=self._run_task_job,
            on_done=self._on_task_done,
        )

    # ── Subclass hooks ──────────────────────────────────────────

    def _push(self, kind: str, payload) -> None:
        """Deliver a live event (sort_item, dup_done, ...) to the UI."""
        raise NotImplementedError

    # ── Event coalescing (v6.1.1) ────────────────────────────────

    def push_event(self, kind: str, payload) -> None:
        """Deliver a live event, coalescing chatty kinds.

        Rare kinds (done/error/sched_*) pass straight through to
        _push(). High-frequency kinds are buffered and flushed at most
        every COALESCE_INTERVAL seconds, so a fast scan cannot flood the
        UI bridge with one round-trip per file.
        """
        if kind in COALESCE_FLUSH_BEFORE:
            # Deliver any pending ticks first so ordering stays honest:
            # progress counters always land before the event that ends them.
            self._flush_coalesced()
            self._push(kind, payload)
            return
        if kind not in COALESCE_LAST_KINDS and kind not in COALESCE_BATCH_KINDS:
            self._push(kind, payload)
            return
        with self._coalesce_lock:
            if kind in COALESCE_BATCH_KINDS:
                self._coalesced.setdefault(kind, []).append(payload)
            else:
                self._coalesced[kind] = payload  # latest wins
            if self._coalesce_timer is None:
                self._coalesce_timer = threading.Timer(
                    COALESCE_INTERVAL, self._flush_coalesced
                )
                self._coalesce_timer.daemon = True
                self._coalesce_timer.start()

    def _flush_coalesced(self) -> None:
        """Deliver everything buffered since the last flush. Runs on a
        daemon timer thread; the queue/JS bridge must be thread-safe
        (both adapters' _push are)."""
        with self._coalesce_lock:
            items = list(self._coalesced.items())
            self._coalesced.clear()
            self._coalesce_timer = None
        for kind, payload in items:
            if isinstance(payload, list):
                for one in payload:
                    self._push(kind, one)
            else:
                self._push(kind, payload)

    def browse_folder(self):
        """Open a native folder-picker dialog.

        Headless frontends have no dialog; they keep this default and
        return None, and the UI falls back to a typed path.
        """
        return None

    def record_recent_folder(self, path: str) -> list:
        """Persist a folder selected through a non-native transport."""
        clean = str(path or "").strip()
        if not clean:
            return self.controller.recent_folders
        return self.controller.record_recent_folder(clean)

    def _begin_scan(self, kind: str):
        """Reserve the single shared scan slot and return its cancel event."""
        with self._scan_lock:
            if self._scan_kind is not None:
                return None
            event = threading.Event()
            self._scan_cancel = event
            self._scan_kind = kind
            return event

    def _finish_scan(self, event) -> None:
        with self._scan_lock:
            if self._scan_cancel is event:
                self._scan_cancel = None
                self._scan_kind = None

    def _begin_operation(self, name: str) -> bool:
        with self._operation_lock:
            if name == "sort":
                if self._sort_running:
                    return False
                self._sort_running = True
                return True
            if name == "cleanup":
                if self._cleanup_running:
                    return False
                self._cleanup_running = True
                return True
            raise ValueError(f"unknown operation: {name}")

    def _finish_operation(self, name: str) -> None:
        with self._operation_lock:
            if name == "sort":
                self._sort_running = False
            elif name == "cleanup":
                self._cleanup_running = False

    def shutdown(self) -> None:
        """Stop background workers owned by this API adapter."""
        self.watch_manager.stop()
        self.task_scheduler.stop()
        self.cancel_scan()
        self._flush_coalesced()


    # ── Scheduled tasks (v5.9.0) ───────────────────────────────

    def start_tasks(self) -> None:
        """Start the task tick loop (idempotent). Called by the service
        on bind and by the windowed app on launch, so schedules run
        while the runtime is alive."""
        self.task_scheduler.start()

    def get_task_history(self) -> list:
        """Recent scheduled-run reports (newest first)."""
        return list(self._task_history)

    def add_task(self, kind: str, folder: str = None,
                 interval_minutes: int = 1440) -> dict:
        """Create a scheduled task (persisted). cleanup needs no folder;
        disk_scan/dup_scan need one."""
        task = self.controller.add_task(kind, folder, interval_minutes)
        self.start_tasks()
        return task

    def update_task(self, task_id: str, patch: dict = None) -> dict:
        """Update a task ({enabled, interval_minutes, folder})."""
        task = self.controller.update_task(task_id, patch)
        if task is None:
            raise ValueError("task not found")
        return task

    def remove_task(self, task_id: str) -> bool:
        """Delete a scheduled task."""
        return self.controller.remove_task(task_id)

    def run_task_now(self, task_id: str) -> bool:
        """Run one task immediately ("Run now"). Returns False if the id
        is unknown or the task is already running."""
        task = next(
            (t for t in self.controller.tasks if t.get("id") == task_id), None
        )
        if task is None:
            return False
        return self.task_scheduler.run_now(task)

    def _run_task_job(self, task: dict) -> dict:
        """Execute one task's scan; progress streams like a manual run.
        Returns a short summary for the history/toast."""
        kind = task.get("kind")
        folder = task.get("folder")
        self._push("sched_run", {
            "task_id": task.get("id"), "kind": kind, "folder": folder,
        })
        if kind == "cleanup":
        if kind == "cleanup":
            result = self.controller.scan_cleanup(on_event=self.push_event)
            return {
                "kind": "cleanup", "folder": None,
                "files": result.get("total_files", 0),
                "bytes": result.get("total_bytes", 0),
            }
        if kind == "disk_scan":
            result = self.controller.scan_space(folder, on_event=self.push_event)
            return {
                "kind": "disk_scan", "folder": folder,
                "files": result.get("files_scanned", 0),
                "bytes": result.get("total_bytes", 0),
            }
        if kind == "dup_scan":
            result = self.controller.scan_duplicates(folder, on_event=self.push_event)
            return {
                "kind": "dup_scan", "folder": folder,
                "groups": len(result.get("groups", [])),
                "bytes": result.get("wasted_bytes", 0),
            }
        raise ValueError(f"unknown task kind: {kind}")

    def _on_task_done(self, task: dict, summary: dict, ok: bool) -> None:
        """Persist last_run, record the run, and tell the UI."""
        self.controller.persist_settings()
        entry = {
            "task_id": task.get("id"),
            "kind": task.get("kind"),
            "folder": task.get("folder"),
            "ok": ok,
            "at": time.time(),
        }
        if ok:
            entry.update(summary)
        else:
            entry["error"] = summary.get("error", "failed")
        self._task_history.insert(0, entry)
        del self._task_history[TASK_HISTORY_LIMIT:]
        self._push("sched_done", entry)

    # ── State / prefs ───────────────────────────────────────────

    def get_state(self) -> dict:
        """Everything the page needs on load."""
        return {
            "version": APP_VERSION,
            "categories": self.controller.categories,
            "categoryMeta": self.controller.category_meta,
            "smartRules": self.controller.smart_rules,
            "tasks": self.controller.tasks,
            "recentFolders": self.controller.recent_folders,
            "watchedFolders": self.controller.watch_folders,
            "theme": self.controller.theme_name,
            "language": self.controller.language,
        }

    def toggle_theme(self) -> str:
        """Flip light/dark, persist it, and return the new theme name."""
        new_theme = "dark" if self.controller.theme_name == "light" else "light"
        self.controller.set_theme(new_theme)
        return new_theme

    def toggle_language(self) -> str:
        """Flip fa/en, persist it, and return the new language code."""
        new_lang = "en" if self.controller.language == "fa" else "fa"
        self.controller.set_language(new_lang)
        return new_lang

    def get_strings(self, lang: str) -> dict:
        """Return the full string table for the given language."""
        return STRINGS.get(lang, STRINGS["en"])

    # ── Analysis ───────────────────────────────────────────────

    def analyze_folder(self, path: str) -> dict:
        """Scan a folder and return the smart-analysis report.

        Returns a plain dict that JSON-serializes cleanly.
        """
        try:
            return self.controller.analyze(path)
        except Exception as e:
            return {"error": str(e)}

    # ── Dry run preview ────────────────────────────────────────

    def plan_sort(self, path: str, duplicate_mode: str = "skip") -> list:
        """Compute what a real sort would do, without touching the filesystem.

        Returns a list of dicts, each with: name, category, action,
        final_name. Path objects are serialized as strings.
        """
        try:
            plan = self.controller.plan(path, duplicate_mode)
            # Build wire-safe rows through the shared protocol contract.
            return [plan_item_wire(item) for item in plan]
        except Exception as e:
            return [{"error": str(e)}]

    # ── Sort ───────────────────────────────────────────────────

    def start_sort(self, path: str, move: bool = False,
                   duplicate_mode: str = "skip") -> bool:
        """Kick off a sort on a background thread; return False if another
        sort/undo operation is still running."""
        if not self._begin_operation("sort"):
            return False
        threading.Thread(
            target=self._run_sort,
            args=(path, move, duplicate_mode),
            daemon=True,
        ).start()
        return True

    def _run_sort(self, path: str, move: bool, duplicate_mode: str) -> None:
        """Background-thread body: stream every AppController event."""
        def on_event(kind, payload):
            self.push_event(kind, payload)

        try:
            self.controller.sort(
                path, move=move, duplicate_mode=duplicate_mode, on_event=on_event
            )
        except Exception as e:
            self.push_event("error", str(e))
        finally:
            self._finish_operation("sort")

    # ── Undo ───────────────────────────────────────────────────

    def undo_sort(self) -> bool:
        """Kick off an undo on a background thread; return False if another
        sort/undo operation is still running."""
        if not self._begin_operation("sort"):
            return False
        threading.Thread(target=self._run_undo, daemon=True).start()
        return True

    def _run_undo(self) -> None:
        """Background-thread body for undo."""
        def on_event(kind, payload):
            self.push_event(kind, payload)

        try:
            self.controller.undo(on_event=on_event)
        except Exception as e:
            self.push_event("error", str(e))
        finally:
            self._finish_operation("sort")

    # ── Duplicate finder ───────────────────────────────────────

    def find_duplicates(self, path: str) -> bool:
        """Kick off a duplicate scan. Only one disk/duplicate scan may run
        at a time; the returned boolean tells the UI whether it started."""
        cancel = self._begin_scan("duplicates")
        if cancel is None:
            return False
        threading.Thread(
            target=self._run_dup_scan, args=(path, cancel), daemon=True
        ).start()
        return True

    def _run_dup_scan(self, path: str, cancel_event=None) -> None:
        cancel_event = cancel_event or self._scan_cancel
        def on_event(kind, payload):
            self.push_event(kind, payload)

        try:
            result = self.controller.scan_duplicates(
                path, on_event=on_event, cancel_event=cancel_event
            )
            self.push_event("dup_done", result)
        except Exception as e:
            self.push_event("error", str(e))
        finally:
            self._finish_scan(cancel_event)

    def delete_duplicates(self, paths: list) -> dict:
        """Permanently delete the given duplicate copies (whitelisted to
        the last scan). Returns {"deleted": [...], "failed": [...]}."""
        try:
            return self.controller.delete_duplicates(paths)
        except Exception as e:
            return {
                "deleted": [],
                "failed": [{"path": p, "error": str(e)} for p in paths],
            }

    # ── Disk space analysis ─────────────────────────────────────

    def list_drives(self) -> list:
        """Enumerate local drives (letter, root path, total/free bytes)."""
        return self.controller.list_drives()

    def scan_disk(self, path: str) -> bool:
        """Kick off a disk-space scan. Only one disk/duplicate scan may run."""
        cancel = self._begin_scan("disk")
        if cancel is None:
            return False
        threading.Thread(
            target=self._run_disk_scan, args=(path, cancel), daemon=True
        ).start()
        return True

    def cancel_scan(self) -> bool:
        """Ask the active disk/duplicate scan to stop at the next file."""
        with self._scan_lock:
            ev = self._scan_cancel
            if ev is None or ev.is_set():
                return False
            ev.set()
            return True

    def _run_disk_scan(self, path: str, cancel_event=None) -> None:
        cancel_event = cancel_event or self._scan_cancel
        def on_event(kind, payload):
            self.push_event(kind, payload)

        try:
            result = self.controller.scan_space(
                path, on_event=on_event, cancel_event=cancel_event
            )
            self.push_event("space_done", result)
        except Exception as e:
            self.push_event("error", str(e))
        finally:
            self._finish_scan(cancel_event)

    # ── Temp / cache cleanup ────────────────────────────────────

    def scan_cleanup(self) -> bool:
        """Kick off a junk-location scan, unless one is already running."""
        if not self._begin_operation("cleanup"):
            return False
        threading.Thread(target=self._run_clean_scan, daemon=True).start()
        return True

    def _run_clean_scan(self) -> None:
        def on_event(kind, payload):
            self.push_event(kind, payload)

        try:
            result = self.controller.scan_cleanup(on_event=on_event)
            self.push_event("clean_done", result)
        except Exception as e:
            self.push_event("error", str(e))
        finally:
            self._finish_operation("cleanup")
    def delete_cleanup(self, location_ids: list) -> dict:
        """Permanently delete everything the last cleanup scan flagged
        under the given location ids. Returns {"deleted": [...],
        "failed": [...], "freed_bytes": int}."""
        try:
            return self.controller.delete_cleanup(location_ids)
        except Exception as e:
            return {
                "deleted": [],
                "failed": [{"path": loc_id, "error": str(e)} for loc_id in location_ids],
                "freed_bytes": 0,
            }

    def recycle_bin_status(self) -> dict:
        """Query the Recycle Bin (all drives): files and total bytes.
        Read-only; {"available": False} off-Windows."""
        return self.controller.recycle_bin_status()

    def empty_recycle_bin(self) -> dict:
        """Empty the Recycle Bin permanently. Callers arm a two-step
        confirmation first; the backend performs no extra check because
        the RPC is only reachable from the local UI.
        """
        return self.controller.empty_recycle_bin()

    # ── Watch mode ─────────────────────────────────────────────

    def add_watch_folder(self, path: str) -> bool:
        """Add a folder to the watch list and start watching it if the
        watcher is already running."""
        if self.controller.add_watch_folder(path):
            self.watch_manager.update_folders(self.controller.watch_folders)
        return True

    def remove_watch_folder(self, path: str) -> bool:
        """Remove a folder from the watch list."""
        if self.controller.remove_watch_folder(path):
            self.watch_manager.update_folders(self.controller.watch_folders)
        return True

    def start_watch(self) -> bool:
        """Start the background polling thread. Returns immediately; per-file
        decisions arrive via _push() watch_item/watch_error."""
        self.watch_manager.update_folders(self.controller.watch_folders)
        self.watch_manager.start()
        return True

    def stop_watch(self) -> bool:
        """Stop the background polling thread."""
        self.watch_manager.stop()
        return True

    # ── Settings ───────────────────────────────────────────────

    def save_categories(self, categories: dict, meta: dict = None) -> bool:
        """Persist updated categories (and optional display metadata) to settings."""
        self.controller.update_categories(categories, meta)
        return True

    def save_smart_rules(self, rules: list) -> bool:
        """Persist the ordered smart-rule list (filename keywords -> category)."""
        self.controller.update_smart_rules(rules)
        return True

    def restore_defaults(self) -> dict:
        """Reset categories to defaults and return them."""
        self.controller.update_categories(
            {k: list(v) for k, v in DEFAULT_CATEGORIES.items()}, meta={}
        )
        return self.controller.categories