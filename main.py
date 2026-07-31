"""File Sorter — entry point.

Run with:
    python main.py

See README.md for features and build_installer.md for packaging into a
standalone .exe.
"""

import tkinter as tk

try:
    from tkinterdnd2 import TkinterDnD
    DND_AVAILABLE = True
except ImportError:
    DND_AVAILABLE = False

from app.ui.main_window import FileSorterApp


def main() -> None:
    # TkinterDnD.Tk() is a drop-in replacement for tk.Tk() that also adds
    # drag & drop support. If tkinterdnd2 isn't installed, fall back to a
    # plain Tk root — the app still works, just without drag & drop.
    root = TkinterDnD.Tk() if DND_AVAILABLE else tk.Tk()
    FileSorterApp(root, dnd_available=DND_AVAILABLE)
    root.mainloop()


if __name__ == "__main__":
    main()
