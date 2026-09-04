"""File Sorter — run-at-startup registration (stdlib winreg, Windows only).

Manages the HKCU ``...\\CurrentVersion\\Run`` entry that launches the
headless service silently (via pythonw) when the user logs in. Only the
current user's hive is touched — no admin rights, no service install.

Usage (from main_web.py CLI):

    python main_web.py --autostart on      # install
    python main_web.py --autostart off     # remove
    python main_web.py --autostart status  # report

The registry key is injectable so the CRUD logic is unit-testable on any
platform without touching a real hive. winreg is used through its
module-level functions (PyHKEY methods were removed in Python 3.14).
"""

import os
import sys

# HKCU\Software\Microsoft\Windows\CurrentVersion\Run — per-user startup apps.
_RUN_KEY_PATH = r"Software\Microsoft\Windows\CurrentVersion\Run"
ENTRY_NAME = "FileSorterService"

_REG_SZ = 1  # winreg.REG_SZ (kept out of winreg for fake-key tests)

_windows = sys.platform == "win32"


def _open_hive():
    """Open HKCU and return (key, winreg) for the Run key (creates it)."""
    import winreg

    key = winreg.OpenKey(
        winreg.HKEY_CURRENT_USER, _RUN_KEY_PATH, 0,
        winreg.KEY_SET_VALUE | winreg.KEY_QUERY_VALUE,
    )
    return key, winreg


# ── indirection over the injectable registry key ──────────────────
# ``root`` is either None (real HKCU via winreg module functions) or a
# duck-typed fake for tests exposing the classic key-object API.

def _query_value(root, name):
    """Return (value, type); raise OSError when the value is absent."""
    if root is None:
        if not is_available():
            raise OSError("autostart is not available on this platform")
        key, winreg = _open_hive()
        try:
            return winreg.QueryValueEx(key, name)
        finally:
            key.Close()
    return root.QueryValueEx(name)


def _set_value(root, name, value) -> None:
    if root is None:
        key, winreg = _open_hive()
        try:
            winreg.SetValueEx(key, name, 0, _REG_SZ, value)
        finally:
            key.Close()
    else:
        root.SetValueEx(name, 0, _REG_SZ, value)


def _delete_value(root, name) -> None:
    if root is None:
        key, winreg = _open_hive()
        try:
            try:
                winreg.DeleteValue(key, name)
            except OSError:  # already gone
                pass
        finally:
            key.Close()
    else:
        try:
            root.DeleteValue(name)
        except OSError:  # already gone
            pass


# ── public API ─────────────────────────────────────────────────────

def is_available() -> bool:
    """True when this platform can register autostart (Windows only)."""
    return _windows


def build_autostart_command() -> str:
    """The command that launches the headless service on login.

    Frozen (PyInstaller): the packaged exe itself, which is already a
    windowed binary — just add the flags. From source: pythonw.exe so
    boot stays completely silent (no console window), plus this script
    with the service flags.
    """
    if getattr(sys, "frozen", False):
        return f'"{sys.executable}" --headless --tray'
    exe = sys.executable
    if exe.lower().endswith("python.exe"):
        exe = exe[: -len("python.exe")] + "pythonw.exe"
    script = os.path.abspath(sys.argv[0])
    return f'"{exe}" "{script}" --headless --tray'


def entry_command(root=None) -> str | None:
    """The stored startup command, or None when not registered."""
    try:
        value, _ = _query_value(root, ENTRY_NAME)
        return str(value)
    except OSError:  # value not present / unavailable platform
        return None


def is_enabled(root=None) -> bool:
    """True when the autostart entry exists."""
    return entry_command(root=root) is not None


def enable(command: str = None, root=None) -> None:
    """Register the startup command (replacing any existing entry)."""
    if command is None:
        command = build_autostart_command()
    _set_value(root, ENTRY_NAME, command)


def disable(root=None) -> None:
    """Remove the startup entry (no-op when absent)."""
    _delete_value(root, ENTRY_NAME)


def run_cli_action(action: str, root=None, out=print) -> int:
    """Perform an --autostart CLI action; returns a process exit code.

    ``action`` is one of "on" / "off" / "status". ``root`` injects a
    fake registry key for tests; ``out`` collects the report (defaults
    to print).
    """
    if not is_available():
        out("Run-at-startup is only available on Windows.")
        return 1
    if action == "on":
        command = build_autostart_command()
        enable(command, root=root)
        out(f"Autostart enabled: {command}")
    elif action == "off":
        disable(root=root)
        out("Autostart disabled.")
    elif action == "status":
        command = entry_command(root=root)
        if command:
            out(f"Autostart is ON: {command}")
        else:
            out("Autostart is OFF.")
    else:
        out(f"Unknown autostart action: {action}")
        return 2
    return 0
