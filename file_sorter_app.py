import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import shutil
import threading
import json
import os

# ── Default categories (user can customize in Settings) ───────────
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

# ── Theme colors (Modern Light) ───────────────────────────────────
BG     = "#f8f9fa"   # page background
BG2    = "#ffffff"   # card / surface
BG3    = "#f1f3f5"   # input / inner background
FG     = "#1a1a2e"   # primary text
FG_DIM = "#6c757d"   # secondary text
GREEN  = "#2d9e6b"   # success
YELLOW = "#e67e22"   # warning
RED    = "#e74c3c"   # error
BLUE   = "#3b82f6"   # blue accent
CYAN   = "#0891b2"   # cyan
PURPLE = "#7c3aed"   # purple accent
PEACH  = "#ea580c"   # orange
ACCENT = "#3b82f6"   # primary button color


# ══════════════════════════════════════════════════════════════════
#  Settings Manager
# ══════════════════════════════════════════════════════════════════

def load_settings() -> dict:
    """Load user settings from disk, or return defaults."""
    if SETTINGS_FILE.exists():
        try:
            with open(SETTINGS_FILE, "r") as f:
                return json.load(f)
        except Exception:
            pass
    return {"categories": DEFAULT_CATEGORIES.copy()}

def save_settings(settings: dict):
    """Persist settings to disk."""
    with open(SETTINGS_FILE, "w") as f:
        json.dump(settings, f, indent=2)


# ══════════════════════════════════════════════════════════════════
#  Core Logic
# ══════════════════════════════════════════════════════════════════

def get_category(suffix: str, categories: dict) -> str:
    """Return the category name for a given file extension."""
    suffix = suffix.lower()
    for category, extensions in categories.items():
        if suffix in extensions:
            return category
    return "others"


