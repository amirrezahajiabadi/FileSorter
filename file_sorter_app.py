"""File Sorter — v3.0.

A lightweight desktop app (Tkinter) that automatically organizes files into
categorized folders, with a customizable rules panel, a pre-sort smart
analysis report, full Persian/English bilingual support, and a Dark/Light
theme system with palettes tuned for each mode.

Developed by HajAmir.
"""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import shutil
import threading
import json
import time
from typing import Optional

APP_VERSION = "3.0.0"

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


# ══════════════════════════════════════════════════════════════════
#  Themes — each mode has its own tuned palette (no mismatched hues,
#  e.g. no low-contrast purple-on-black) so buttons/badges stay legible
#  and visually "belong" to that mode.
# ══════════════════════════════════════════════════════════════════
THEMES = {
    "light": {
        "BG":       "#f8f9fa",   # page background
        "BG2":      "#ffffff",   # card / surface
        "BG3":      "#f1f3f5",   # input / inner background
        "FG":       "#1a1a2e",   # primary text
        "FG_DIM":   "#6c757d",   # secondary text
        "GREEN":    "#2d9e6b",
        "YELLOW":   "#e67e22",
        "RED":      "#e74c3c",
        "BLUE":     "#3b82f6",
        "CYAN":     "#0891b2",
        "PURPLE":   "#7c3aed",
        "PEACH":    "#ea580c",
        "ACCENT":       "#3b82f6",
        "ACCENT_HOVER": "#2563eb",
        "ON_ACCENT":    "#ffffff",   # text color placed on top of bright accent buttons
    },
    "dark": {
        # Catppuccin-Mocha inspired — every accent color is a soft pastel
        # that reads clearly against the near-black background.
        "BG":       "#1e1e2e",
        "BG2":      "#181825",
        "BG3":      "#313244",
        "FG":       "#cdd6f4",
        "FG_DIM":   "#a6adc8",
        "GREEN":    "#a6e3a1",
        "YELLOW":   "#f9e2af",
        "RED":      "#f38ba8",
        "BLUE":     "#89b4fa",
        "CYAN":     "#94e2d5",
        "PURPLE":   "#cba6f7",
        "PEACH":    "#fab387",
        "ACCENT":       "#89b4fa",
        "ACCENT_HOVER": "#a6c8ff",
        "ON_ACCENT":    "#1e1e2e",   # dark text on pastel buttons (light buttons need dark text)
    },
}


