"""File Sorter — Web UI entry point.

Run with:
    pip install pywebview
    python main_web.py

Architecture: this file (and the Api class in it) is a thin adapter,
exactly like app/ui/main_window.py is for Tkinter — it builds the
window and translates between JS calls / AppController events. All
actual logic lives in app/controller.py.
"""

import json
import sys
import threading
from pathlib import Path

import webview

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.controller import AppController
from app.i18n import STRINGS
from app.protocol import plan_item_wire


def _base_dir() -> Path:
    """Return the project root — works both when run from source and
    when bundled by PyInstaller (--onefile unpacks to sys._MEIPASS).
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent


class Api:
    """Methods exposed to JavaScript via `pywebview.api.<name>(...)`."""

    def __init__(self):
        self.controller = AppController()
        self.window = None  # set in main() once the window exists

    def get_state(self) -> dict:
        """Everything the page needs on load."""
        return {
            "version": APP_VERSION,
            "categories": self.controller.categories,
            "categoryMeta": self.controller.category_meta,
            "recentFolders": self.controller.recent_folders,
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
    web_index = str(_base_dir() / "web" / "index.html")
    window = webview.create_window(
        "FileSorter", web_index, js_api=api, width=800, height=800
    )
    api.window = window
    webview.start()


if __name__ == "__main__":
    main()
