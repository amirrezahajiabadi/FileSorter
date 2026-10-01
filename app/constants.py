"""Shared constants: app version, default categories, thresholds, paths."""

from pathlib import Path

APP_VERSION = "6.1.2"

# ══════════════════════════════════════════════════════════════════
#  Default categories (user can customize in Settings)
# ══════════════════════════════════════════════════════════════════
DEFAULT_CATEGORIES = {
    "images":      [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".svg", ".webp", ".heic", ".raw", ".ico"],
    "documents":   [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".rtf", ".csv"],
    "videos":      [".mp4", ".mkv", ".avi", ".mov", ".wmv", ".flv", ".webm", ".m4v"],
    "audio":       [".mp3", ".wav", ".aac", ".flac", ".ogg", ".m4a", ".wma"],
    "archives":    [".zip", ".rar", ".tar", ".gz", ".7z", ".bz2", ".xz"],
    "code":        [".py", ".js", ".ts", ".html", ".css", ".java", ".cpp", ".c", ".cs", ".go", ".rs", ".php", ".rb", ".swift", ".kt"],
    "data":        [".json", ".xml", ".yaml", ".yml", ".sql", ".db", ".sqlite", ".parquet"],
    "ebooks":      [".epub", ".mobi", ".azw", ".fb2"],
    "executables": [".exe", ".msi", ".dmg", ".deb", ".rpm", ".sh", ".bat", ".ps1"],
    "fonts":       [".ttf", ".otf", ".woff", ".woff2"],
    "others":      []
}

# Settings file path
SETTINGS_FILE = Path.home() / ".filesorter_settings.json"

# Large file threshold (bytes) — 100 MB
LARGE_FILE_THRESHOLD = 100 * 1024 * 1024

# Old file threshold (days)
OLD_FILE_DAYS = 365

# How many sort-log rows travel to the UI in the "done" event. A whole-drive
# sort can produce six figures of entries; shipping them all built a
# multi-megabyte JSON frame that had to be parsed and kept in JS memory twice
# over (once in the event, once in the store). Undo never uses this preview —
# it replays AppController.last_sort_log, which stays complete — so the cap
# only trims what the Undo dialog displays (it already renders a tail window).
MAX_SORT_LOG_WIRE = 2000
