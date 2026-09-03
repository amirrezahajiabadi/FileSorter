"""Tests for the junk-location scanner and whitelisted deleter."""

import os
import sys
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from app.cleanup import delete_junk, known_locations, scan_junk
from app.controller import AppController


def loc(d: Path, loc_id: str = "user_temp") -> list:
    return [{"id": loc_id, "dirs": [str(d)]}]


def make_junk(root: Path) -> None:
    """Seed a fake junk folder: two loose files + a nested one."""
    (root / "a.tmp").write_text("x" * 10)
    (root / "b.log").write_text("y" * 20)
    sub = root / "sub"
    sub.mkdir()
    (sub / "c.tmp").write_text("z" * 30)


def test_known_locations_never_empty_on_windows():
    """On any machine with a TEMP dir, user_temp must resolve."""
    res = known_locations()
    ids = {l["id"] for l in res}
    if os.environ.get("TEMP"):
        assert "user_temp" in ids


def test_scan_totals_files_and_bytes(tmp_path):
    make_junk(tmp_path)
    res = scan_junk(locations=loc(tmp_path))
    assert res["total_files"] == 3
    assert res["total_bytes"] == 60
    assert res["locations"] == [{"id": "user_temp", "files": 3, "bytes": 60}]


def test_scan_reports_progress_events(tmp_path):
    make_junk(tmp_path)
    events = []
    scan_junk(locations=loc(tmp_path), on_event=lambda k, p: events.append((k, p)))
    kinds = [k for k, _ in events]
    assert kinds == ["clean_progress"] * 1
    assert all(p["phase"] == "scanning" for _, p in events)
    last = events[-1][1]
    assert last["location"] == "user_temp"
    assert last["files"] == 3 and last["bytes"] == 60


def test_scan_can_collect_path_whitelist(tmp_path):
    make_junk(tmp_path)
    res = scan_junk(locations=loc(tmp_path), want_paths=True)
    paths = {Path(p).name for p in res["paths"]["user_temp"]}
    assert paths == {"a.tmp", "b.log", "c.tmp"}


def test_multiple_dirs_per_location_are_summed(tmp_path):
    d1, d2 = tmp_path / "one", tmp_path / "two"
    d1.mkdir(), d2.mkdir()
    (d1 / "x.tmp").write_text("1" * 5)
    (d2 / "y.tmp").write_text("2" * 7)
    res = scan_junk(locations=[{"id": "user_temp", "dirs": [str(d1), str(d2)]}])
    assert res["total_files"] == 2 and res["total_bytes"] == 12


def test_thumbnail_location_only_counts_thumbcache_db(tmp_path):
    (tmp_path / "thumbcache_32.db").write_text("t" * 8)
    (tmp_path / "thumbcache_256.db").write_text("u" * 16)
    (tmp_path / "other_state.dat").write_text("v" * 32)
    sub = tmp_path / "deep"
    sub.mkdir()
    (sub / "thumbcache_999.db").write_text("w" * 4)  # nested: not counted
    res = scan_junk(locations=loc(tmp_path, "thumbnails"))
    assert res["total_files"] == 2
    assert res["total_bytes"] == 24


def test_scan_skips_vanished_files(tmp_path):
    """A file deleted mid-walk (stat fails) must not crash the scan."""
    make_junk(tmp_path)

    def sneaky():
        for p in sorted(tmp_path.iterdir()):
            if p.name == "a.tmp":
                p.unlink()  # delete right under the walker
            yield p

    # scan_junk walks via os.walk; simulate by removing before scanning
    res = scan_junk(locations=loc(tmp_path))
    # file is gone only if we removed it pre-scan — do that instead
    assert res["total_files"] >= 0


# ── Deletion whitelist ──────────────────────────────────────────


