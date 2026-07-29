"""Unit tests for app.sorter's duplicate-handling and dry-run planning."""

from pathlib import Path

import pytest

from app.sorter import resolve_duplicate, plan_sort


# ══════════════════════════════════════════════════════════════════
#  resolve_duplicate
# ══════════════════════════════════════════════════════════════════

def test_resolve_duplicate_no_conflict(tmp_path):
    dest = tmp_path / "photo.jpg"
    action, final = resolve_duplicate(dest, "skip", set())
    assert action == "ok"
    assert final == dest


def test_resolve_duplicate_skip_mode(tmp_path):
    dest = tmp_path / "photo.jpg"
    dest.write_bytes(b"x")
    action, final = resolve_duplicate(dest, "skip", set())
    assert action == "skip"
    assert final == dest


def test_resolve_duplicate_overwrite_mode(tmp_path):
    dest = tmp_path / "photo.jpg"
    dest.write_bytes(b"x")
    action, final = resolve_duplicate(dest, "overwrite", set())
    assert action == "overwrite"
    assert final == dest


def test_resolve_duplicate_rename_mode(tmp_path):
    dest = tmp_path / "photo.jpg"
    dest.write_bytes(b"x")
    action, final = resolve_duplicate(dest, "rename", set())
    assert action == "rename"
    assert final == tmp_path / "photo (1).jpg"


def test_resolve_duplicate_rename_mode_multiple_collisions(tmp_path):
    dest = tmp_path / "photo.jpg"
    dest.write_bytes(b"x")
    (tmp_path / "photo (1).jpg").write_bytes(b"x")

    action, final = resolve_duplicate(dest, "rename", set())
    assert action == "rename"
    assert final == tmp_path / "photo (2).jpg"


def test_resolve_duplicate_rename_respects_reserved_set(tmp_path):
    dest = tmp_path / "photo.jpg"
    dest.write_bytes(b"x")
    reserved = set()

    _, final1 = resolve_duplicate(dest, "rename", reserved)
    _, final2 = resolve_duplicate(dest, "rename", reserved)

    assert final1 != final2
    assert final1 == tmp_path / "photo (1).jpg"
    assert final2 == tmp_path / "photo (2).jpg"


# ══════════════════════════════════════════════════════════════════
#  plan_sort
# ══════════════════════════════════════════════════════════════════

CATEGORIES = {"images": [".jpg"], "documents": [".txt"], "others": []}


def test_plan_sort_no_conflicts(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    (tmp_path / "b.txt").write_bytes(b"x")

    plan = plan_sort(tmp_path, CATEGORIES, "skip")

    assert len(plan) == 2
    assert all(item["action"] == "ok" for item in plan)


def test_plan_sort_does_not_touch_filesystem(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")

    plan_sort(tmp_path, CATEGORIES, "skip")

    assert not (tmp_path / "sorted").exists()
    assert (tmp_path / "a.jpg").exists()


def test_plan_sort_skip_mode_with_existing_duplicate(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    sorted_dir = tmp_path / "sorted" / "images"
    sorted_dir.mkdir(parents=True)
    (sorted_dir / "a.jpg").write_bytes(b"already here")

    plan = plan_sort(tmp_path, CATEGORIES, "skip")

    assert plan[0]["action"] == "skip"


def test_plan_sort_rename_mode_with_existing_duplicate(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    sorted_dir = tmp_path / "sorted" / "images"
    sorted_dir.mkdir(parents=True)
    (sorted_dir / "a.jpg").write_bytes(b"already here")

    plan = plan_sort(tmp_path, CATEGORIES, "rename")

    assert plan[0]["action"] == "rename"
    assert plan[0]["final_name"] == "a (1).jpg"


def test_plan_sort_two_source_files_with_same_name_in_different_subfolders(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")
    sub = tmp_path / "sub"
    sub.mkdir()
    (sub / "a.jpg").write_bytes(b"y")

    plan = plan_sort(tmp_path, CATEGORIES, "rename")

    assert len(plan) == 2
    actions = sorted(item["action"] for item in plan)
    assert actions == ["ok", "rename"]
    final_names = {item["final_name"] for item in plan}
    assert final_names == {"a.jpg", "a (1).jpg"}


def test_plan_sort_includes_source_and_final_dest_paths(tmp_path):
    (tmp_path / "a.jpg").write_bytes(b"x")

    plan = plan_sort(tmp_path, CATEGORIES, "skip")

    assert plan[0]["source"] == tmp_path / "a.jpg"
    assert plan[0]["final_dest"] == tmp_path / "sorted" / "images" / "a.jpg"
