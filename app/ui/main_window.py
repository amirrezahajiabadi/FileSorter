"""Main application window — ties every module together."""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import shutil
import threading
import queue

from app.constants import APP_VERSION, DEFAULT_CATEGORIES
from app.settings_manager import load_settings, save_settings
from app.sorter import analyze_folder, plan_sort
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
        self.last_sort_log = []  # for Undo: list of {"action": "moved"/"copied", "source": Path, "final_dest": Path}

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
        self.processed_label_widget = None
        for label, var, color in [
            (T["copied_label"],  self.count_ok,   theme["GREEN"]),
            (T["skipped_label"], self.count_skip, theme["YELLOW"]),
            (T["errors_label"],  self.count_err,  theme["RED"]),
        ]:
            cell = tk.Frame(cbar, bg=theme["BG2"], padx=12, pady=6)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            label_widget = tk.Label(cell, text=label, font=get_font(lang, 9),
                     bg=theme["BG2"], fg=theme["FG_DIM"])
            label_widget.pack(side="left")
            if label == T["copied_label"]:
                self.processed_label_widget = label_widget
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

        self.undo_btn = tk.Button(
            bottom, text=T["undo_btn"], command=self.undo_last_sort,
            font=get_font(lang, 9), bg=theme["BG3"], fg=theme["FG_DIM"],
            relief="flat", pady=6, cursor="hand2",
            activebackground=theme["BG"], activeforeground=theme["FG"],
            state="normal" if self.last_sort_log else "disabled"
        )
        self.undo_btn.pack(fill="x", pady=(6, 0))

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

        analysis_queue = queue.Queue()

        def analysis_worker():
            report = analyze_folder(Path(path), self.categories)
            analysis_queue.put(report)

        threading.Thread(target=analysis_worker, daemon=True).start()
        self.root.after(50, lambda: self._poll_analysis_queue(analysis_queue, path))

    def _poll_analysis_queue(self, q: queue.Queue, path: str) -> None:
        """Runs on the main thread only. See _poll_sort_queue()."""
        try:
            report = q.get_nowait()
        except queue.Empty:
            self.root.after(50, lambda: self._poll_analysis_queue(q, path))
            return

        self.progress.stop()
        self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
        AnalysisWindow(
            self.root, report, self.theme, self.lang, Path(path), self.categories,
            on_proceed=lambda move, duplicate_mode: self._start_sort(path, move, duplicate_mode)
        )

    def _start_sort(self, path: str, move: bool = False, duplicate_mode: str = "skip") -> None:
        self.clear_log()
        self.count_ok.set(0)
        self.count_skip.set(0)
        self.count_err.set(0)
        if self.processed_label_widget is not None:
            self.processed_label_widget.config(
                text=self.T["moved_label"] if move else self.T["copied_label"]
            )
        self.sort_btn.configure(state="disabled", text=self.T["sorting_btn"])
        self.undo_btn.configure(state="disabled")
        self.progress.start(10)

        sort_queue = queue.Queue()
        threading.Thread(target=self._sort_worker, args=(path, move, duplicate_mode, sort_queue), daemon=True).start()
        self.root.after(50, lambda: self._poll_sort_queue(sort_queue))

    def _sort_worker(self, path_str: str, move: bool, duplicate_mode: str, q: queue.Queue) -> None:
        """Sort files into category subfolders inside a 'sorted' directory.

        Runs entirely on a background thread and NEVER touches Tkinter —
        not even via root.after() — since that turned out to be unsafe to
        call from a non-main thread in practice (observed to silently stop
        after a single file on larger folders). Instead, every update is
        put on a thread-safe queue.Queue and only ever read by the main
        thread in _poll_sort_queue(), which is the one place actually
        allowed to touch widgets.

        Uses plan_sort() to decide what happens to every file (including
        duplicate handling) — the exact same function the Dry Run preview
        uses — so execution can never diverge from what was previewed.

        Args:
            path_str: The folder to sort.
            move: If True, files are moved (removed from source). If False
                (default), files are copied and the originals are kept.
            duplicate_mode: "skip" (default), "rename", or "overwrite" —
                what to do when a destination file already exists.
            q: Queue this worker reports progress on.
        """
        T = self.T
        base_dir   = Path(path_str)
        target_dir = base_dir / "sorted"
        sort_log = []  # for Undo
        try:
            for category in self.categories:
                (target_dir / category).mkdir(parents=True, exist_ok=True)

            plan = plan_sort(base_dir, self.categories, duplicate_mode)

            copied = skipped = errors = 0

            for item in plan:
                source, final_dest = item["source"], item["final_dest"]
                action, category = item["action"], item["category"]

                if action == "skip":
                    q.put(("log", "skip", T["skipped_log"].format(name=item["name"])))
                    skipped += 1
                    q.put(("count_skip", skipped))
                    continue

                try:
                    if move:
                        shutil.move(str(source), str(final_dest))
                        q.put(("log", "ok", T["moved_log"].format(name=item["final_name"], category=category)))
                        sort_log.append({"action": "moved", "source": source, "final_dest": final_dest})
                    else:
                        shutil.copy2(source, final_dest)
                        q.put(("log", "ok", T["copied_log"].format(name=item["final_name"], category=category)))
                        sort_log.append({"action": "copied", "source": source, "final_dest": final_dest})
                    copied += 1
                    q.put(("count_ok", copied))
                except Exception as e:
                    q.put(("log", "error", T["error_log"].format(name=item["name"], error=e)))
                    errors += 1
                    q.put(("count_err", errors))

            q.put(("log", "done", T["done_log"].format(copied=copied, skipped=skipped, errors=errors, target=target_dir)))
            q.put(("sort_log", sort_log))

        except Exception as e:
            q.put(("log", "error", T["fatal_error_log"].format(error=e)))
        finally:
            q.put(("finished", None))

    def _poll_sort_queue(self, q: queue.Queue) -> None:
        """Runs on the main thread only. Drains messages the worker put on
        the queue and applies them to widgets, then reschedules itself
        until the worker signals it's finished.
        """
        finished = False
        try:
            while True:
                msg = q.get_nowait()
                kind = msg[0]
                if kind == "log":
                    self.log(msg[1], msg[2])
                elif kind == "count_ok":
                    self.count_ok.set(msg[1])
                elif kind == "count_skip":
                    self.count_skip.set(msg[1])
                elif kind == "count_err":
                    self.count_err.set(msg[1])
                elif kind == "sort_log":
                    self.last_sort_log = msg[1]
                elif kind == "finished":
                    finished = True
        except queue.Empty:
            pass

        if finished:
            self.progress.stop()
            self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
            self.undo_btn.configure(state="normal" if self.last_sort_log else "disabled")
        else:
            self.root.after(50, lambda: self._poll_sort_queue(q))

    def undo_last_sort(self) -> None:
        """Reverse the last sort: move files back, delete copies made by this app.

        Runs on a background thread for the same reason _sort_worker does —
        undoing a large batch could otherwise freeze the window — and uses
        the same queue.Queue pattern to stay Tkinter-safe.
        """
        T = self.T
        if not self.last_sort_log:
            messagebox.showinfo(T["undo_nothing_title"], T["undo_nothing_msg"])
            return

        confirmed = messagebox.askyesno(T["undo_confirm_title"], T["undo_confirm_msg"])
        if not confirmed:
            return

        self.clear_log()
        self.undo_btn.configure(state="disabled")
        self.sort_btn.configure(state="disabled")
        self.progress.start(10)

        entries = list(self.last_sort_log)
        undo_queue = queue.Queue()
        threading.Thread(target=self._undo_worker, args=(entries, undo_queue), daemon=True).start()
        self.root.after(50, lambda: self._poll_undo_queue(undo_queue))

    def _undo_worker(self, entries: list, q: queue.Queue) -> None:
        """Background-thread body for undo_last_sort(). Never touches Tkinter."""
        T = self.T
        restored = removed = failed = 0

        for entry in reversed(entries):
            source, final_dest = entry["source"], entry["final_dest"]
            try:
                if entry["action"] == "moved":
                    source.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(final_dest), str(source))
                    q.put(("log", "ok", T["undo_restored_log"].format(name=source.name)))
                    restored += 1
                else:  # "copied"
                    if final_dest.exists():
                        final_dest.unlink()
                    q.put(("log", "skip", T["undo_removed_log"].format(name=final_dest.name)))
                    removed += 1
            except Exception as e:
                q.put(("log", "error", T["undo_failed_log"].format(name=final_dest.name, error=e)))
                failed += 1

        q.put(("log", "done", T["undo_done_log"].format(restored=restored, removed=removed, failed=failed)))
        q.put(("finished", None))

    def _poll_undo_queue(self, q: queue.Queue) -> None:
        """Runs on the main thread only. See _poll_sort_queue()."""
        finished = False
        try:
            while True:
                msg = q.get_nowait()
                if msg[0] == "log":
                    self.log(msg[1], msg[2])
                elif msg[0] == "finished":
                    finished = True
        except queue.Empty:
            pass

        if finished:
            self.last_sort_log = []
            self.undo_btn.configure(state="disabled")
            self.progress.stop()
            self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
        else:
            self.root.after(50, lambda: self._poll_undo_queue(q))

    def log(self, tag: str, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def clear_log(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")
