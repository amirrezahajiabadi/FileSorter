"""Shows folder analysis report with smart suggestions before sorting."""

import tkinter as tk
from tkinter import ttk

from app.i18n import STRINGS, get_font, anchor_for, justify_for
from app.sorter import format_size, build_suggestions


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
