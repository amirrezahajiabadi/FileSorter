"""TaskScheduler — run user-defined tasks on a timer (v5.9.0).

The headless service (and the windowed app while it's open) keeps the
scans the user uses the most — junk cleanup, disk space, duplicates —
running on a schedule, without any UI being open. Pure stdlib: one
daemon thread wakes every poll interval, checks which enabled tasks are
due (last_run + interval <= now), and runs each due task on its own
thread.

A task is a plain dict (persisted with the other settings):

    {"id": "tk_...", "kind": "cleanup" | "disk_scan" | "dup_scan",
     "folder": null | "C:\\", "interval_minutes": int,
     "enabled": bool, "last_run": float (epoch seconds)}

Only the timing and concurrency live here. What a task *does* is the
caller's job via two callbacks:

- run_job(task) -> summary dict        (may raise; runs on its own thread)
- on_done(task, summary, ok)            (called after the job finishes,
                                         on the job thread — persist
                                         last_run / notify the UI here)

The clock is injectable (now=...) so tests drive due/runs deterministically
without sleeping.
"""

from __future__ import annotations

import threading
import time
from typing import Callable, Dict, List, Optional

# How often the tick loop wakes to check for due tasks.
DEFAULT_POLL_SECONDS = 10.0


class TaskScheduler:
    """Owns the tick thread; runs due tasks and reports completions."""

    def __init__(
        self,
        get_tasks: Callable[[], list],
        run_job: Callable[[dict], dict],
        on_done: Callable[[dict, dict, bool], None],
        now: Optional[Callable[[], float]] = None,
        poll_seconds: float = DEFAULT_POLL_SECONDS,
    ):
        self._get_tasks = get_tasks
        self._run_job = run_job
        self._on_done = on_done
        self._now = now or time.time
        self._poll = poll_seconds
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        self._running: set = set()
        self._lock = threading.Lock()

    # ── lifecycle ───────────────────────────────────────────────

    def start(self) -> None:
        """Start the tick thread (no-op if already running)."""
        with self._lock:
            if self._thread and self._thread.is_alive():
                return
            self._stop.clear()
            self._thread = threading.Thread(
                target=self._run, name="filesorter-tasks", daemon=True
            )
            self._thread.start()

    def stop(self) -> None:
        """Stop the tick thread and wait briefly for it to exit."""
        self._stop.set()
        with self._lock:
            thread = self._thread
            self._thread = None
        if thread and thread.is_alive():
            thread.join(timeout=max(self._poll, 1.0) + 1.0)

    @property
    def running(self) -> bool:
        return bool(self._thread and self._thread.is_alive())

    def _run(self) -> None:
        while not self._stop.is_set():
            self.tick()
            self._stop.wait(self._poll)

    # ── the interesting part ────────────────────────────────────

    def tick(self) -> None:
        """Launch a thread for every enabled task whose interval elapsed."""
        now = self._now()
        for task in self._get_tasks():
            if not task.get("enabled", True):
                continue
            last = float(task.get("last_run") or 0)
            interval = int(task.get("interval_minutes") or 0) * 60
            if interval <= 0:
                continue
            if now - last < interval:
                continue
            task_id = task.get("id")
            with self._lock:
                if task_id in self._running:
                    continue  # still running its previous pass — skip this tick
                self._running.add(task_id)
            threading.Thread(
                target=self._run_one, args=(task,), daemon=True
            ).start()

    def run_now(self, task: dict) -> bool:
        """Run one task immediately (UI's "Run now"); no interval check.

        Returns False if that task is already running.
        """
        task_id = task.get("id")
        with self._lock:
            if task_id in self._running:
                return False
            self._running.add(task_id)
        threading.Thread(target=self._run_one, args=(task,), daemon=True).start()
        return True

    def _run_one(self, task: dict) -> None:
        try:
            summary = self._run_job(task)
            ok = True
        except Exception as exc:  # job failure -> still report to the UI
            summary = {"error": str(exc)}
            ok = False
        finally:
            with self._lock:
                self._running.discard(task.get("id"))
        if ok:
            task["last_run"] = self._now()  # caller persists the shared list
        self._on_done(task, summary, ok)