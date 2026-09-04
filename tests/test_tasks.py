"""Tests for the scheduled-task tick loop (app/tasks.py + controller CRUD).

The scheduler runs due tasks on a timer with an injectable clock, so
the timing logic is tested without sleeping: we advance a fake clock and
call tick() directly (never starting the daemon thread).
"""

import json
import tempfile
import time
from pathlib import Path

import pytest

from app.tasks import TaskScheduler


class FakeClock:
    def __init__(self, start: float = 1_000_000.0):
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def make_task(**over):
    task = {
        "id": "tk_test1",
        "kind": "cleanup",
        "folder": None,
        "interval_minutes": 60,
        "enabled": True,
        "last_run": 0.0,
    }
    task.update(over)
    return task


class Harness:
    """Wires a scheduler to recording callbacks and a shared task list."""

    def __init__(self, tasks=None):
        self.clock = FakeClock()
        self.tasks: list = tasks if tasks is not None else []
        self.jobs: list = []        # (task_id, summary) completed
        self.dones: list = []       # (task, summary, ok)
        self.fail = {}              # task_id -> exception to raise
        self.scheduler = TaskScheduler(
            get_tasks=lambda: self.tasks,
            run_job=self._run,
            on_done=self._done,
            now=self.clock,
            poll_seconds=1.0,
        )

    def _run(self, task):
        if task["id"] in self.fail:
            raise self.fail[task["id"]]
        summary = {"ok": True, "kind": task["kind"]}
        self.jobs.append((task["id"], summary))
        return summary

    def _done(self, task, summary, ok):
        self.dones.append((dict(task), dict(summary), ok))


# ══════════════════════════════════════════════════════════════════
#  Due / interval logic
# ══════════════════════════════════════════════════════════════════

def test_not_due_within_interval():
    h = Harness()
    task = make_task(interval_minutes=60, last_run=h.clock.now)
    h.tasks.append(task)
    h.clock.advance(3599)
    h.scheduler.tick()
    assert h.jobs == []  # not a full hour yet
    h.clock.advance(2)   # past the hour
    h.scheduler.tick()
    assert [j[0] for j in h.jobs] == ["tk_test1"]


def test_last_run_updates_after_run():
    h = Harness()
    task = make_task(interval_minutes=10, last_run=h.clock.now)
    h.tasks.append(task)
    h.clock.advance(601)
    h.scheduler.tick()
    assert task["last_run"] == h.clock.now  # updated on success
    h.clock.advance(599)
    h.scheduler.tick()
    assert len(h.jobs) == 1  # not due again yet
    h.clock.advance(2)
    h.scheduler.tick()
    assert len(h.jobs) == 2  # due again after the next interval


def test_disabled_task_never_runs():
    h = Harness()
    task = make_task(enabled=False, last_run=0.0)
    h.tasks.append(task)
    h.clock.advance(10_000)
    h.scheduler.tick()
    assert h.jobs == []


def test_due_run_sends_done_with_updated_task():
    h = Harness()
    task = make_task(last_run=h.clock.now - 3600)
    h.tasks.append(task)
    h.scheduler.tick()
    assert len(h.jobs) == 1
    assert len(h.dones) == 1
    done_task, summary, ok = h.dones[0]
    assert ok is True and summary == {"ok": True, "kind": "cleanup"}
    assert done_task["last_run"] == h.clock.now


# ══════════════════════════════════════════════════════════════════
#  Failure + concurrency guards
# ══════════════════════════════════════════════════════════════════

def test_failing_job_reports_error_and_does_not_update_last_run():
    h = Harness()
    task = make_task(last_run=h.clock.now - 3600)
    h.fail["tk_test1"] = RuntimeError("boom")
    h.tasks.append(task)
    h.scheduler.tick()
    assert len(h.dones) == 1
    _done_task, summary, ok = h.dones[0]
    assert ok is False and summary == {"error": "boom"}
    assert task["last_run"] == h.clock.now - 3600  # unchanged — not marked successful


def test_no_double_run_while_task_is_running():
    """A task still running its previous pass is skipped this tick."""
    h = Harness()
    task = make_task(last_run=h.clock.now - 3600)
    h.tasks.append(task)
    # Occupy the task slot by launching run_now (sync run would complete
    # instantly, so patch _run_one to block until released).
    import threading

    release = threading.Event()

    def slow_run(task):
        release.wait(2)
        return {"ok": True}

    h.scheduler._run_job = slow_run  # type: ignore[assignment]
    started = h.scheduler.run_now(task)
    assert started is True
    # While it's blocked, a tick must not launch a second instance.
    h.scheduler.tick()
    assert len(h.jobs) == 0  # _run_job replaced, jobs not recorded anyway
    release.set()
    # Wait for the slow job to finish and the running set to clear.
    deadline = time.monotonic() + 2
    while task["id"] in h.scheduler._running and time.monotonic() < deadline:
        time.sleep(0.01)
    # Now it can run again.
    h.scheduler.tick()
    assert h.dones  # second completion arrived


def test_run_now_returns_false_when_already_running():
    h = Harness()
    task = make_task(last_run=h.clock.now)
    h.tasks.append(task)
    import threading

    release = threading.Event()

    def block(task):
        release.wait(2)
        return {"ok": True}

    h.scheduler._run_job = block  # type: ignore[assignment]
    assert h.scheduler.run_now(task) is True
    assert h.scheduler.run_now(task) is False  # already running
    release.set()


# ══════════════════════════════════════════════════════════════════
#  Controller CRUD + persistence
# ══════════════════════════════════════════════════════════════════

@pytest.fixture()
def ctl(tmp_path, monkeypatch):
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    from app.controller import AppController
    return AppController()


def test_add_task_persists_and_validates(ctl):
    task = ctl.add_task("disk_scan", folder="D:\\", interval_minutes=60)
    assert task["id"].startswith("tk_")
    assert task["kind"] == "disk_scan" and task["enabled"] is True
    assert task["folder"] == "D:\\"
    assert ctl.tasks == [task]
    with pytest.raises(ValueError):
        ctl.add_task("nope")
    with pytest.raises(ValueError):
        ctl.add_task("disk_scan")  # folder required


def test_update_and_remove_task(ctl):
    task = ctl.add_task("cleanup", interval_minutes=60)
    tid = task["id"]
    updated = ctl.update_task(tid, {"enabled": False, "interval_minutes": 5})
    assert updated["enabled"] is False and updated["interval_minutes"] == 5
    assert ctl.update_task("tk_missing", {"enabled": True}) is None
    assert ctl.remove_task(tid) is True
    assert ctl.remove_task(tid) is False
    assert ctl.tasks == []


def test_tasks_survive_reload(ctl, tmp_path, monkeypatch):
    task = ctl.add_task("cleanup", interval_minutes=30)
    tid = task["id"]
    # A fresh controller reads the same settings file.
    import app.settings_manager as settings_manager
    from app.controller import AppController
    ctl2 = AppController()
    assert [t["id"] for t in ctl2.tasks] == [tid]