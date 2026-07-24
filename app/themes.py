"""Theme palettes (Dark / Light) and ttk styling helpers.

Each mode has its own tuned color palette (no mismatched hues, e.g. no
low-contrast purple-on-black) so buttons/badges stay legible and visually
"belong" to that mode.
"""

import tkinter as tk
from tkinter import ttk


# ══════════════════════════════════════════════════════════════════
#  Themes
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
