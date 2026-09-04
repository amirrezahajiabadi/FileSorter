"""Tests for the headless local service (app/service.py).

Covers the HTTP layer: token auth on /api and /events, JSON-RPC
dispatch, the SSE event stream, and static UI serving with the api
token injected into the page.
"""

import http.client
import json
import socket
import threading
import time
import urllib.error
import urllib.request

import pytest

from app.service import FileSorterService


# ══════════════════════════════════════════════════════════════════
#  Fixtures / helpers
# ══════════════════════════════════════════════════════════════════

@pytest.fixture()
def service(tmp_path, monkeypatch):
    """A running headless service on an ephemeral port, with settings
    isolated in a temp dir."""
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")

    svc = FileSorterService(token="test-token", port=0)
    svc.start()
    yield svc
    svc.shutdown()


def rpc(service, method, params=None, token="test-token"):
    """POST a JSON-RPC call; returns the parsed response dict, raising
    AssertionError with the body on non-200."""
    body = json.dumps({"method": method, "params": params or []}).encode("utf-8")
    req = urllib.request.Request(
        service.url() + "api",
        data=body,
        headers={"X-Api-Token": token, "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        payload = e.read().decode("utf-8", "replace")
        raise AssertionError(f"rpc {method} -> HTTP {e.code}: {payload}")


def read_sse_until(service, action, predicate, timeout=15):
    """Subscribe to /events, run `action()`, then read data lines until
    predicate(parsed) is true.

    Subscribing *before* triggering the work is essential: events pushed
    with no subscriber connected are dropped, and the events must not be
    missed by a fast scan.

    Returns the list of parsed events received.
    """
    conn = http.client.HTTPConnection("127.0.0.1", service.port, timeout=timeout)
    conn.request("GET", "/events?token=test-token")
    resp = conn.getresponse()
    assert resp.status == 200, f"events -> HTTP {resp.status}"
    action()
    events = []
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            line = resp.readline()
        except (socket.timeout, OSError):
            break
        if not line:
            break
        if line.startswith(b"data: "):
            ev = json.loads(line[6:].decode("utf-8"))
            events.append(ev)
            if predicate(ev):
                conn.close()
                return events
    conn.close()
    return events


# ══════════════════════════════════════════════════════════════════
#  Auth
# ══════════════════════════════════════════════════════════════════

def test_api_requires_token(service):
    req = urllib.request.Request(service.url() + "api", data=b"{}")
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == 401


def test_api_rejects_wrong_token(service):
    req = urllib.request.Request(
        service.url() + "api",
        data=b"{}",
        headers={"X-Api-Token": "wrong-token"},
    )
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == 401


def test_events_requires_token(service):
    conn = http.client.HTTPConnection("127.0.0.1", service.port, timeout=5)
    conn.request("GET", "/events")
    resp = conn.getresponse()
    assert resp.status == 401
    conn.close()


# ══════════════════════════════════════════════════════════════════
#  JSON-RPC dispatch
# ══════════════════════════════════════════════════════════════════

def test_get_state(service):
    resp = rpc(service, "get_state")
    state = resp["result"]
    assert state["version"] == "5.9.0"
    assert "categories" in state and "smartRules" in state
    assert state["language"] in ("fa", "en")


def test_get_strings(service):
    resp = rpc(service, "get_strings", ["en"])
    assert "app_title" in resp["result"]


def _expect_http(service, code, method, params=None):
    body = json.dumps({"method": method, "params": params or []}).encode("utf-8")
    req = urllib.request.Request(
        service.url() + "api",
        data=body,
        headers={"X-Api-Token": "test-token"},
    )
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(req, timeout=5)
    assert exc.value.code == code


def test_unknown_method_returns_error(service):
    _expect_http(service, 400, "no_such_method")


def test_private_method_blocked(service):
    _expect_http(service, 400, "_subscribe")


def test_keyword_params(service):
    resp = rpc(service, "get_strings", {"lang": "fa"})
    assert resp["result"]["app_title"]


# ══════════════════════════════════════════════════════════════════
#  Real work over the wire
# ══════════════════════════════════════════════════════════════════

def _make_folder(tmp_path):
    src = tmp_path / "inbox"
    src.mkdir()
    (src / "photo.jpg").write_bytes(b"jpeg-data")
    (src / "notes.txt").write_text("hello")
    return src


def test_analyze_folder(service, tmp_path):
    folder = _make_folder(tmp_path)
    resp = rpc(service, "analyze_folder", [str(folder)])
    report = resp["result"]
    assert report["total"] == 2


def test_plan_sort_returns_wire_rows(service, tmp_path):
    folder = _make_folder(tmp_path)
    resp = rpc(service, "plan_sort", [str(folder)])
    rows = resp["result"]
    assert len(rows) == 2
    assert {r["name"] for r in rows} == {"photo.jpg", "notes.txt"}
    assert all("category" in r and "action" in r for r in rows)


def test_sort_streams_events_over_sse(service, tmp_path):
    folder = _make_folder(tmp_path)

    def start_sort_after_subscribe():
        rpc(service, "start_sort", [str(folder), False, "skip"])

    events = read_sse_until(
        service, start_sort_after_subscribe,
        lambda ev: ev["kind"] == "done", timeout=15,
    )
    kinds = [ev["kind"] for ev in events]
    assert "total" in kinds and "item" in kinds, f"unexpected events: {kinds}"
    assert "done" in kinds, f"expected the final done event, got {kinds}"


# ══════════════════════════════════════════════════════════════════
#  Static UI
# ══════════════════════════════════════════════════════════════════

def test_index_served_with_token_injected(service):
    with urllib.request.urlopen(service.url(), timeout=5) as resp:
        html = resp.read().decode("utf-8")
    assert '<meta name="api-token" content="test-token">' in html


def test_unknown_path_returns_404(service):
    with pytest.raises(urllib.error.HTTPError) as exc:
        urllib.request.urlopen(service.url() + "nope", timeout=5)
    assert exc.value.code == 404

# ══════════════════════════════════════════════════════════════════
#  v5.7.0 — drive-wide scans over the wire
# ══════════════════════════════════════════════════════════════════

def test_list_drives_rpc(service):
    resp = rpc(service, "list_drives")
    drives = resp["result"]
    assert isinstance(drives, list)
    for d in drives:
        assert set(d) == {"letter", "path", "total", "free"}
        assert len(d["letter"]) == 1 and d["total"] > 0


def test_cancel_scan_returns_false_when_idle(service):
    resp = rpc(service, "cancel_scan")
    assert resp["result"] is False


def test_disk_scan_cancel_streams_partial_done(service, tmp_path):
    """A cancelled drive scan streams space_progress then a space_done
    marked cancelled with the partial counts."""
    folder = tmp_path / "big"
    folder.mkdir()
    for i in range(2000):
        (folder / f"f{i:04d}.txt").write_text("x" * 8)

    def cancel_after_start():
        rpc(service, "scan_disk", [str(folder)])
        rpc(service, "cancel_scan")

    events = read_sse_until(
        service, cancel_after_start,
        lambda ev: ev["kind"] == "space_done", timeout=20,
    )
    kinds = [ev["kind"] for ev in events]
    assert "space_progress" in kinds, f"expected progress ticks, got {kinds}"
    done = events[-1]["payload"]
    assert done["cancelled"] is True
    assert done["files_scanned"] < 2000  # partial, not the full walk


def test_dup_scan_cancel_streams_partial_done(service, tmp_path):
    """A cancelled duplicate scan streams dup_progress then a dup_done
    marked cancelled (drive-wide scans stop at the next file boundary)."""
    folder = tmp_path / "dups"
    folder.mkdir()
    content = b"dup-content" * 200
    for i in range(40):
        (folder / f"copy{i:02d}.dat").write_bytes(content)

    def cancel_after_start():
        rpc(service, "find_duplicates", [str(folder)])
        rpc(service, "cancel_scan")

    events = read_sse_until(
        service, cancel_after_start,
        lambda ev: ev["kind"] == "dup_done", timeout=20,
    )
    kinds = [ev["kind"] for ev in events]
    assert "dup_progress" in kinds, f"expected progress ticks, got {kinds}"
    done = events[-1]["payload"]
    assert done["cancelled"] is True


def test_run_task_now_streams_sched_done(service, tmp_path):
    """run_task_now executes a task's scan and streams a sched_done with
    the summary over SSE."""
    folder = tmp_path / "taskdir"
    folder.mkdir()
    (folder / "a.txt").write_bytes(b"aa")
    (folder / "b.txt").write_bytes(b"bb")

    task = rpc(service, "add_task", ["disk_scan", str(folder), 60])["result"]
    assert "id" in task

    def run_now():
        ok = rpc(service, "run_task_now", [task["id"]])["result"]
        assert ok is True

    events = read_sse_until(
        service, run_now,
        lambda ev: ev["kind"] == "sched_done" and ev["payload"]["task_id"] == task["id"],
        timeout=20,
    )
    kinds = [ev["kind"] for ev in events]
    assert "sched_run" in kinds
    done = events[-1]["payload"]
    assert done["ok"] is True
    assert done["files"] == 2 and done["bytes"] == 4
    # history endpoint records the run
    hist = rpc(service, "get_task_history")["result"]
    assert hist and hist[0]["task_id"] == task["id"]