# ══════════════════════════════════════════════════════════════════
#  Translations (fa / en)
# ══════════════════════════════════════════════════════════════════
STRINGS = {
    "en": {
        "app_title": "File Sorter",
        "header_subtitle": "Select a folder and click Analyze & Sort",
        "dev_line": f"Developed by HajAmir  •  v{APP_VERSION}",
        "settings_btn": "⚙  Settings",
        "selected_folder_label": "Selected Folder:",
        "no_folder": "No folder selected",
        "browse_btn": "📂  Browse",
        "analyze_btn": "🔍  Analyze & Sort",
        "analyzing_btn": "⏳  Analyzing...",
        "sorting_btn": "⏳  Sorting...",
        "copied_label": "✅  Copied:",
        "skipped_label": "⏭  Skipped:",
        "errors_label": "❌  Errors:",
        "log_header": "Operation Log",
        "clear_btn": "Clear",
        "ready_log": "Ready — select a folder and click Analyze & Sort.",
        "folder_selected_log": "📂  Folder selected:\n    {path}",
        "no_folder_warning_title": "No Folder",
        "no_folder_warning_msg": "Please select a folder first.",
        "settings_saved_log": "✅  Settings saved successfully.",
        "done_log": "\n🎉  Done!\n    ✅ {copied} copied   |   ⏭ {skipped} skipped   |   ❌ {errors} errors\n    📁 Output:  {target}",
        "fatal_error_log": "❌  Fatal error:\n    {error}",
        "copied_log": "✅  Copied:   {name}   →   {category}/",
        "skipped_log": "⏭  Skipped (duplicate):   {name}",
        "error_log": "❌  Error:   {name}\n    {error}",

        "splash_title": "File Sorter",
        "splash_dev": "Developed by HajAmir",

        "settings_window_title": "Settings — File Categories",
        "settings_header": "⚙  Settings — File Categories",
        "settings_subheader": "Customize which extensions go into each category",
        "categories_label": "Categories",
        "add_cat_btn": "+ Add",
        "remove_cat_btn": "− Remove",
        "select_category_placeholder": "Select a category",
        "extensions_for": "Extensions for:  {cat}",
        "add_ext_btn": "+ Add Extension",
        "remove_ext_btn": "− Remove Selected",
        "restore_defaults_btn": "Restore Defaults",
        "save_close_btn": "✅  Save & Close",
        "cancel_btn": "Cancel",
        "no_category_warning_title": "No Category",
        "no_category_warning_msg": "Select a category first.",
        "new_category_title": "New Category",
        "new_category_label": "Category name:",
        "create_btn": "Create",
        "cannot_remove_title": "Cannot Remove",
        "cannot_remove_others_msg": "'others' category cannot be removed.",
        "remove_category_confirm_title": "Remove Category",
        "remove_category_confirm_msg": "Remove '{cat}' and all its extensions?",
        "restore_defaults_confirm_title": "Restore Defaults",
        "restore_defaults_confirm_msg": "Reset all categories to default?",

        "analysis_window_title": "Folder Analysis",
        "analysis_header": "🔍  Folder Analysis",
        "analysis_subheader": "Review the report below before sorting",
        "total_files": "Total Files",
        "total_size": "Total Size",
        "large_files": "Large Files",
        "old_files": "Old Files",
        "files_by_category": "Files by Category",
        "smart_suggestions": "💡  Smart Suggestions",
        "no_issues": "✅  No issues found — folder looks clean!",
        "proceed_btn": "▶  Proceed with Sort",
        "files_count_suffix": "{count} files",

        "suggestion_large": "⚠  {n} large file(s) found (>100MB). Consider archiving them to save space.",
        "suggestion_old": "📅  {n} file(s) older than 1 year. Consider archiving or deleting.",
        "suggestion_unknown": "❓  Unknown extensions found: {exts}. Add them to Settings → Categories.",
        "suggestion_others": "📁  {n} file(s) will go to 'others'. Open Settings to assign their extensions.",

        "lang_toggle_to": "فا",
        "theme_toggle_to_dark": "🌙",
        "theme_toggle_to_light": "☀",
    },
    "fa": {
        "app_title": "مرتب‌کننده فایل",
        "header_subtitle": "یک پوشه انتخاب کنید و روی «تحلیل و مرتب‌سازی» کلیک کنید",
        "dev_line": f"توسعه‌یافته توسط HajAmir  •  نسخه {APP_VERSION}",
        "settings_btn": "⚙  تنظیمات",
        "selected_folder_label": "پوشه انتخاب‌شده:",
        "no_folder": "پوشه‌ای انتخاب نشده",
        "browse_btn": "📂  انتخاب پوشه",
        "analyze_btn": "🔍  تحلیل و مرتب‌سازی",
        "analyzing_btn": "⏳  در حال تحلیل...",
        "sorting_btn": "⏳  در حال مرتب‌سازی...",
        "copied_label": "✅  کپی‌شده:",
        "skipped_label": "⏭  رد شده:",
        "errors_label": "❌  خطاها:",
        "log_header": "گزارش عملیات",
        "clear_btn": "پاک کردن",
        "ready_log": "آماده — یک پوشه انتخاب کنید و روی «تحلیل و مرتب‌سازی» کلیک کنید.",
        "folder_selected_log": "📂  پوشه انتخاب شد:\n    {path}",
        "no_folder_warning_title": "پوشه‌ای انتخاب نشده",
        "no_folder_warning_msg": "لطفاً ابتدا یک پوشه انتخاب کنید.",
        "settings_saved_log": "✅  تنظیمات با موفقیت ذخیره شد.",
        "done_log": "\n🎉  تمام شد!\n    ✅ {copied} کپی‌شده   |   ⏭ {skipped} رد شده   |   ❌ {errors} خطا\n    📁 خروجی:  {target}",
        "fatal_error_log": "❌  خطای بحرانی:\n    {error}",
        "copied_log": "✅  کپی شد:   {name}   ←   {category}/",
        "skipped_log": "⏭  رد شد (تکراری):   {name}",
        "error_log": "❌  خطا:   {name}\n    {error}",

        "splash_title": "مرتب‌کننده فایل",
        "splash_dev": "توسعه‌یافته توسط HajAmir",

        "settings_window_title": "تنظیمات — دسته‌بندی فایل‌ها",
        "settings_header": "⚙  تنظیمات — دسته‌بندی فایل‌ها",
        "settings_subheader": "تعیین کنید هر پسوند به کدام دسته برود",
        "categories_label": "دسته‌بندی‌ها",
        "add_cat_btn": "+ افزودن",
        "remove_cat_btn": "− حذف",
        "select_category_placeholder": "یک دسته انتخاب کنید",
        "extensions_for": "پسوندهای دسته:  {cat}",
        "add_ext_btn": "+ افزودن پسوند",
        "remove_ext_btn": "− حذف انتخاب‌شده",
        "restore_defaults_btn": "بازگردانی پیش‌فرض‌ها",
        "save_close_btn": "✅  ذخیره و بستن",
        "cancel_btn": "انصراف",
        "no_category_warning_title": "دسته‌ای انتخاب نشده",
        "no_category_warning_msg": "لطفاً ابتدا یک دسته انتخاب کنید.",
        "new_category_title": "دسته جدید",
        "new_category_label": "نام دسته:",
        "create_btn": "ایجاد",
        "cannot_remove_title": "غیرقابل حذف",
        "cannot_remove_others_msg": "دسته «others» قابل حذف نیست.",
        "remove_category_confirm_title": "حذف دسته",
        "remove_category_confirm_msg": "دسته «{cat}» و تمام پسوندهای آن حذف شود؟",
        "restore_defaults_confirm_title": "بازگردانی پیش‌فرض",
        "restore_defaults_confirm_msg": "تمام دسته‌بندی‌ها به حالت پیش‌فرض بازگردانده شود؟",

        "analysis_window_title": "تحلیل پوشه",
        "analysis_header": "🔍  تحلیل پوشه",
        "analysis_subheader": "قبل از مرتب‌سازی، گزارش زیر را بررسی کنید",
        "total_files": "کل فایل‌ها",
        "total_size": "حجم کل",
        "large_files": "فایل‌های حجیم",
        "old_files": "فایل‌های قدیمی",
        "files_by_category": "فایل‌ها بر اساس دسته",
        "smart_suggestions": "💡  پیشنهادهای هوشمند",
        "no_issues": "✅  مشکلی پیدا نشد — پوشه تمیز است!",
        "proceed_btn": "▶  ادامه مرتب‌سازی",
        "files_count_suffix": "{count} فایل",

        "suggestion_large": "⚠  {n} فایل حجیم (بیش از ۱۰۰ مگابایت) پیدا شد. بهتر است آرشیو شوند.",
        "suggestion_old": "📅  {n} فایل قدیمی‌تر از ۱ سال پیدا شد. بهتر است آرشیو یا حذف شوند.",
        "suggestion_unknown": "❓  پسوندهای ناشناخته پیدا شد: {exts}. آن‌ها را در تنظیمات → دسته‌بندی‌ها اضافه کنید.",
        "suggestion_others": "📁  {n} فایل به دسته «others» می‌روند. برای دسته‌بندی آن‌ها به تنظیمات مراجعه کنید.",

        "lang_toggle_to": "EN",
        "theme_toggle_to_dark": "🌙",
        "theme_toggle_to_light": "☀",
    },
}


