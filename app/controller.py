"""AppController — the application's business logic, entirely UI-free.

This is what lets any interface (today the React UI driven through the
PyWebView bridge in main_web.py) drive the exact same folder analysis,
sorting, undo, and settings logic without duplicating or rewriting any
of it — only the adapter layer changes when the front end does.

Design rule: nothing in this module imports a GUI framework, and no
method here touches a widget. Long-running operations (sort, undo)
accept an `on_event(kind, payload)` callback so the caller decides how
to report progress — the web UI streams those events over the JS
bridge, and a future caller could stream them over a websocket or an
async generator without this file changing at all.

Every method is safe to call from any thread; the controller itself
never starts threads — the caller decides that too.
"""

import shutil
from pathlib import Path

from app.constants import DEFAULT_CATEGORIES
from app.settings_manager import load_settings, save_settings, add_recent_folder
from app.duplicates import delete_files, scan_duplicates
from app.disk_scan import list_drives, scan_space
from app.cleanup import delete_junk, scan_junk
from app.sorter import analyze_folder, plan_sort


class AppController:
    """Holds application state and every piece of non-UI logic."""

    def __init__(self):
        self.settings = load_settings()
        self.categories = self.settings.get("categories", DEFAULT_CATEGORIES.copy())
        self.category_meta = self.settings.get("category_meta", {})
        self.language = self.settings.get("language", "fa")
        self.theme_name = self.settings.get("theme", "light")
        self.recent_folders = self.settings.get("recent_folders", [])
        self.watch_folders = self.settings.get("watched_folders", [])
        self.smart_rules = self.settings.get("smart_rules", [])
        self.tasks = self.settings.get("tasks", [])
        self.last_sort_log = []  # for undo: list of {"action", "source", "final_dest"}
        self.last_dup_paths = set()  # whitelist of paths the last duplicate scan flagged
        self.last_clean_by_loc = {}  # {location_id: [paths]} flagged by the last cleanup scan

    # ══════════════════════════════════════════════════════════════
    #  Settings
    # ══════════════════════════════════════════════════════════════

    def set_language(self, lang: str) -> None:
        self.language = lang
        self.settings["language"] = lang
        save_settings(self.settings)

    def set_theme(self, theme_name: str) -> None:
        self.theme_name = theme_name
        self.settings["theme"] = theme_name
        save_settings(self.settings)

    def update_categories(self, categories: dict, meta: dict = None) -> None:
        self.categories = categories
        self.settings["categories"] = categories
        if meta is not None:
            self.category_meta = meta
            self.settings["category_meta"] = meta
        # Drop smart rules whose target category was removed — they can no
        # longer match anything (match_rule_category skips them anyway).
        if self.smart_rules:
            self.smart_rules = [
                r for r in self.smart_rules if r.get("category") in categories
            ]
            self.settings["smart_rules"] = self.smart_rules
        save_settings(self.settings)

    def update_smart_rules(self, rules: list) -> None:
        """Persist the ordered smart-rule list (keywords -> category)."""
        self.smart_rules = [
            {
                "keywords": [str(k).strip() for k in r.get("keywords") or [] if str(k).strip()],
                "category": r.get("category", ""),
            }
            for r in rules or []
            if r.get("category") in self.categories
        ]
        self.settings["smart_rules"] = self.smart_rules
        save_settings(self.settings)

    def record_recent_folder(self, path: str) -> list:
        """Add `path` to the recent-folders list (persisted) and return it."""
        add_recent_folder(self.settings, path)
        self.recent_folders = self.settings["recent_folders"]
        return self.recent_folders

    # ══════════════════════════════════════════════════════════════
    #  Scheduled tasks (v5.9.0)
    # ══════════════════════════════════════════════════════════════

    TASK_KINDS = ("cleanup", "disk_scan", "dup_scan")

    def persist_settings(self) -> None:
        """Write the in-memory settings dict (incl. tasks + last_run
        timestamps) back to disk. Called after scheduled runs finish.
        """
        save_settings(self.settings)

    def add_task(self, kind: str, folder: str = None,
                 interval_minutes: int = 1440) -> dict:
        """Create and persist a scheduled task.

        kind: one of TASK_KINDS (cleanup needs no folder).
        folder: scan target for disk_scan/dup_scan.
        interval_minutes: how often to run (>= 1).

        last_run is set to now, so the first automatic run happens a
        full interval from creation ("Run now" is always available).
        """
        import time
        import uuid

        if kind not in self.TASK_KINDS:
            raise ValueError(f"unknown task kind: {kind}")
        if kind in ("disk_scan", "dup_scan") and not folder:
            raise ValueError(f"{kind} needs a folder")
        interval = max(1, int(interval_minutes or 1))
        task = {
            "id": f"tk_{uuid.uuid4().hex[:10]}",
            "kind": kind,
            "folder": folder,
            "interval_minutes": interval,
            "enabled": True,
            "last_run": time.time(),
        }
        self.tasks.append(task)
        self.settings["tasks"] = self.tasks
        save_settings(self.settings)
        return task

    def update_task(self, task_id: str, patch: dict = None) -> dict:
        """Apply a patch ({enabled, interval_minutes, folder}) to a task.
        Returns the task, or None if the id doesn't exist.
        """
        task = next((t for t in self.tasks if t.get("id") == task_id), None)
        if task is None:
            return None
        patch = patch or {}
        if "enabled" in patch:
            task["enabled"] = bool(patch["enabled"])
        if "interval_minutes" in patch:
            task["interval_minutes"] = max(1, int(patch["interval_minutes"] or 1))
        if "folder" in patch:
            if task["kind"] in ("disk_scan", "dup_scan"):
                task["folder"] = patch["folder"] or None
        self.settings["tasks"] = self.tasks
        save_settings(self.settings)
        return task

    def remove_task(self, task_id: str) -> bool:
        """Delete a task. Returns True if something was removed."""
        before = len(self.tasks)
        self.tasks = [t for t in self.tasks if t.get("id") != task_id]
        self.settings["tasks"] = self.tasks
        if len(self.tasks) != before:
            save_settings(self.settings)
            return True
        return False


    def add_watch_folder(self, path: str) -> list:
        """Add `path` to the watched-folder list (persisted). Returns the list."""
        if path not in self.watch_folders:
            self.watch_folders.append(path)
            self.settings["watched_folders"] = self.watch_folders
            save_settings(self.settings)
        return self.watch_folders

    def remove_watch_folder(self, path: str) -> list:
        """Remove `path` from the watched-folder list (persisted). Returns the list."""
        if path in self.watch_folders:
            self.watch_folders.remove(path)
            self.settings["watched_folders"] = self.watch_folders
            save_settings(self.settings)
        return self.watch_folders

    # ══════════════════════════════════════════════════════════════
    #  Analysis / planning — pure, synchronous, safe on any thread
    # ══════════════════════════════════════════════════════════════

    def analyze(self, path: str) -> dict:
        """Scan a folder and return the smart-analysis report."""
        return analyze_folder(Path(path), self.categories, rules=self.smart_rules)

    def plan(self, path: str, duplicate_mode: str = "skip") -> list:
        """Compute what a real sort would do, without touching the filesystem
        (used for the Dry Run preview).
        """
        return plan_sort(Path(path), self.categories, duplicate_mode, rules=self.smart_rules)

    # ══════════════════════════════════════════════════════════════
    #  Sort
    # ══════════════════════════════════════════════════════════════

    def list_drives(self) -> list:
        """Enumerate local drives (Windows): letter, root path, and
        total/free bytes. Empty list on non-Windows platforms.
        """
        return list_drives()

    def scan_space(self, path: str, on_event=None, cancel_event=None) -> dict:
        """Analyze disk usage of `path` — a folder or a whole drive root:
        per-category totals and the largest files, bucketed by the
        current sort categories. Emits ("space_progress", ...) events
        during the walk; when cancel_event gets set, the walk stops at
        the next file boundary and returns partial results with
        "cancelled": True. Read-only.
        """
        return scan_space(
            Path(path), self.categories, on_event=on_event, cancel_event=cancel_event
        )

    def scan_cleanup(self, on_event=None) -> dict:
        """Scan known junk locations (user temp, caches, crash dumps),
        reporting progress through on_event(kind, payload):

        - ("clean_progress", {"phase": "scanning", "location": str,
                              "processed": int, "files": int,
                              "bytes": int}) — repeatedly

        Returns {"locations": [{"id", "files", "bytes"}],
        "total_files", "total_bytes"} and records the exact file list
        as the deletion whitelist for delete_cleanup().
        """
        result = scan_junk(on_event=on_event, want_paths=True)
        # Whitelist per location: delete_cleanup(location_ids) later
        # removes exactly these files and nothing else — a file that
        # appeared *after* the scan is never touched.
        self.last_clean_by_loc = {
            loc_id: [Path(p) for p in loc_paths]
            for loc_id, loc_paths in result.get("paths", {}).items()
        }
        return {k: v for k, v in result.items() if k != "paths"}

    def delete_cleanup(self, location_ids: list) -> dict:
        """Delete every file the last cleanup scan flagged under the
        given location ids (whitelisted — see cleanup.delete_junk).
        Returns {"deleted": [...], "failed": [{"path", "error"}],
        "freed_bytes": int}.
        """
        whitelist = set()
        paths: list = []
        for loc_id in location_ids:
            loc_paths = self.last_clean_by_loc.get(loc_id, [])
            whitelist.update(loc_paths)
            paths.extend(str(p) for p in loc_paths)
        return delete_junk(paths, whitelist)

    def scan_duplicates(self, path: str, on_event=None, cancel_event=None) -> dict:
        """Find duplicate files under `path` (identical content), reporting
        progress through on_event(kind, payload):

        - ("dup_progress", {"phase": "listing"|"hashing",
                            "processed": int, "total": int}) — repeatedly

        Returns {"groups", "wasted_bytes", "files_scanned"} and records
        the flagged file paths as the deletion whitelist for
        delete_duplicates().
        """
        result = scan_duplicates(Path(path), on_event=on_event, cancel_event=cancel_event)
        self.last_dup_paths = {
            Path(f["path"])
            for group in result["groups"]
            for f in group["files"]
        }
        return result

    def delete_duplicates(self, paths: list) -> dict:
        """Delete the given duplicate copies — only paths the last scan
        flagged are touched (see duplicates.delete_files). Returns
        {"deleted": [...], "failed": [{"path", "error"}]}.
        """
        return delete_files(list(paths), self.last_dup_paths)

    def sort(self, path: str, move: bool = False, duplicate_mode: str = "skip", on_event=None) -> dict:
        """Run a real sort, reporting progress through on_event(kind, payload).

        Event kinds emitted, in order:
        - ("total", file_count)               — once, as soon as it's known
        - ("item", {...}) — once per file:
            {"status": "skip", "name": str, "category": str}
            {"status": "ok", "name": str, "category": str, "action": "copied"|"moved"}
            {"status": "error", "name": str, "error": str}
        - ("progress", files_processed_so_far) — once per file, after "item"
        - ("done", result_dict)                — once, on success
        - ("error", message)                   — instead of "done", on a
          fatal error that stopped the sort entirely (e.g. can't create
          the output folder)

        Args:
            path: The folder to sort.
            move: If True, files are moved (removed from source). If False
                (default), files are copied and the originals are kept.
            duplicate_mode: "skip" (default), "rename", or "overwrite".
            on_event: Optional callback(kind: str, payload) for progress.

        Returns:
            {"copied": int, "skipped": int, "errors": int,
             "target_dir": Path, "sort_log": list}
        """
        def emit(kind, payload=None):
            if on_event:
                on_event(kind, payload)

        base_dir = Path(path)
        target_dir = base_dir / "sorted"
        sort_log = []

        try:
            for category in self.categories:
                (target_dir / category).mkdir(parents=True, exist_ok=True)

            plan = plan_sort(base_dir, self.categories, duplicate_mode, rules=self.smart_rules)
            emit("total", len(plan))

            copied = skipped = errors = processed = 0

            for item in plan:
                source, final_dest = item["source"], item["final_dest"]
                action, category = item["action"], item["category"]

                if action == "skip":
                    emit("item", {"status": "skip", "name": item["name"], "category": category})
                    skipped += 1
                else:
                    try:
                        if move:
                            shutil.move(str(source), str(final_dest))
                            sort_log.append({"action": "moved", "source": source, "final_dest": final_dest,
                              "name": item["name"], "category": category})
                            emit("item", {"status": "ok", "name": item["final_name"],
                                          "category": category, "action": "moved"})
                        else:
                            shutil.copy2(source, final_dest)
                            sort_log.append({"action": "copied", "source": source, "final_dest": final_dest,
                               "name": item["name"], "category": category})
                            emit("item", {"status": "ok", "name": item["final_name"],
                                          "category": category, "action": "copied"})
                        copied += 1
                    except Exception as e:
                        emit("item", {"status": "error", "name": item["name"], "error": str(e)})
                        errors += 1

                processed += 1
                emit("progress", processed)

            self.last_sort_log = sort_log
            result = {
                "copied": copied, "skipped": skipped, "errors": errors,
                "target_dir": target_dir, "sort_log": sort_log,
            }
            emit("done", result)
            return result

        except Exception as e:
            emit("error", str(e))
            raise

    # ══════════════════════════════════════════════════════════════
    #  Undo
    # ══════════════════════════════════════════════════════════════

    def undo(self, on_event=None) -> dict:
        """Reverse the last sort() call: move files back, delete copies made
        by this app. Files overwritten as duplicates cannot be restored.

        Event kinds emitted, in order:
        - ("total", entry_count)
        - ("item", {...}) — once per entry:
            {"status": "restored", "name": str}
            {"status": "removed", "name": str}
            {"status": "failed", "name": str, "error": str}
        - ("progress", entries_processed_so_far)
        - ("done", result_dict)

        Returns:
            {"restored": int, "removed": int, "failed": int, "nothing": bool}
            `nothing` is True (and everything else 0) if there was no
            previous sort to undo — the caller decides how to tell the user.
        """
        def emit(kind, payload=None):
            if on_event:
                on_event(kind, payload)

        entries = list(self.last_sort_log)
        if not entries:
            result = {"restored": 0, "removed": 0, "failed": 0, "nothing": True}
            emit("done", result)
            return result

        emit("total", len(entries))
        restored = removed = failed = processed = 0

        for entry in reversed(entries):
            source, final_dest = entry["source"], entry["final_dest"]
            try:
                if entry["action"] == "moved":
                    source.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(final_dest), str(source))
                    emit("item", {"status": "restored", "name": source.name})
                    restored += 1
                else:  # "copied"
                    if final_dest.exists():
                        final_dest.unlink()
                    emit("item", {"status": "removed", "name": final_dest.name})
                    removed += 1
            except Exception as e:
                emit("item", {"status": "failed", "name": final_dest.name, "error": str(e)})
                failed += 1

            processed += 1
            emit("progress", processed)

        self.last_sort_log = []
        result = {"restored": restored, "removed": removed, "failed": failed, "nothing": False}
        emit("done", result)
        return result
