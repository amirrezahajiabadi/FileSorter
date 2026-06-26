import tkinter as tk
from tkinter import filedialog, messagebox, ttk
from pathlib import Path
import shutil
import threading
import time

FILE_CATEGORIES = {
    "images":    [".jpg", ".jpeg", ".png", ".gif", ".bmp", ".tiff", ".svg", ".webp", ".heic"],
    "documents": [".pdf", ".doc", ".docx", ".txt", ".xls", ".xlsx", ".ppt", ".pptx"],
    "videos":    [".mp4", ".mkv", ".avi", ".mov", ".wmv"],
    "audio":     [".mp3", ".wav", ".aac", ".flac", ".ogg"],
    "archives":  [".zip", ".rar", ".tar", ".gz", ".7z"],
    "others":    []
}

# ── رنگ‌ها ─────────────────────────────────────────────────────────
BG         = "#1e1e2e"
BG2        = "#313244"
BG3        = "#181825"
FG         = "#cdd6f4"
FG_DIM     = "#a6adc8"
GREEN      = "#a6e3a1"
YELLOW     = "#f9e2af"
RED        = "#f38ba8"
BLUE       = "#89b4fa"
CYAN       = "#89dceb"
PURPLE     = "#cba6f7"
ACCENT     = "#a6e3a1"

def get_category(suffix: str) -> str:
    suffix = suffix.lower()
    for category, extensions in FILE_CATEGORIES.items():
        if suffix in extensions:
            return category
    return "others"


# ══════════════════════════════════════════════════════════════════
#  Splash Screen
# ══════════════════════════════════════════════════════════════════
class SplashScreen:
    def __init__(self, root, on_done):
        self.root   = root
        self.on_done = on_done

        self.win = tk.Toplevel(root)
        self.win.overrideredirect(True)   # بدون titlebar
        self.win.configure(bg=BG2)
        self.win.attributes("-topmost", True)

        W, H = 420, 220
        sw = self.win.winfo_screenwidth()
        sh = self.win.winfo_screenheight()
        self.win.geometry(f"{W}x{H}+{(sw-W)//2}+{(sh-H)//2}")

        # Border ظریف
        border = tk.Frame(self.win, bg=BLUE, padx=2, pady=2)
        border.pack(fill="both", expand=True)
        inner = tk.Frame(border, bg=BG2)
        inner.pack(fill="both", expand=True)

        tk.Label(inner, text="📁", font=("Segoe UI Emoji", 36),
                 bg=BG2, fg=FG).pack(pady=(28, 6))

        tk.Label(inner, text="File Sorter",
                 font=("Segoe UI", 20, "bold"), bg=BG2, fg=FG).pack()

        tk.Label(inner, text="نوشته شده توسط دکتر حاجی‌آبادی",
                 font=("Segoe UI", 11), bg=BG2, fg=FG_DIM).pack(pady=(6, 0))

        self.bar = ttk.Progressbar(inner, mode="indeterminate", length=300)
        self.bar.pack(pady=(18, 0))
        self.bar.start(12)

        # fade-in
        self.win.attributes("-alpha", 0.0)
        self._fade_in()

    def _fade_in(self, alpha=0.0):
        if alpha < 1.0:
            self.win.attributes("-alpha", alpha)
            self.win.after(20, lambda: self._fade_in(round(alpha + 0.07, 2)))
        else:
            self.win.after(1800, self._fade_out)

    def _fade_out(self, alpha=1.0):
        if alpha > 0.0:
            self.win.attributes("-alpha", alpha)
            self.win.after(20, lambda: self._fade_out(round(alpha - 0.07, 2)))
        else:
            self.win.destroy()
            self.on_done()


