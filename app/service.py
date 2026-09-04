"""File Sorter — headless local service (stdlib only).

Runs the exact same AppController behind a loopback HTTP server, with
no UI window at all:

    python main_web.py --headless --port 8175

Endpoints:
    GET  /            serves the built React UI (ui/dist), with the
                      per-run api token injected into the page
    POST /api         JSON-RPC: {"method": ..., "params": [...]}
                      -> {"result": ...} / {"error": ...}
    GET  /events      Server-Sent Events stream (sort_item, dup_done,
                      space_progress, watch_item, ...)

The server binds 127.0.0.1 only and every /api and /events request must
carry the per-run token (X-Api-Token header, or ?token= for EventSource),
so no other local process or webpage can drive the sorter. The token is
injected into the served page as <meta name="api-token" ...>, which the
frontend transport reads automatically.

This is the foundation the roadmap's drive-wide / scheduled / always-on
features build on: the same JSON vocabulary the pywebview bridge uses,
just over HTTP.
"""

import json
import queue
import secrets
import socket
import sys
import threading
from functools import partial
from http.server import BaseHTTPRequestHandler, SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

from app.api import BaseApi

_TOKEN_META = '<meta name="api-token" content="{token}">'


def _base_dir() -> Path:
    """Return the project root — works both when run from source and
    when bundled by PyInstaller (--onefile unpacks to sys._MEIPASS).
    """
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parent.parent


def _dist_dir() -> Path:
    return _base_dir() / "ui" / "dist"


def _require_build() -> Path:
    dist = _dist_dir()
    index = dist / "index.html"
    if not index.exists():
        sys.exit(
            "Frontend build not found at ui/dist/index.html. "
            "Build it first with:  cd ui && npm install && npm run build"
        )
    return dist


# ══════════════════════════════════════════════════════════════════
#  Shared static file server (used by both the windowed pywebview app
#  and the headless service)
# ══════════════════════════════════════════════════════════════════

class _DistHandler(SimpleHTTPRequestHandler):
    """Serve the built React UI quietly (no per-request logging)."""

    def log_message(self, *args):  # silence per-request logging
        pass


def serve_dist() -> str:
    """Serve the built React UI (ui/dist) over an ephemeral local port.

    Returns the page URL for pywebview to open. localhost HTTP is used
    instead of a file:// URL on purpose: the frontend ships as ES
    modules, which browsers refuse to load from file:// due to CORS.

    The server binds an ephemeral loopback port (never exposed) and runs
    on a daemon thread, so it dies with the app.
    """
    dist = _require_build()
    handler = partial(_DistHandler, directory=str(dist))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{server.server_address[1]}/index.html"


# ══════════════════════════════════════════════════════════════════
#  ServiceApi — headless frontend adapter
# ══════════════════════════════════════════════════════════════════

class ServiceApi(BaseApi):
    """Headless adapter: events fan out to SSE subscribers instead of a
    webview window, and there is no native folder dialog.
    """

    def __init__(self):
        super().__init__()
        self._subscribers = set()
        self._lock = threading.Lock()

    # ── event fan-out ───────────────────────────────────────────

    def _push(self, kind: str, payload) -> None:
        data = json.dumps({"kind": kind, "payload": payload}, default=str)
        with self._lock:
            subs = tuple(self._subscribers)
        for q in subs:
            try:
                q.put_nowait(data)
            except queue.Full:
                pass  # slowest reader drops events rather than stalling scans

    def _subscribe(self) -> queue.Queue:
        q = queue.Queue(maxsize=256)
        with self._lock:
            self._subscribers.add(q)
        return q

    def _unsubscribe(self, q: queue.Queue) -> None:
        with self._lock:
            self._subscribers.discard(q)


# ══════════════════════════════════════════════════════════════════
#  HTTP layer
# ══════════════════════════════════════════════════════════════════

def _json_default(obj):
    """JSON-serialize Path objects and friends as strings."""
    return str(obj)