def analyze_folder(base_dir: Path, categories: dict) -> dict:
    """
    Scan folder and return analysis report with smart suggestions.
    Returns dict with file counts, large files, old files, unknown extensions.
    """
    import time
    now = time.time()
    result = {
        "total": 0,
        "by_category": {},
        "large_files": [],       # files > LARGE_FILE_THRESHOLD
        "old_files": [],         # files older than OLD_FILE_DAYS
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

        # Large file detection
        if size > LARGE_FILE_THRESHOLD:
            result["large_files"].append((file.name, size))

        # Old file detection
        age_days = (now - file.stat().st_mtime) / 86400
        if age_days > OLD_FILE_DAYS:
            result["old_files"].append((file.name, int(age_days)))

        # Unknown extension
        if category == "others" and file.suffix:
            result["unknown_extensions"].add(file.suffix.lower())

    # Generate suggestions
    if result["large_files"]:
        total_large = len(result["large_files"])
        result["suggestions"].append(
            f"⚠  {total_large} large file(s) found (>100MB). Consider archiving them to save space."
        )

    if result["old_files"]:
        result["suggestions"].append(
            f"📅  {len(result['old_files'])} file(s) older than 1 year. Consider archiving or deleting."
        )

    if result["unknown_extensions"]:
        exts = ", ".join(sorted(result["unknown_extensions"])[:5])
        result["suggestions"].append(
            f"❓  Unknown extensions found: {exts}. Add them to Settings → Categories."
        )

    others_count = result["by_category"].get("others", 0)
    if others_count > 5:
        result["suggestions"].append(
            f"📁  {others_count} file(s) will go to 'others'. Open Settings to assign their extensions."
        )

    result["unknown_extensions"] = sorted(result["unknown_extensions"])
    return result


def format_size(bytes_val: int) -> str:
    """Convert bytes to human-readable size string."""
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

    def __init__(self, root, on_done):
        self.root    = root
        self.on_done = on_done

        self.win = tk.Toplevel(root)
        self.win.overrideredirect(True)
        self.win.configure(bg=BG2)
        self.win.attributes("-topmost", True)

        W, H = 420, 220
        sw = self.win.winfo_screenwidth()
        sh = self.win.winfo_screenheight()
        self.win.geometry(f"{W}x{H}+{(sw - W) // 2}+{(sh - H) // 2}")

        border = tk.Frame(self.win, bg=BLUE, padx=2, pady=2)
        border.pack(fill="both", expand=True)
        inner = tk.Frame(border, bg=BG2)
        inner.pack(fill="both", expand=True)

        tk.Label(inner, text="📁", font=("Segoe UI Emoji", 36),
                 bg=BG2, fg=FG).pack(pady=(28, 6))
        tk.Label(inner, text="File Sorter",
                 font=("Segoe UI", 20, "bold"), bg=BG2, fg=FG).pack()
        tk.Label(inner, text="Developed by HajAmir",
                 font=("Segoe UI", 11), bg=BG2, fg=FG_DIM).pack(pady=(6, 0))

        self.bar = ttk.Progressbar(inner, mode="indeterminate", length=300)
        self.bar.pack(pady=(18, 0))
        self.bar.start(12)

        self.win.attributes("-alpha", 0.0)
        self._fade_in()

    def _fade_in(self, alpha=0.0):
        if alpha < 1.0:
            self.win.attributes("-alpha", alpha)
            self.win.after(20, lambda: self._fade_in(round(alpha + 0.07, 2)))
        else:
            self.win.after(1800, self._fade_out)

    def _fade_out(self, alpha=1.0):
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
    """
    Modal window for managing file categories and their extensions.
    Users can add/remove extensions and create custom categories.
    """

    def __init__(self, parent, categories: dict, on_save):
        self.parent     = parent
        self.categories = {k: list(v) for k, v in categories.items()}  # deep copy
        self.on_save    = on_save

        self.win = tk.Toplevel(parent)
        self.win.title("Settings — File Categories")
        self.win.geometry("700x540")
        self.win.resizable(False, False)
        self.win.configure(bg=BG)
        self.win.grab_set()   # make modal

        self._center()
        self._build_ui()

    def _center(self):
        self.win.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() - 700) // 2
        y = self.parent.winfo_y() + (self.parent.winfo_height() - 540) // 2
        self.win.geometry(f"700x540+{x}+{y}")

    def _build_ui(self):
        # Header
        header = tk.Frame(self.win, bg=BG2, pady=12)
        header.pack(fill="x")
        tk.Label(header, text="⚙  Settings — File Categories",
                 font=("Segoe UI", 14, "bold"), bg=BG2, fg=FG).pack()
        tk.Label(header, text="Customize which extensions go into each category",
                 font=("Segoe UI", 9), bg=BG2, fg=FG_DIM).pack(pady=(2, 0))

        # Main split: left = category list, right = extension editor
        main = tk.Frame(self.win, bg=BG)
        main.pack(fill="both", expand=True, padx=16, pady=12)

        # ── Left: category list ───────────────────────────────────
        left = tk.Frame(main, bg=BG2, width=180)
        left.pack(side="left", fill="y", padx=(0, 12))
        left.pack_propagate(False)

        tk.Label(left, text="Categories", font=("Segoe UI", 10, "bold"),
                 bg=BG2, fg=FG_DIM).pack(pady=(10, 6))

        self.cat_listbox = tk.Listbox(
            left, font=("Segoe UI", 10), bg=BG3, fg=FG,
            selectbackground=BLUE, selectforeground="#ffffff",
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        self.cat_listbox.pack(fill="both", expand=True, padx=8, pady=(0, 6))
        self.cat_listbox.bind("<<ListboxSelect>>", self._on_cat_select)

        for cat in self.categories:
            self.cat_listbox.insert("end", f"  {cat}")

        # Add / Remove category buttons
        cat_btn_row = tk.Frame(left, bg=BG2)
        cat_btn_row.pack(fill="x", padx=8, pady=(0, 8))

        tk.Button(cat_btn_row, text="+ Add", command=self._add_category,
                  font=("Segoe UI", 9), bg=BG3, fg=GREEN,
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=BG, activeforeground=GREEN
                  ).pack(side="left")
        tk.Button(cat_btn_row, text="− Remove", command=self._remove_category,
                  font=("Segoe UI", 9), bg=BG3, fg=RED,
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=BG, activeforeground=RED
                  ).pack(side="right")

        # ── Right: extension editor ───────────────────────────────
        right = tk.Frame(main, bg=BG)
        right.pack(side="left", fill="both", expand=True)

        self.right_title = tk.Label(right, text="Select a category",
                 font=("Segoe UI", 12, "bold"), bg=BG, fg=FG_DIM)
        self.right_title.pack(anchor="w", pady=(4, 8))

        # Extension list
        ext_frame = tk.Frame(right, bg=BG3)
        ext_frame.pack(fill="both", expand=True)

        self.ext_listbox = tk.Listbox(
            ext_frame, font=("Consolas", 10), bg=BG3, fg=CYAN,
            selectbackground=BG3, selectforeground=FG,
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        ext_sb = ttk.Scrollbar(ext_frame, command=self.ext_listbox.yview)
        self.ext_listbox.configure(yscrollcommand=ext_sb.set)
        ext_sb.pack(side="right", fill="y")
        self.ext_listbox.pack(fill="both", expand=True, padx=10, pady=8)

        # Add extension row
        add_row = tk.Frame(right, bg=BG)
        add_row.pack(fill="x", pady=(8, 0))

        self.new_ext_var = tk.StringVar()
        ext_entry = tk.Entry(add_row, textvariable=self.new_ext_var,
                             font=("Consolas", 11), bg=BG2, fg=FG,
                             insertbackground=PURPLE, relief="flat",
                             width=12)
        ext_entry.pack(side="left", ipady=6, padx=(0, 8))
        ext_entry.insert(0, ".ext")
        ext_entry.bind("<FocusIn>", lambda e: ext_entry.delete(0, "end") if self.new_ext_var.get() == ".ext" else None)

        tk.Button(add_row, text="+ Add Extension",
                  command=self._add_extension,
                  font=("Segoe UI", 9, "bold"), bg=GREEN, fg=BG,
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground="#2563eb", activeforeground="#ffffff"
                  ).pack(side="left")

        tk.Button(add_row, text="− Remove Selected",
                  command=self._remove_extension,
                  font=("Segoe UI", 9), bg=BG2, fg=RED,
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground=BG3, activeforeground=RED
                  ).pack(side="left", padx=(8, 0))

        # ── Bottom buttons ────────────────────────────────────────
        bottom = tk.Frame(self.win, bg=BG2, pady=10, padx=16)
        bottom.pack(fill="x", side="bottom")

        tk.Button(bottom, text="Restore Defaults",
                  command=self._restore_defaults,
                  font=("Segoe UI", 9), bg=BG3, fg=YELLOW,
                  relief="flat", padx=12, pady=6, cursor="hand2",
                  activebackground=BG, activeforeground=YELLOW
                  ).pack(side="left")

        tk.Button(bottom, text="✅  Save & Close",
                  command=self._save,
                  font=("Segoe UI", 10, "bold"), bg=ACCENT, fg=BG,
                  relief="flat", padx=16, pady=8, cursor="hand2",
                  activebackground="#2563eb", activeforeground="#ffffff"
                  ).pack(side="right")

        tk.Button(bottom, text="Cancel",
                  command=self.win.destroy,
                  font=("Segoe UI", 9), bg=BG3, fg=FG_DIM,
                  relief="flat", padx=12, pady=8, cursor="hand2",
                  activebackground=BG, activeforeground=FG
                  ).pack(side="right", padx=(0, 8))

        # Select first category by default
        self.cat_listbox.selection_set(0)
        self._on_cat_select(None)

    def _selected_category(self) -> str | None:
        sel = self.cat_listbox.curselection()
        if not sel:
            return None
        return list(self.categories.keys())[sel[0]]

    def _on_cat_select(self, event):
        cat = self._selected_category()
        if not cat:
            return
        self.right_title.config(text=f"Extensions for:  {cat}", fg=FG)
        self.ext_listbox.delete(0, "end")
        for ext in sorted(self.categories.get(cat, [])):
            self.ext_listbox.insert("end", f"  {ext}")

    def _add_extension(self):
        cat = self._selected_category()
        if not cat:
            messagebox.showwarning("No Category", "Select a category first.", parent=self.win)
            return
        ext = self.new_ext_var.get().strip().lower()
        if not ext.startswith("."):
            ext = "." + ext
        if ext == ".":
            return
        if ext not in self.categories[cat]:
            self.categories[cat].append(ext)
            self._on_cat_select(None)

    def _remove_extension(self):
        cat = self._selected_category()
        sel = self.ext_listbox.curselection()
        if not cat or not sel:
            return
        ext = self.ext_listbox.get(sel[0]).strip()
        if ext in self.categories[cat]:
            self.categories[cat].remove(ext)
        self._on_cat_select(None)

    def _add_category(self):
        win = tk.Toplevel(self.win)
        win.title("New Category")
        win.geometry("300x130")
        win.configure(bg=BG)
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text="Category name:", font=("Segoe UI", 10),
                 bg=BG, fg=FG).pack(pady=(16, 4))
        var = tk.StringVar()
        entry = tk.Entry(win, textvariable=var, font=("Segoe UI", 11),
                         bg=BG2, fg=FG, insertbackground=PURPLE,
                         relief="flat")
        entry.pack(fill="x", padx=20, ipady=6)
        entry.focus()

        def confirm():
            name = var.get().strip().lower().replace(" ", "_")
            if name and name not in self.categories:
                self.categories[name] = []
                self.cat_listbox.insert("end", f"  {name}")
            win.destroy()

        tk.Button(win, text="Create", command=confirm,
                  font=("Segoe UI", 10, "bold"), bg=ACCENT, fg=BG,
                  relief="flat", pady=8, cursor="hand2").pack(fill="x", padx=20, pady=10)
        entry.bind("<Return>", lambda e: confirm())

    def _remove_category(self):
        cat = self._selected_category()
        if not cat:
            return
        if cat == "others":
            messagebox.showwarning("Cannot Remove", "'others' category cannot be removed.", parent=self.win)
            return
        if messagebox.askyesno("Remove Category", f"Remove '{cat}' and all its extensions?", parent=self.win):
            del self.categories[cat]
            idx = self.cat_listbox.curselection()[0]
            self.cat_listbox.delete(idx)
            self.ext_listbox.delete(0, "end")
            self.right_title.config(text="Select a category", fg=FG_DIM)

    def _restore_defaults(self):
        if messagebox.askyesno("Restore Defaults", "Reset all categories to default?", parent=self.win):
            self.categories = {k: list(v) for k, v in DEFAULT_CATEGORIES.items()}
            self.cat_listbox.delete(0, "end")
            for cat in self.categories:
                self.cat_listbox.insert("end", f"  {cat}")
            self.cat_listbox.selection_set(0)
            self._on_cat_select(None)

    def _save(self):
        self.on_save(self.categories)
        self.win.destroy()


# ══════════════════════════════════════════════════════════════════
#  Analysis Window
# ══════════════════════════════════════════════════════════════════

class AnalysisWindow:
    """Shows folder analysis report with smart suggestions before sorting."""

    def __init__(self, parent, report: dict, on_proceed):
        self.on_proceed = on_proceed

        self.win = tk.Toplevel(parent)
        self.win.title("Folder Analysis")
        self.win.geometry("580x520")
        self.win.resizable(False, False)
        self.win.configure(bg=BG)
        self.win.grab_set()

        x = parent.winfo_x() + (parent.winfo_width() - 580) // 2
        y = parent.winfo_y() + (parent.winfo_height() - 520) // 2
        self.win.geometry(f"580x520+{x}+{y}")

        self._build_ui(report)

    def _build_ui(self, report):
        # Header
        header = tk.Frame(self.win, bg=BG2, pady=12)
        header.pack(fill="x")
        tk.Label(header, text="🔍  Folder Analysis",
                 font=("Segoe UI", 14, "bold"), bg=BG2, fg=FG).pack()
        tk.Label(header, text="Review the report below before sorting",
                 font=("Segoe UI", 9), bg=BG2, fg=FG_DIM).pack(pady=(2, 0))

        content = tk.Frame(self.win, bg=BG, padx=20, pady=14)
        content.pack(fill="both", expand=True)

        # ── Summary stats ─────────────────────────────────────────
        stats_row = tk.Frame(content, bg=BG)
        stats_row.pack(fill="x", pady=(0, 12))

        for label, value, color in [
            ("Total Files",  str(report["total"]),                    BLUE),
            ("Total Size",   format_size(report["total_size"]),       CYAN),
            ("Large Files",  str(len(report["large_files"])),         YELLOW),
            ("Old Files",    str(len(report["old_files"])),           PEACH),
        ]:
            cell = tk.Frame(stats_row, bg=BG2, padx=12, pady=10)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            tk.Label(cell, text=value, font=("Segoe UI", 16, "bold"),
                     bg=BG2, fg=color).pack()
            tk.Label(cell, text=label, font=("Segoe UI", 8),
                     bg=BG2, fg=FG_DIM).pack()

        # ── Category breakdown ────────────────────────────────────
        tk.Label(content, text="Files by Category",
                 font=("Segoe UI", 10, "bold"), bg=BG, fg=FG_DIM).pack(anchor="w")

        cat_frame = tk.Frame(content, bg=BG3)
        cat_frame.pack(fill="x", pady=(6, 12))

        cat_inner = tk.Frame(cat_frame, bg=BG3, padx=12, pady=8)
        cat_inner.pack(fill="x")

        for cat, count in sorted(report["by_category"].items(),
                                  key=lambda x: x[1], reverse=True):
            row = tk.Frame(cat_inner, bg=BG3)
            row.pack(fill="x", pady=1)
            color = RED if cat == "others" else FG
            tk.Label(row, text=f"  {cat}", font=("Segoe UI", 9),
                     bg=BG3, fg=color, width=16, anchor="w").pack(side="left")
            tk.Label(row, text=f"{count} files",
                     font=("Segoe UI", 9, "bold"), bg=BG3, fg=color).pack(side="left")

        # ── Smart suggestions ─────────────────────────────────────
        if report["suggestions"]:
            tk.Label(content, text="💡  Smart Suggestions",
                     font=("Segoe UI", 10, "bold"), bg=BG, fg=PURPLE).pack(anchor="w")

            for suggestion in report["suggestions"]:
                s_frame = tk.Frame(content, bg=BG2, padx=12, pady=8)
                s_frame.pack(fill="x", pady=(4, 0))
                tk.Label(s_frame, text=suggestion, font=("Segoe UI", 9),
                         bg=BG2, fg=FG, wraplength=500, justify="left",
                         anchor="w").pack(fill="x")
        else:
            tk.Label(content, text="✅  No issues found — folder looks clean!",
                     font=("Segoe UI", 10), bg=BG, fg=GREEN).pack(anchor="w", pady=8)

        # ── Bottom buttons ────────────────────────────────────────
        bottom = tk.Frame(self.win, bg=BG2, pady=10, padx=20)
        bottom.pack(fill="x", side="bottom")

        tk.Button(bottom, text="▶  Proceed with Sort",
                  command=self._proceed,
                  font=("Segoe UI", 11, "bold"), bg=ACCENT, fg=BG,
                  relief="flat", padx=16, pady=9, cursor="hand2",
                  activebackground="#2563eb", activeforeground="#ffffff"
                  ).pack(side="right")

        tk.Button(bottom, text="Cancel",
                  command=self.win.destroy,
                  font=("Segoe UI", 9), bg=BG3, fg=FG_DIM,
                  relief="flat", padx=12, pady=9, cursor="hand2",
                  activebackground=BG, activeforeground=FG
                  ).pack(side="right", padx=(0, 8))

    def _proceed(self):
        self.win.destroy()
        self.on_proceed()


# ══════════════════════════════════════════════════════════════════
#  Main Application
# ══════════════════════════════════════════════════════════════════

class FileSorterApp:
    """Main GUI window for the File Sorter application."""

    def __init__(self, root):
        self.root = root
        self.root.title("File Sorter  v2.0")
        self.root.geometry("640x580")
        self.root.resizable(False, False)
        self.root.configure(bg=BG)
        self.root.withdraw()

        # Load persisted settings
        self.settings   = load_settings()
        self.categories = self.settings.get("categories", DEFAULT_CATEGORIES.copy())

        self.selected_dir = tk.StringVar(value="No folder selected")
        self.count_ok     = tk.IntVar(value=0)
        self.count_skip   = tk.IntVar(value=0)
        self.count_err    = tk.IntVar(value=0)

        SplashScreen(self.root, self._show_main)

    def _show_main(self):
        self.root.deiconify()
        self.build_ui()

    # ── Build UI ──────────────────────────────────────────────────
    def build_ui(self):

        # Header
        header = tk.Frame(self.root, bg=BG2, pady=12)
        header.pack(fill="x", side="top")

        header_row = tk.Frame(header, bg=BG2)
        header_row.pack(fill="x", padx=16)

        tk.Label(header_row, text="📁  File Sorter",
                 font=("Segoe UI", 18, "bold"), bg=BG2, fg=FG).pack(side="left")

        # Settings button in header
        tk.Button(header_row, text="⚙  Settings",
                  command=self.open_settings,
                  font=("Segoe UI", 9), bg=BG3, fg=FG_DIM,
                  relief="flat", padx=10, pady=5, cursor="hand2",
                  activebackground=BG, activeforeground=FG
                  ).pack(side="right")

        tk.Label(header, text="Select a folder and click Analyze & Sort",
                 font=("Segoe UI", 10), bg=BG2, fg=FG_DIM).pack(pady=(2, 0))
        tk.Label(header, text="Developed by HajAmir  •  v2.0",
                 font=("Segoe UI", 8), bg=BG2, fg="#585b70").pack(pady=(1, 0))

        # Bottom section
        bottom = tk.Frame(self.root, bg=BG, pady=12, padx=24)
        bottom.pack(fill="x", side="bottom")

        # Counter bar
        cbar = tk.Frame(bottom, bg=BG)
        cbar.pack(fill="x", pady=(0, 8))
        for label, var, color in [
            ("✅  Copied:",  self.count_ok,   GREEN),
            ("⏭  Skipped:", self.count_skip, YELLOW),
            ("❌  Errors:",  self.count_err,  RED),
        ]:
            cell = tk.Frame(cbar, bg=BG2, padx=12, pady=6)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            tk.Label(cell, text=label, font=("Segoe UI", 9),
                     bg=BG2, fg=FG_DIM).pack(side="left")
            tk.Label(cell, textvariable=var, font=("Segoe UI", 11, "bold"),
                     bg=BG2, fg=color).pack(side="right")

        self.progress = ttk.Progressbar(bottom, mode="indeterminate")
        self.progress.pack(fill="x", pady=(0, 8))

        self.sort_btn = tk.Button(
            bottom, text="🔍  Analyze & Sort", command=self.start_analysis,
            font=("Segoe UI", 13, "bold"), bg=ACCENT, fg=BG,
            relief="flat", pady=11, cursor="hand2",
            activebackground="#2563eb", activeforeground="#ffffff"
        )
        self.sort_btn.pack(fill="x")

        # Folder selector
        dir_frame = tk.Frame(self.root, bg=BG, pady=14, padx=24)
        dir_frame.pack(fill="x", side="top")

        tk.Label(dir_frame, text="Selected Folder:",
                 font=("Segoe UI", 10, "bold"), bg=BG, fg=FG_DIM).pack(anchor="w")

        path_row = tk.Frame(dir_frame, bg=BG)
        path_row.pack(fill="x", pady=(6, 0))

        self.path_label = tk.Label(
            path_row, textvariable=self.selected_dir,
            font=("Segoe UI", 10), bg=BG2, fg=FG,
            anchor="w", padx=12, pady=9, relief="flat",
            wraplength=440, justify="left"
        )
        self.path_label.pack(side="left", fill="x", expand=True)

        tk.Button(
            path_row, text="📂  Browse", command=self.browse_directory,
            font=("Segoe UI", 10, "bold"), bg=BLUE, fg=BG,
            relief="flat", padx=14, pady=9, cursor="hand2",
            activebackground="#2563eb", activeforeground="#ffffff"
        ).pack(side="right", padx=(10, 0))

        tk.Frame(self.root, bg=BG2, height=1).pack(fill="x", padx=24, side="top")

        # Log area
        log_frame = tk.Frame(self.root, bg=BG, padx=24, pady=10)
        log_frame.pack(fill="both", expand=True, side="top")

        log_header = tk.Frame(log_frame, bg=BG)
        log_header.pack(fill="x")
        tk.Label(log_header, text="Operation Log",
                 font=("Segoe UI", 10, "bold"), bg=BG, fg=FG_DIM).pack(side="left")
        tk.Button(log_header, text="Clear", command=self.clear_log,
                  font=("Segoe UI", 8), bg=BG2, fg=FG_DIM,
                  relief="flat", padx=8, pady=2, cursor="hand2",
                  activebackground=BG, activeforeground=FG).pack(side="right")

        text_frame = tk.Frame(log_frame, bg=BG)
        text_frame.pack(fill="both", expand=True, pady=(6, 0))

        self.log_box = tk.Text(
            text_frame, font=("Segoe UI", 10), bg=BG3, fg=FG,
            relief="flat", padx=14, pady=10, state="disabled",
            wrap="word", spacing1=3, spacing3=3,
            selectbackground=BG3, selectforeground=FG,
            insertbackground=FG,
        )
        scrollbar = ttk.Scrollbar(text_frame, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.log_box.pack(side="left", fill="both", expand=True)

        self.log_box.tag_config("ok",      foreground=GREEN,  font=("Segoe UI", 10))
        self.log_box.tag_config("skip",    foreground=YELLOW, font=("Segoe UI", 10))
        self.log_box.tag_config("error",   foreground=RED,    font=("Segoe UI", 10, "bold"))
        self.log_box.tag_config("info",    foreground=CYAN,   font=("Segoe UI", 10))
        self.log_box.tag_config("done",    foreground=PURPLE, font=("Segoe UI", 11, "bold"))
        self.log_box.tag_config("suggest", foreground=PEACH,  font=("Segoe UI", 10))

        self.log("info", "Ready — select a folder and click Analyze & Sort.")

    # ── Actions ───────────────────────────────────────────────────
    def browse_directory(self):
        directory = filedialog.askdirectory(title="Select a folder")
        if directory:
            self.selected_dir.set(directory)
            self.log("info", f"📂  Folder selected:\n    {directory}")

    def open_settings(self):
        SettingsWindow(self.root, self.categories, self._on_settings_save)

    def _on_settings_save(self, new_categories: dict):
        self.categories = new_categories
        self.settings["categories"] = new_categories
        save_settings(self.settings)
        self.log("info", "✅  Settings saved successfully.")

    def start_analysis(self):
        path = self.selected_dir.get()
        if path == "No folder selected":
            messagebox.showwarning("No Folder", "Please select a folder first.")
            return

        self.sort_btn.configure(state="disabled", text="⏳  Analyzing...")
        self.progress.start(10)

        def run_analysis():
            report = analyze_folder(Path(path), self.categories)
            self.progress.stop()
            self.sort_btn.configure(state="normal", text="🔍  Analyze & Sort")
            # Show analysis window on main thread
            self.root.after(0, lambda: AnalysisWindow(
                self.root, report,
                on_proceed=lambda: self._start_sort(path)
            ))

        threading.Thread(target=run_analysis, daemon=True).start()

    def _start_sort(self, path: str):
        self.clear_log()
        self.count_ok.set(0)
        self.count_skip.set(0)
        self.count_err.set(0)
        self.sort_btn.configure(state="disabled", text="⏳  Sorting...")
        self.progress.start(10)
        threading.Thread(target=self.run_sort, args=(path,), daemon=True).start()

    def run_sort(self, path_str: str):
        """Sort files into category subfolders inside a 'sorted' directory."""
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
                    self.log("skip", f"⏭  Skipped (duplicate):   {file.name}")
                    skipped += 1
                    self.count_skip.set(skipped)
                    continue

                try:
                    shutil.copy2(file, dest)
                    self.log("ok", f"✅  Copied:   {file.name}   →   {category}/")
                    copied += 1
                    self.count_ok.set(copied)
                except Exception as e:
                    self.log("error", f"❌  Error:   {file.name}\n    {e}")
                    errors += 1
                    self.count_err.set(errors)

            self.log("done",
                     f"\n🎉  Done!\n"
                     f"    ✅ {copied} copied   |   "
                     f"⏭ {skipped} skipped   |   "
                     f"❌ {errors} errors\n"
                     f"    📁 Output:  {target_dir}")

        except Exception as e:
            self.log("error", f"❌  Fatal error:\n    {e}")
        finally:
            self.progress.stop()
            self.sort_btn.configure(state="normal", text="🔍  Analyze & Sort")

    def log(self, tag, message):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def clear_log(self):
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")


# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    root = tk.Tk()
    app = FileSorterApp(root)
    root.mainloop()