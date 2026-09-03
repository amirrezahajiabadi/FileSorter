"""Unit tests for main_web.py Api class — tests the Python-side API
that bridges JS ↔ AppController, without requiring a real pywebview window.

Run with:
    pytest tests/test_web_api.py -v
"""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# We need to mock webview before importing main_web
import sys
mock_webview = MagicMock()
sys.modules['webview'] = mock_webview

from main_web import Api
from app.constants import DEFAULT_CATEGORIES


@pytest.fixture
def api(tmp_path, monkeypatch):
    """A fresh Api instance with settings in a temp dir."""
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    
    api_instance = Api()
    # Mock the window object
    api_instance.window = MagicMock()
    return api_instance


# ══════════════════════════════════════════════════════════════════
#  get_state
# ══════════════════════════════════════════════════════════════════

def test_get_state_returns_required_keys(api):
    state = api.get_state()
    assert "version" in state
    assert "categories" in state
    assert "recentFolders" in state
    assert "theme" in state
    assert "language" in state


def test_get_state_version_matches_constants(api):
    from app.constants import APP_VERSION
    state = api.get_state()
    assert state["version"] == APP_VERSION


def test_get_state_categories_are_dict(api):
    state = api.get_state()
    assert isinstance(state["categories"], dict)
    assert "images" in state["categories"]


# ══════════════════════════════════════════════════════════════════
#  toggle_theme
# ══════════════════════════════════════════════════════════════════

def test_toggle_theme_flips_dark_to_light(api):
    api.controller.set_theme("dark")
    result = api.toggle_theme()
    assert result == "light"
    assert api.controller.theme_name == "light"


def test_toggle_theme_flips_light_to_dark(api):
    api.controller.set_theme("light")
    result = api.toggle_theme()
    assert result == "dark"
    assert api.controller.theme_name == "dark"


# ══════════════════════════════════════════════════════════════════
#  toggle_language
# ══════════════════════════════════════════════════════════════════

def test_toggle_language_flips_fa_to_en(api):
    api.controller.set_language("fa")
    result = api.toggle_language()
    assert result == "en"
    assert api.controller.language == "en"


def test_toggle_language_flips_en_to_fa(api):
    api.controller.set_language("en")
    result = api.toggle_language()
    assert result == "fa"
    assert api.controller.language == "fa"


# ══════════════════════════════════════════════════════════════════
#  get_strings
# ══════════════════════════════════════════════════════════════════

def test_get_strings_returns_dict(api):
    strings = api.get_strings("en")
    assert isinstance(strings, dict)
    assert "app_title" in strings


def test_get_strings_fa_returns_persian(api):
    strings = api.get_strings("fa")
    assert "مرتب" in strings["app_title"]


def test_get_strings_unknown_lang_falls_back_to_en(api):
    strings = api.get_strings("xx")
    assert isinstance(strings, dict)
    assert "app_title" in strings


# ══════════════════════════════════════════════════════════════════
#  analyze_folder
# ══════════════════════════════════════════════════════════════════

def test_analyze_folder_returns_report(api, tmp_path):
    (tmp_path / "test.jpg").write_bytes(b"x")
    report = api.analyze_folder(str(tmp_path))
    assert report["total"] == 1
    assert report["by_category"]["images"] == 1


def test_analyze_folder_returns_empty_report_on_invalid_path(api):
    result = api.analyze_folder("/nonexistent/path/that/does/not/exist")
    # analyze_folder returns empty report for non-existent paths
    assert result["total"] == 0
    assert result["by_category"] == {}


# ══════════════════════════════════════════════════════════════════
#  plan_sort
# ══════════════════════════════════════════════════════════════════

def test_plan_sort_returns_list(api, tmp_path):
    (tmp_path / "test.jpg").write_bytes(b"x")
    plan = api.plan_sort(str(tmp_path))
    assert isinstance(plan, list)
    assert len(plan) == 1
    assert plan[0]["category"] == "images"


def test_plan_sort_serializes_paths(api, tmp_path):
    (tmp_path / "test.jpg").write_bytes(b"x")
    plan = api.plan_sort(str(tmp_path))
    # Paths should be serialized as strings, not Path objects
    assert isinstance(plan[0]["name"], str)
    assert isinstance(plan[0]["final_name"], str)


# ══════════════════════════════════════════════════════════════════
#  save_categories
# ══════════════════════════════════════════════════════════════════

def test_save_categories_updates_controller(api):
    new_cats = {"memes": [".jpg"], "others": []}
    result = api.save_categories(new_cats)
    assert result is True
    assert api.controller.categories == new_cats


# ══════════════════════════════════════════════════════════════════
#  restore_defaults
# ══════════════════════════════════════════════════════════════════

