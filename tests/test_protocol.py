"""Round-trip tests for app/protocol.py - the typed JSON wire contract."""

import json
from pathlib import Path

import pytest

from app import protocol
from app.protocol import (
    ACTION_COPIED,
    AppState,
    EVENT_DONE,
    MODE_SKIP,
    PlanItem,
    SortLogEntry,
    event_message,
    json_safe,
    plan_item_wire,
)


def _roundtrip(value):
    """Simulate the pywebview bridge: dumps + loads."""
    return json.loads(json.dumps(value, ensure_ascii=False))


class TestJsonSafe:
    def test_paths_become_strings(self):
        d = Path('sorted')
        out = json_safe({'target_dir': d, 'n': 1})
        assert out == {'target_dir': str(d), 'n': 1}
        assert isinstance(out['target_dir'], str)

    def test_tuples_become_lists(self):
        out = json_safe([('a.txt', 1024), ('b.txt', 2048)])
        assert out == [['a.txt', 1024], ['b.txt', 2048]]

    def test_unknown_extensions_set_is_sorted(self):
        out = json_safe({'unknown_extensions': {'.zzz', '.abc'}})
        assert out == {'unknown_extensions': ['.abc', '.zzz']}

    def test_unknown_object_falls_back_to_str(self):
        class Opaque:
            def __str__(self):
                return 'opaque'

        assert json_safe(Opaque()) == 'opaque'

    def test_persian_text_is_preserved(self):
        assert json_safe({'msg': 'تصاویر'}) == {'msg': 'تصاویر'}


class TestEventMessage:
    def test_known_kinds_are_allowed(self):
        msg = event_message(EVENT_DONE, {'copied': 3})
        assert msg['kind'] == EVENT_DONE
        assert msg['payload'] == {'copied': 3}

    def test_unknown_kind_raises(self):
        with pytest.raises(ValueError):
            event_message('explode', {})

    def test_payload_is_json_safe(self):
        d = Path('x')
        msg = event_message(EVENT_DONE, {'target_dir': d})
        assert msg['payload'] == {'target_dir': str(d)}
        assert _roundtrip(msg) == msg


class TestPlanItemWire:
    def test_drops_path_keys_keeps_public_contract(self):
        raw = {
            'source': Path('in') / 'a.txt',
            'final_dest': Path('in') / 'sorted' / 'docs' / 'a.txt',
            'name': 'a.txt',
            'category': 'documents',
            'action': 'ok',
            'final_name': 'a.txt',
        }
        out: PlanItem = plan_item_wire(raw)
        assert out == {
            'name': 'a.txt',
            'category': 'documents',
            'action': 'ok',
            'final_name': 'a.txt',
        }
        assert 'source' not in out
        assert 'final_dest' not in out
        assert _roundtrip(out) == out


class TestStateContract:
    def test_app_state_shape_roundtrips(self):
        state: AppState = {
            'version': '4.3.0',
            'categories': {'images': ['.jpg'], 'others': []},
            'categoryMeta': {
                'images': {'icon': '📸', 'nameEn': 'Images', 'nameFa': 'تصاویر'}
            },
            'recentFolders': ['C:/Photos'],
            'theme': 'dark',
            'language': 'fa',
        }
        assert _roundtrip(state) == state

    def test_sort_log_entry_shape_roundtrips(self):
        entry: SortLogEntry = {
            'action': ACTION_COPIED,
            'source': 'C:/in/a.txt',
            'final_dest': 'C:/in/sorted/docs/a.txt',
            'name': 'a.txt',
            'category': 'documents',
        }
        assert _roundtrip(entry) == entry


class TestConstants:
    def test_duplicate_modes(self):
        assert MODE_SKIP in protocol.DUPLICATE_MODES
        assert protocol.DUPLICATE_MODES == {'skip', 'rename', 'overwrite'}

    def test_event_flow_order(self):
        expected = ['total', 'item', 'progress', 'done']
        for kind in expected:
            assert kind in protocol.EVENT_KINDS


