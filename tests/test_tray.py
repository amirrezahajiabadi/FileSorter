"""Tests for the system tray + background entry points (app/tray.py,
main_web.py CLI dispatch).

The real WinForms icon needs a live desktop message pump, so the tray
itself is tested at the boundaries: availability gating, labels,
autostart toggle semantics (fake registry), the quit path, and the
main() dispatch — all without ever constructing a .NET control.
"""

import pytest

from app import autostart
from app.tray import TrayController, TrayUnavailable


def make_controller(language="fa", **kw):
    return TrayController(url="http://127.0.0.1:8175/", port=8175,
                          language=language, **kw)


# ══════════════════════════════════════════════════════════════════
#  Availability gating
# ══════════════════════════════════════════════════════════════════

def test_run_raises_tray_unavailable_when_winforms_missing(monkeypatch):
    monkeypatch.setattr("app.tray._load_winforms", lambda: None)
    with pytest.raises(TrayUnavailable):
        make_controller().run()


# ══════════════════════════════════════════════════════════════════
#  Labels / tooltip
# ══════════════════════════════════════════════════════════════════

def test_labels_persian():
    c = make_controller(language="fa")
    assert c._label("open") == "باز کردن در مرورگر"
    assert c._label("quit") == "خروج"
    assert "8175" in c.tooltip()


def test_labels_english():
    c = make_controller(language="en")
    assert c._label("open") == "Open in browser"
    assert c._label("startup") == "Start with Windows"
    assert c.tooltip() == "File Sorter — running on port 8175"


def test_unknown_language_falls_back_to_persian():
    c = make_controller(language="fr")
    assert c._label("open") == "باز کردن در مرورگر"


# ══════════════════════════════════════════════════════════════════
#  Autostart toggle semantics (fake registry key)
# ══════════════════════════════════════════════════════════════════

class FakeKey:
    def __init__(self):
        self.values = {}

    def QueryValueEx(self, name):
        if name not in self.values:
            raise OSError("absent")
        return self.values[name], 1

    def SetValueEx(self, name, reserved, type_, value):
        self.values[name] = value

    def DeleteValue(self, name):
        if name not in self.values:
            raise OSError("absent")
        del self.values[name]


def test_toggle_enables_then_disables():
    key = FakeKey()
    c = make_controller(autostart_root=key)
    assert c._autostart_checked() is False
    assert c._toggle_autostart() is True  # just turned on
    assert autostart.is_enabled(root=key)
    assert c._toggle_autostart() is False  # turned off again
    assert not autostart.is_enabled(root=key)


def test_toggle_reflects_external_change():
    key = FakeKey()
    autostart.enable("cmd", root=key)
    c = make_controller(autostart_root=key)
    assert c._autostart_checked() is True


# ══════════════════════════════════════════════════════════════════
#  Quit path
# ══════════════════════════════════════════════════════════════════

def test_quit_invokes_on_quit(monkeypatch):
    calls = []
    monkeypatch.setattr("app.tray._load_winforms", lambda: None)
    c = make_controller(on_quit=lambda: calls.append("quit"))
    c._winforms = {"Application": type("A", (), {"ExitThread": lambda self: None})()}
    c._request_quit()
    assert calls == ["quit"]


def test_quit_tolerates_on_quit_failure(monkeypatch):
    def boom():
        raise RuntimeError("shutdown failed")

    monkeypatch.setattr("app.tray._load_winforms", lambda: None)
    c = make_controller(on_quit=boom)
    c._winforms = {"Application": type("A", (), {"ExitThread": lambda self: None})()}
    c._request_quit()  # must not raise


# ══════════════════════════════════════════════════════════════════
#  CLI dispatch (main_web.main)
# ══════════════════════════════════════════════════════════════════

def test_main_headless_tray_dispatch(monkeypatch):
    import main_web

    calls = {}

    def fake_tray(port=None, token=None):
        calls["tray"] = (port, token)

    # main_web imports run_tray_service lazily from app.tray, so the
    # patch goes on the tray module itself.
    monkeypatch.setattr("app.tray.run_tray_service", fake_tray)
    main_web.main(["--headless", "--tray", "--port", "9000", "--token", "dev"])
    assert calls == {"tray": (9000, "dev")}


def test_main_headless_plain_dispatch(monkeypatch):
    import main_web

    calls = {}

    def fake_run(port=None, token=None):
        calls["run"] = (port, token)

    monkeypatch.setattr(main_web, "run_service", fake_run)
    main_web.main(["--headless"])
    assert calls == {"run": (8175, None)}


def test_main_autostart_action_dispatch(monkeypatch):
    import main_web

    seen = {}

    def fake_action(action):
        seen["action"] = action
        return 0

    monkeypatch.setattr(main_web.autostart, "run_cli_action", fake_action)
    with pytest.raises(SystemExit) as exc:
        main_web.main(["--autostart", "status"])
    assert exc.value.code == 0
    assert seen == {"action": "status"}


def test_parse_args_defaults():
    from main_web import parse_args

    a = parse_args([])
    assert a.headless is False
    assert a.tray is False
    assert a.autostart is None
    assert a.port == 8175


def test_parse_args_rejects_bad_autostart_choice():
    from main_web import parse_args

    with pytest.raises(SystemExit):
        parse_args(["--autostart", "maybe"])
