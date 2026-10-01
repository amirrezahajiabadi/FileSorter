#!/usr/bin/env python
"""Smoke-test a *frozen* FileSorter build — the artefact, not the source.

Why this exists: a PyInstaller build is assembled by a static analyser, so a
missed hidden import or an over-eager ``excludes`` entry never shows up in
pytest (which runs from source). It shows up as a crash on a user's machine.
This script exercises the real executable the way a release does:

  * the onedir layout PyInstaller produced (exe + ``_internal`` + the
    bundled React build + the pythonnet/WebView2 runtime the window needs)
  * the Windows version resource Explorer shows in the file's Details tab
  * ``--autostart status``: console I/O from a windowed (no-console) exe
  * the headless JSON-RPC service end to end: auth rejection, a real
    method call, the token injected into the served page, and the SSE stream

Usage (after building):

    python -m PyInstaller --clean --noconfirm FileSorter.spec
    python tools/smoke_test_build.py

Exit code 0 means the build is shippable; non-zero lists what failed.
"""

from __future__ import annotations

import argparse
import json
import re
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_EXE = ROOT / "dist" / "FileSorter" / "FileSorter.exe"

EXE_NAME = "FileSorter.exe"

_passed = 0
_failures: list[str] = []


# ══════════════════════════════════════════════════════════════════
#  Tiny assertion helpers (one failing check must not hide the rest)
# ══════════════════════════════════════════════════════════════════

def expect(condition, label: str, detail: str = "") -> bool:
    """Record one check and print its outcome.

    ASCII only on purpose: this runs in Windows consoles whose code page
    is not UTF-8, where a nicer dash would be an encoding error instead of
    a log line. ``detail`` is for the failure text.
    """
    global _passed
    if condition:
        _passed += 1
        print(f"  [ok]   {label}")
    else:
        _failures.append(label)
        print(f"  [FAIL] {label}" + (f" - {detail}" if detail else ""))
    return bool(condition)


def section(title: str) -> None:
    print(f"\n=== {title} ===")


# ══════════════════════════════════════════════════════════════════
#  1. Layout — what PyInstaller actually put on disk
# ══════════════════════════════════════════════════════════════════

def check_layout(exe: Path) -> None:
    section("frozen layout")
    internal = exe.parent / "_internal"

    expect(exe.is_file(), f"{exe.name} exists", str(exe))
    if not exe.is_file():
        return  # nothing else can be checked meaningfully

    expect(internal.is_dir(), "_internal/ directory (onedir build)")

    # The React app is served from here at runtime; a missing or stale
    # ui/dist is the classic "white window" bug in a packaged webview app.
    index = internal / "ui" / "dist" / "index.html"
    expect(index.is_file(), "bundled frontend (ui/dist/index.html)")
    if index.is_file():
        html = index.read_text(encoding="utf-8", errors="replace")
        expect('type="module"' in html or ".js" in html,
               "bundled frontend references its JS entry points")
        expect(len(list((internal / "ui" / "dist").rglob("*.js"))) > 0,
               "bundled frontend has JS chunks")

    # The windowed app cannot open a window at all without these.
    expect((internal / "pythonnet" / "runtime" / "Python.Runtime.dll").is_file(),
           "pythonnet runtime (bridge to WinForms/WebView2)")
    webview_lib = internal / "webview" / "lib"
    expect(webview_lib.is_dir(), "pywebview lib/ directory")
    if webview_lib.is_dir():
        expect(any(webview_lib.glob("Microsoft.Web.WebView2.*.dll")),
               "WebView2 managed assemblies")
        expect(any(webview_lib.rglob("WebView2Loader.dll")),
               "WebView2 native loader (per-arch runtimes)")


# ══════════════════════════════════════════════════════════════════
#  2. Version resource — must match the app's single source of truth
# ══════════════════════════════════════════════════════════════════

def check_version_resource(exe: Path) -> None:
    section("version resource")
    sys.path.insert(0, str(ROOT))
    try:
        from app.constants import APP_VERSION
    except Exception as exc:  # pragma: no cover - source tree broken
        expect(False, "read APP_VERSION from app/constants.py", str(exc))
        return

    try:
        from PyInstaller.utils.win32.versioninfo import (
            read_version_info_from_executable,
        )

        text = str(read_version_info_from_executable(str(exe)))
    except Exception as exc:  # pragma: no cover - PyInstaller not installed
        print(f"  [skip] version resource — PyInstaller unavailable: {exc}")
        return

    found = dict(re.findall(r"StringStruct\('(\w+)', ['\"]([^'\"]*)['\"]\)", text))
    expect(found.get("FileVersion") == APP_VERSION,
           f"FileVersion == {APP_VERSION}", found.get("FileVersion", "<absent>"))
    expect(found.get("ProductVersion") == APP_VERSION,
           f"ProductVersion == {APP_VERSION}", found.get("ProductVersion", "<absent>"))
    expect(found.get("ProductName") == "FileSorter", "ProductName is set",
           found.get("ProductName", "<absent>"))
    expect(bool(found.get("CompanyName")), "CompanyName is set",
           found.get("CompanyName", "<absent>"))
    expect(bool(found.get("FileDescription")), "FileDescription is set")
    quad = re.search(r"filevers=\(([^)]*)\)", text)
    expect(quad is not None and len([p for p in quad.group(1).split(",") if p.strip()]) == 4,
           "filevers is a four-field Windows version tuple",
           quad.group(1) if quad else "<absent>")