# ══════════════════════════════════════════════════════════════════
#  Event-kind coverage
#
#  Regression: EVENT_KINDS drifted behind the kinds the app actually
#  emits, so event_message() raised ValueError for clean_*/sched_* at the
#  wire boundary and the TypeScript mirror lost sched_run/sched_done.
# ══════════════════════════════════════════════════════════════════

# Every kind app/ can emit, by push_event / _push call site. Update this
# set (and EVENT_KINDS) together when a new event kind is introduced.
EMITTED_KINDS = {
    'total', 'item', 'progress', 'done', 'error',
    'watch_item', 'watch_error',
    'dup_progress', 'dup_done',
    'space_progress', 'space_done',
    'clean_progress', 'clean_done',
    'sched_run', 'sched_done',
}

TERMINAL_KINDS = {
    'done', 'error', 'dup_done', 'space_done', 'clean_done', 'sched_done',
}


class TestEventKindCoverage:
    def test_every_emitted_kind_is_declared(self):
        missing = EMITTED_KINDS - set(protocol.EVENT_KINDS)
        assert not missing, (
            f'emitted by the app but absent from EVENT_KINDS: {sorted(missing)}'
        )

    def test_event_message_accepts_every_emitted_kind(self):
        # event_message() validates against EVENT_KINDS, so an undeclared
        # kind is a hard failure at the boundary, not a silent no-op.
        for kind in sorted(EMITTED_KINDS):
            assert event_message(kind, {})['kind'] == kind

    def test_terminal_kinds_are_the_declared_terminal_set(self):
        assert protocol.TERMINAL_EVENT_KINDS == TERMINAL_KINDS
        assert TERMINAL_KINDS <= set(protocol.EVENT_KINDS)

    def test_terminal_kinds_flush_pending_rows_before_themselves(self):
        # A terminal frame must never be overtaken by buffered progress ticks
        # from the same run, or the UI closes the operation on stale counters.
        from app.api import COALESCE_FLUSH_BEFORE

        missing = TERMINAL_KINDS - COALESCE_FLUSH_BEFORE
        assert not missing, f'must flush buffered rows first: {sorted(missing)}'

    def test_typescript_mirror_declares_the_same_kinds(self):
        """The UI's EventKind set must match Python's exactly.

        Both sides validate against their own set, so a kind present on one
        side and missing on the other is invisible until it silently drops at
        runtime. Parses ui/src/protocol.ts deliberately: reformatting that
        block should fail loudly here rather than drift.
        """
        import re

        ts_path = (
            Path(__file__).resolve().parents[1] / 'ui' / 'src' / 'protocol.ts'
        )
        source = ts_path.read_text(encoding='utf-8')
        block = re.search(
            r'export const EVENT_KINDS[^=]*=\s*new Set\(\[(.*?)\]\)', source, re.S
        )
        assert block, 'could not find the EVENT_KINDS set in ui/src/protocol.ts'
        declared = set(re.findall(r"'([a-z_]+)'", block.group(1)))
        assert declared == set(protocol.EVENT_KINDS)

    def test_typescript_mirror_declares_the_same_terminal_kinds(self):
        import re

        ts_path = (
            Path(__file__).resolve().parents[1] / 'ui' / 'src' / 'protocol.ts'
        )
        source = ts_path.read_text(encoding='utf-8')
        block = re.search(
            r'export const TERMINAL_EVENT_KINDS[^=]*=\s*new Set\(\[(.*?)\]\)',
            source,
            re.S,
        )
        assert block, 'could not find TERMINAL_EVENT_KINDS in ui/src/protocol.ts'
        declared = set(re.findall(r"'([a-z_]+)'", block.group(1)))
        assert declared == set(protocol.TERMINAL_EVENT_KINDS)
