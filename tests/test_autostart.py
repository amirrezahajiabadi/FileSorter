"""Tests for run-at-startup registration (app/autostart.py).

The registry CRUD is exercised against an injectable fake key so the
suite never touches a real hive; the command builder is tested with
monkeypatched sys.executable/argv (source vs. frozen).
"""

import sys

import pytest

from app import autostart


class FakeKey:
    """Minimal stand-in for a winreg key: QueryValueEx / SetValueEx /
    DeleteValue raise OSError when a value is absent, like winreg does.
    """

    def __init__(self):
        self.values = {}

    def QueryValueEx(self, name):
        if name not in self.values:
            raise OSError("value not present")
        return self.values[name], autostart._REG_SZ

    def SetValueEx(self, name, reserved, type_, value):
        self.values[name] = value

    def DeleteValue(self, name):
        if name not in self.values:
            raise OSError("value not present")
        del self.values[name]


# ══════════════════════════════════════════════════════════════════
#  CRUD against the fake key
# ══════════════════════════════════════════════════════════════════

def test_enable_writes_entry():
    key = FakeKey()
    autostart.enable('"C:\\py\\pythonw.exe" "C:\\app\\main_web.py" --headless --tray', root=key)
    assert autostart.is_enabled(root=key)
    assert autostart.entry_command(root=key) == (
        '"C:\\py\\pythonw.exe" "C:\\app\\main_web.py" --headless --tray'
    )


def test_disable_removes_entry():
    key = FakeKey()
    autostart.enable("some command", root=key)
    autostart.disable(root=key)
    assert not autostart.is_enabled(root=key)
    assert autostart.entry_command(root=key) is None


def test_disable_absent_is_noop():
    key = FakeKey()
    autostart.disable(root=key)  # must not raise
    assert not autostart.is_enabled(root=key)


def test_enable_replaces_existing():
    key = FakeKey()
    autostart.enable("old", root=key)
    autostart.enable("new", root=key)
    assert autostart.entry_command(root=key) == "new"


def test_entry_command_none_on_empty_key():
    assert autostart.entry_command(root=FakeKey()) is None


# ══════════════════════════════════════════════════════════════════
#  Command builder (source run vs. frozen exe)
# ══════════════════════════════════════════════════════════════════

def test_build_command_from_source_uses_pythonw(monkeypatch):
    monkeypatch.setattr(autostart.sys, "executable", r"C:\Python314\python.exe")
    monkeypatch.setattr(autostart.sys, "argv", [r"C:\proj\src\main_web.py"])
    monkeypatch.delattr(autostart.sys, "frozen", raising=False)
    assert autostart.build_autostart_command() == (
        '"C:\\Python314\\pythonw.exe" "C:\\proj\\src\\main_web.py" --headless --tray'
    )


def test_build_command_from_frozen_uses_exe(monkeypatch):
    monkeypatch.setattr(autostart.sys, "frozen", True, raising=False)
    monkeypatch.setattr(autostart.sys, "executable", r"C:\Program Files\FileSorter\FileSorter.exe")
    assert autostart.build_autostart_command() == (
        '"C:\\Program Files\\FileSorter\\FileSorter.exe" --headless --tray'
    )


# ══════════════════════════════════════════════════════════════════
#  CLI action (--autostart on|off|status)
# ══════════════════════════════════════════════════════════════════

def test_cli_on_enables_and_reports(monkeypatch, capsys):
    key = FakeKey()
    monkeypatch.setattr(autostart, "_windows", True)
    code = autostart.run_cli_action("on", root=key)
    out = capsys.readouterr().out
    assert code == 0
    assert autostart.is_enabled(root=key)
    assert "Autostart enabled" in out


def test_cli_off_disables(monkeypatch):
    key = FakeKey()
    autostart.enable("cmd", root=key)
    monkeypatch.setattr(autostart, "_windows", True)
    assert autostart.run_cli_action("off", root=key) == 0
    assert not autostart.is_enabled(root=key)


def test_cli_status_reports(monkeypatch, capsys):
    key = FakeKey()
    monkeypatch.setattr(autostart, "_windows", True)
    autostart.run_cli_action("status", root=key)
    assert "Autostart is OFF" in capsys.readouterr().out
    autostart.enable("cmd", root=key)
    autostart.run_cli_action("status", root=key)
    assert "Autostart is ON" in capsys.readouterr().out


def test_cli_off_on_non_windows(monkeypatch, capsys):
    monkeypatch.setattr(autostart, "_windows", False)
    assert autostart.run_cli_action("on", root=FakeKey()) == 1
    assert "only available on Windows" in capsys.readouterr().out


def test_entry_command_real_hive_when_non_windows_returns_none(monkeypatch):
    monkeypatch.setattr(autostart, "_windows", False)
    assert autostart.entry_command() is None
    assert not autostart.is_enabled()
