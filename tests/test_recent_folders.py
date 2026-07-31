"""Unit tests for app.settings_manager's recent-folders helper."""

from app.settings_manager import add_recent_folder, MAX_RECENT_FOLDERS


def test_add_recent_folder_to_empty_list():
    settings = {"recent_folders": []}
    add_recent_folder(settings, "/a")
    assert settings["recent_folders"] == ["/a"]


def test_add_recent_folder_puts_newest_first():
    settings = {"recent_folders": ["/a"]}
    add_recent_folder(settings, "/b")
    assert settings["recent_folders"] == ["/b", "/a"]


def test_add_recent_folder_deduplicates_and_moves_to_front():
    settings = {"recent_folders": ["/a", "/b", "/c"]}
    add_recent_folder(settings, "/b")
    assert settings["recent_folders"] == ["/b", "/a", "/c"]


def test_add_recent_folder_caps_at_max():
    settings = {"recent_folders": [f"/f{i}" for i in range(MAX_RECENT_FOLDERS)]}
    add_recent_folder(settings, "/new")
    assert len(settings["recent_folders"]) == MAX_RECENT_FOLDERS
    assert settings["recent_folders"][0] == "/new"
    assert f"/f{MAX_RECENT_FOLDERS - 1}" not in settings["recent_folders"]


def test_add_recent_folder_missing_key_defaults_to_empty():
    settings = {}
    add_recent_folder(settings, "/a")
    assert settings["recent_folders"] == ["/a"]


def test_add_recent_folder_returns_same_dict():
    settings = {"recent_folders": []}
    result = add_recent_folder(settings, "/a")
    assert result is settings
