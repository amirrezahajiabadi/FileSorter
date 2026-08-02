"""Main application window — ties every module together."""

import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import threading
import queue
import os

from app.constants import APP_VERSION
from app.controller import AppController
from app.i18n import STRINGS, get_font, anchor_for, justify_for
from app.themes import THEMES, configure_ttk_style
from app.ui.splash import SplashScreen
from app.ui.settings_window import SettingsWindow
from app.ui.analysis_window import AnalysisWindow


class FileSorterApp:
    """Main GUI window for the File Sorter application."""

    def __init__(self, root: tk.Tk, dnd_available: bool = False):
        self.root = root
        self.dnd_available = dnd_available
        self.root.resizable(False, False)
        self.root.withdraw()

        # All state and persistence lives behind the controller — this
        # class only builds widgets and translates user actions into
        # controller calls (and controller events into widget updates).
        self.controller = AppController()
        self.categories     = self.controller.categories
        self.lang            = self.controller.language
        self.theme_name      = self.controller.theme_name
        self.recent_folders  = self.controller.recent_folders

        self.selected_dir = tk.StringVar(value="")
        self.count_ok     = tk.IntVar(value=0)
        self.count_skip   = tk.IntVar(value=0)
        self.count_err    = tk.IntVar(value=0)
        self.last_sort_log = []  # cached mirror of self.controller.last_sort_log

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
        self.controller.set_theme(self.theme_name)
        self._rebuild_ui()

    def toggle_lang(self) -> None:
        """Switch between Persian and English and rebuild the UI."""
        self.lang = "en" if self.lang == "fa" else "fa"
        self.controller.set_language(self.lang)
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

        self.progress_label = tk.Label(
            bottom, text="", font=get_font(lang, 8),
            bg=theme["BG"], fg=theme["FG_DIM"], anchor=anchor
        )
        self.progress_label.pack(fill="x")

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
            path_row, text=T["recent_folders_btn"], command=self._show_recent_folders,
            font=get_font(lang, 10), bg=theme["BG3"], fg=theme["FG_DIM"],
            relief="flat", padx=10, pady=9, cursor="hand2",
            activebackground=theme["BG"], activeforeground=theme["FG"]
        ).pack(side="right", padx=(6, 0))

        tk.Button(
            path_row, text=T["browse_btn"], command=self.browse_directory,
            font=get_font(lang, 10, "bold"), bg=theme["BLUE"], fg=theme["ON_ACCENT"],
            relief="flat", padx=14, pady=9, cursor="hand2",
            activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
        ).pack(side="right", padx=(10, 0))

        if self.dnd_available:
            tk.Label(dir_frame, text=T["drop_zone_hint"],
                     font=get_font(lang, 8), bg=theme["BG"], fg=theme["FG_DIM"],
                     anchor=anchor).pack(anchor=anchor, fill="x", pady=(4, 0))
            self._register_drop_target(self.path_label)

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
            self._set_folder(directory)

    def _set_folder(self, directory: str) -> None:
        """Set the selected folder (from Browse, drag & drop, or Recent Folders)
        and record it in the recent-folders list.
        """
        self.selected_dir.set(directory)
        self.log("info", self.T["folder_selected_log"].format(path=directory))
        self.recent_folders = self.controller.record_recent_folder(directory)

    def _register_drop_target(self, widget: tk.Widget) -> None:
        """Register a widget as a drag & drop target for folders.

        Only called when main.py detected tkinterdnd2 is installed and
        created the root window as a TkinterDnD.Tk() (dnd_available=True) —
        the drop_target_register/dnd_bind methods only exist on widgets
        belonging to that kind of root.
        """
        from tkinterdnd2 import DND_FILES
        widget.drop_target_register(DND_FILES)
        widget.dnd_bind("<<Drop>>", self._on_drop)

    def _on_drop(self, event) -> None:
        """Handle a folder being dragged onto the drop zone.

        event.data may contain multiple space-separated paths, and paths
        with spaces are wrapped in braces (e.g. "{C:/My Folder}") — Tk's
        splitlist() is the documented way to parse that correctly.
        """
        paths = self.root.tk.splitlist(event.data)
        if not paths:
            return
        path = paths[0]
        if not os.path.isdir(path):
            messagebox.showwarning(self.T["invalid_drop_title"], self.T["invalid_drop_msg"])
            return
        self._set_folder(path)

    def _show_recent_folders(self) -> None:
        """Show a small popup menu of recently used folders."""
        menu = tk.Menu(self.root, tearoff=0)
        if not self.recent_folders:
            menu.add_command(label=self.T["recent_folders_empty"], state="disabled")
        else:
            for path in self.recent_folders:
                menu.add_command(label=path, command=lambda p=path: self._set_folder(p))

        x = self.root.winfo_pointerx()
        y = self.root.winfo_pointery()
        try:
            menu.tk_popup(x, y)
        finally:
            menu.grab_release()

    def open_settings(self) -> None:
        SettingsWindow(self.root, self.categories, self.theme, self.lang, self._on_settings_save)

    def _on_settings_save(self, new_categories: dict) -> None:
        self.categories = new_categories
        self.controller.update_categories(new_categories)
        self.log("info", self.T["settings_saved_log"])

    def start_analysis(self) -> None:
        path = self.selected_dir.get()
        if path == self.T["no_folder"]:
            messagebox.showwarning(self.T["no_folder_warning_title"], self.T["no_folder_warning_msg"])
            return

        self.sort_btn.configure(state="disabled", text=self.T["analyzing_btn"])
        self.progress.configure(mode="indeterminate")
        self.progress.start(10)
        self.progress_label.configure(text="")

        analysis_queue = queue.Queue()

        def analysis_worker():
            report = self.controller.analyze(path)
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
        self.progress.configure(mode="indeterminate")
        self.progress.start(10)

        sort_queue = queue.Queue()
        threading.Thread(target=self._sort_worker, args=(path, move, duplicate_mode, sort_queue), daemon=True).start()
        self.root.after(50, lambda: self._poll_sort_queue(sort_queue))

    def _sort_worker(self, path_str: str, move: bool, duplicate_mode: str, q: queue.Queue) -> None:
        """Runs the sort on a background thread via self.controller.sort().

        This thread NEVER touches Tkinter — not even via root.after() —
        since that turned out to be unsafe to call from a non-main thread
        in practice (observed to silently stop after a single file on
        larger folders). Instead, every controller event is put on a
        thread-safe queue.Queue and only ever read by the main thread in
        _poll_sort_queue(), which is the one place actually allowed to
        touch widgets.
        """
        def on_event(kind, payload):
            q.put((kind, payload))

        try:
            self.controller.sort(path_str, move=move, duplicate_mode=duplicate_mode, on_event=on_event)
        except Exception:
            pass  # the controller already emitted an "error" event before re-raising
        finally:
            q.put(("finished", None))

    def _poll_sort_queue(self, q: queue.Queue) -> None:
        """Runs on the main thread only. Drains controller events the
        worker put on the queue, translates each into a localized log
        line / widget update, then reschedules itself until the worker
        signals it's finished.
        """
        finished = False
        try:
            while True:
                msg = q.get_nowait()
                kind, payload = msg[0], (msg[1] if len(msg) > 1 else None)
                if kind == "total":
                    self._set_progress_total(payload)
                elif kind == "progress":
                    self._set_progress_value(payload)
                elif kind == "item":
                    self._log_sort_item(payload)
                elif kind == "done":
                    self._log_sort_done(payload)
                    self.last_sort_log = self.controller.last_sort_log
                elif kind == "error":
                    self.log("error", self.T["fatal_error_log"].format(error=payload))
                elif kind == "finished":
                    finished = True
        except queue.Empty:
            pass

        if finished:
            self.progress.stop()
            self.progress_label.configure(text="")
            self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
            self.undo_btn.configure(state="normal" if self.last_sort_log else "disabled")
        else:
            self.root.after(50, lambda: self._poll_sort_queue(q))

    def _log_sort_item(self, payload: dict) -> None:
        """Translate one AppController.sort() "item" event into a log line
        and counter update. See AppController.sort() for the payload shape.
        """
        T = self.T
        status = payload["status"]
        if status == "skip":
            self.count_skip.set(self.count_skip.get() + 1)
            self.log("skip", T["skipped_log"].format(name=payload["name"]))
        elif status == "ok":
            self.count_ok.set(self.count_ok.get() + 1)
            key = "moved_log" if payload["action"] == "moved" else "copied_log"
            self.log("ok", T[key].format(name=payload["name"], category=payload["category"]))
        elif status == "error":
            self.count_err.set(self.count_err.get() + 1)
            self.log("error", T["error_log"].format(name=payload["name"], error=payload["error"]))

    def _log_sort_done(self, result: dict) -> None:
        T = self.T
        self.log("done", T["done_log"].format(
            copied=result["copied"], skipped=result["skipped"],
            errors=result["errors"], target=result["target_dir"]
        ))

    def _set_progress_total(self, total: int) -> None:
        """Switch the progress bar from indeterminate ("working, unknown
        how long") to determinate ("X of Y done") once the worker knows
        how many files there are.
        """
        self.progress.stop()
        if total > 0:
            self.progress.configure(mode="determinate", maximum=total, value=0)
        self._update_progress_label(0, total)

    def _set_progress_value(self, done: int) -> None:
        self.progress.configure(value=done)
        total = int(self.progress.cget("maximum")) or 0
        self._update_progress_label(done, total)

    def _update_progress_label(self, done: int, total: int) -> None:
        percent = int(done / total * 100) if total else 0
        self.progress_label.configure(
            text=self.T["progress_status"].format(done=done, total=total, percent=percent)
        )

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
        self.progress.configure(mode="indeterminate")
        self.progress.start(10)

        undo_queue = queue.Queue()
        threading.Thread(target=self._undo_worker, args=(undo_queue,), daemon=True).start()
        self.root.after(50, lambda: self._poll_undo_queue(undo_queue))

    def _undo_worker(self, q: queue.Queue) -> None:
        """Background-thread body for undo_last_sort(), via self.controller.undo().
        Never touches Tkinter — see _sort_worker()'s docstring for why.
        """
        def on_event(kind, payload):
            q.put((kind, payload))

        self.controller.undo(on_event=on_event)
        q.put(("finished", None))

    def _poll_undo_queue(self, q: queue.Queue) -> None:
        """Runs on the main thread only. See _poll_sort_queue()."""
        finished = False
        try:
            while True:
                msg = q.get_nowait()
                kind, payload = msg[0], (msg[1] if len(msg) > 1 else None)
                if kind == "total":
                    self._set_progress_total(payload)
                elif kind == "progress":
                    self._set_progress_value(payload)
                elif kind == "item":
                    self._log_undo_item(payload)
                elif kind == "done":
                    self._log_undo_done(payload)
                elif kind == "finished":
                    finished = True
        except queue.Empty:
            pass

        if finished:
            self.last_sort_log = self.controller.last_sort_log  # now []
            self.undo_btn.configure(state="disabled")
            self.progress.stop()
            self.progress_label.configure(text="")
            self.sort_btn.configure(state="normal", text=self.T["analyze_btn"])
        else:
            self.root.after(50, lambda: self._poll_undo_queue(q))

    def _log_undo_item(self, payload: dict) -> None:
        T = self.T
        status = payload["status"]
        if status == "restored":
            self.log("ok", T["undo_restored_log"].format(name=payload["name"]))
        elif status == "removed":
            self.log("skip", T["undo_removed_log"].format(name=payload["name"]))
        elif status == "failed":
            self.log("error", T["undo_failed_log"].format(name=payload["name"], error=payload["error"]))

    def _log_undo_done(self, result: dict) -> None:
        if result.get("nothing"):
            return
        T = self.T
        self.log("done", T["undo_done_log"].format(
            restored=result["restored"], removed=result["removed"], failed=result["failed"]
        ))

    def log(self, tag: str, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def clear_log(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")
