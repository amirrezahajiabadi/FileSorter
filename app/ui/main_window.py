"""Main application window — ties every module together."""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import shutil
import threading

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.settings_manager import load_settings, save_settings
from app.sorter import get_category, analyze_folder
from app.i18n import STRINGS, get_font, anchor_for, justify_for
from app.themes import THEMES, configure_ttk_style
from app.ui.splash import SplashScreen
from app.ui.settings_window import SettingsWindow
from app.ui.analysis_window import AnalysisWindow


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
