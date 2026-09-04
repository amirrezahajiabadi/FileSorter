"""File Sorter — Web UI entry point.

Run with:
    pip install pywebview
    python main_web.py                      # windowed desktop app
    python main_web.py --headless           # local service, no window
    python main_web.py --headless --port 9000 --token dev
    python main_web.py --headless --tray    # service + Windows tray icon
    python main_web.py --autostart on|off|status   # run at login (Windows)

Architecture: this file (and the Api class in it) is a thin adapter —
it builds the window and translates between JS calls / AppController
events. All actual logic lives in app/controller.py. The frontend is
the React app in ui/ (build with `npm run build` in ui/ first); the
windowed app serves that build over a local HTTP server, and --headless
runs the same build plus a JSON-RPC/SSE API through app/service.py.
--tray adds a system-tray icon (app/tray.py) so the service keeps
running with no console; --autostart registers/unregisters the silent
run-at-login entry (app/autostart.py, HKCU Run key, Windows only).
"""

import argparse
import json
import sys

import webview

from app import autostart
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


def parse_args(argv=None) -> argparse.Namespace:
    """Build the CLI parser (exposed for tests)."""
    parser = argparse.ArgumentParser(description="File Sorter")
    parser.add_argument(
        "--headless",
        action="store_true",
        help="run as a local service with no window (JSON-RPC + SSE on 127.0.0.1)",
    )
    parser.add_argument(
        "--tray",
        action="store_true",
        help="with --headless: keep the service under a Windows tray icon "
        "(open in browser / start at login / quit) instead of a console",
    )
    parser.add_argument(
        "--autostart",
        choices=["on", "off", "status"],
        default=None,
        help="install / remove / report the run-at-login entry for the "
        "headless service (Windows), then exit",
    )
    parser.add_argument(
        "--port", type=int, default=8175, help="headless service port (default 8175)"
    )
    parser.add_argument(
        "--token",
        default=None,
        help="headless service api token (random per run if omitted)",
    )
    return parser.parse_args(argv)


def main(argv=None) -> None:
    args = parse_args(argv)

    if args.autostart:
        sys.exit(autostart.run_cli_action(args.autostart))

    if args.headless:
        if args.tray:
            from app.tray import run_tray_service  # lazy: pythonnet import

            run_tray_service(port=args.port, token=args.token)
        else:
            run_service(port=args.port, token=args.token)
        return

    if args.tray:
        print("--tray only applies to the headless service; use --headless --tray.")
        return

    api = Api()
    api.start_tasks()  # scheduled tasks run while the desktop app is open
    window = webview.create_window(
        "FileSorter", serve_dist(), js_api=api, width=800, height=800
    )
    api.window = window
    webview.start()


if __name__ == "__main__":
    main()