class FileSorterService:
    """The headless local service: UI + JSON-RPC + SSE on one loopback port."""

    def __init__(self, api: ServiceApi = None, token: str = None,
                 port: int = 8175):
        self.api = api or ServiceApi()
        self.token = token or secrets.token_hex(16)
        self.port = port
        self._httpd = None
        self._thread = None

    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def _build_handler(self):
        api = self.api
        token = self.token
        dist = _require_build()

        class Handler(_DistHandler):
            server_version = "FileSorterService/6.1.2"
            protocol_version = "HTTP/1.1"

            def _authorized(self, parsed=None):
                header = self.headers.get("X-Api-Token")
                query = parsed.query if parsed else ""
                params = parse_qs(query) if query else {}
                tok = header or (params.get("token", [""])[0] if params else "")
                return tok == token

            def _send_json(self, status: int, obj: dict) -> None:
                body = json.dumps(obj, default=_json_default).encode("utf-8")
                self.send_response(status)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(body)

            def _serve_index(self) -> None:
                index = dist / "index.html"
                content = index.read_bytes()
                meta = _TOKEN_META.format(token=token).encode("utf-8")
                if b"</head>" in content:
                    content = content.replace(b"</head>", meta + b"</head>", 1)
                else:
                    content = meta + content
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(content)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(content)

            def _handle_events(self, parsed) -> None:
                if not self._authorized(parsed):
                    self._send_json(401, {"error": "unauthorized"})
                    return
                q = api._subscribe()
                try:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.send_header("Cache-Control", "no-cache")
                    self.send_header("Connection", "keep-alive")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(b": connected\n\n")
                    self.wfile.flush()
                    while True:
                        try:
                            data = q.get(timeout=15)
                        except queue.Empty:
                            # heartbeat so proxies / the browser keep the
                            # connection alive during long idle stretches
                            self.wfile.write(b": ping\n\n")
                            self.wfile.flush()
                            continue
                        self.wfile.write(f"data: {data}\n\n".encode("utf-8"))
                        self.wfile.flush()
                except (BrokenPipeError, ConnectionResetError, OSError, ValueError):
                    pass  # client went away — normal for SSE
                finally:
                    api._unsubscribe(q)

            def _handle_api(self, parsed) -> None:
                if not self._authorized(parsed):
                    self._send_json(401, {"error": "unauthorized"})
                    return
                try:
                    length = int(self.headers.get("Content-Length", 0))
                    raw = self.rfile.read(length) if length else b"{}"
                    body = json.loads(raw.decode("utf-8") or "{}")
                except (ValueError, json.JSONDecodeError):
                    self._send_json(400, {"error": "invalid json"})
                    return
                method = body.get("method", "")
                params = body.get("params", [])
                fn = getattr(api, method, None)
                if method.startswith("_") or not callable(fn):
                    self._send_json(400, {"error": f"unknown method: {method}"})
                    return
                try:
                    if isinstance(params, dict):
                        result = fn(**params)
                    else:
                        result = fn(*params)
                except Exception as e:  # method-level failure -> RPC error
                    self._send_json(500, {"error": str(e)})
                    return
                self._send_json(200, {"result": result})

            # ── verbs ──────────────────────────────────────────

            def do_OPTIONS(self):
                # CORS preflight (vite dev runs on a different origin)
                self.send_response(204)
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
                self.send_header("Access-Control-Allow-Headers", "X-Api-Token, Content-Type")
                self.send_header("Content-Length", "0")
                self.end_headers()

            def do_GET(self):
                parsed = urlsplit(self.path)
                if parsed.path == "/events":
                    self._handle_events(parsed)
                    return
                if parsed.path == "/" or parsed.path == "/index.html":
                    self._serve_index()
                    return
                super().do_GET()

            def do_POST(self):
                parsed = urlsplit(self.path)
                if parsed.path != "/api":
                    self._send_json(404, {"error": "not found"})
                    return
                self._handle_api(parsed)

        return Handler

    # ── lifecycle ──────────────────────────────────────────────

    def _bind(self):
        """Build the handler factory, bind the port (falling back to a
        free one if the preferred port is taken) and record the real
        port. Returns the bound ThreadingHTTPServer."""
        dist = _require_build()
        handler_cls = self._build_handler()
        factory = partial(handler_cls, directory=str(dist))
        httpd = ThreadingHTTPServer(("127.0.0.1", self.port), factory)
        self.port = httpd.server_address[1]
        return httpd

    def start(self) -> None:
        """Bind the port and start serving on a background thread."""
        self._httpd = self._bind()
        self.api.start_tasks()  # scheduled tasks run while the service is up
        self._thread = threading.Thread(
            target=self._httpd.serve_forever, daemon=True, name="filesorter-service"
        )
        self._thread.start()

    def serve_forever(self) -> None:
        """Bind and serve on the calling thread (used by tests / CLI)."""
        self._httpd = self._bind()
        self.api.start_tasks()
        self._httpd.serve_forever()

    def shutdown(self) -> None:
        if self._httpd:
            self._httpd.shutdown()
            self._httpd.server_close()
            self._httpd = None


def run_service(port: int = 8175, token: str = None) -> None:
    """Blocking entry point for the headless service (CLI / packaged)."""
    import time

    service = FileSorterService(token=token, port=port)
    service.start()
    print(f"FileSorter service running at {service.url()}")
    print(f"API token: {service.token}")
    try:
        while True:
            time.sleep(3600)
    except KeyboardInterrupt:
        service.shutdown()
        print("Service stopped.")