"""Unit tests for scripts/generate_theme_css.py — makes sure the generated
CSS custom properties always exactly match app/themes.py's THEMES dict,
so the two can never silently drift apart.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.generate_theme_css import generate_css, KEY_TO_CSS_VAR
from app.themes import THEMES


def _extract_vars(css: str, selector_pattern: str) -> dict:
    """Pull out {css_var: value} pairs from one CSS rule block in a
    generated stylesheet, for comparison against THEMES.
    """
    match = re.search(selector_pattern + r"\s*\{([^}]*)\}", css)
    assert match, f"selector {selector_pattern!r} not found in generated CSS"
    body = match.group(1)
    return dict(re.findall(r"(--[\w-]+):\s*([^;]+);", body))


def test_generated_css_has_both_theme_blocks():
    css = generate_css()
    assert ":root {" in css
    assert '[data-theme="dark"] {' in css


def test_light_theme_values_match_THEMES(tmp_path=None):
    css = generate_css()
    light_vars = _extract_vars(css, r":root")
    for key, css_var in KEY_TO_CSS_VAR.items():
        assert light_vars[css_var] == THEMES["light"][key], (
            f"{css_var} should be {THEMES['light'][key]}, got {light_vars[css_var]}"
        )


def test_dark_theme_values_match_THEMES():
    css = generate_css()
    dark_vars = _extract_vars(css, r'\[data-theme="dark"\]')
    for key, css_var in KEY_TO_CSS_VAR.items():
        assert dark_vars[css_var] == THEMES["dark"][key], (
            f"{css_var} should be {THEMES['dark'][key]}, got {dark_vars[css_var]}"
        )


def test_every_theme_key_has_a_css_var_mapping():
    # If someone adds a new key to THEMES without updating the generator,
    # this should fail loudly rather than silently omitting it from the CSS.
    for key in THEMES["light"]:
        assert key in KEY_TO_CSS_VAR, f"THEMES key {key!r} has no CSS var mapping"


def test_generate_css_is_deterministic():
    assert generate_css() == generate_css()