# ══════════════════════════════════════════════════════════════════
#  3. CLI: --autostart status from a windowed (no-console) binary
# ══════════════════════════════════════════════════════════════════

def check_autostart_cli(exe: Path) -> None:
    section("CLI (windowed exe, console I/O)")
    try:
        proc = subprocess.run(
            [str(exe), "--autostart", "status"],
            capture_output=True, text=True, timeout=90,
        )
    except subprocess.TimeoutExpired:
        expect(False, "--autostart status finishes", "timed out after 90s")
        return

    expect(proc.returncode == 0, "--autostart status exits 0",
           f"rc={proc.returncode}")
    out = (proc.stdout or "") + (proc.stderr or "")
    expect("Autostart" in out, "--autostart status reports a state",
           out.strip().splitlines()[-1] if out.strip() else "<no output>")
    # A windowed build that cannot write to a redirected stream dies here
    # instead of silently doing nothing, which is exactly what we want to know.
    expect("Traceback" not in out, "no crash on the console-less path")


# ══════════════════════════════════════════════════════════════════
#  4. Headless service: auth, a real RPC call, the SSE stream
# ══════════════════════════════════════════════════════════════════

def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _rpc(port: int, method: str, token: str | None, params=None):
    """POST one JSON-RPC call; returns (status, payload)."""
    body = json.dumps({"method": method, "params": params or []}).encode()
    req = urllib.request.Request(
        f"http://127.0.0.1:{port}/api", data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    if token:
        req.add_header("X-Api-Token", token)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        raw = err.read().decode("utf-8", errors="replace")
        try:
            return err.code, json.loads(raw)
        except ValueError:
            return err.code, {"raw": raw}


def _wait_until_serving(port: int, proc: subprocess.Popen, timeout: float):
    """Poll GET / until the service answers, or the process dies."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            return None
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/", timeout=5) as r:
                return r.read().decode("utf-8", errors="replace")
        except Exception:
            time.sleep(0.4)
    return None


def check_headless_service(exe: Path, timeout: float) -> None:
    section("headless service (JSON-RPC + SSE)")
    sys.path.insert(0, str(ROOT))
    from app.constants import APP_VERSION

    port = _free_port()
    token = "smoke-test-token"
    proc = subprocess.Popen(
        [str(exe), "--headless", "--port", str(port), "--token", token],
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    try:
        page = _wait_until_serving(port, proc, timeout)
        started = expect(page is not None,
                         f"service answers on 127.0.0.1:{port} within {timeout:.0f}s")
        if not started:
            print(f"         (process exit code: {proc.poll()} - None means it was still running)")
            return

        # The page must carry the per-run token, or the UI could never talk
        # to its own backend in the packaged build.
        expect(f'content="{token}"' in page, "served page carries the api token")

        # Auth is the only thing standing between a random local page and
        # the user's file system, so prove it is actually enforced.
        status, payload = _rpc(port, "get_state", token=None)
        expect(status == 401, "unauthenticated /api is rejected", f"status={status}")

        status, payload = _rpc(port, "get_state", token=token)
        expect(status == 200, "authenticated /api call succeeds",
               f"status={status}")
        result = payload.get("result") if isinstance(payload, dict) else None
        expect(isinstance(result, dict) and "categories" in result,
               "get_state returns the app state", str(payload)[:120])
        if isinstance(result, dict):
            expect(result.get("version") == APP_VERSION,
                   f"frozen app reports version {APP_VERSION}",
                   str(result.get("version")))

        # SSE is how every progress frame reaches the UI.
        try:
            with urllib.request.urlopen(
                f"http://127.0.0.1:{port}/events?token={token}", timeout=15
            ) as stream:
                ctype = stream.headers.get("Content-Type", "")
                expect(stream.status == 200 and "text/event-stream" in ctype,
                       "SSE /events stream opens", f"status={stream.status} {ctype}")
        except Exception as exc:
            expect(False, "SSE /events stream opens", str(exc))

        status, payload = _rpc(port, "no_such_method", token=token)
        expect(status == 400, "unknown RPC method is rejected", f"status={status}")
    finally:
        _terminate(proc)


def _terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is not None:
        return
    if sys.platform == "win32":
        subprocess.run(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                       capture_output=True)
    try:
        proc.wait(timeout=20)
    except subprocess.TimeoutExpired:  # pragma: no cover
        proc.kill()


# ══════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════

def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--exe", type=Path, default=DEFAULT_EXE,
                        help=f"frozen executable to test (default: {DEFAULT_EXE})")
    parser.add_argument("--timeout", type=float, default=60.0,
                        help="seconds to wait for the headless service to start")
    args = parser.parse_args(argv)

    exe = args.exe if args.exe.is_absolute() else (ROOT / args.exe)
    print(f"Smoke-testing frozen build: {exe}")
    if not exe.is_file():
        print(f"\nFAILED: {exe} not found.\n"
              f"Build it first:  python -m PyInstaller --clean --noconfirm FileSorter.spec")
        return 2

    check_layout(exe)
    if sys.platform == "win32":
        check_version_resource(exe)
        check_autostart_cli(exe)
    else:
        print("\n[skip] Windows-only checks (version resource, autostart)")
    check_headless_service(exe, args.timeout)

    print(f"\n{'=' * 60}")
    if _failures:
        print(f"FAILED — {len(_failures)} check(s) failed, {_passed} passed:")
        for name in _failures:
            print(f"  - {name}")
        return 1
    print(f"PASSED — {_passed} checks; the frozen build is shippable.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
