"""File Sorter — Web UI entry point.

Run with:
    pip install pywebview
    python main_web.py                 # windowed desktop app
    python main_web.py --headless      # local service, no window
    python main_web.py --headless --port 9000 --token dev

Architecture: this file (and the Api class in it) is a thin adapter —
it builds the window and translates between JS calls / AppController
events. All actual logic lives in app/controller.py. The frontend is
the React app in ui/ (build with `npm run build` in ui/ first); the
windowed app serves that build over a local HTTP server, and --headless
runs the same build plus a JSON-RPC/SSE API through app/service.py.
"""

import argparse
import json

import webview

from app.api import BaseApi
from app.service import run_service, serve_dist


class Api(BaseApi):
    """Windowed (pywebview) frontend adapter: native folder dialog and
    evaluate_js event push. Everything else lives in BaseApi so the
    headless service shares the exact same JSON vocabulary.
    """

    def __init__(self):
        super().__init__()
        self.window = None  # set in main() once the window exists

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

    def _push(self, kind: str, payload) -> None:
        if not self.window:
            return
        data = json.dumps({"kind": kind, "payload": payload}, default=str)
        self.window.evaluate_js(f"window.onSortEvent({data})")


def main() -> None:
    parser = argparse.ArgumentParser(description="File Sorter")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="run as a local service with no window (JSON-RPC + SSE on 127.0.0.1)",
    )
    parser.add_argument(
        "--port", type=int, default=8175, help="headless service port (default 8175)"
    )
    parser.add_argument(
        "--token",
        default=None,
        help="headless service api token (random per run if omitted)",
    )
    args = parser.parse_args()

    if args.headless:
        run_service(port=args.port, token=args.token)
        return

    api = Api()
    window = webview.create_window(
        "FileSorter", serve_dist(), js_api=api, width=800, height=800
    )
    api.window = window
    webview.start()


if __name__ == "__main__":
    main()