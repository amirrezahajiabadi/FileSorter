"""Generate assets/icon.ico — the application icon used by the .exe, the
installer and the shortcuts.

The mark is the app's own logo (the folder + plus from the UI's header) drawn
in the current brand accent, so the icon and the product stay visually
identical without shipping a designer file nobody can regenerate.

Run it only when the artwork or the brand colour changes:

    pip install pillow          # dev-only, not a runtime or build dependency
    python tools/make_icon.py

Outputs:
    assets/icon.ico          7 sizes, 16 -> 256 px (what Windows uses)
    assets/icon.png          256 px, handy for docs/store listings
    assets/icon_preview.png  contact sheet for eyeballing small sizes
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

# Mirrors ui/src/index.css (--accent: #6366f1 and its hover/active shades).
ACCENT_TOP = (129, 140, 248)   # #818cf8  (dark-theme accent)
ACCENT_BOTTOM = (79, 70, 229)  # #4f46e5  (active shade)
PLUS_IN_TILE = (88, 84, 226)   # sampled mid-gradient: reads as a punched-out plus

SIZES = (16, 24, 32, 48, 64, 128, 256)
MASTER = 1024
# Sizes the mark is tuned against; the contact sheet renders every one of
# SIZES so the smallest raster can be judged honestly.
CHECK_SIZES = (16, 24, 32, 48)

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets"


def gradient_tile(size: int) -> Image.Image:
    """A rounded-square tile filled with the accent gradient."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    strip = Image.new("RGBA", (1, size))
    for y in range(size):
        t = y / max(size - 1, 1)
        strip.putpixel(
            (0, y),
            tuple(
                round(ACCENT_TOP[i] + (ACCENT_BOTTOM[i] - ACCENT_TOP[i]) * t)
                for i in range(3)
            )
            + (255,),
        )
    gradient = strip.resize((size, size))

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=int(0.22 * size), fill=255
    )
    img.paste(gradient, (0, 0), mask)
    return img


def draw_mark(img: Image.Image, size: int) -> None:
    """Draw the folder + plus mark, sized relative to `size`.

    Everything is proportional, so the 16 px rendering is the same drawing as
    the 256 px one and only the raster resolution differs.
    """
    draw = ImageDraw.Draw(img)
    width = 0.70 * size
    height = 0.49 * size
    left = (size - width) / 2
    top = (size - height) / 2 + 0.02 * size
    # The plus must stay readable at 16 px, where a proportional stroke would
    # round down to a hairline: floor it at two pixels so the notch survives
    # the downsample instead of smearing into the folder.
    stroke = max(2, round(0.033 * size))

    # Tab first, so the body's top edge overlaps it and they read as one shape.
    tab_w, tab_h = 0.40 * width, 0.26 * height
    draw.rounded_rectangle(
        [left + 0.06 * width, top - 0.12 * height, left + 0.06 * width + tab_w, top + 0.16 * height],
        radius=0.055 * size,
        fill=(255, 255, 255, 255),
    )
    # Body.
    draw.rounded_rectangle(
        [left, top + 0.06 * height, left + width, top + height],
        radius=0.085 * size,
        fill=(255, 255, 255, 255),
    )
    # The plus, in the tile's own colour, so it looks cut out of the folder.
    cx, cy = left + width / 2, top + 0.56 * height
    arm = 0.15 * width
    draw.line([cx - arm, cy, cx + arm, cy], fill=PLUS_IN_TILE + (255,), width=stroke)
    draw.line([cx, cy - arm, cx, cy + arm], fill=PLUS_IN_TILE + (255,), width=stroke)


def contact_sheet(master: Image.Image, path: Path) -> None:
    """Every size on light, dark and pale backgrounds, for a visual check."""
    pad, row_h = 16, 288
    sheet = Image.new(
        "RGBA", (sum(s + pad for s in SIZES) + pad, row_h * 3), (255, 255, 255, 255)
    )
    x = pad
    for size in SIZES:
        icon = master.resize((size, size), Image.LANCZOS)
        for row, bg in enumerate(
            [(255, 255, 255, 255), (32, 33, 40, 255), (240, 241, 245, 255)]
        ):
            tile = Image.new("RGBA", (size, size), bg)
            tile.alpha_composite(icon)
            sheet.paste(tile, (x, row * row_h + pad))
        x += size + pad
    sheet.convert("RGB").save(path)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    master = gradient_tile(MASTER)
    draw_mark(master, MASTER)

    ico = OUT_DIR / "icon.ico"
    master.save(ico, format="ICO", sizes=[(s, s) for s in SIZES])
    master.resize((256, 256), Image.LANCZOS).save(OUT_DIR / "icon.png")
    contact_sheet(master, OUT_DIR / "icon_preview.png")

    print(f"wrote {ico} ({', '.join(f'{s}px' for s in SIZES)})")


if __name__ == "__main__":
    main()
