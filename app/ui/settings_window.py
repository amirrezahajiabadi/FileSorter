"""Modal window for managing file categories and their extensions."""

import tkinter as tk
from tkinter import messagebox, ttk
from typing import Optional

from app.constants import DEFAULT_CATEGORIES
from app.i18n import STRINGS, get_font, anchor_for, justify_for


class SettingsWindow:
    """Modal window for managing file categories and their extensions."""

    def __init__(self, parent: tk.Tk, categories: dict, theme: dict, lang: str, on_save):
        self.parent     = parent
        self.categories = {k: list(v) for k, v in categories.items()}  # deep copy
        self.on_save    = on_save
        self.theme      = theme
        self.lang       = lang
        self.T          = STRINGS[lang]

        self.win = tk.Toplevel(parent)
        self.win.title(self.T["settings_window_title"])
        self.win.geometry("700x540")
        self.win.resizable(False, False)
        self.win.configure(bg=theme["BG"])
        self.win.grab_set()

        self._center()
        self._build_ui()

    def _center(self) -> None:
        self.win.update_idletasks()
        x = self.parent.winfo_x() + (self.parent.winfo_width() - 700) // 2
        y = self.parent.winfo_y() + (self.parent.winfo_height() - 540) // 2
        self.win.geometry(f"700x540+{x}+{y}")

    def _build_ui(self) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        anchor, justify = anchor_for(lang), justify_for(lang)

        header = tk.Frame(self.win, bg=theme["BG2"], pady=12)
        header.pack(fill="x")
        tk.Label(header, text=T["settings_header"],
                 font=get_font(lang, 14, "bold"), bg=theme["BG2"], fg=theme["FG"]).pack()
        tk.Label(header, text=T["settings_subheader"],
                 font=get_font(lang, 9), bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(2, 0))

        main = tk.Frame(self.win, bg=theme["BG"])
        main.pack(fill="both", expand=True, padx=16, pady=12)

        # ── Left: category list ───────────────────────────────────
        left = tk.Frame(main, bg=theme["BG2"], width=180)
        left.pack(side="left", fill="y", padx=(0, 12))
        left.pack_propagate(False)

        tk.Label(left, text=T["categories_label"], font=get_font(lang, 10, "bold"),
                 bg=theme["BG2"], fg=theme["FG_DIM"]).pack(pady=(10, 6))

        self.cat_listbox = tk.Listbox(
            left, font=get_font(lang, 10), bg=theme["BG3"], fg=theme["FG"],
            selectbackground=theme["ACCENT"], selectforeground=theme["ON_ACCENT"],
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        self.cat_listbox.pack(fill="both", expand=True, padx=8, pady=(0, 6))
        self.cat_listbox.bind("<<ListboxSelect>>", self._on_cat_select)

        for cat in self.categories:
            self.cat_listbox.insert("end", f"  {cat}")

        cat_btn_row = tk.Frame(left, bg=theme["BG2"])
        cat_btn_row.pack(fill="x", padx=8, pady=(0, 8))

        tk.Button(cat_btn_row, text=T["add_cat_btn"], command=self._add_category,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["GREEN"],
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["GREEN"]
                  ).pack(side="left")
        tk.Button(cat_btn_row, text=T["remove_cat_btn"], command=self._remove_category,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["RED"],
                  relief="flat", padx=8, pady=4, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["RED"]
                  ).pack(side="right")

        # ── Right: extension editor ───────────────────────────────
        right = tk.Frame(main, bg=theme["BG"])
        right.pack(side="left", fill="both", expand=True)

        self.right_title = tk.Label(right, text=T["select_category_placeholder"],
                 font=get_font(lang, 12, "bold"), bg=theme["BG"], fg=theme["FG_DIM"],
                 anchor=anchor, justify=justify)
        self.right_title.pack(anchor=anchor, fill="x", pady=(4, 8))

        ext_frame = tk.Frame(right, bg=theme["BG3"])
        ext_frame.pack(fill="both", expand=True)

        self.ext_listbox = tk.Listbox(
            ext_frame, font=("Consolas", 10), bg=theme["BG3"], fg=theme["CYAN"],
            selectbackground=theme["BG3"], selectforeground=theme["FG"],
            relief="flat", borderwidth=0, activestyle="none",
            highlightthickness=0
        )
        ext_sb = ttk.Scrollbar(ext_frame, command=self.ext_listbox.yview)
        self.ext_listbox.configure(yscrollcommand=ext_sb.set)
        ext_sb.pack(side="right", fill="y")
        self.ext_listbox.pack(fill="both", expand=True, padx=10, pady=8)

        add_row = tk.Frame(right, bg=theme["BG"])
        add_row.pack(fill="x", pady=(8, 0))

        self.new_ext_var = tk.StringVar()
        ext_entry = tk.Entry(add_row, textvariable=self.new_ext_var,
                             font=("Consolas", 11), bg=theme["BG2"], fg=theme["FG"],
                             insertbackground=theme["PURPLE"], relief="flat",
                             width=12)
        ext_entry.pack(side="left", ipady=6, padx=(0, 8))
        ext_entry.insert(0, ".ext")
        ext_entry.bind("<FocusIn>", lambda e: ext_entry.delete(0, "end") if self.new_ext_var.get() == ".ext" else None)

        tk.Button(add_row, text=T["add_ext_btn"],
                  command=self._add_extension,
                  font=get_font(lang, 9, "bold"), bg=theme["GREEN"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="left")

        tk.Button(add_row, text=T["remove_ext_btn"],
                  command=self._remove_extension,
                  font=get_font(lang, 9), bg=theme["BG2"], fg=theme["RED"],
                  relief="flat", padx=10, pady=6, cursor="hand2",
                  activebackground=theme["BG3"], activeforeground=theme["RED"]
                  ).pack(side="left", padx=(8, 0))

        # ── Bottom buttons ────────────────────────────────────────
        bottom = tk.Frame(self.win, bg=theme["BG2"], pady=10, padx=16)
        bottom.pack(fill="x", side="bottom")

        tk.Button(bottom, text=T["restore_defaults_btn"],
                  command=self._restore_defaults,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["YELLOW"],
                  relief="flat", padx=12, pady=6, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["YELLOW"]
                  ).pack(side="left")

        tk.Button(bottom, text=T["save_close_btn"],
                  command=self._save,
                  font=get_font(lang, 10, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", padx=16, pady=8, cursor="hand2",
                  activebackground=theme["ACCENT_HOVER"], activeforeground=theme["ON_ACCENT"]
                  ).pack(side="right")

        tk.Button(bottom, text=T["cancel_btn"],
                  command=self.win.destroy,
                  font=get_font(lang, 9), bg=theme["BG3"], fg=theme["FG_DIM"],
                  relief="flat", padx=12, pady=8, cursor="hand2",
                  activebackground=theme["BG"], activeforeground=theme["FG"]
                  ).pack(side="right", padx=(0, 8))

        self.cat_listbox.selection_set(0)
        self._on_cat_select(None)

    def _selected_category(self) -> Optional[str]:
        sel = self.cat_listbox.curselection()
        if not sel:
            return None
        return list(self.categories.keys())[sel[0]]

    def _on_cat_select(self, event) -> None:
        cat = self._selected_category()
        if not cat:
            return
        self.right_title.config(text=self.T["extensions_for"].format(cat=cat), fg=self.theme["FG"])
        self.ext_listbox.delete(0, "end")
        for ext in sorted(self.categories.get(cat, [])):
            self.ext_listbox.insert("end", f"  {ext}")

    def _add_extension(self) -> None:
        cat = self._selected_category()
        if not cat:
            messagebox.showwarning(self.T["no_category_warning_title"],
                                    self.T["no_category_warning_msg"], parent=self.win)
            return
        ext = self.new_ext_var.get().strip().lower()
        if not ext.startswith("."):
            ext = "." + ext
        if ext == ".":
            return
        if ext not in self.categories[cat]:
            self.categories[cat].append(ext)
            self._on_cat_select(None)

    def _remove_extension(self) -> None:
        cat = self._selected_category()
        sel = self.ext_listbox.curselection()
        if not cat or not sel:
            return
        ext = self.ext_listbox.get(sel[0]).strip()
        if ext in self.categories[cat]:
            self.categories[cat].remove(ext)
        self._on_cat_select(None)

    def _add_category(self) -> None:
        theme, T, lang = self.theme, self.T, self.lang
        win = tk.Toplevel(self.win)
        win.title(T["new_category_title"])
        win.geometry("300x130")
        win.configure(bg=theme["BG"])
        win.resizable(False, False)
        win.grab_set()

        tk.Label(win, text=T["new_category_label"], font=get_font(lang, 10),
                 bg=theme["BG"], fg=theme["FG"]).pack(pady=(16, 4))
        var = tk.StringVar()
        entry = tk.Entry(win, textvariable=var, font=get_font(lang, 11),
                         bg=theme["BG2"], fg=theme["FG"], insertbackground=theme["PURPLE"],
                         relief="flat")
        entry.pack(fill="x", padx=20, ipady=6)
        entry.focus()

        def confirm():
            name = var.get().strip().lower().replace(" ", "_")
            if name and name not in self.categories:
                self.categories[name] = []
                self.cat_listbox.insert("end", f"  {name}")
            win.destroy()

        tk.Button(win, text=T["create_btn"], command=confirm,
                  font=get_font(lang, 10, "bold"), bg=theme["ACCENT"], fg=theme["ON_ACCENT"],
                  relief="flat", pady=8, cursor="hand2").pack(fill="x", padx=20, pady=10)
        entry.bind("<Return>", lambda e: confirm())

    def _remove_category(self) -> None:
        T = self.T
        cat = self._selected_category()
        if not cat:
            return
        if cat == "others":
            messagebox.showwarning(T["cannot_remove_title"], T["cannot_remove_others_msg"], parent=self.win)
            return
        if messagebox.askyesno(T["remove_category_confirm_title"],
                                T["remove_category_confirm_msg"].format(cat=cat), parent=self.win):
            del self.categories[cat]
            idx = self.cat_listbox.curselection()[0]
            self.cat_listbox.delete(idx)
            self.ext_listbox.delete(0, "end")
            self.right_title.config(text=T["select_category_placeholder"], fg=self.theme["FG_DIM"])

    def _restore_defaults(self) -> None:
        T = self.T
        if messagebox.askyesno(T["restore_defaults_confirm_title"], T["restore_defaults_confirm_msg"], parent=self.win):
            self.categories = {k: list(v) for k, v in DEFAULT_CATEGORIES.items()}
            self.cat_listbox.delete(0, "end")
            for cat in self.categories:
                self.cat_listbox.insert("end", f"  {cat}")
            self.cat_listbox.selection_set(0)
            self._on_cat_select(None)

    def _save(self) -> None:
        self.on_save(self.categories)
        self.win.destroy()


# ══════════════════════════════════════════════════════════════════
#  Analysis Window
# ══════════════════════════════════════════════════════════════════
