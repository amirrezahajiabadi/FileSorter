"""AppController — the application's business logic, entirely free of
Tkinter.

This is what lets a future UI (e.g. a PyWebView/Eel front end, per the
roadmap) drive the exact same folder analysis, sorting, undo, and
settings logic without duplicating or rewriting any of it — only the UI
layer (currently app/ui/*) would need to change.

Design rule: nothing in this file imports tkinter, and no method here
touches a widget. Long-running operations (sort, undo) accept an
`on_event(kind, payload)` callback so the caller decides how to report
progress — today that's a Tkinter queue.Queue (see app/ui/main_window.py),
but a future caller could stream the same events over a websocket, an
async generator, or anything else, without this file changing at all.

Every method is safe to call from any thread; the controller itself
never starts threads — the caller (currently the Tkinter UI) decides
that too.
"""

import shutil
from pathlib import Path

from app.constants import DEFAULT_CATEGORIES
from app.settings_manager import load_settings, save_settings, add_recent_folder
from app.sorter import analyze_folder, plan_sort


class AppController:
    """Holds application state and every piece of non-UI logic."""

    def __init__(self):
        self.settings = load_settings()
        self.categories = self.settings.get("categories", DEFAULT_CATEGORIES.copy())
        self.language = self.settings.get("language", "fa")
        self.theme_name = self.settings.get("theme", "light")
        self.recent_folders = self.settings.get("recent_folders", [])
        self.last_sort_log = []  # for undo: list of {"action", "source", "final_dest"}

    # ══════════════════════════════════════════════════════════════
    #  Settings
    # ══════════════════════════════════════════════════════════════

    def set_language(self, lang: str) -> None:
        self.language = lang
        self.settings["language"] = lang
        save_settings(self.settings)

    def set_theme(self, theme_name: str) -> None:
        self.theme_name = theme_name
        self.settings["theme"] = theme_name
        save_settings(self.settings)

    def update_categories(self, categories: dict) -> None:
        self.categories = categories
        self.settings["categories"] = categories
        save_settings(self.settings)

    def record_recent_folder(self, path: str) -> list:
        """Add `path` to the recent-folders list (persisted) and return it."""
        add_recent_folder(self.settings, path)
        self.recent_folders = self.settings["recent_folders"]
        return self.recent_folders

    # ══════════════════════════════════════════════════════════════
    #  Analysis / planning — pure, synchronous, safe on any thread
    # ══════════════════════════════════════════════════════════════

    def analyze(self, path: str) -> dict:
        """Scan a folder and return the smart-analysis report."""
        return analyze_folder(Path(path), self.categories)

    def plan(self, path: str, duplicate_mode: str = "skip") -> list:
        """Compute what a real sort would do, without touching the filesystem
        (used for the Dry Run preview).
        """
        return plan_sort(Path(path), self.categories, duplicate_mode)

    # ══════════════════════════════════════════════════════════════
    #  Sort
    # ══════════════════════════════════════════════════════════════

    def sort(self, path: str, move: bool = False, duplicate_mode: str = "skip", on_event=None) -> dict:
        """Run a real sort, reporting progress through on_event(kind, payload).

        Event kinds emitted, in order:
        - ("total", file_count)               — once, as soon as it's known
        - ("item", {...}) — once per file:
            {"status": "skip", "name": str, "category": str}
            {"status": "ok", "name": str, "category": str, "action": "copied"|"moved"}
            {"status": "error", "name": str, "error": str}
        - ("progress", files_processed_so_far) — once per file, after "item"
        - ("done", result_dict)                — once, on success
        - ("error", message)                   — instead of "done", on a
          fatal error that stopped the sort entirely (e.g. can't create
          the output folder)

        Args:
            path: The folder to sort.
            move: If True, files are moved (removed from source). If False
                (default), files are copied and the originals are kept.
            duplicate_mode: "skip" (default), "rename", or "overwrite".
            on_event: Optional callback(kind: str, payload) for progress.

        Returns:
            {"copied": int, "skipped": int, "errors": int,
             "target_dir": Path, "sort_log": list}
        """
        def emit(kind, payload=None):
            if on_event:
                on_event(kind, payload)

        base_dir = Path(path)
        target_dir = base_dir / "sorted"
        sort_log = []

        try:
            for category in self.categories:
                (target_dir / category).mkdir(parents=True, exist_ok=True)

            plan = plan_sort(base_dir, self.categories, duplicate_mode)
            emit("total", len(plan))

            copied = skipped = errors = processed = 0

            for item in plan:
                source, final_dest = item["source"], item["final_dest"]
                action, category = item["action"], item["category"]

                if action == "skip":
                    emit("item", {"status": "skip", "name": item["name"], "category": category})
                    skipped += 1
                else:
                    try:
                        if move:
                            shutil.move(str(source), str(final_dest))
                            sort_log.append({"action": "moved", "source": source, "final_dest": final_dest})
                            emit("item", {"status": "ok", "name": item["final_name"],
                                          "category": category, "action": "moved"})
                        else:
                            shutil.copy2(source, final_dest)
                            sort_log.append({"action": "copied", "source": source, "final_dest": final_dest})
                            emit("item", {"status": "ok", "name": item["final_name"],
                                          "category": category, "action": "copied"})
                        copied += 1
                    except Exception as e:
                        emit("item", {"status": "error", "name": item["name"], "error": str(e)})
                        errors += 1

                processed += 1
                emit("progress", processed)

            self.last_sort_log = sort_log
            result = {
                "copied": copied, "skipped": skipped, "errors": errors,
                "target_dir": target_dir, "sort_log": sort_log,
            }
            emit("done", result)
            return result

        except Exception as e:
            emit("error", str(e))
            raise

    # ══════════════════════════════════════════════════════════════
    #  Undo
    # ══════════════════════════════════════════════════════════════

    def undo(self, on_event=None) -> dict:
        """Reverse the last sort() call: move files back, delete copies made
        by this app. Files overwritten as duplicates cannot be restored.

        Event kinds emitted, in order:
        - ("total", entry_count)
        - ("item", {...}) — once per entry:
            {"status": "restored", "name": str}
            {"status": "removed", "name": str}
            {"status": "failed", "name": str, "error": str}
        - ("progress", entries_processed_so_far)
        - ("done", result_dict)

        Returns:
            {"restored": int, "removed": int, "failed": int, "nothing": bool}
            `nothing` is True (and everything else 0) if there was no
            previous sort to undo — the caller decides how to tell the user.
        """
        def emit(kind, payload=None):
            if on_event:
                on_event(kind, payload)

        entries = list(self.last_sort_log)
        if not entries:
            result = {"restored": 0, "removed": 0, "failed": 0, "nothing": True}
            emit("done", result)
            return result

        emit("total", len(entries))
        restored = removed = failed = processed = 0

        for entry in reversed(entries):
            source, final_dest = entry["source"], entry["final_dest"]
            try:
                if entry["action"] == "moved":
                    source.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(final_dest), str(source))
                    emit("item", {"status": "restored", "name": source.name})
                    restored += 1
                else:  # "copied"
                    if final_dest.exists():
                        final_dest.unlink()
                    emit("item", {"status": "removed", "name": final_dest.name})
                    removed += 1
            except Exception as e:
                emit("item", {"status": "failed", "name": final_dest.name, "error": str(e)})
                failed += 1

            processed += 1
            emit("progress", processed)

        self.last_sort_log = []
        result = {"restored": restored, "removed": removed, "failed": failed, "nothing": False}
        emit("done", result)
        return result
