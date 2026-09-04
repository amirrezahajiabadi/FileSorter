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
"""

import threading

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.controller import AppController
from app.i18n import STRINGS
from app.protocol import plan_item_wire
from app.watcher import WatchManager


class BaseApi:
    """Everything the UI can ask the Python core to do.

    Long-running operations (sort, undo, scans) return immediately and
    stream progress via ``_push(kind, payload)`` — the subclass decides
    how those events reach the page.
    """

    def __init__(self):
        self.controller = AppController()
        self._scan_cancel = None  # set per scan by find_duplicates()/scan_disk(); read by cancel_scan()
        self.watch_manager = WatchManager(
            get_categories=lambda: self.controller.categories,
            on_event=self._push,
            get_rules=lambda: self.controller.smart_rules,
        )
        self.watch_manager.update_folders(self.controller.watch_folders)

    # ── Subclass hooks ──────────────────────────────────────────

    def _push(self, kind: str, payload) -> None:
        """Deliver a live event (sort_item, dup_done, ...) to the UI."""
        raise NotImplementedError

    def browse_folder(self):
        """Open a native folder-picker dialog.

        Headless frontends have no dialog; they keep this default and
        return None, and the UI falls back to a typed path.
        """
        return None

    # ── State / prefs ───────────────────────────────────────────

    def get_state(self) -> dict:
        """Everything the page needs on load."""
        return {
            "version": APP_VERSION,
            "categories": self.controller.categories,
            "categoryMeta": self.controller.category_meta,
            "smartRules": self.controller.smart_rules,
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
        """Kick off a sort on a background thread. Returns immediately —
        progress/log/completion are pushed separately via _push(), not
        through this call's return value.
        """
        threading.Thread(
            target=self._run_sort,
            args=(path, move, duplicate_mode),
            daemon=True,
        ).start()
        return True

    def _run_sort(self, path: str, move: bool, duplicate_mode: str) -> None:
        """Background-thread body: stream every AppController event."""
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            self.controller.sort(
                path, move=move, duplicate_mode=duplicate_mode, on_event=on_event
            )
        except Exception as e:
            self._push("error", str(e))

    # ── Undo ───────────────────────────────────────────────────

    def undo_sort(self) -> bool:
        """Kick off an undo on a background thread. Returns immediately —
        progress/completion arrive via _push().
        """
        threading.Thread(target=self._run_undo, daemon=True).start()
        return True

    def _run_undo(self) -> None:
        """Background-thread body for undo."""
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            self.controller.undo(on_event=on_event)
        except Exception as e:
            self._push("error", str(e))

    # ── Duplicate finder ───────────────────────────────────────

    def find_duplicates(self, path: str) -> bool:
        """Kick off a duplicate scan (folder or whole drive) on a
        background thread. Returns immediately; progress and the final
        groups arrive via _push() (dup_progress / dup_done). The scan
        can be aborted mid-walk with cancel_scan()."""
        self._scan_cancel = threading.Event()
        threading.Thread(
            target=self._run_dup_scan, args=(path,), daemon=True
        ).start()
        return True

    def _run_dup_scan(self, path: str) -> None:
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            result = self.controller.scan_duplicates(
                path, on_event=on_event, cancel_event=self._scan_cancel
            )
            self._push("dup_done", result)
        except Exception as e:
            self._push("error", str(e))

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
        """Kick off a disk-space scan (folder or whole drive) on a
        background thread. Returns immediately; live counters and the
        final report arrive via _push() (space_progress / space_done).
        The scan can be aborted mid-walk with cancel_scan()."""
        self._scan_cancel = threading.Event()
        threading.Thread(
            target=self._run_disk_scan, args=(path,), daemon=True
        ).start()
        return True

    def cancel_scan(self) -> bool:
        """Ask the currently running disk/duplicate scan to stop at the
        next file boundary; its partial results arrive via space_done /
        dup_done with "cancelled": True. Returns False if nothing is
        running."""
        ev = getattr(self, "_scan_cancel", None)
        if ev is not None and not ev.is_set():
            ev.set()
            return True
        return False

    def _run_disk_scan(self, path: str) -> None:
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            result = self.controller.scan_space(
                path, on_event=on_event, cancel_event=self._scan_cancel
            )
            self._push("space_done", result)
        except Exception as e:
            self._push("error", str(e))

    # ── Temp / cache cleanup ────────────────────────────────────

    def scan_cleanup(self) -> bool:
        """Kick off a junk-location scan on a background thread. Returns
        immediately; live counters and the final report arrive via
        _push() (clean_progress / clean_done)."""
        threading.Thread(target=self._run_clean_scan, daemon=True).start()
        return True

    def _run_clean_scan(self) -> None:
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            result = self.controller.scan_cleanup(on_event=on_event)
            self._push("clean_done", result)
        except Exception as e:
            self._push("error", str(e))

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