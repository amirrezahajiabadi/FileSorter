"""Load/save the user's persisted settings (categories, language, theme)."""

import json

from app.constants import SETTINGS_FILE, DEFAULT_CATEGORIES


def load_settings() -> dict:
    """Load user settings (categories, language, theme) from disk, or defaults."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            data.setdefault("categories", DEFAULT_CATEGORIES.copy())
            data.setdefault("language", "fa")
            data.setdefault("theme", "light")
            return data
        except Exception:
            pass
    return {"categories": DEFAULT_CATEGORIES.copy(), "language": "fa", "theme": "light"}


def save_settings(settings: dict) -> None:
    """Persist settings to disk as UTF-8 JSON (safe for Persian text)."""
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings, f, indent=2, ensure_ascii=False)
    except Exception:
        pass
