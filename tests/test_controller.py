"""Unit tests for AppController — no Tkinter involved, since the whole
point of this module is that it doesn't need any."""

from pathlib import Path

import pytest

from app.controller import AppController


@pytest.fixture
def controller(tmp_path, monkeypatch):
    """A fresh AppController whose settings file lives in a temp dir,
    so tests never touch the real ~/.filesorter_settings.json.

    Patches app.settings_manager.SETTINGS_FILE specifically (not
    app.constants.SETTINGS_FILE) because settings_manager imported it
    with `from app.constants import SETTINGS_FILE`, which binds its own
    local name — patching the original in app.constants wouldn't affect
    the copy settings_manager actually uses.
    """
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    return AppController()


# ══════════════════════════════════════════════════════════════════
#  Settings
# ══════════════════════════════════════════════════════════════════

def test_set_language_persists(controller, tmp_path):
    controller.set_language("en")
    assert controller.language == "en"
    from app.settings_manager import load_settings
    assert load_settings()["language"] == "en"


def test_set_theme_persists(controller):
    controller.set_theme("dark")
    assert controller.theme_name == "dark"


def test_update_categories(controller):
    new_cats = {"memes": [".jpg"], "others": []}
    controller.update_categories(new_cats)
    assert controller.categories == new_cats


def test_record_recent_folder(controller):
    controller.record_recent_folder("/a")
    controller.record_recent_folder("/b")
    assert controller.recent_folders == ["/b", "/a"]


# ══════════════════════════════════════════════════════════════════
#  analyze / plan
# ══════════════════════════════════════════════════════════════════

def test_analyze_returns_report(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    report = controller.analyze(str(tmp_path))
    assert report["total"] == 1
    assert report["by_category"]["images"] == 1


def test_plan_matches_analyze_category(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    plan = controller.plan(str(tmp_path))
    assert len(plan) == 1
    assert plan[0]["category"] == "images"
    assert plan[0]["action"] == "ok"


# ══════════════════════════════════════════════════════════════════
#  sort
# ══════════════════════════════════════════════════════════════════

def test_sort_copies_files_by_default(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    result = controller.sort(str(tmp_path))
    assert result["copied"] == 1
    assert (tmp_path / "a.jpg").exists()          # original kept
    assert (tmp_path / "sorted" / "images" / "a.jpg").exists()


def test_sort_move_removes_original(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    result = controller.sort(str(tmp_path), move=True)
    assert result["copied"] == 1
    assert not (tmp_path / "a.jpg").exists()       # original gone
    assert (tmp_path / "sorted" / "images" / "a.jpg").exists()


def test_sort_populates_last_sort_log(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    controller.sort(str(tmp_path), move=True)
    assert len(controller.last_sort_log) == 1
    assert controller.last_sort_log[0]["action"] == "moved"


def test_sort_emits_events_in_order(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "b.txt").write_bytes(b"x")
    events = []
    controller.sort(str(tmp_path), on_event=lambda kind, payload: events.append(kind))
    assert events[0] == "total"
    assert events.count("item") == 2
    assert events.count("progress") == 2
    assert events[-1] == "done"


def test_sort_duplicate_skip_mode(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "sorted" / "images").mkdir(parents=True)
    (tmp_path / "sorted" / "images" / "a.jpg").write_bytes(b"existing")

    events = []
    result = controller.sort(str(tmp_path), duplicate_mode="skip",
                              on_event=lambda k, p: events.append((k, p)))
    assert result["skipped"] == 1
    assert result["copied"] == 0


def test_sort_duplicate_rename_mode(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "sorted" / "images").mkdir(parents=True)
    (tmp_path / "sorted" / "images" / "a.jpg").write_bytes(b"existing")

    result = controller.sort(str(tmp_path), duplicate_mode="rename")
    assert result["copied"] == 1
    assert (tmp_path / "sorted" / "images" / "a (1).jpg").exists()


# ══════════════════════════════════════════════════════════════════
#  undo
# ══════════════════════════════════════════════════════════════════

def test_undo_with_nothing_to_undo(controller):
    result = controller.undo()
    assert result["nothing"] is True


def test_undo_restores_moved_files(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    controller.sort(str(tmp_path), move=True)
    result = controller.undo()
    assert result["restored"] == 1
    assert (tmp_path / "a.jpg").exists()
    assert not (tmp_path / "sorted" / "images" / "a.jpg").exists()


def test_undo_removes_copies(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    controller.sort(str(tmp_path), move=False)
    result = controller.undo()
    assert result["removed"] == 1
    assert (tmp_path / "a.jpg").exists()  # original was never touched
    assert not (tmp_path / "sorted" / "images" / "a.jpg").exists()


def test_undo_clears_last_sort_log(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    controller.sort(str(tmp_path), move=True)
    controller.undo()
    assert controller.last_sort_log == []


def test_undo_emits_events_in_order(controller, tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    controller.sort(str(tmp_path), move=True)
    events = []
    controller.undo(on_event=lambda kind, payload: events.append(kind))
    assert events[0] == "total"
    assert "item" in events
    assert "progress" in events
    assert events[-1] == "done"
