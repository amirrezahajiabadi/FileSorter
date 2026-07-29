"""Read-only preview of what a real sort would do — a "dry run".

Reuses the exact same plan_sort()/resolve_duplicate() logic that the real
sort uses, so what you see here is guaranteed to match what would actually
happen.
"""

import tkinter as tk
from tkinter import ttk

from app.i18n import STRINGS, get_font, anchor_for, justify_for


class PreviewWindow:
    """Shows the planned outcome of a sort without touching any files."""

    def __init__(self, parent: tk.Tk, plan: list, theme: dict, lang: str):
        self.theme = theme
        self.lang = lang
        self.T = STRINGS[lang]

        self.win = tk.Toplevel(parent)
        self.win.title(self.T["dry_run_window_title"])
        self.win.geometry("560x480")
        self.win.resizable(False, False)
        self.win.configure(bg=theme["BG"])
        self.win.grab_set()

        x = parent.winfo_x() + (parent.winfo_width() - 560) // 2
        y = parent.winfo_y() + (parent.winfo_height() - 480) // 2
        self.win.geometry(f"560x480+{x}+{y}")

        self._build_ui(plan)

    def _build_ui(self, plan: list) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        anchor, justify = anchor_for(lang), justify_for(lang)

        header = tk.Frame(self.win, bg=theme["BG2"], pady=12)
        header.pack(fill="x")
        tk.Label(header, text=T["dry_run_header"],
                 font=get_font(lang, 14, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack()
        tk.Label(header, text=T["dry_run_subheader"],
                 font=get_font(lang, 9), bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(2, 0))

        content = tk.Frame(self.win, bg=theme["BG"], padx=16, pady=12)
        content.pack(fill="both", expand=True)

        text_frame = tk.Frame(content, bg=theme["BG"])
        text_frame.pack(fill="both", expand=True)

        text = tk.Text(
            text_frame, font=get_font(lang, 10), bg=theme["BG3"], fg=theme["FG"],
            relief="flat", padx=12, pady=10, state="disabled", wrap="word",
            selectbackground=theme["BG3"], selectforeground=theme["FG"],
        )
        scrollbar = ttk.Scrollbar(text_frame, command=text.yview)
        text.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        text.pack(side="left", fill="both", expand=True)

        text.tag_config("ok", foreground=theme["GREEN"], font=get_font(lang, 10))
        text.tag_config("skip", foreground=theme["YELLOW"], font=get_font(lang, 10))
        text.tag_config("rename", foreground=theme["CYAN"], font=get_font(lang, 10))
        text.tag_config("overwrite", foreground=theme["RED"], font=get_font(lang, 10, "bold"))

        action_text = {
            "ok": T["dry_run_action_ok"],
            "skip": T["dry_run_action_skip"],
            "rename": T["dry_run_action_rename"],
            "overwrite": T["dry_run_action_overwrite"],
        }

        text.configure(state="normal")
        if not plan:
            text.insert("end", T["dry_run_empty"])
        else:
            for item in plan:
                action = item["action"]
                desc = action_text[action]
                if action == "rename":
                    desc = desc.format(final_name=item["final_name"])
                line = f"{item['name']}  →  {item['category']}/   —   {desc}\n"
                text.insert("end", line, action)
        text.configure(state="disabled")

        bottom = tk.Frame(self.win, bg=theme["BG2"], pady=10, padx=16)
        bottom.pack(fill="x", side="bottom")
        tk.Button(bottom, text=T["dry_run_close_btn"], command=self.win.destroy,
                  font=get_font(lang, 10, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=16, pady=8, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="right")
