"""File Sorter — entry point.

Run with:
    python main.py

See README.md for features and build_installer.md for packaging into a
standalone .exe.
"""

import tkinter as tk

from app.ui.main_window import FileSorterApp


def main() -> None:
    root = tk.Tk()
    FileSorterApp(root)
    root.mainloop()


if __name__ == "__main__":
    main()
