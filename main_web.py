"""File Sorter — Web UI entry point (v4.2, in progress).

This is a SEPARATE, parallel entry point to main.py — it does NOT
replace the Tkinter app yet. Per ROADMAP.md, the Tkinter UI stays the
shipped app until the web UI is fully built out (v5.0). Run this to
preview the new UI as it's built, screen by screen.

Run with:
    pip install pywebview
    python main_web.py

Architecture: this file (and the Api class in it) is a thin adapter,
exactly like app/ui/main_window.py is for Tkinter — it builds the
window and translates between JS calls / AppController events. All
actual logic lives in app/controller.py. See web/js/app.js for the
JS side of this bridge, and poc/webview_poc.py for the pattern this
was validated against in v4.0.
"""

import json
import threading

import webview

from app.constants import APP_VERSION
from app.controller import AppController


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
            "recentFolders": self.controller.recent_folders,
            "theme": self.controller.theme_name,
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

    def start_sort(self, path: str) -> bool:
        """Kick off a sort on a background thread. Returns immediately —
        progress/log/completion are pushed to the page separately via
        window.onSortEvent(), not through this call's return value.
        """
        threading.Thread(target=self._run_sort, args=(path,), daemon=True).start()
        return True

    def _run_sort(self, path: str) -> None:
        """Background-thread body. Push every AppController event straight
        to the page via evaluate_js — no queue.Queue needed here, unlike
        the Tkinter adapter, because pywebview's evaluate_js is documented
        safe to call from any thread (Tkinter's widget/after() calls were
        the ones that turned out not to be, see v3.6.1's CHANGELOG entry).
        """
        def on_event(kind, payload):
            self._push(kind, payload)

        try:
            self.controller.sort(path, move=False, duplicate_mode="skip", on_event=on_event)
        except Exception as e:
            self._push("error", str(e))

    def _push(self, kind: str, payload) -> None:
        if not self.window:
            return
        data = json.dumps({"kind": kind, "payload": payload}, default=str)
        self.window.evaluate_js(f"window.onSortEvent({data})")


def main() -> None:
    api = Api()
    window = webview.create_window(
        "FileSorter", "web/index.html", js_api=api, width=640, height=760
    )
    api.window = window
    webview.start()


if __name__ == "__main__":
    main()
