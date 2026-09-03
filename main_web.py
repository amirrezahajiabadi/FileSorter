"""File Sorter — Web UI entry point.

Run with:
    pip install pywebview
    python main_web.py

Architecture: this file (and the Api class in it) is a thin adapter —
it builds the window and translates between JS calls / AppController
events. All actual logic lives in app/controller.py. The frontend is
the React app in ui/ (build with `npm run build` in ui/ first); this
entry point serves that build over a local HTTP server.
"""

import json
import sys
import threading
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import webview

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.controller import AppController
from app.i18n import STRINGS
from app.protocol import plan_item_wire
from app.watcher import WatchManager


def _base_dir() -> Path:
    """Return the project root — works both when run from source and
    when bundled by PyInstaller (--onefile unpacks to sys._MEIPASS).
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


def _serve_dist() -> str:
    """Serve the built React UI (ui/dist) over a local HTTP server.

    Returns the page URL for pywebview to open. localhost HTTP is used
    instead of a file:// URL on purpose: the frontend ships as ES
    modules, which browsers refuse to load from file:// due to CORS.

    The server binds an ephemeral loopback port (never exposed) and runs
    on a daemon thread, so it dies with the app.
    """
    dist = _base_dir() / "ui" / "dist"
    index = dist / "index.html"
    if not index.exists():
        sys.exit(
            "Frontend build not found at ui/dist/index.html. "
            "Build it first with:  cd ui && npm install && npm run build"
        )

    class QuietHandler(SimpleHTTPRequestHandler):
        def log_message(self, *args):  # silence per-request logging
            pass

    handler = partial(QuietHandler, directory=str(dist))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/index.html"


class Api:
    """Methods exposed to JavaScript via `pywebview.api.<name>(...)`."""

    def __init__(self):
        self.controller = AppController()
        self.window = None  # set in main() once the window exists
        self.watch_manager = WatchManager(
            get_categories=lambda: self.controller.categories,
            on_event=self._push,
        )
        self.watch_manager.update_folders(self.controller.watch_folders)

    def get_state(self) -> dict:
        """Everything the page needs on load."""
        return {
            "version": APP_VERSION,
            "categories": self.controller.categories,
            "categoryMeta": self.controller.category_meta,
            "recentFolders": self.controller.recent_folders,
            "watchedFolders": self.controller.watch_folders,
            "theme": self.controller.theme_name,
            "language": self.controller.language,
        }

    def browse_folder(self):
        """Open a native folder-picker dialog. Returns the chosen path,
        or None if the user cancelled.
        """
        result = self.window.create_file_dialog(webview.FOLDER_DIALOG)
        if not result:
            return None
        path = result[0]
        self.controller.record_recent_folder(path)
        return path

    def toggle_theme(self) -> str:
        """Flip light/dark, persist it, and return the new theme name."""
        new_theme = "dark" if self.controller.theme_name == "light" else "light"
        self.controller.set_theme(new_theme)
        return new_theme

    # ── Language / i18n ────────────────────────────────────────

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
        progress/log/completion are pushed to the page separately via
        window.onSortEvent(), not through this call's return value.
        """
        threading.Thread(
            target=self._run_sort,
            args=(path, move, duplicate_mode),
            daemon=True,
        ).start()
        return True

    def _run_sort(self, path: str, move: bool, duplicate_mode: str) -> None:
        """Background-thread body. Push every AppController event straight
        to the page via evaluate_js — no queue.Queue needed here, unlike
        the Tkinter adapter, because pywebview's evaluate_js is documented
        safe to call from any thread (Tkinter's widget/after() calls were
        the ones that turned out not to be, see v3.6.1's CHANGELOG entry).
        """
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
        progress/completion arrive via window.onSortEvent().
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

    # ── Duplicate finder ─────────────────────────────────────────

    def find_duplicates(self, path: str) -> bool:
        """Kick off a duplicate scan on a background thread. Returns
        immediately; progress and the final groups arrive via
        window.onSortEvent() (dup_progress / dup_done)."""
        threading.Thread(
            target=self._run_dup_scan, args=(path,), daemon=True
        ).start()
        return True

    def _run_dup_scan(self, path: str) -> None:
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            self.controller.scan_duplicates(path, on_event=on_event)
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
        decisions arrive via window.onSortEvent() watch_item/watch_error."""
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

    def restore_defaults(self) -> dict:
        """Reset categories to defaults and return them."""
        self.controller.update_categories(
            {k: list(v) for k, v in DEFAULT_CATEGORIES.items()}, meta={}
        )
        return self.controller.categories

    # ── Internal helpers ───────────────────────────────────────

    def _push(self, kind: str, payload) -> None:
        if not self.window:
            return
        data = json.dumps({"kind": kind, "payload": payload}, default=str)
        self.window.evaluate_js(f"window.onSortEvent({data})")


def main() -> None:
    api = Api()
    window = webview.create_window(
        "FileSorter", _serve_dist(), js_api=api, width=800, height=800
    )
    api.window = window
    webview.start()


if __name__ == "__main__":
    main()