def get_font(lang: str, size: int = 10, weight: str = "normal") -> tuple:
    """Return a font tuple appropriate for the given language.

    Tahoma renders Persian glyphs correctly on Windows; Segoe UI is used
    for English to match the original design.

    Args:
        lang: Either "fa" or "en".
        size: Font point size.
        weight: "normal" or "bold".

    Returns:
        A tkinter-compatible font tuple.
    """
    family = "Tahoma" if lang == "fa" else "Segoe UI"
    if weight == "normal":
        return (family, size)
    return (family, size, weight)


def anchor_for(lang: str) -> str:
    """Return the text anchor ("e" for Persian/RTL-ish, "w" for English)."""
    return "e" if lang == "fa" else "w"


def justify_for(lang: str) -> str:
    """Return the text justify mode matching the language's reading direction."""
    return "right" if lang == "fa" else "left"


def configure_ttk_style(theme: dict) -> None:
    """Apply the current theme's palette to ttk widgets (Progressbar, Scrollbar).

    Args:
        theme: One of the THEMES dicts (light/dark).
    """
    style = ttk.Style()
    try:
        style.theme_use("clam")
    except tk.TclError:
        pass
    style.configure(
        "TProgressbar",
        troughcolor=theme["BG3"], background=theme["ACCENT"],
        bordercolor=theme["BG3"], lightcolor=theme["ACCENT"], darkcolor=theme["ACCENT"],
    )
    style.configure(
        "Vertical.TScrollbar",
        background=theme["BG3"], troughcolor=theme["BG"],
        bordercolor=theme["BG"], arrowcolor=theme["FG_DIM"],
    )


# ══════════════════════════════════════════════════════════════════
#  Settings Manager
# ══════════════════════════════════════════════════════════════════

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


# ══════════════════════════════════════════════════════════════════
#  Core Logic (unchanged from v2.0)
# ══════════════════════════════════════════════════════════════════

def get_category(suffix: str, categories: dict) -> str:
    """Return the category name for a given file extension."""
    suffix = suffix.lower()
    for category, extensions in categories.items():
        if suffix in extensions:
            return category
    return "others"


def analyze_folder(base_dir: Path, categories: dict) -> dict:
    """Scan folder and return an analysis report with smart suggestions."""
    now = time.time()
    result = {
        "total": 0,
        "by_category": {},
        "large_files": [],
        "old_files": [],
        "unknown_extensions": set(),
        "total_size": 0,
        "suggestions": []
    }

    target_dir = base_dir / "sorted"

    for file in base_dir.rglob("*"):
        if target_dir in file.parents:
            continue
        if not file.is_file():
            continue

        result["total"] += 1
        size = file.stat().st_size
        result["total_size"] += size

        category = get_category(file.suffix, categories)
        result["by_category"][category] = result["by_category"].get(category, 0) + 1

        if size > LARGE_FILE_THRESHOLD:
            result["large_files"].append((file.name, size))

        age_days = (now - file.stat().st_mtime) / 86400
        if age_days > OLD_FILE_DAYS:
            result["old_files"].append((file.name, int(age_days)))

        if category == "others" and file.suffix:
            result["unknown_extensions"].add(file.suffix.lower())

    result["unknown_extensions"] = sorted(result["unknown_extensions"])
    return result


def build_suggestions(report: dict, T: dict) -> list:
    """Turn a raw analysis report into localized human-readable suggestions."""
    suggestions = []

    if report["large_files"]:
        suggestions.append(T["suggestion_large"].format(n=len(report["large_files"])))

    if report["old_files"]:
        suggestions.append(T["suggestion_old"].format(n=len(report["old_files"])))

    if report["unknown_extensions"]:
        exts = ", ".join(report["unknown_extensions"][:5])
        suggestions.append(T["suggestion_unknown"].format(exts=exts))

    others_count = report["by_category"].get("others", 0)
    if others_count > 5:
        suggestions.append(T["suggestion_others"].format(n=others_count))

    return suggestions


def format_size(bytes_val: float) -> str:
    """Convert bytes to a human-readable size string."""
    for unit in ["B", "KB", "MB", "GB"]:
        if bytes_val < 1024:
            return f"{bytes_val:.1f} {unit}"
        bytes_val /= 1024
    return f"{bytes_val:.1f} TB"


# ══════════════════════════════════════════════════════════════════
#  Splash Screen
# ══════════════════════════════════════════════════════════════════