# ══════════════════════════════════════════════════════════════════
#  Main App
# ══════════════════════════════════════════════════════════════════
class FileSorterApp:
    def __init__(self, root):
        self.root = root
        self.root.title("File Sorter")
        self.root.geometry("620x540")
        self.root.resizable(False, False)
        self.root.configure(bg=BG)
        self.root.withdraw()   # پنهان تا splash تموم بشه

        self.selected_dir = tk.StringVar(value="هیچ پوشه‌ای انتخاب نشده")
        self.count_ok     = tk.IntVar(value=0)
        self.count_skip   = tk.IntVar(value=0)
        self.count_err    = tk.IntVar(value=0)

        SplashScreen(self.root, self._show_main)

    def _show_main(self):
        self.root.deiconify()
        self.build_ui()

    # ── UI ────────────────────────────────────────────────────────
    def build_ui(self):

        # Header
        header = tk.Frame(self.root, bg=BG2, pady=14)
        header.pack(fill="x", side="top")
        tk.Label(header, text="📁  File Sorter",
                 font=("Segoe UI", 20, "bold"), bg=BG2, fg=FG).pack()
        tk.Label(header, text="پوشه را انتخاب کن و مرتب‌سازی را شروع کن",
                 font=("Segoe UI", 10), bg=BG2, fg=FG_DIM).pack(pady=(3, 0))
        tk.Label(header, text="نوشته شده توسط دکتر حاجی‌آبادی",
                 font=("Segoe UI", 8), bg=BG2, fg="#585b70").pack(pady=(1, 0))

        # Bottom (دکمه و progress) — قبل از log pack میشه
        bottom = tk.Frame(self.root, bg=BG, pady=12, padx=24)
        bottom.pack(fill="x", side="bottom")

        # Counter bar
        cbar = tk.Frame(bottom, bg=BG)
        cbar.pack(fill="x", pady=(0, 8))
        for label, var, color in [
            ("✅  کپی‌شده:", self.count_ok,   GREEN),
            ("⏭  تکراری:",  self.count_skip, YELLOW),
            ("❌  خطا:",     self.count_err,  RED),
        ]:
            cell = tk.Frame(cbar, bg=BG2, padx=12, pady=6)
            cell.pack(side="left", expand=True, fill="x", padx=(0, 6))
            tk.Label(cell, text=label, font=("Segoe UI", 9),
                     bg=BG2, fg=FG_DIM).pack(side="left")
            tk.Label(cell, textvariable=var, font=("Segoe UI", 11, "bold"),
                     bg=BG2, fg=color).pack(side="right")

        self.progress = ttk.Progressbar(bottom, mode="indeterminate")
        self.progress.pack(fill="x", pady=(0, 8))

        self.sort_btn = tk.Button(
            bottom, text="▶   مرتب‌سازی", command=self.start_sort,
            font=("Segoe UI", 13, "bold"), bg=ACCENT, fg=BG,
            relief="flat", pady=11, cursor="hand2",
            activebackground="#94e2d5", activeforeground=BG
        )
        self.sort_btn.pack(fill="x")

        # Directory selector
        dir_frame = tk.Frame(self.root, bg=BG, pady=14, padx=24)
        dir_frame.pack(fill="x", side="top")

        tk.Label(dir_frame, text="پوشه انتخاب‌شده:",
                 font=("Segoe UI", 10, "bold"), bg=BG, fg=FG_DIM).pack(anchor="w")

        path_row = tk.Frame(dir_frame, bg=BG)
        path_row.pack(fill="x", pady=(6, 0))

        self.path_label = tk.Label(
            path_row, textvariable=self.selected_dir,
            font=("Segoe UI", 10), bg=BG2, fg=FG,
            anchor="w", padx=12, pady=9, relief="flat",
            wraplength=430, justify="left"
        )
        self.path_label.pack(side="left", fill="x", expand=True)

        browse_btn = tk.Button(
            path_row, text="📂  Browse", command=self.browse_directory,
            font=("Segoe UI", 10, "bold"), bg=BLUE, fg=BG,
            relief="flat", padx=14, pady=9, cursor="hand2",
            activebackground="#74c7ec", activeforeground=BG
        )
        browse_btn.pack(side="right", padx=(10, 0))

        tk.Frame(self.root, bg=BG2, height=1).pack(fill="x", padx=24, side="top")

        # Log area
        log_frame = tk.Frame(self.root, bg=BG, padx=24, pady=10)
        log_frame.pack(fill="both", expand=True, side="top")

        log_header = tk.Frame(log_frame, bg=BG)
        log_header.pack(fill="x")
        tk.Label(log_header, text="گزارش عملیات",
                 font=("Segoe UI", 10, "bold"), bg=BG, fg=FG_DIM).pack(side="left")
        clear_btn = tk.Button(log_header, text="پاک کردن", command=self.clear_log,
                              font=("Segoe UI", 8), bg=BG2, fg=FG_DIM,
                              relief="flat", padx=8, pady=2, cursor="hand2",
                              activebackground=BG, activeforeground=FG)
        clear_btn.pack(side="right")

        text_frame = tk.Frame(log_frame, bg=BG)
        text_frame.pack(fill="both", expand=True, pady=(6, 0))

        self.log_box = tk.Text(
            text_frame,
            font=("Segoe UI", 10),   # فونت بهتر و خواناتر
            bg=BG3, fg=FG,
            relief="flat", padx=14, pady=10,
            state="disabled", wrap="word",
            spacing1=3, spacing3=3,   # فاصله بین خطوط
            selectbackground=BG2, selectforeground=FG,
            insertbackground=FG,
        )
        scrollbar = ttk.Scrollbar(text_frame, command=self.log_box.yview)
        self.log_box.configure(yscrollcommand=scrollbar.set)
        scrollbar.pack(side="right", fill="y")
        self.log_box.pack(side="left", fill="both", expand=True)

        # Tag styles
        self.log_box.tag_config("ok",    foreground=GREEN,  font=("Segoe UI", 10))
        self.log_box.tag_config("skip",  foreground=YELLOW, font=("Segoe UI", 10))
        self.log_box.tag_config("error", foreground=RED,    font=("Segoe UI", 10, "bold"))
        self.log_box.tag_config("info",  foreground=CYAN,   font=("Segoe UI", 10))
        self.log_box.tag_config("done",  foreground=PURPLE, font=("Segoe UI", 11, "bold"))

        self.log("info", "آماده — ابتدا یک پوشه انتخاب کنید.")

    # ── Methods ──────────────────────────────────────────────────
    def browse_directory(self):
        directory = filedialog.askdirectory(title="پوشه را انتخاب کنید")
        if directory:
            self.selected_dir.set(directory)
            self.log("info", f"📂  پوشه انتخاب شد:\n    {directory}")

    def log(self, tag, message):
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n", tag)
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def clear_log(self):
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

    def start_sort(self):
        path = self.selected_dir.get()
        if path == "هیچ پوشه‌ای انتخاب نشده":
            messagebox.showwarning("خطا", "لطفاً ابتدا یک پوشه انتخاب کنید.")
            return
        self.clear_log()
        self.count_ok.set(0)
        self.count_skip.set(0)
        self.count_err.set(0)
        self.sort_btn.configure(state="disabled", text="⏳  در حال مرتب‌سازی...")
        self.progress.start(10)
        threading.Thread(target=self.run_sort, args=(path,), daemon=True).start()

    def run_sort(self, path_str):
        base_dir   = Path(path_str)
        target_dir = base_dir / "sorted"
        try:
            for category in FILE_CATEGORIES:
                (target_dir / category).mkdir(parents=True, exist_ok=True)

            copied = skipped = errors = 0

            for file in base_dir.rglob("*"):
                if target_dir in file.parents:
                    continue
                if not file.is_file():
                    continue

                category = get_category(file.suffix)
                dest = target_dir / category / file.name

                if dest.exists():
                    self.log("skip", f"⏭  تکراری:   {file.name}")
                    skipped += 1
                    self.count_skip.set(skipped)
                    continue

                try:
                    shutil.copy2(file, dest)
                    self.log("ok", f"✅  کپی شد:   {file.name}   →   {category}/")
                    copied += 1
                    self.count_ok.set(copied)
                except Exception as e:
                    self.log("error", f"❌  خطا:   {file.name}\n    {e}")
                    errors += 1
                    self.count_err.set(errors)

            self.log("done",
                     f"\n🎉  عملیات با موفقیت تمام شد!\n"
                     f"    ✅ {copied} فایل کپی   |   "
                     f"⏭ {skipped} تکراری   |   "
                     f"❌ {errors} خطا\n"
                     f"    📁 مسیر خروجی:  {target_dir}")

        except Exception as e:
            self.log("error", f"❌  خطای کلی:\n    {e}")
        finally:
            self.progress.stop()
            self.sort_btn.configure(state="normal", text="▶   مرتب‌سازی")


# ══════════════════════════════════════════════════════════════════
if __name__ == "__main__":
    root = tk.Tk()
    app = FileSorterApp(root)
    root.mainloop()
