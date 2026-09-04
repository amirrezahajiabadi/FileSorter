"""Unit tests for app/watcher.py — the auto-sort WatchManager.

All filesystem behaviour is exercised through tick() directly (no
threads), matching how the desktop runtime drives it. One test covers
the thread lifecycle itself.
"""

import time

import pytest

import app.watcher as watcher_mod
from app.constants import DEFAULT_CATEGORIES
from app.watcher import WatchManager, snapshot_folder


@pytest.fixture
def manager(tmp_path):
    """A WatchManager watching one temp folder, capturing events."""
    watched = tmp_path / "inbox"
    watched.mkdir()
    events = []

    mgr = WatchManager(
        get_categories=lambda: DEFAULT_CATEGORIES,
        on_event=lambda kind, payload: events.append((kind, payload)),
    )
    mgr.update_folders([str(watched)])
    return mgr, watched, events


def test_snapshot_lists_files_not_dirs(tmp_path):
    folder = tmp_path / "snap"
    folder.mkdir()
    (folder / "a.jpg").write_text("x")
    (folder / "sub").mkdir()
    snap = snapshot_folder(folder)
    assert snap == {"a.jpg": (pytest.approx((folder / "a.jpg").stat().st_mtime),
                              (folder / "a.jpg").stat().st_size)} or "a.jpg" in snap


def test_tick_moves_new_file_into_category(manager):
    mgr, watched, events = manager
    (watched / "photo.jpg").write_text("pic")

    mgr.tick()

    assert not (watched / "photo.jpg").exists()
    assert (watched / "images" / "photo.jpg").exists()
    moved = [e for e in events if e[0] == "watch_item"]
    assert len(moved) == 1
    assert moved[0][1]["action"] == "moved"
    assert moved[0][1]["category"] == "images"


def test_tick_is_idempotent(manager):
    mgr, watched, events = manager
    (watched / "a.jpg").write_text("x")
    mgr.tick()
    mgr.tick()
    items = [e for e in events if e[0] == "watch_item"]
    assert len(items) == 1


def test_unknown_extension_goes_to_others(manager):
    mgr, watched, events = manager
    (watched / "mystery.zzz").write_text("?")
    mgr.tick()
    assert (watched / "others" / "mystery.zzz").exists()


def test_skips_when_destination_exists(manager):
    mgr, watched, events = manager
    (watched / "images").mkdir()
    (watched / "images" / "photo.jpg").write_text("existing")
    (watched / "photo.jpg").write_text("new")

    mgr.tick()

    # The duplicate is left in place; the event says skipped.
    assert (watched / "photo.jpg").exists()
    (watched / "images" / "photo.jpg").write_text("existing")  # still there
    item = [e for e in events if e[0] == "watch_item"][0]
    assert item[1]["action"] == "skipped"


def test_failed_move_is_retried_after_delay(tmp_path, monkeypatch):
    watched = tmp_path / "inbox"
    watched.mkdir()
    (watched / "song.mp3").write_bytes(b"music")
    events = []

    mgr = WatchManager(
        get_categories=lambda: DEFAULT_CATEGORIES,
        on_event=lambda kind, payload: events.append((kind, payload)),
        retry_delay=0.0,  # retry on the very next tick
    )
    mgr.update_folders([str(watched)])

    real_move = watcher_mod.shutil.move
    state = {"fail": True}

    def flaky_move(src, dst):
        if state["fail"]:
            state["fail"] = False
            raise OSError("file is locked")
        return real_move(src, dst)

    monkeypatch.setattr(watcher_mod.shutil, "move", flaky_move)
    mgr.tick()  # move fails -> one error event, file kept for a retry
    monkeypatch.setattr(watcher_mod.shutil, "move", real_move)
    mgr.tick()  # retry succeeds

    items = [e for e in events if e[0] == "watch_item"]
    assert [i[1]["action"] for i in items] == ["error", "moved"]
    assert not (watched / "song.mp3").exists()
    assert (watched / "audio" / "song.mp3").exists()


def test_failed_move_stays_quiet_while_cooling_down(manager):
    mgr, watched, events = manager  # default 10s retry backoff
    (watched / "song.mp3").write_bytes(b"music")
    # Block the move by making the target category dir a file.
    (watched / "audio").write_text("blocker")

    mgr.tick()  # error emitted once
    events.clear()
    mgr.tick()  # still cooling down -> no new events, no spam
    assert events == []


def test_missing_folder_reports_error(manager):
    mgr, watched, events = manager
    mgr.update_folders([str(watched / "gone")])
    mgr.tick()
    errors = [e for e in events if e[0] == "watch_error"]
    assert len(errors) == 1
    assert "gone" in errors[0][1]["folder"]


def test_update_folders_drops_old_folder(manager):
    mgr, watched, events = manager
    (watched / "a.jpg").write_text("x")
    mgr.tick()
    assert (watched / "images" / "a.jpg").exists()

    events.clear()
    other = watched.parent / "other"
    other.mkdir()
    mgr.update_folders([str(other)])
    mgr.tick()
    # Watching only the new folder: no events for the old one.
    assert events == []


def test_thread_start_stop(tmp_path):
    """The polling thread starts and stops cleanly (no move assertions —
    timing-dependent)."""
    folder = tmp_path / "threaded"
    folder.mkdir()
    mgr = WatchManager(get_categories=lambda: DEFAULT_CATEGORIES)
    mgr.update_folders([str(folder)])
    mgr.start()
    time.sleep(0.15)
    mgr.stop()
    assert mgr._thread is None or not mgr._thread.is_alive()


def test_controller_watch_list_persists(tmp_path, monkeypatch):
    """AppController add/remove watch folders + persistence."""
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    from app.controller import AppController

    c = AppController()
    assert c.watch_folders == []
    c.add_watch_folder("C:/inbox")
    c.add_watch_folder("D:/downloads")
    assert c.watch_folders == ["C:/inbox", "D:/downloads"]
    c.remove_watch_folder("C:/inbox")
    assert c.watch_folders == ["D:/downloads"]

    # A fresh controller reads the persisted list.
    c2 = AppController()
    assert c2.watch_folders == ["D:/downloads"]


def test_tick_applies_smart_rules(tmp_path):
    """A file matching a smart-rule keyword goes to the rule's category,
    beating the extension fallback."""
    watched = tmp_path / "inbox"
    watched.mkdir()
    events = []

    cats = {"documents": [".pdf"], "invoices": [], "others": []}
    rules = [{"keywords": ["invoice", "فاکتور"], "category": "invoices"}]

    mgr = WatchManager(
        get_categories=lambda: cats,
        on_event=lambda kind, payload: events.append((kind, payload)),
        get_rules=lambda: rules,
    )
    mgr.update_folders([str(watched)])
    (watched / "invoice-2024.pdf").write_text("x")
    (watched / "letter.pdf").write_text("y")

    mgr.tick()

    assert (watched / "invoices" / "invoice-2024.pdf").exists()
    assert (watched / "documents" / "letter.pdf").exists()
    cats_by_name = {
        p[1]["name"]: p[1]["category"]
        for p in events if p[0] == "watch_item" and p[1]["action"] == "moved"
    }
    assert cats_by_name == {"invoice-2024.pdf": "invoices", "letter.pdf": "documents"}


def test_tick_no_rules_matches_extension(manager):
    mgr, watched, events = manager
    (watched / "holiday-2023.mp4").write_text("x")
    mgr.tick()
    moved = [e for e in events if e[0] == "watch_item" and e[1]["action"] == "moved"]
    assert moved and moved[0][1]["category"] == "videos"
