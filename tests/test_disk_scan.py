"""Tests for the disk space analysis scanner (app/disk_scan.py)."""

import os
import tempfile
from pathlib import Path

import pytest

from app.disk_scan import TOP_N, scan_space
from app.sorter import get_category

# A tiny category map mirroring the app's default shape.
CATEGORIES = {
    "images": {".png", ".jpg"},
    "documents": {".pdf", ".txt"},
    "archives": {".zip"},
}


def _make_tree(root: Path) -> None:
    """Create a small tree with known sizes."""
    (root / "photos").mkdir()
    (root / "docs").mkdir()
    (root / "deep" / "nested").mkdir(parents=True)
    (root / "a.png").write_bytes(b"x" * 100)       # images  100
    (root / "photos" / "b.jpg").write_bytes(b"y" * 50)  # images  50
    (root / "docs" / "c.pdf").write_bytes(b"z" * 200)   # documents 200
    (root / "deep" / "nested" / "d.txt").write_bytes(b"w" * 30)  # documents 30
    (root / "big.zip").write_bytes(b"b" * 5000)     # archives 5000
    (root / "readme.xyz").write_bytes(b"r" * 7)     # others  7


def test_buckets_by_category():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _make_tree(root)
        res = scan_space(root, CATEGORIES)

        assert res["files_scanned"] == 6
        assert res["total_bytes"] == 100 + 50 + 200 + 30 + 5000 + 7

        imgs = res["by_category"]["images"]
        assert imgs["files"] == 2
        assert imgs["bytes"] == 150

        docs = res["by_category"]["documents"]
        assert docs["files"] == 2
        assert docs["bytes"] == 230

        assert res["by_category"]["archives"]["bytes"] == 5000
        assert res["by_category"]["others"]["bytes"] == 7


def test_top_files_sorted_desc_and_limited():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        _make_tree(root)
        res = scan_space(root, CATEGORIES, top_n=3)

        assert len(res["top_files"]) == 3
        sizes = [f["size"] for f in res["top_files"]]
        assert sizes == sorted(sizes, reverse=True)
        assert sizes[0] == 5000
        assert res["top_files"][0]["path"] == str(root / "big.zip")


def test_top_n_default_and_cap():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        for i in range(30):
            (root / f"f{i:02d}.txt").write_bytes(b"z" * (i + 1))
        res = scan_space(root, CATEGORIES)
        assert len(res["top_files"]) == TOP_N == 20


def test_empty_folder():
    with tempfile.TemporaryDirectory() as tmp:
        res = scan_space(Path(tmp), CATEGORIES)
        assert res["files_scanned"] == 0
        assert res["total_bytes"] == 0
        assert res["by_category"] == {}
        assert res["top_files"] == []


def test_missing_folder_raises():
    with pytest.raises(FileNotFoundError):
        scan_space(Path("C:/definitely/not/here-392"), CATEGORIES)


def test_zero_byte_files_are_counted_but_free():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "empty.png").write_bytes(b"")
        res = scan_space(root, CATEGORIES)
        assert res["files_scanned"] == 1
        assert res["total_bytes"] == 0
        assert res["by_category"]["images"]["files"] == 1


def test_progress_events_stream():
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        # Enough files to cross the emit-every-128 threshold a few times.
        for i in range(300):
            (root / f"f{i:03d}.dat").write_bytes(b"z" * (i % 10))
        events = []
        scan_space(root, CATEGORIES, on_event=lambda k, p: events.append((k, p)))

        assert all(k == "space_progress" for k, _ in events)
        # Counters are monotonically non-decreasing, capped at total.
        processed = [p["processed"] for _, p in events]
        assert processed == sorted(processed)
        assert processed[-1] == 300
        assert all(p["phase"] == "scanning" for _, p in events)


def test_unreadable_entry_is_skipped():
    if os.name == "nt":
        pytest.skip("permission bits are unreliable on Windows")
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "ok.txt").write_bytes(b"a" * 10)
        locked = root / "locked.txt"
        locked.write_bytes(b"b" * 20)
        locked.chmod(0)
        try:
            res = scan_space(root, CATEGORIES)
            assert res["files_scanned"] == 1
            assert res["total_bytes"] == 10
        finally:
            locked.chmod(0o644)


def test_controller_scan_space_uses_current_categories():
    """The controller buckets with the live category settings, not a fixed map."""
    from app.controller import AppController

    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        (root / "pic.png").write_bytes(b"p" * 40)
        (root / "data.xyz").write_bytes(b"d" * 8)
        ctl = AppController()
        res = ctl.scan_space(str(root))
        cats = ctl.categories
        assert res["by_category"][get_category(".png", cats)]["bytes"] == 40
        assert res["by_category"][get_category(".xyz", cats)]["bytes"] == 8
        assert res["files_scanned"] == 2