class SplashScreen:
    """Borderless intro window shown on startup with fade-in/out animation."""

    def __init__(self, root: tk.Tk, theme: dict, lang: str, on_done):
        self.root = root
        self.on_done = on_done
        T = STRINGS[lang]

        self.win = tk.Toplevel(root)
        self.win.overrideredirect(True)
        self.win.configure(bg=theme["BG2"])
        self.win.attributes("-topmost", True)

        W, H = 420, 220
        sw = self.win.winfo_screenwidth()
        sh = self.win.winfo_screenheight()
        self.win.geometry(f"{W}x{H}+{(sw - W) // 2}+{(sh - H) // 2}")

        border = tk.Frame(self.win, bg=theme["ACCENT"], padx=2, pady=2)
        border.pack(fill="both", expand=True)
        inner = tk.Frame(border, bg=theme["BG2"])
        inner.pack(fill="both", expand=True)

        tk.Label(inner, text="📁", font=("Segoe UI Emoji", 36),
                 bg=theme["BG2"], fg=theme["FG"]).pack(pady=(28, 6))
        tk.Label(inner, text=T["splash_title"],
                 font=get_font(lang, 20, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack()
        tk.Label(inner, text=T["splash_dev"],
                 font=get_font(lang, 11), bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(6, 0))

        self.bar = ttk.Progressbar(inner, mode="indeterminate", length=300)
        self.bar.pack(pady=(18, 0))
        self.bar.start(12)

        self.win.attributes("-alpha", 0.0)
        self._fade_in()

    def _fade_in(self, alpha: float = 0.0) -> None:
        if alpha < 1.0:
            self.win.attributes("-alpha", alpha)
            self.win.after(20, lambda: self._fade_in(round(alpha + 0.07, 2)))
        else:
            self.win.after(1800, self._fade_out)

    def _fade_out(self, alpha: float = 1.0) -> None:
        if alpha > 0.0:
            self.win.attributes("-alpha", alpha)
            self.win.after(20, lambda: self._fade_out(round(alpha - 0.07, 2)))
        else:
            self.win.destroy()
            self.on_done()


# ══════════════════════════════════════════════════════════════════
#  Settings Window
# ══════════════════════════════════════════════════════════════════

class SettingsWindow:
    """Modal window for managing file categories and their extensions."""

    def __init__(self, parent: tk.Tk, categories: dict, theme: dict, lang: str, on_save):
        self.parent     = parent
        self.categories = {k: list(v) for k, v in categories.items()}  # deep copy
        self.on_save    = on_save
        self.theme      = theme
        self.lang       = lang
        self.T          = STRINGS[lang]

        self.win = tk.Toplevel(parent)
        self.win.title(self.T["settings_window_title"])
        self.win.geometry("700x540")
        self.win.resizable(False, False)
        self.win.configure(bg=theme["BG"])
        self.win.grab_set()

        self._center()
        self._build_ui()

    def _center(self) -> None:
        self.win.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() - 700) // 2
        y = self.parent.winfo_y() + (self.parent.winfo_height() - 540) // 2
        self.win.geometry(f"700x540+{x}+{y}")

    def _build_ui(self) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        anchor, justify = anchor_for(lang), justify_for(lang)

        header = tk.Frame(self.win, bg=theme["BG2"], pady=12)
        header.pack(fill="x")
        tk.Label(header, text=T["settings_header"],
                 font=get_font(lang, 14, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack()
        tk.Label(header, text=T["settings_subheader"],
                 font=get_font(lang, 9), bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(2, 0))

        main = tk.Frame(self.win, bg=theme["BG"])
        main.pack(fill="both", expand=True, padx=16, pady=12)

        # ── Left: category list ───────────────────────────────────
        left = tk.Frame(main, bg=theme["BG2"], width=180)
        left.pack(side="left", fill="y", padx=(0, 12))
        left.pack_propagate(False)

        tk.Label(left, text=T["categories_label"], font=get_font(lang, 10, "bold"),
                 bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(10, 6))

        self.cat_listbox = tk.Listbox(
            left, font=get_font(lang, 10), bg=theme["BG3"], fg=theme["FG"],
            selectbackground=theme["ACCENT"], selectforeground=theme["ON_ACCENT"],
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        self.cat_listbox.pack(fill="both", expand=True, padx=8, pady=(0, 6))
        self.cat_listbox.bind("<<ListboxSelect>>", self._on_cat_select)

        for cat in self.categories:
            self.cat_listbox.insert("end", f"  {cat}")

        cat_btn_row = tk.Frame(left, bg=theme["BG2"])
        cat_btn_row.pack(fill="x", padx=8, pady=(0, 8))

        tk.Button(cat_btn_row, text=T["add_cat_btn"], command=self._add_category,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["GREEN"],
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["GREEN"]
                  ).pack(side="left")
        tk.Button(cat_btn_row, text=T["remove_cat_btn"], command=self._remove_category,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["RED"],
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["RED"]
                  ).pack(side="right")

        # ── Right: extension editor ───────────────────────────────
        right = tk.Frame(main, bg=theme["BG"])
        right.pack(side="left", fill="both", expand=True)

        self.right_title = tk.Label(right, text=T["select_category_placeholder"],
                 font=get_font(lang, 12, "bold"), bg=theme["BG"], fg=theme["FG_DIM"],
                 anchor=anchor, justify=justify)
        self.right_title.pack(anchor=anchor, fill="x", pady=(4, 8))

        ext_frame = tk.Frame(right, bg=theme["BG3"])
        ext_frame.pack(fill="both", expand=True)

        self.ext_listbox = tk.Listbox(
            ext_frame, font=("Consolas", 10), bg=theme["BG3"], fg=theme["CYAN"],
            selectbackground=theme["BG3"], selectforeground=theme["FG"],
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        ext_sb = ttk.Scrollbar(ext_frame, command=self.ext_listbox.yview)
        self.ext_listbox.configure(yscrollcommand=ext_sb.set)
        ext_sb.pack(side="right", fill="y")
        self.ext_listbox.pack(fill="both", expand=True, padx=10, pady=8)

        add_row = tk.Frame(right, bg=theme["BG"])
        add_row.pack(fill="x", pady=(8, 0))

        self.new_ext_var = tk.StringVar()
        ext_entry = tk.Entry(add_row, textvariable=self.new_ext_var,
                             font=("Consolas", 11), bg=theme["BG2"], fg=theme["FG"],
                             insertbackground=theme["PURPLE"], relief="flat",
                             width=12)
        ext_entry.pack(side="left", ipady=6, padx=(0, 8))
        ext_entry.insert(0, ".ext")
        ext_entry.bind("<FocusIn>", lambda e: ext_entry.delete(0, "end") if self.new_ext_var.get() == ".ext" else None)

        tk.Button(add_row, text=T["add_ext_btn"],
                  command=self._add_extension,
                  font=get_font(lang, 9, "bold"), bg=theme["GREEN"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="left")

        tk.Button(add_row, text=T["remove_ext_btn"],
                  command=self._remove_extension,
                  font=get_font(lang, 9), bg=theme["BG2"], fg=theme["RED"],
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground=theme["BG3"], activeforeground=theme["RED"]
                  ).pack(side="left", padx=(8, 0))

        # ── Bottom buttons ────────────────────────────────────────
        bottom = tk.Frame(self.win, bg=theme["BG2"], pady=10, padx=16)
        bottom.pack(fill="x", side="bottom")

        tk.Button(bottom, text=T["restore_defaults_btn"],
                  command=self._restore_defaults,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["YELLOW"],
                  relief="flat", padx=12, pady=6, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["YELLOW"]
                  ).pack(side="left")

        tk.Button(bottom, text=T["save_close_btn"],
                  command=self._save,
                  font=get_font(lang, 10, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=16, pady=8, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="right")

        tk.Button(bottom, text=T["cancel_btn"],
                  command=self.win.destroy,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["FG_DIM"],
                  relief="flat", padx=12, pady=8, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]
                  ).pack(side="right", padx=(0, 8))

        self.cat_listbox.selection_set(0)
        self._on_cat_select(None)

    def _selected_category(self) -> Optional[str]:
        sel = self.cat_listbox.curselection()
        if not sel:
            return None
        return list(self.categories.keys())[sel[0]]

    def _on_cat_select(self, event) -> None:
        cat = self._selected_category()
        if not cat:
            return
        self.right_title.config(text=self.T["extensions_for"].format(cat=cat), fg=self.theme["FG"])
        self.ext_listbox.delete(0, "end")
        for ext in sorted(self.categories.get(cat, [])):
            self.ext_listbox.insert("end", f"  {ext}")

    def _add_extension(self) -> None:
        cat = self._selected_category()
        if not cat:
            messagebox.showwarning(self.T["no_category_warning_title"],
                                    self.T["no_category_warning_msg"], parent=self.win)
            return
        ext = self.new_ext_var.get().strip().lower()
        if not ext.startswith("."):
            ext = "." + ext
        if ext == ".":
            return
        if ext not in self.categories[cat]:
            self.categories[cat].append(ext)
            self._on_cat_select(None)

    def _remove_extension(self) -> None:
        cat = self._selected_category()
        sel = self.ext_listbox.curselection()
        if not cat or not sel:
            return
        ext = self.ext_listbox.get(sel[0]).strip()
        if ext in self.categories[cat]:
            self.categories[cat].remove(ext)
        self._on_cat_select(None)

    def _add_category(self) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        win = tk.Toplevel(self.win)
        win.title(T["new_category_title"])
        win.geometry("300x130")
        win.configure(bg=theme["BG"])
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text=T["new_category_label"], font=get_font(lang, 10),
                 bg=theme["BG"], fg=theme["FG"]).pack(pady=(16, 4))
        var = tk.StringVar()
        entry = tk.Entry(win, textvariable=var, font=get_font(lang, 11),
                         bg=theme["BG2"], fg=theme["FG"], insertbackground=theme["PURPLE"],
                         relief="flat")
        entry.pack(fill="x", padx=20, ipady=6)
        entry.focus()

        def confirm():
            name = var.get().strip().lower().replace(" ", "_")
            if name and name not in self.categories:
                self.categories[name] = []
                self.cat_listbox.insert("end", f"  {name}")
            win.destroy()

        tk.Button(win, text=T["create_btn"], command=confirm,
                  font=get_font(lang, 10, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", pady=8, cursor="hand2").pack(fill="x", padx=20, pady=10)
        entry.bind("<Return>", lambda e: confirm())

    def _remove_category(self) -> None:
        T = self.T
        cat = self._selected_category()
        if not cat:
            return
        if cat == "others":
            messagebox.showwarning(T["cannot_remove_title"], T["cannot_remove_others_msg"], parent=self.win)
            return
        if messagebox.askyesno(T["remove_category_confirm_title"],
                                T["remove_category_confirm_msg"].format(cat=cat), parent=self.win):
            del self.categories[cat]
            idx = self.cat_listbox.curselection()[0]
            self.cat_listbox.delete(idx)
            self.ext_listbox.delete(0, "end")
            self.right_title.config(text=T["select_category_placeholder"], fg=self.theme["FG_DIM"])

    def _restore_defaults(self) -> None:
        T = self.T
        if messagebox.askyesno(T["restore_defaults_confirm_title"], T["restore_defaults_confirm_msg"], parent=self.win):
            self.categories = {k: list(v) for k, v in DEFAULT_CATEGORIES.items()}
            self.cat_listbox.delete(0, "end")
            for cat in self.categories:
                self.cat_listbox.insert("end", f"  {cat}")
            self.cat_listbox.selection_set(0)
            self._on_cat_select(None)

    def _save(self) -> None:
        self.on_save(self.categories)
        self.win.destroy()


# ══════════════════════════════════════════════════════════════════
#  Analysis Window
# ══════════════════════════════════════════════════════════════════

class AnalysisWindow:
    """Shows folder analysis report with smart suggestions before sorting."""

    def __init__(self, parent: tk.Tk, report: dict, theme: dict, lang: str, on_proceed):
        self.on_proceed = on_proceed
        self.theme = theme
        self.lang = lang
        self.T = STRINGS[lang]

        self.win = tk.Toplevel(parent)
        self.win.title(self.T["analysis_window_title"])
        self.win.geometry("580x520")
        self.win.resizable(False, False)
        self.win.configure(bg=theme["BG"])
        self.win.grab_set()

        x = parent.winfo_x() + (parent.winfo_width() - 580) // 2
        y = parent.winfo_y() + (parent.winfo_height() - 520) // 2
        self.win.geometry(f"580x520+{x}+{y}")

        self._build_ui(report)

    def _build_ui(self, report: dict) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        anchor, justify = anchor_for(lang), justify_for(lang)

        header = tk.Frame(self.win, bg=theme["BG2"], pady=12)
        header.pack(fill="x")
        tk.Label(header, text=T["analysis_header"],
                 font=get_font(lang, 14, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack()
        tk.Label(header, text=T["analysis_subheader"],
                 font=get_font(lang, 9), bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(2, 0))

        content = tk.Frame(self.win, bg=theme["BG"], padx=20, pady=14)
        content.pack(fill="both", expand=True)

        # ── Summary stats ─────────────────────────────────────────
        stats_row = tk.Frame(content, bg=theme["BG"])
        stats_row.pack(fill="x", pady=(0, 12))

        for label, value, color in [
            (T["total_files"],  str(report["total"]),               theme["BLUE"]),
            (T["total_size"],   format_size(report["total_size"]),  theme["CYAN"]),
            (T["large_files"],  str(len(report["large_files"])),    theme["YELLOW"]),
            (T["old_files"],    str(len(report["old_files"])),      theme["PEACH"]),
        ]:
            cell = tk.Frame(stats_row, bg=theme["BG2"], padx=12, pady=10)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            tk.Label(cell, text=value, font=get_font(lang, 16, "bold"),
                     bg=theme["BG2"], fg=color).pack()
            tk.Label(cell, text=label, font=get_font(lang, 8),
                     bg=theme["BG2"], fg=theme["FG_DIM"]).pack()

        # ── Category breakdown ────────────────────────────────────
        tk.Label(content, text=T["files_by_category"],
                 font=get_font(lang, 10, "bold"), bg=theme["BG"], fg=theme["FG_DIM"],
                 anchor=anchor).pack(anchor=anchor, fill="x")

        cat_frame = tk.Frame(content, bg=theme["BG3"])
        cat_frame.pack(fill="x", pady=(6, 12))

        cat_inner = tk.Frame(cat_frame, bg=theme["BG3"], padx=12, pady=8)
        cat_inner.pack(fill="x")

        for cat, count in sorted(report["by_category"].items(),
                                  key=lambda x: x[1], reverse=True):
            row = tk.Frame(cat_inner, bg=theme["BG3"])
            row.pack(fill="x", pady=1)
            color = theme["RED"] if cat == "others" else theme["FG"]
            tk.Label(row, text=f"  {cat}", font=get_font(lang, 9),
                     bg=theme["BG3"], fg=color, width=16, anchor="w").pack(side="left")
            tk.Label(row, text=T["files_count_suffix"].format(count=count),
                     font=get_font(lang, 9, "bold"), bg=theme["BG3"], fg=color).pack(side="left")

        # ── Smart suggestions ─────────────────────────────────────
        suggestions = build_suggestions(report, T)
        if suggestions:
            tk.Label(content, text=T["smart_suggestions"],
                     font=get_font(lang, 10, "bold"), bg=theme["BG"], fg=theme["PURPLE"],
                     anchor=anchor).pack(anchor=anchor, fill="x")

            for suggestion in suggestions:
                s_frame = tk.Frame(content, bg=theme["BG2"], padx=12, pady=8)
                s_frame.pack(fill="x", pady=(4, 0))
                tk.Label(s_frame, text=suggestion, font=get_font(lang, 9),
                         bg=theme["BG2"], fg=theme["FG"], wraplength=500, justify=justify,
                         anchor=anchor).pack(fill="x")
        else:
            tk.Label(content, text=T["no_issues"],
                     font=get_font(lang, 10), bg=theme["BG"], fg=theme["GREEN"],
                     anchor=anchor).pack(anchor=anchor, fill="x", pady=8)

        # ── Bottom buttons ────────────────────────────────────────
        bottom = tk.Frame(self.win, bg=theme["BG2"], pady=10, padx=20)
        bottom.pack(fill="x", side="bottom")

        tk.Button(bottom, text=T["proceed_btn"],
                  command=self._proceed,
                  font=get_font(lang, 11, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=16, pady=9, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="right")

        tk.Button(bottom, text=T["cancel_btn"],
                  command=self.win.destroy,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["FG_DIM"],
                  relief="flat", padx=12, pady=9, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]
                  ).pack(side="right", padx=(0, 8))

    def _proceed(self) -> None:
        self.win.destroy()
        self.on_proceed()


# ══════════════════════════════════════════════════════════════════
#  Main Application
# ══════════════════════════════════════════════════════════════════

class FileSorterApp:
    """Main GUI window for the File Sorter application."""

    def __init__(self, root: tk.Tk):
        self.root = root
        self.root.resizable(False, False)
        self.root.withdraw()

        # Load persisted settings (categories, language, theme)
        self.settings   = load_settings()
        self.categories = self.settings.get("categories", DEFAULT_CATEGORIES.copy())
        self.lang       = self.settings.get("language", "fa")
        self.theme_name = self.settings.get("theme", "light")

        self.selected_dir = tk.StringVar(value="")
        self.count_ok     = tk.IntVar(value=0)
        self.count_skip   = tk.IntVar(value=0)
        self.count_err    = tk.IntVar(value=0)

        configure_ttk_style(self.theme)
        self.root.configure(bg=self.theme["BG"])
        SplashScreen(self.root, self.theme, self.lang, self._show_main)

    # ── Convenience accessors ────────────────────────────────────
    @property
    def theme(self) -> dict:
        return THEMES[self.theme_name]

    @property
    def T(self) -> dict:
        return STRINGS[self.lang]

    def _show_main(self) -> None:
        self.root.deiconify()
        self.selected_dir.set(self.T["no_folder"])
        self.build_ui()

    # ── Theme / language toggles ─────────────────────────────────
    def toggle_theme(self) -> None:
        """Switch between dark and light mode and rebuild the UI."""
        self.theme_name = "dark" if self.theme_name == "light" else "light"
        self.settings["theme"] = self.theme_name
        save_settings(self.settings)
        self._rebuild_ui()

    def toggle_lang(self) -> None:
        """Switch between Persian and English and rebuild the UI."""
        self.lang = "en" if self.lang == "fa" else "fa"
        self.settings["language"] = self.lang
        save_settings(self.settings)
        self._rebuild_ui()

    def _rebuild_ui(self) -> None:
        """Destroy and recreate every widget using the current theme/language."""
        was_no_folder = self.selected_dir.get() in (STRINGS["fa"]["no_folder"], STRINGS["en"]["no_folder"], "")
        current_path = None if was_no_folder else self.selected_dir.get()

        for w in self.root.winfo_children():
            w.destroy()

        configure_ttk_style(self.theme)
        self.root.configure(bg=self.theme["BG"])
        self.selected_dir.set(current_path if current_path else self.T["no_folder"])
        self.build_ui()

    # ── Build UI ──────────────────────────────────────────────────
    def build_ui(self) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        anchor, justify = anchor_for(lang), justify_for(lang)

        self.root.title(f"{T['app_title']}  v{APP_VERSION}")

        # Header
        header = tk.Frame(self.root, bg=theme["BG2"], pady=12)
        header.pack(fill="x", side="top")

        header_row = tk.Frame(header, bg=theme["BG2"])
        header_row.pack(fill="x", padx=16)

        tk.Label(header_row, text=f"📁  {T['app_title']}",
                 font=get_font(lang, 18, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack(side="left")

        # Right-side header controls: Settings, Theme toggle, Language toggle
        controls = tk.Frame(header_row, bg=theme["BG2"])
        controls.pack(side="right")

        tk.Button(controls, text=T["settings_btn"],
                  command=self.open_settings,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["FG_DIM"],
                  relief="flat", padx=10, pady=5, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]
                  ).pack(side="left", padx=(0, 6))

        theme_icon = T["theme_toggle_to_dark"] if self.theme_name == "light" else T["theme_toggle_to_light"]
        tk.Button(controls, text=theme_icon,
                  command=self.toggle_theme,
                  font=get_font(lang, 11), bg=theme["BG3"], fg=theme["FG"],
                  relief="flat", padx=10, pady=5, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]
                  ).pack(side="left", padx=(0, 6))

        tk.Button(controls, text=T["lang_toggle_to"],
                  command=self.toggle_lang,
                  font=get_font(lang, 9, "bold"), bg=theme["BG3"], fg=theme["ACCENT"],
                  relief="flat", padx=10, pady=5, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["ACCENT"]
                  ).pack(side="left")

        tk.Label(header, text=T["header_subtitle"],
                 font=get_font(lang, 10), bg=theme["BG2"], fg=theme["FG_DIM"],
                 anchor=anchor, justify=justify).pack(fill="x", padx=16, pady=(2, 0))
        tk.Label(header, text=T["dev_line"],
                 font=get_font(lang, 8), bg=theme["BG2"], fg=theme["FG_DIM"],
                 anchor=anchor, justify=justify).pack(fill="x", padx=16, pady=(1, 0))

        # Bottom section
        bottom = tk.Frame(self.root, bg=theme["BG"], pady=12, padx=24)
        bottom.pack(fill="x", side="bottom")

        cbar = tk.Frame(bottom, bg=theme["BG"])
        cbar.pack(fill="x", pady=(0, 8))
        for label, var, color in [
            (T["copied_label"],  self.count_ok,   theme["GREEN"]),
            (T["skipped_label"], self.count_skip, theme["YELLOW"]),
            (T["errors_label"],  self.count_err,  theme["RED"]),
        ]:
            cell = tk.Frame(cbar, bg=theme["BG2"], padx=12, pady=6)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            tk.Label(cell, text=label, font=get_font(lang, 9),
                     bg=theme["BG2"], fg=theme["FG_DIM"]).pack(side="left")
            tk.Label(cell, textvariable=var, font=get_font(lang, 11, "bold"),
                     bg=theme["BG2"], fg=color).pack(side="right")

        self.progress = ttk.Progressbar(bottom, mode="indeterminate")
        self.progress.pack(fill="x", pady=(0, 8))

        self.sort_btn = tk.Button(
            bottom, text=T["analyze_btn"], command=self.start_analysis,
            font=get_font(lang, 13, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
            relief="flat", pady=11, cursor="hand2",
            activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
        )
        self.sort_btn.pack(fill="x")

        # Folder selector
        dir_frame = tk.Frame(self.root, bg=theme["BG"], pady=14, padx=24)
        dir_frame.pack(fill="x", side="top")

        tk.Label(dir_frame, text=T["selected_folder_label"],
                 font=get_font(lang, 10, "bold"), bg=theme["BG"], fg=theme["FG_DIM"],
                 anchor=anchor).pack(anchor=anchor, fill="x")

        path_row = tk.Frame(dir_frame, bg=theme["BG"])
        path_row.pack(fill="x", pady=(6, 0))

        self.path_label = tk.Label(
            path_row, textvariable=self.selected_dir,
            font=get_font(lang, 10), bg=theme["BG2"], fg=theme["FG"],
            anchor=anchor, padx=12, pady=9, relief="flat",
            wraplength=440, justify=justify
        )
        self.path_label.pack(side="left", fill="x", expand=True)

        tk.Button(
            path_row, text=T["browse_btn"], command=self.browse_directory,
            font=get_font(lang, 10, "bold"), bg=theme["BLUE"], fg=theme["ON_ACCENT"],
            relief="flat", padx=14, pady=9, cursor="hand2",
            activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
        ).pack(side="right", padx=(10, 0))

        tk.Frame(self.root, bg=theme["BG2"], height=1).pack(fill="x", padx=24, side="top")

        # Log area
        log_frame = tk.Frame(self.root, bg=theme["BG"], padx=24, pady=10)
        log_frame.pack(fill="both", expand=True, side="top")

        log_header = tk.Frame(log_frame, bg=theme["BG"])
        log_header.pack(fill="x")
        tk.Label(log_header, text=T["log_header"],
                 font=get_font(lang, 10, "bold"), bg=theme["BG"], fg=theme["FG_DIM"]).pack(side="left")
        tk.Button(log_header, text=T["clear_btn"], command=self.clear_log,
                  font=get_font(lang, 8), bg=theme["BG2"], fg=theme["FG_DIM"],
                  relief="flat", padx=8, pady=2, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]).pack(side="right")

        text_frame = tk.Frame(log_frame, bg=theme["BG"])
        text_frame.pack(fill="both", expand=True, pady=(6, 0))

        self.log_box = tk.Text(
            text_frame, font=get_font(lang, 10), bg=theme["BG3"], fg=theme["FG"],
            relief="flat", padx=14, pady=10, state="disabled",
            wrap="word", spacing1=3, spacing3=3,
            selectbackground=theme["BG3"], selectforeground=theme["FG"],
            insertbackground=theme["FG"],
        )
        scrollbar = ttk.Scrollbar(text_frame, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.log_box.pack(side="left", fill="both", expand=True)

        self.log_box.tag_config("ok",      foreground=theme["GREEN"],  font=get_font(lang, 10))
        self.log_box.tag_config("skip",    foreground=theme["YELLOW"], font=get_font(lang, 10))
        self.log_box.tag_config("error",   foreground=theme["RED"],    font=get_font(lang, 10, "bold"))
        self.log_box.tag_config("info",    foreground=theme["CYAN"],   font=get_font(lang, 10))
        self.log_box.tag_config("done",    foreground=theme["PURPLE"], font=get_font(lang, 11, "bold"))
        self.log_box.tag_config("suggest", foreground=theme["PEACH"],  font=get_font(lang, 10))

        self.log("info", T["ready_log"])

    # ── Actions ───────────────────────────────────────────────────
    def browse_directory(self) -> None:
        directory = filedialog.askdirectory(title=self.T["browse_btn"])
        if directory:
            self.selected_dir.set(directory)
            self.log("info", self.T["folder_selected_log"].format(path=directory))

    def open_settings(self) -> None:
        SettingsWindow(self.root, self.categories, self.theme, self.lang, self._on_settings_save)

    def _on_settings_save(self, new_categories: dict) -> None:
        self.categories = new_categories
        self.settings["categories"] = new_categories
        save_settings(self.settings)
        self.log("info", self.T["settings_saved_log"])

    def start_analysis(self) -> None:
        path = self.selected_dir.get()
        if path == self.T["no_folder"]:
            messagebox.showwarning(self.T["no_folder_warning_title"], self.T["no_folder_warning_msg"])
            return

        self.sort_btn.configure(state="disabled", text=self.T["analyzing_btn"])
        self.progress.start(10)

        def run_analysis():
            report = analyze_folder(Path(path), self.categories)
            self.progress.stop()
            self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
            self.root.after(0, lambda: AnalysisWindow(
                self.root, report, self.theme, self.lang,
                on_proceed=lambda: self._start_sort(path)
            ))

        threading.Thread(target=run_analysis, daemon=True).start()

    def _start_sort(self, path: str) -> None:
        self.clear_log()
        self.count_ok.set(0)
        self.count_skip.set(0)
        self.count_err.set(0)
        self.sort_btn.configure(state="disabled", text=self.T["sorting_btn"])
        self.progress.start(10)
        threading.Thread(target=self.run_sort, args=(path,), daemon=True).start()

    def run_sort(self, path_str: str) -> None:
        """Sort files into category subfolders inside a 'sorted' directory."""
        T = self.T
        base_dir   = Path(path_str)
        target_dir = base_dir / "sorted"
        try:
            for category in self.categories:
                (target_dir / category).mkdir(parents=True, exist_ok=True)

            copied = skipped = errors = 0

            for file in base_dir.rglob("*"):
                if target_dir in file.parents:
                    continue
                if not file.is_file():
                    continue

                category = get_category(file.suffix, self.categories)
                dest = target_dir / category / file.name

                if dest.exists():
                    self.log("skip", T["skipped_log"].format(name=file.name))
                    skipped += 1
                    self.count_skip.set(skipped)
                    continue

                try:
                    shutil.copy2(file, dest)
                    self.log("ok", T["copied_log"].format(name=file.name, category=category))
                    copied += 1
                    self.count_ok.set(copied)
                except Exception as e:
                    self.log("error", T["error_log"].format(name=file.name, error=e))
                    errors += 1
                    self.count_err.set(errors)

            self.log("done", T["done_log"].format(copied=copied, skipped=skipped, errors=errors, target=target_dir))

        except Exception as e:
            self.log("error", T["fatal_error_log"].format(error=e))
        finally:
            self.progress.stop()
            self.sort_btn.configure(state="normal", text=T["analyze_btn"])

    def log(self, tag: str, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def clear_log(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")


# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    root = tk.Tk()
    app = FileSorterApp(root)
    root.mainloop()
