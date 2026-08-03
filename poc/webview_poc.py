"""PyWebView proof of concept — v4.0 of the roadmap (see ROADMAP.md).

NOT part of the shipped app. This is a standalone, throwaway validation
script that confirms the technical foundation for the planned UI overhaul
works: a Python <-> HTML/JS bridge, wired to the real AppController from
app/controller.py (the same Tkinter-free logic layer the Tkinter UI uses).

If this works, a real web-based UI (Phase 3 of the roadmap) can talk to
AppController the exact same way, screen by screen, without touching
Tkinter at all.

Run with:
    pip install pywebview
    python poc/webview_poc.py

This does NOT affect `python main.py` (the real app) in any way.
"""

import sys
from pathlib import Path

# Allow running this script directly from the poc/ folder.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import webview

from app.constants import APP_VERSION
from app.controller import AppController


class Api:
    """Methods exposed to JavaScript via `pywebview.api.<name>(...)`.

    This is the same shape a real web UI would use to drive
    AppController — proof that the controller extracted in v3.9.0 is
    genuinely reusable outside of Tkinter, not just in theory.
    """

    def __init__(self):
        self.controller = AppController()

    def ping(self, message: str) -> str:
        return f"Python received: {message!r}"

    def get_app_version(self) -> str:
        return APP_VERSION

    def get_categories(self) -> dict:
        return self.controller.categories

    def analyze_folder(self, path: str) -> dict:
        """Real controller call — analyzes a folder and returns the report.
        JSON-serializes cleanly since analyze_folder() already returns
        only plain dicts/lists/strings/ints.
        """
        try:
            return self.controller.analyze(path)
        except Exception as e:
            return {"error": str(e)}


HTML = """
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>FileSorter — Web UI Proof of Concept</title>
<style>
  body {
    font-family: -apple-system, "Segoe UI", sans-serif;
    background: #1e1e2e; color: #cdd6f4;
    padding: 32px; margin: 0;
  }
  h1 { font-size: 20px; }
  p.subtitle { color: #a6adc8; font-size: 13px; margin-top: -8px; }
  button {
    background: #89b4fa; color: #1e1e2e; border: none;
    padding: 10px 18px; border-radius: 8px; cursor: pointer;
    font-size: 13px; font-weight: 600; margin-right: 8px; margin-bottom: 8px;
  }
  button:hover { background: #a6c8ff; }
  input {
    background: #313244; color: #cdd6f4; border: none;
    padding: 10px 12px; border-radius: 8px; font-size: 13px;
    width: 300px; margin-bottom: 8px;
  }
  #output {
    margin-top: 16px; padding: 14px; background: #313244;
    border-radius: 8px; min-height: 40px; white-space: pre-wrap;
    font-family: Consolas, monospace; font-size: 12px;
  }
</style>
</head>
<body>
  <h1>📁 FileSorter — Web UI Proof of Concept</h1>
  <p class="subtitle">If you can see this and the buttons work, the Python ⟷ HTML/JS bridge is solid.</p>

  <div>
    <button onclick="ping()">Ping Python</button>
    <button onclick="getVersion()">Get App Version</button>
    <button onclick="getCategories()">Get Categories (from real settings)</button>
  </div>

  <div>
    <input id="folderPath" type="text" placeholder="Paste a folder path, e.g. C:\\Users\\you\\Downloads">
    <button onclick="analyzeFolder()">Analyze Folder (real AppController call)</button>
  </div>

  <div id="output">Waiting for a button click...</div>

  <script>
    function show(data) {
      document.getElementById('output').innerText =
        typeof data === 'string' ? data : JSON.stringify(data, null, 2);
    }
    async function ping() {
      show(await pywebview.api.ping("hello from JS"));
    }
    async function getVersion() {
      show("App version: " + await pywebview.api.get_app_version());
    }
    async function getCategories() {
      show(await pywebview.api.get_categories());
    }
    async function analyzeFolder() {
      const path = document.getElementById('folderPath').value;
      if (!path) { show("Type a folder path first."); return; }
      show(await pywebview.api.analyze_folder(path));
    }
  </script>
</body>
</html>
"""


def main() -> None:
    api = Api()
    webview.create_window(
        "FileSorter — Web UI POC", html=HTML, js_api=api, width=560, height=480
    )
    webview.start()


if __name__ == "__main__":
    main()
