"""Shared constants: app version, default categories, thresholds, paths."""

from pathlib import Path

APP_VERSION = "3.1.0"

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
    "data":        [".json", ".xml", ".yaml", ".yml", ".sql", ".db", ".sqlite", ".parquet", ".csv"],
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
