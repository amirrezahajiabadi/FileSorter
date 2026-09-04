"""File Sorter — Windows system-tray icon for the headless service.

``python main_web.py --headless --tray`` runs the same loopback service
as plain --headless but with a tray icon instead of a console: the icon
shows the port, offers "Open in browser", toggles "Start with Windows"
(run-at-login via app.autostart) and quits the service cleanly.

The icon is a real WinForms ``NotifyIcon`` driven through pythonnet —
already a hard requirement of the windowed app's pywebview backend, so
this adds **no new dependency**. Everything is imported lazily, and on a
non-Windows box (or one without pythonnet) ``run()`` raises
``TrayUnavailable`` so callers can fall back to plain headless mode.

Layout: the tray needs a Windows message pump, so ``run_tray_service``
keeps the pump on the calling (main) thread while the HTTP service runs
on its own daemon thread inside ``FileSorterService`` — the same
arrangement the windowed app uses, just without the webview window.
"""

from app import autostart
from app.service import FileSorterService

# ══════════════════════════════════════════════════════════════════
#  Lazy pythonnet / WinForms loader
# ══════════════════════════════════════════════════════════════════

_winforms = None  # set by the first successful load


class TrayUnavailable(RuntimeError):
    """The system tray needs Windows + .NET WinForms (via pythonnet)."""


def _load_winforms():
    """Add the WinForms references and return a namespace of the classes
    the tray needs, or None when the platform can't host them."""
    global _winforms
    if _winforms is not None:
        return _winforms
    try:
        import clr  # noqa: PLC0415  (pythonnet — lazy so tests/non-Windows stay clean)

        clr.AddReference("System.Windows.Forms")
        clr.AddReference("System.Drawing")
        from System.Windows.Forms import (  # noqa: PLC0415
            Application,
            ContextMenuStrip,
            NotifyIcon,
            ToolStripMenuItem,
        )
        from System.Drawing import SystemIcons  # noqa: PLC0415

        _winforms = {
            "Application": Application,
            "ContextMenuStrip": ContextMenuStrip,
            "NotifyIcon": NotifyIcon,
            "ToolStripMenuItem": ToolStripMenuItem,
            "SystemIcons": SystemIcons,
        }
    except Exception:
        _winforms = False
    return _winforms or None


# ══════════════════════════════════════════════════════════════════
#  Tray controller
# ══════════════════════════════════════════════════════════════════

_LABELS = {
    "open": {"fa": "باز کردن در مرورگر", "en": "Open in browser"},
    "startup": {"fa": "اجرا هنگام روشن شدن ویندوز", "en": "Start with Windows"},
    "quit": {"fa": "خروج", "en": "Exit"},
    "tooltip": {
        "fa": "مرتب‌کننده فایل — در حال اجرا روی پورت {port}",
        "en": "File Sorter — running on port {port}",
    },
}


class TrayController:
    """Owns the NotifyIcon and its context menu.

    ``run()`` blocks on the Windows message pump; call it from the main
    thread. The service itself lives on another thread, and ``on_quit``
    (a zero-arg callable) is invoked when the user picks Exit so the
    caller can shut the HTTP server down before the pump unwinds.
    """

    def __init__(self, url: str, port: int, language: str = "fa",
                 on_quit=None, autostart_root=None):
        self.url = url
        self.port = port
        self.language = language if language in ("fa", "en") else "fa"
        self.on_quit = on_quit
        self.autostart_root = autostart_root  # injectable registry key (tests)
        # kept as attributes so pythonnet doesn't collect the .NET objects
        self._icon = None
        self._menu = None
        self._open_item = None
        self._startup_item = None
        self._quit_item = None

    # ── text ─────────────────────────────────────────────────────

    def _label(self, key: str) -> str:
        return _LABELS[key][self.language]

    def tooltip(self) -> str:
        return _LABELS["tooltip"][self.language].format(port=self.port)

    # ── autostart toggle ─────────────────────────────────────────

    def _autostart_checked(self) -> bool:
        return autostart.is_enabled(root=self.autostart_root)

    def _toggle_autostart(self) -> bool:
        """Flip run-at-login; returns the new checked state."""
        if self._autostart_checked():
            autostart.disable(root=self.autostart_root)
            return False
        autostart.enable(root=self.autostart_root)
        return True

    # ── lifecycle ────────────────────────────────────────────────

    def _refresh_startup_check(self, *_) -> None:
        if self._startup_item is not None:
            self._startup_item.Checked = self._autostart_checked()

    def _request_quit(self, *_) -> None:
        if self._icon is not None:
            self._icon.Visible = False
        if self.on_quit:
            try:
                self.on_quit()
            except Exception:
                pass  # service shutdown is best-effort on the way out
        try:
            self._winforms["Application"].ExitThread()
        except Exception:
            pass

    def run(self) -> None:
        """Show the tray icon and pump messages until Exit. Blocks."""
        wf = _load_winforms()
        if not wf:
            raise TrayUnavailable(
                "system tray needs Windows with .NET WinForms (pythonnet); "
                "run without --tray for plain headless mode"
            )
        self._winforms = wf
        app = wf["Application"]

        icon = wf["NotifyIcon"]()
        icon.Text = self.tooltip()[:63]  # WinForms tooltip limit
        icon.Icon = wf["SystemIcons"].Application
        icon.Visible = True

        menu = wf["ContextMenuStrip"]()
        menu.Opening += self._refresh_startup_check

        self._open_item = wf["ToolStripMenuItem"](self._label("open"))
        self._open_item.Click += lambda s, e: self._open_browser()
        self._startup_item = wf["ToolStripMenuItem"](self._label("startup"))
        self._startup_item.CheckOnClick = True
        self._startup_item.Checked = self._autostart_checked()
        self._startup_item.Click += lambda s, e: self._toggle_autostart()
        self._quit_item = wf["ToolStripMenuItem"](self._label("quit"))
        self._quit_item.Click += self._request_quit

        menu.Items.Add(self._open_item)
        menu.Items.Add(self._startup_item)
        menu.Items.Add(self._quit_item)
        icon.ContextMenuStrip = menu

        self._icon = icon
        self._menu = menu
        try:
            app.Run()
        finally:
            icon.Visible = False
            icon.Dispose()
            self._icon = None

    def _open_browser(self) -> None:
        import webbrowser  # lazy: only needed on the Open click

        webbrowser.open(self.url)


# ══════════════════════════════════════════════════════════════════
#  Entry point: service + tray together
# ══════════════════════════════════════════════════════════════════

def run_tray_service(port: int = 8175, token: str = None,
                     language: str = None) -> None:
    """Start the headless service and keep it alive under the tray icon.

    Blocks until the user quits from the tray menu. The service runs on
    its own daemon thread; the tray message pump owns this thread.
    """
    service = FileSorterService(token=token, port=port)
    service.start()

    # Label the tray in the language the user chose in the app (the
    # controller's persisted settings); fall back to Persian.
    if language is None:
        try:
            language = service.api.controller.settings.get("language", "fa")
        except Exception:
            language = "fa"

    controller = TrayController(
        url=service.url(), port=service.port, language=language,
        on_quit=service.shutdown,
    )
    print(f"FileSorter service running at {service.url()} (tray icon active)")
    print(f"API token: {service.token}")
    try:
        controller.run()
    except KeyboardInterrupt:
        pass
    finally:
        service.shutdown()
        print("Service stopped.")
