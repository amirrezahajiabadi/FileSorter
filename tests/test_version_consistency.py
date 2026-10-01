"""The release version must have exactly one source of truth.

A version bump that misses one copy is the classic release bug: the exe says
one thing, the installer another, the About line a third. These tests run the
same checker the release workflow runs, and prove it actually detects drift.
"""

import importlib.util
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _load_tool():
    spec = importlib.util.spec_from_file_location(
        "check_version_consistency", ROOT / "tools" / "check_version_consistency.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


tool = _load_tool()


def test_every_copy_of_the_version_agrees():
    from app.constants import APP_VERSION

    assert tool.collect_mismatches(APP_VERSION) == []


def test_ci_command_passes_on_this_repo():
    assert tool.main([]) == 0


def test_drift_is_reported_for_every_copy():
    """A wrong APP_VERSION must name every file that needs editing."""
    joined = "\n".join(tool.collect_mismatches("9.9.9"))
    for expected in ("ui/package.json", "transport.ts", "installer.nsi", "strings.ts"):
        assert expected in joined, f"{expected} not reported as drifted"


def test_release_tag_must_match_the_app_version():
    from app.constants import APP_VERSION

    assert tool.check_tag(f"v{APP_VERSION}", APP_VERSION) == []
    assert tool.check_tag(APP_VERSION, APP_VERSION) == []  # tag without the v
    problem = tool.check_tag("v0.0.1", APP_VERSION)
    assert problem and "0.0.1" in problem[0]
