"""Tests for the Duplicate Finder (app/duplicates.py + controller glue).

Two-phase hashing means the interesting behaviors are content-based:
files that share a size but differ in content must NOT be grouped, and
identical content must be found across different subfolders/names.
"""

import tempfile
from pathlib import Path

import pytest

from app.duplicates import delete_files, scan_duplicates
from app.controller import AppController


@pytest.fixture
def controller(tmp_path, monkeypatch):
    """Fresh controller with a temp settings file (see test_controller.py)."""
    import app.settings_manager as settings_manager
    monkeypatch.setattr(settings_manager, "SETTINGS_FILE", tmp_path / "settings.json")
    return AppController()


def write(root: Path, rel: str, data: bytes) -> Path:
    path = root / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return path


# ══════════════════════════════════════════════════════════════════
#  scan_duplicates
# ══════════════════════════════════════════════════════════════════

def test_finds_identical_content_across_subfolders(tmp_path):
    write(tmp_path, "a/photo.jpg", b"same-bytes")
    write(tmp_path, "b/backup/photo.jpg", b"same-bytes")
    result = scan_duplicates(tmp_path)
    assert len(result["groups"]) == 1
    group = result["groups"][0]
    assert len(group["files"]) == 2
    assert group["size"] == len(b"same-bytes")
    assert result["wasted_bytes"] == len(b"same-bytes")
    assert result["files_scanned"] == 2


def test_same_size_different_content_is_not_duplicate(tmp_path):
    write(tmp_path, "a.bin", b"AAAA" * 100)
    write(tmp_path, "b.bin", b"BBBB" * 100)  # same size, different bytes
    result = scan_duplicates(tmp_path)
    assert result["groups"] == []


def test_three_copies_waste_two(tmp_path):
    write(tmp_path, "one/song.mp3", b"x" * 300)
    write(tmp_path, "two/song copy.mp3", b"x" * 300)
    write(tmp_path, "three/song (1).mp3", b"x" * 300)
    result = scan_duplicates(tmp_path)
    assert len(result["groups"]) == 1
    assert len(result["groups"][0]["files"]) == 3
    assert result["wasted_bytes"] == 600


def test_empty_files_are_ignored(tmp_path):
    write(tmp_path, "a.txt", b"")
    write(tmp_path, "sub/b.txt", b"")
    result = scan_duplicates(tmp_path)
    assert result["groups"] == []
    assert result["files_scanned"] == 2


def test_two_separate_groups(tmp_path):
    write(tmp_path, "1/a.jpg", b"pic")
    write(tmp_path, "2/a.jpg", b"pic")
    write(tmp_path, "1/note.txt", b"text")
    write(tmp_path, "2/note-copy.txt", b"text")
    result = scan_duplicates(tmp_path)
    assert len(result["groups"]) == 2
    sizes = sorted(g["size"] for g in result["groups"])
    assert sizes == [3, 4]


def test_scan_reports_events(tmp_path):
    write(tmp_path, "a/a.bin", b"z" * 500)
    write(tmp_path, "b/a.bin", b"z" * 500)
    events = []
    scan_duplicates(tmp_path, on_event=lambda k, p: events.append((k, p)))
    kinds = [k for k, _ in events]
    assert kinds == ["dup_progress"] * 4
    phases = [p["phase"] for _, p in events]
    # listing start, hashing start, then one event per hashed candidate
    assert phases == ["listing", "hashing", "hashing", "hashing"]
    assert events[-1][1]["processed"] == 2


def test_deterministic_group_order_and_id(tmp_path):
    write(tmp_path, "a.bin", b"data")
    write(tmp_path, "b.bin", b"data")
    first = scan_duplicates(tmp_path)
    second = scan_duplicates(tmp_path)
    assert first == second
    assert len(first["groups"][0]["id"]) == 12  # sha256 prefix


# ══════════════════════════════════════════════════════════════════
#  delete_files (whitelist)
# ══════════════════════════════════════════════════════════════════

def test_delete_removes_flagged_copies(tmp_path):
    keep = write(tmp_path, "keep/a.bin", b"v")
    dupe = write(tmp_path, "dupe/b.bin", b"v")
    allowed = {keep, dupe}
    result = delete_files([str(dupe)], allowed)
    assert result["deleted"] == [str(dupe)]
    assert result["failed"] == []
    assert not dupe.exists()
    assert keep.exists()


def test_delete_refuses_paths_outside_whitelist(tmp_path):
    keep = write(tmp_path, "a.bin", b"v")
    untracked = write(tmp_path, "b.bin", b"w")  # different content, not flagged
    result = delete_files([str(untracked)], allowed={keep})
    assert result["deleted"] == []
    assert len(result["failed"]) == 1
    assert "not flagged" in result["failed"][0]["error"]
    assert untracked.exists()


# ══════════════════════════════════════════════════════════════════
#  controller glue
# ══════════════════════════════════════════════════════════════════

def test_controller_scan_then_delete(controller, tmp_path):
    write(tmp_path, "orig/notes.txt", b"hello world")
    dupe = write(tmp_path, "copy/notes.txt", b"hello world")
    result = controller.scan_duplicates(str(tmp_path))
    assert len(result["groups"]) == 1
    # Scan-flagged file can be deleted...
    out = controller.delete_duplicates([str(dupe)])
    assert out["deleted"] == [str(dupe)]
    assert not dupe.exists()
    # ...but an arbitrary path (never part of a scan) cannot.
    other = write(tmp_path, "unrelated/other.txt", b"different")
    out2 = controller.delete_duplicates([str(other)])
    assert out2["deleted"] == []
    assert other.exists()


# ══════════════════════════════════════════════════════════════════
#  v5.8.0 — drive-wide duplicate scans: cancel support
# ══════════════════════════════════════════════════════════════════

def _dup_tree(root, pairs=3, copies=3):
    """pairs groups × copies files each, identical content per group."""
    root = Path(root)
    for g in range(pairs):
        content = f"group-{g} content".encode() * 1000
        for c in range(copies):
            f = root / f"g{g}_copy{c}.dat"
            f.write_bytes(content)
    return root


def test_dup_cancel_before_scan_returns_empty():
    import threading

    from app.duplicates import scan_duplicates

    with tempfile.TemporaryDirectory() as tmp:
        root = _dup_tree(tmp)
        cancel = threading.Event()
        cancel.set()
        res = scan_duplicates(root, cancel_event=cancel)
        assert res["cancelled"] is True
        assert res["groups"] == []


def test_dup_cancel_mid_hash_returns_partial():
    import threading

    from app.duplicates import scan_duplicates

    with tempfile.TemporaryDirectory() as tmp:
        root = _dup_tree(tmp, pairs=30, copies=2)  # 60 files to hash
        cancel = threading.Event()

        def cancel_soon():
            import time
            time.sleep(0.01)
            cancel.set()

        t = threading.Thread(target=cancel_soon, daemon=True)
        t.start()
        res = scan_duplicates(root, cancel_event=cancel)
        assert res["cancelled"] is True
        # some groups may already be complete; the result stays valid
        assert isinstance(res["groups"], list)


def test_dup_scan_without_cancel_never_cancels():
    from app.duplicates import scan_duplicates

    with tempfile.TemporaryDirectory() as tmp:
        root = _dup_tree(tmp)
        res = scan_duplicates(root)
        assert res["cancelled"] is False
        assert len(res["groups"]) == 3
