"""Typed JSON protocol shared by the Python core and every UI layer.

All values crossing the app boundary (the pywebview bridge today, a local
service transport tomorrow) are documented here as typed dicts so both
sides speak one contract. The Python side builds responses through the
small helpers below; the TypeScript frontend mirrors these shapes in
ui/src/protocol.ts.

Wire format is always JSON. Path objects never leave Python as-is: they
are converted to strings by :func:`json_safe` before serialization.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, TypedDict

# Increment when a breaking change is made to any wire shape.
PROTOCOL_VERSION = 1

# ── Event kinds pushed from AppController to the UI ─────────────
# Order contract (see controller.sort / controller.undo docstrings):
#   total -> (item, progress)* -> done
#   error may replace done on a fatal failure.
EVENT_TOTAL = "total"
EVENT_ITEM = "item"
EVENT_PROGRESS = "progress"
EVENT_DONE = "done"
EVENT_ERROR = "error"

EVENT_KINDS = frozenset({EVENT_TOTAL, EVENT_ITEM, EVENT_PROGRESS, EVENT_DONE, EVENT_ERROR})

# ── Duplicate-handling modes ────────────────────────────────────
MODE_SKIP = "skip"
MODE_RENAME = "rename"
MODE_OVERWRITE = "overwrite"
DUPLICATE_MODES = frozenset({MODE_SKIP, MODE_RENAME, MODE_OVERWRITE})

# Sort item actions (per file, emitted during a sort)
ACTION_COPIED = "copied"
ACTION_MOVED = "moved"
ITEM_STATUS_OK = "ok"
ITEM_STATUS_SKIP = "skip"
ITEM_STATUS_ERROR = "error"
UNDO_STATUS_RESTORED = "restored"
UNDO_STATUS_REMOVED = "removed"
UNDO_STATUS_FAILED = "failed"

# ── Wire shapes ─────────────────────────────────────────────────


class CategoryMeta(TypedDict):
    """Display metadata for one category, persisted across restarts."""

    icon: str
    nameEn: str
    nameFa: str


class AppState(TypedDict):
    """Payload of Api.get_state(): everything the page needs on load."""

    version: str
    categories: Dict[str, List[str]]
    categoryMeta: Dict[str, CategoryMeta]
    recentFolders: List[str]
    theme: str  # "light" | "dark"
    language: str  # "fa" | "en"


class PlanItem(TypedDict):
    """One row of the dry-run preview (Api.plan_sort())."""

    name: str
    category: str
    action: str  # "ok" | "skip" | "rename" | "overwrite"
    final_name: str


class SortLogEntry(TypedDict):
    """One entry of a completed sort's undo log."""

    action: str  # "copied" | "moved"
    source: str
    final_dest: str
    name: str
    category: str


class SortDone(TypedDict):
    """Payload of the "done" event after a successful sort."""

    copied: int
    skipped: int
    errors: int
    target_dir: str
    sort_log: List[SortLogEntry]


class UndoDone(TypedDict):
    """Payload of the "done" event after an undo pass."""

    restored: int
    removed: int
    failed: int
    nothing: bool


class EventMessage(TypedDict):
    """The envelope window.onSortEvent() receives: {"kind", "payload"}."""

    kind: str
    payload: Any


# ── Serialization helpers ───────────────────────────────────────


def json_safe(value: Any) -> Any:
    """Deep-convert a Python value into pure JSON types.

    Path objects become strings, tuples become lists, and sets are
    sorted first so output is deterministic. Anything else that is not a
    JSON primitive falls back to str(value).
    """
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, dict):
        return {str(k): json_safe(v) for k, v in value.items()}
    if isinstance(value, (set, frozenset)):
        return [json_safe(v) for v in sorted(value, key=str)]
    if isinstance(value, (tuple, list)):
        return [json_safe(v) for v in value]
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    return str(value)


def plan_item_wire(item: Dict[str, Any]) -> PlanItem:
    """Build the wire-safe, 4-key dry-run row from a controller plan item.

    Path values in the controller's plan (source / final_dest) are not
    part of the public dry-run contract and are intentionally dropped.
    """
    return {
        "name": item["name"],
        "category": item["category"],
        "action": item["action"],
        "final_name": item["final_name"],
    }


def event_message(kind: str, payload: Any) -> EventMessage:
    """Build a push envelope, JSON-safe (used by _push)."""
    if kind not in EVENT_KINDS:
        raise ValueError(f"unknown event kind: {kind!r}")
    return {"kind": kind, "payload": json_safe(payload)}
