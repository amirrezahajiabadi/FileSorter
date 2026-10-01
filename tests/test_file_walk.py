"""Tests for sorter.iter_files — the one-stat-per-file walk shared by the
analysis, the sort planner and the disk-space scanner.

These pin the properties the scanners depend on:

* each entry is stat'd exactly once (the old code walked with rglob/os.walk
  and then called path.stat() — a fresh syscall on a brand-new Path object —
  once for the size and again for the mtime, and lost the whole report if the
  file disappeared between the two calls);
* a file that vanishes or is locked mid-walk is skipped, not fatal;
* an unreadable sub-directory is skipped, not fatal;
* the sorter's own output folder is pruned from the walk entirely;
* a missing scan root raises instead of silently reporting "0 files".
"""

import os
from pathlib import Path

import pytest

from app.constants import DEFAULT_CATEGORIES
from app.sorter import analyze_folder, iter_files, plan_sort


class _FakeEntry:
    """Minimal os.DirEntry stand-in for injecting an unstable entry."""

    def __init__(self, path, *, is_dir=False, stat_error=None):
        self.path = str(path)
        self.name = Path(path).name
        self._is_dir = is_dir
        self._stat_error = stat_error

    def is_dir(self, follow_symlinks=True):
        return self._is_dir

    def is_file(self, follow_symlinks=True):
        return not self._is_dir

    def stat(self, follow_symlinks=True):
        if self._stat_error is not None:
            raise self._stat_error
        return os.stat(self.path)


class _FakeScandir:
    """Context manager + iterator, like the object os.scandir returns."""

    def __init__(self, entries):
        self._entries = list(entries)

    def __iter__(self):
        return iter(self._entries)

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        return False


class _CountingEntry:
    """Proxy that records every explicit stat() the walk performs."""

    def __init__(self, entry, calls):
        self._entry = entry
        self._calls = calls

    def __getattr__(self, name):
        return getattr(self._entry, name)

    def is_dir(self, follow_symlinks=True):
        return self._entry.is_dir(follow_symlinks=follow_symlinks)

    def is_file(self, follow_symlinks=True):
        return self._entry.is_file(follow_symlinks=follow_symlinks)

    def stat(self, follow_symlinks=True):
        self._calls.append(self._entry.name)
        return self._entry.stat(follow_symlinks=follow_symlinks)


class _CountingScandir:
    def __init__(self, iterator, calls):
        self._iterator = iterator
        self._calls = calls

    def __iter__(self):
        return (_CountingEntry(e, self._calls) for e in self._iterator)

    def __enter__(self):
        self._iterator.__enter__()
        return self

    def __exit__(self, *exc_info):
        return self._iterator.__exit__(*exc_info)


def _patch_scandir(monkeypatch, directory, entries):
    """Make os.scandir(directory) yield `entries`; everything else is real."""
    real_scandir = os.scandir

    def fake_scandir(path):
        if Path(path) == Path(directory):
            return _FakeScandir(entries)
        return real_scandir(path)

    monkeypatch.setattr("app.sorter.os.scandir", fake_scandir)


# ══════════════════════════════════════════════════════════════════
#  The walk itself
# ══════════════════════════════════════════════════════════════════

def test_yields_every_file_with_its_stat(tmp_path):
    (tmp_path / "a.txt").write_bytes(b"x")
    nested = tmp_path / "sub" / "deeper"
    nested.mkdir(parents=True)
    (nested / "b.bin").write_bytes(b"yyyy")

    found = {p.name: st.st_size for p, st in iter_files(tmp_path)}

    assert found == {"a.txt": 1, "b.bin": 4}


def test_prunes_the_excluded_output_dir(tmp_path):
    (tmp_path / "loose.txt").write_bytes(b"x")
    out = tmp_path / "sorted" / "images"
    out.mkdir(parents=True)
    (out / "already-sorted.txt").write_bytes(b"x")

    found = [p.name for p, _ in iter_files(tmp_path, exclude=tmp_path / "sorted")]

    assert found == ["loose.txt"]


def test_unreadable_directory_is_skipped_not_fatal(tmp_path, monkeypatch):
    (tmp_path / "ok.txt").write_bytes(b"x")
    broken = tmp_path / "broken"
    real_scandir = os.scandir

    def fake_scandir(path):
        if Path(path) == tmp_path:
            return _FakeScandir(
                [_FakeEntry(broken, is_dir=True), _FakeEntry(tmp_path / "ok.txt")]
            )
        if Path(path) == broken:
            # A real unreadable directory is reported as a directory by its
            # parent, then refuses to be listed (permissions / systems dirs).
            raise PermissionError("denied")
        return real_scandir(path)

    monkeypatch.setattr("app.sorter.os.scandir", fake_scandir)

    assert [p.name for p, _ in iter_files(tmp_path)] == ["ok.txt"]


def test_entry_that_vanishes_mid_walk_is_skipped(tmp_path, monkeypatch):
    present = tmp_path / "present.txt"
    present.write_bytes(b"x")
    _patch_scandir(
        monkeypatch,
        tmp_path,
        [
            _FakeEntry(present),
            _FakeEntry(tmp_path / "gone.txt", stat_error=FileNotFoundError("gone")),
        ],
    )

    assert [p.name for p, _ in iter_files(tmp_path)] == ["present.txt"]


def test_each_entry_is_stat_ed_exactly_once(tmp_path, monkeypatch):
    for i in range(5):
        (tmp_path / f"f{i}.txt").write_bytes(b"x")

    calls = []
    real_scandir = os.scandir
    monkeypatch.setattr(
        "app.sorter.os.scandir",
        lambda path: _CountingScandir(real_scandir(path), calls),
    )

    found = list(iter_files(tmp_path))

    assert len(found) == 5
    assert sorted(calls) == sorted(f"f{i}.txt" for i in range(5))


# ══════════════════════════════════════════════════════════════════
#  Consumers: analyse + plan
# ══════════════════════════════════════════════════════════════════

def test_analyze_folder_ignores_a_file_that_vanishes_mid_walk(tmp_path, monkeypatch):
    """The regression this walk was introduced for: a file disappearing
    between two stat() calls used to abort the entire analysis."""
    present = tmp_path / "photo.jpg"
    present.write_bytes(b"x")
    _patch_scandir(
        monkeypatch,
        tmp_path,
        [
            _FakeEntry(present),
            _FakeEntry(tmp_path / "gone.jpg", stat_error=FileNotFoundError("gone")),
        ],
    )

    report = analyze_folder(tmp_path, DEFAULT_CATEGORIES)

    assert report["total"] == 1
    assert report["by_category"] == {"images": 1}
    assert "error" not in report


@pytest.mark.parametrize("scan", [analyze_folder, plan_sort])
def test_missing_root_raises_instead_of_reporting_empty(tmp_path, scan):
    with pytest.raises(FileNotFoundError):
        scan(tmp_path / "nope", DEFAULT_CATEGORIES)


def test_plan_sort_still_resolves_duplicates_deterministically(tmp_path):
    """Collecting the sources before planning keeps rename assignment stable
    (the dry run must never disagree with the real sort)."""
    (tmp_path / "a.jpg").write_bytes(b"x")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "a.jpg").write_bytes(b"y")

    first = plan_sort(tmp_path, DEFAULT_CATEGORIES, "rename")
    second = plan_sort(tmp_path, DEFAULT_CATEGORIES, "rename")

    assert [(i["name"], i["final_name"]) for i in first] == [
        (i["name"], i["final_name"]) for i in second
    ]
    assert sorted(i["action"] for i in first) == ["ok", "rename"]
