import json
import os
import re

from app.constants import SETTINGS_FILE, DEFAULT_CATEGORIES

MAX_RECENT_FOLDERS = 8


def sanitize_category_name(name: str) -> str:
    """Ensure category name is a safe, single-level directory name without path traversal."""
    if not isinstance(name, str):
        return "others"
    clean = re.sub(r'[\/\\:\*\?"<>\|\x00-\x1f]', '_', name.strip())
    clean = clean.strip(". ")
    if not clean or clean.upper() in {
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    }:
        return "others"
    return clean


def load_settings() -> dict:
    """Load user settings (categories, theme) from disk, or defaults."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("categories", DEFAULT_CATEGORIES.copy())
            data.setdefault("theme", "light")
            data.setdefault("recent_folders", [])
            return data
        except Exception:
            pass
    return {
        "categories": DEFAULT_CATEGORIES.copy(),
        "theme": "light",
        "recent_folders": [],
    }


def save_settings(settings: dict) -> None:
    """Persist settings to disk as UTF-8 JSON atomically via temp file."""
    try:
        tmp_file = SETTINGS_FILE.with_suffix(".json.tmp")
        with open(tmp_file, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_file, SETTINGS_FILE)
    except Exception as exc:
        import logging
        logging.warning("Failed to save settings to %s: %s", SETTINGS_FILE, exc)


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