def test_restore_defaults_resets_categories(api):
    # First change categories
    api.save_categories({"custom": [".xyz"]})
    # Then restore
    result = api.restore_defaults()
    assert "images" in result
    assert "custom" not in result


# ══════════════════════════════════════════════════════════════════
#  _push (internal event emitter)
# ══════════════════════════════════════════════════════════════════

def test_push_calls_evaluate_js(api):
    api._push("test_event", {"key": "value"})
    api.window.evaluate_js.assert_called_once()
    call_args = api.window.evaluate_js.call_args[0][0]
    assert "window.onSortEvent" in call_args
    assert "test_event" in call_args


def test_push_does_nothing_without_window(api):
    api.window = None
    # Should not raise
    api._push("test_event", {"key": "value"})


# ══════════════════════════════════════════════════════════════════
#  browse_folder
# ══════════════════════════════════════════════════════════════════

def test_browse_folder_returns_path(api, tmp_path):
    api.window.create_file_dialog.return_value = [str(tmp_path)]
    result = api.browse_folder()
    assert result == str(tmp_path)


def test_browse_folder_returns_none_on_cancel(api):
    api.window.create_file_dialog.return_value = []
    result = api.browse_folder()
    assert result is None


def test_browse_folder_records_recent(api, tmp_path):
    api.window.create_file_dialog.return_value = [str(tmp_path)]
    api.browse_folder()
    assert str(tmp_path) in api.controller.recent_folders


# ══════════════════════════════════════════════════════════════════
#  Background scan runners push terminal done events
#  (regression: desktop scans used to emit progress but never finish)
# ══════════════════════════════════════════════════════════════════

def _event_kinds(api):
    """Parse every evaluate_js call into its event kind."""
    import json as _json
    kinds = []
    for c in api.window.evaluate_js.call_args_list:
        arg = c.args[0]
        payload = arg[len("window.onSortEvent("):-1]
        kinds.append(_json.loads(payload)["kind"])
    return kinds

def _make_two_duplicates(root):
    (root / "a.txt").write_text("same-content")
    (root / "b.txt").write_text("same-content")


def test_run_dup_scan_pushes_dup_done(api, tmp_path):
    _make_two_duplicates(tmp_path)
    api._run_dup_scan(str(tmp_path))
    assert "dup_done" in _event_kinds(api)
    import json as _json
    done_payload = None
    for c in api.window.evaluate_js.call_args_list:
        arg = c.args[0]
        payload = arg[len("window.onSortEvent("):-1]
        msg = _json.loads(payload)
        if msg["kind"] == "dup_done":
            done_payload = msg["payload"]
    assert done_payload is not None
    assert len(done_payload["groups"]) == 1


def test_run_dup_scan_pushes_error_on_exception(api, tmp_path):
    api.window.reset_mock()
    with patch.object(api.controller, "scan_duplicates", side_effect=RuntimeError("boom")):
        api._run_dup_scan(str(tmp_path))
    import json as _json
    arg = api.window.evaluate_js.call_args.args[0]
    payload = arg[len("window.onSortEvent("):-1]
    assert _json.loads(payload)["kind"] == "error"


def test_run_disk_scan_pushes_space_done(api, tmp_path):
    (tmp_path / "v.txt").write_text("v" * 50)
    api._run_disk_scan(str(tmp_path))
    assert "space_done" in _event_kinds(api)


def test_run_clean_scan_pushes_clean_done(api, tmp_path, monkeypatch):
    import app.cleanup as cleanup_mod
    monkeypatch.setattr(
        cleanup_mod, "known_locations",
        lambda: [{"id": "user_temp", "dirs": [str(tmp_path)]}],
    )
    (tmp_path / "junk.tmp").write_text("junk")
    api._run_clean_scan()
    assert "clean_done" in _event_kinds(api)


def test_delete_cleanup_returns_result_dict(api, tmp_path):
    # Nothing scanned yet: deleting by location id is a clean no-op.
    result = api.delete_cleanup(["user_temp"])
    assert result["deleted"] == []
    assert result["failed"] == []
    assert result["freed_bytes"] == 0


def test_delete_cleanup_deletes_flagged_location(api, tmp_path, monkeypatch):
    import app.cleanup as cleanup_mod
    monkeypatch.setattr(
        cleanup_mod, "known_locations",
        lambda: [{"id": "user_temp", "dirs": [str(tmp_path)]}],
    )
    victim = tmp_path / "junk.tmp"
    victim.write_text("x" * 7)
    api._run_clean_scan()
    result = api.delete_cleanup(["user_temp"])
    assert len(result["deleted"]) == 1
    assert result["freed_bytes"] == 7
    assert not victim.exists()
