"""Load/save the user's persisted settings (categories, language, theme)."""

import json

from app.constants import SETTINGS_FILE, DEFAULT_CATEGORIES

MAX_RECENT_FOLDERS = 8


def load_settings() -> dict:
    """Load user settings (categories, language, theme) from disk, or defaults."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("categories", DEFAULT_CATEGORIES.copy())
            data.setdefault("language", "fa")
            data.setdefault("theme", "light")
            data.setdefault("recent_folders", [])
            return data
        except Exception:
            pass
    return {
        "categories": DEFAULT_CATEGORIES.copy(),
        "language": "fa",
        "theme": "light",
        "recent_folders": [],
    }


def save_settings(settings: dict) -> None:
    """Persist settings to disk as UTF-8 JSON (safe for Persian text)."""
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
    except Exception:
        pass


def add_recent_folder(settings: dict, path: str) -> dict:
    """Move `path` to the front of settings['recent_folders'] (deduplicated, capped).

    Pure function — does not touch disk. Caller is responsible for calling
    save_settings() afterwards if the change should persist.

    Args:
        settings: The settings dict to update (mutated in place and returned).
        path: The folder path to record as most-recently-used.

    Returns:
        The same settings dict, for convenient chaining.
    """
    recents = settings.get("recent_folders", [])
    recents = [p for p in recents if p != path]
    recents.insert(0, path)
    settings["recent_folders"] = recents[:MAX_RECENT_FOLDERS]
    return settings
