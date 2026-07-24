"""Startup splash screen with fade-in/out animation."""

import tkinter as tk
from tkinter import ttk

from app.i18n import STRINGS, get_font


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
