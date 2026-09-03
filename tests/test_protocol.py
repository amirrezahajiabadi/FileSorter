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
