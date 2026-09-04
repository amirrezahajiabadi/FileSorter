"""Unit tests for BaseApi.push_event coalescing (v6.1.1).

The fix for the freeze: per-file sort/scan events used to reach the UI
bridge one round-trip per file, which saturated the renderer on folders
with many files. push_event() now buffers chatty kinds and flushes them
at most every COALESCE_INTERVAL seconds.

These tests drive a recording subclass so delivery is observable
without any real frontend.
"""

import time

import pytest

from app.api import (
    COALESCE_BATCH_KINDS,
    COALESCE_INTERVAL,
    COALESCE_LAST_KINDS,
    BaseApi,
)


class RecordingApi(BaseApi):
    """BaseApi whose _push records every delivery in order."""

    def __init__(self):
        super().__init__()
        self.delivered = []

    def _push(self, kind: str, payload) -> None:
        self.delivered.append((kind, payload))


@pytest.fixture
def api(tmp_path, monkeypatch):
    """A recording api with a temp settings file (never the real one)."""
    import app.settings_manager as settings_manager

    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    return RecordingApi()


def _flush(api):
    """Deliver whatever is buffered (what the timer thread does)."""
    api._flush_coalesced()


# ══════════════════════════════════════════════════════════════════
#  "last" kinds: monotonic counters collapse to their newest value
# ══════════════════════════════════════════════════════════════════

def test_last_kind_keeps_only_newest_payload(api):
    for i in range(100):
        api.push_event("space_progress", {"phase": "scanning", "processed": i, "bytes": i * 8})
    _flush(api)
    assert len(api.delivered) == 1
    kind, payload = api.delivered[0]
    assert kind == "space_progress"
    assert payload["processed"] == 99  # the last write wins


def test_last_kind_restarts_after_flush(api):
    api.push_event("progress", 1)
    _flush(api)
    api.push_event("progress", 2)
    _flush(api)
    assert api.delivered == [("progress", 1), ("progress", 2)]


@pytest.mark.parametrize("kind", sorted(COALESCE_LAST_KINDS))
def test_all_last_kinds_coalesce(api, kind):
    api.push_event(kind, {"n": 1})
    api.push_event(kind, {"n": 2})
    _flush(api)
    assert [d for d in api.delivered if d[0] == kind] == [(kind, {"n": 2})]


# ══════════════════════════════════════════════════════════════════
#  "batch" kinds: every payload is a distinct log row, none dropped
# ══════════════════════════════════════════════════════════════════

def test_batch_kind_delivers_every_payload_in_order(api):
    for i in range(5):
        api.push_event("item", {"status": "ok", "name": f"f{i}.jpg", "category": "images"})
    _flush(api)
    items = [d for d in api.delivered if d[0] == "item"]
    assert len(items) == 5
    assert [p["name"] for _, p in items] == ["f0.jpg", "f1.jpg", "f2.jpg", "f3.jpg", "f4.jpg"]


@pytest.mark.parametrize("kind", sorted(COALESCE_BATCH_KINDS))
def test_all_batch_kinds_accumulate(api, kind):
    api.push_event(kind, {"i": 1})
    api.push_event(kind, {"i": 2})
    _flush(api)
    assert [d for d in api.delivered if d[0] == kind] == [(kind, {"i": 1}), (kind, {"i": 2})]


def test_batch_and_last_kinds_flush_together(api):
    api.push_event("item", {"status": "ok", "name": "a.txt", "category": "docs"})
    api.push_event("progress", 1)
    api.push_event("item", {"status": "ok", "name": "b.txt", "category": "docs"})
    api.push_event("progress", 2)
    _flush(api)
    kinds = [k for k, _ in api.delivered]
    # Kinds buffer independently: both items arrive (nothing dropped),
    # progress collapses to its newest value.
    assert kinds == ["item", "item", "progress"]
    assert api.delivered[2] == ("progress", 2)


# ══════════════════════════════════════════════════════════════════
#  Rare kinds pass straight through — no delay, no buffering
# ══════════════════════════════════════════════════════════════════

def test_rare_kind_delivered_immediately(api):
    api.push_event("done", {"copied": 5, "skipped": 0, "errors": 0, "target_dir": "x"})
    assert api.delivered == [("done", {"copied": 5, "skipped": 0, "errors": 0, "target_dir": "x"})]


def test_terminal_kind_flushes_pending_ticks_first(api):
    """Terminal events must not race ahead of the progress they follow:
    the UI always sees the last tick before done/error."""
    api.push_event("space_progress", {"processed": 10, "bytes": 1})
    api.push_event("error", "boom")
    assert api.delivered == [
        ("space_progress", {"processed": 10, "bytes": 1}),
        ("error", "boom"),
    ]


def test_terminal_kind_flushes_batched_rows_too(api):
    api.push_event("item", {"status": "ok", "name": "a.txt", "category": "docs"})
    api.push_event("done", {"copied": 1, "skipped": 0, "errors": 0, "target_dir": "x"})
    assert [k for k, _ in api.delivered] == ["item", "done"]


# ══════════════════════════════════════════════════════════════════
#  The timer really flushes without any manual help
# ══════════════════════════════════════════════════════════════════

def test_timer_flushes_after_interval(api):
    api.push_event("progress", 7)
    assert api.delivered == []  # still buffered right after the push
    deadline = time.monotonic() + COALESCE_INTERVAL + 1.0
    while time.monotonic() < deadline and not api.delivered:
        time.sleep(0.02)
    assert api.delivered == [("progress", 7)]


def test_timer_respawns_for_later_bursts(api):
    api.push_event("progress", 1)
    deadline = time.monotonic() + COALESCE_INTERVAL + 1.0
    while time.monotonic() < deadline and not api.delivered:
        time.sleep(0.02)
    api.push_event("progress", 2)
    deadline = time.monotonic() + COALESCE_INTERVAL + 1.0
    while time.monotonic() < deadline and api.delivered == [("progress", 1)]:
        time.sleep(0.02)
    assert api.delivered == [("progress", 1), ("progress", 2)]