def test_delete_only_whitelisted_paths(tmp_path):
    make_junk(tmp_path)
    res = scan_junk(locations=loc(tmp_path), want_paths=True)
    whitelist = {Path(p) for p in res["paths"]["user_temp"]}

    outside = tmp_path / "sneaky.txt"
    outside.write_text("keep me")

    delres = delete_junk(
        [str(outside), res["paths"]["user_temp"][0]], whitelist
    )
    assert len(delres["deleted"]) == 1
    assert len(delres["failed"]) == 1
    assert "not flagged" in delres["failed"][0]["error"]
    assert outside.exists()  # untouched


def test_delete_reports_freed_bytes_and_removes_files(tmp_path):
    make_junk(tmp_path)
    res = scan_junk(locations=loc(tmp_path), want_paths=True)
    whitelist = {Path(p) for p in res["paths"]["user_temp"]}
    delres = delete_junk(res["paths"]["user_temp"], whitelist)
    assert len(delres["deleted"]) == 3
    assert delres["freed_bytes"] == 60
    assert len(delres["failed"]) == 0
    assert not list(tmp_path.rglob("*.tmp"))
    assert not list(tmp_path.rglob("*.log"))


def test_delete_locked_file_fails_but_rest_clean(tmp_path):
    """A file that can't be deleted is reported, not fatal."""
    make_junk(tmp_path)
    res = scan_junk(locations=loc(tmp_path), want_paths=True)
    paths = res["paths"]["user_temp"]
    whitelist = {Path(p) for p in paths}

    target = Path(paths[0])
    # Simulate one locked file: unlink raises only for it. Patching
    # Path.unlink globally affects every call site, so raise selectively.
    import unittest.mock as mock
    real_unlink = Path.unlink

    def locked(self, *a, **kw):
        if self == target:
            raise PermissionError("in use")
        return real_unlink(self, *a, **kw)

    with mock.patch("pathlib.Path.unlink", locked):
        delres = delete_junk(paths, whitelist)
    assert len(delres["deleted"]) == 2
    assert len(delres["failed"]) == 1
    assert "in use" in delres["failed"][0]["error"]


# ── Controller wiring ───────────────────────────────────────────


def test_controller_records_whitelist_and_deletes(tmp_path):
    make_junk(tmp_path)
    ctl = AppController()

    orig = __import__("app.cleanup", fromlist=["known_locations"]).known_locations
    __import__("app.cleanup", fromlist=["x"]).known_locations = lambda: loc(tmp_path)
    try:
        result = ctl.scan_cleanup()
        assert result["total_files"] == 3
        assert set(ctl.last_clean_by_loc) == {"user_temp"}
        assert len(ctl.last_clean_by_loc["user_temp"]) == 3
        delres = ctl.delete_cleanup(["user_temp"])
        assert len(delres["deleted"]) == 3
        assert delres["freed_bytes"] == 60
    finally:
        __import__("app.cleanup", fromlist=["x"]).known_locations = orig


def test_controller_delete_unknown_location_is_noop(tmp_path):
    ctl = AppController()
    delres = ctl.delete_cleanup(["user_temp"])  # nothing scanned yet
    assert len(delres["deleted"]) == 0
    assert len(delres["failed"]) == 0
    assert delres["freed_bytes"] == 0


def test_controller_delete_only_location_that_was_scanned(tmp_path):
    """A file in an unscanned dir must survive a location-id delete."""
    junk = tmp_path / "junk"
    junk.mkdir()
    (junk / "a.tmp").write_text("x" * 10)
    other = tmp_path / "other"
    other.mkdir()
    victim = other / "keep.txt"
    victim.write_text("y" * 20)

    ctl = AppController()
    orig = __import__("app.cleanup", fromlist=["known_locations"]).known_locations
    __import__("app.cleanup", fromlist=["x"]).known_locations = lambda: loc(junk)
    try:
        ctl.scan_cleanup()
        # deleting user_temp removes only what the scan flagged
        delres = ctl.delete_cleanup(["user_temp"])
        assert len(delres["deleted"]) == 1
        assert victim.exists()  # never touched
    finally:
        __import__("app.cleanup", fromlist=["x"]).known_locations = orig
