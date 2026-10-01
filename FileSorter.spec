# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller recipe for FileSorter — the single source of truth for packaging.

Build with:

    python -m PyInstaller --clean --noconfirm FileSorter.spec

The release workflow runs exactly this command, so the artefact that CI tests
is the artefact that ships. Nothing else may hand-roll a ``pyinstaller``
command line: the frozen build has a long tail of things that must stay in
sync (hidden imports, the bundled frontend, the icon, the version resource),
and a second copy of those decisions is a second place to get them wrong.

Why this shape:

* **onedir, not onefile.** A onefile build unpacks every bundled DLL into a
  temp directory on each launch — a visible pause before the window appears,
  repeated work Windows cannot cache, and a failure mode on locked-down
  machines where %TEMP% is restricted. A folder build starts like a native
  app and lets the loader page in only what the process touches.
* **UPX off.** Compressing the DLLs shrinks the download but costs
  decompression time on every start, and packed binaries are the single
  largest source of antivirus false positives in the PyInstaller ecosystem.
  A correct signature matters more here than a few megabytes.
* **optimize=2.** Ships bytecode with docstrings and asserts stripped: a
  smaller archive and less work at import time.
* **excludes.** Standard-library packages that neither the app, pywebview nor
  pythonnet import. Each entry is a potential hidden-import break, so the
  list stays short, is justified line by line, and is covered by the frozen
  smoke test (tools/smoke_test_build.py) that the release workflow runs.
* **Icon + version resource.** Both come from the app itself (assets/icon.ico
  and ``app.constants.APP_VERSION``), so a release never edits a version
  literal in this file.
"""

import sys
from pathlib import Path

from PyInstaller.utils.win32.versioninfo import (
    FixedFileInfo,
    StringFileInfo,
    StringStruct,
    StringTable,
    VarFileInfo,
    VarStruct,
    VSVersionInfo,
)

PROJECT_ROOT = Path(SPECPATH).resolve()

APP_NAME = "FileSorter"
PUBLISHER = "HajAmir"

# ── Version metadata: read from the app, never duplicated ──────────────
# The exe's "Details" tab, the uninstall entry, the About box and the
# installer all have to agree on the version, so the resource below is built
# from app/constants.APP_VERSION — the one line a release touches.
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from app.constants import APP_VERSION  # noqa: E402


def _version_quad(version: str) -> tuple:
    """'6.2.0' -> (6, 2, 0, 0): Windows wants a fixed four-field tuple."""
    parts = [int(p) for p in version.split(".") if p.isdigit()][:4]
    return tuple((parts + [0, 0, 0, 0])[:4])


FILE_VERSION = _version_quad(APP_VERSION)

VERSION_INFO = VSVersionInfo(
    ffi=FixedFileInfo(
        filevers=FILE_VERSION,
        prodvers=FILE_VERSION,
        mask=0x3F,     # all flag bits defined
        flags=0x0,     # release build (set VS_FF_DEBUG for dev builds)
        OS=0x40004,    # VOS_NT_WINDOWS32
        fileType=0x1,  # VFT_APP
        subtype=0x0,
        date=(0, 0),
    ),
    kids=[
        StringFileInfo([
            StringTable("040904B0", [  # 0x0409 en-US, 0x04B0 Unicode
                StringStruct("CompanyName", PUBLISHER),
                StringStruct("FileDescription", "File Sorter — automatic file organizer"),
                StringStruct("FileVersion", APP_VERSION),
                StringStruct("InternalName", APP_NAME),
                StringStruct("LegalCopyright", f"© {PUBLISHER}"),
                StringStruct("OriginalFilename", f"{APP_NAME}.exe"),
                StringStruct("ProductName", APP_NAME),
                StringStruct("ProductVersion", APP_VERSION),
            ]),
        ]),
        VarFileInfo([VarStruct("Translation", [1033, 1200])]),
    ],
)

# ── Icon ───────────────────────────────────────────────────────────────
# Generated from the app's own folder mark by tools/make_icon.py. It is a
# build input, so a missing file is a hard error rather than a silent
# default-icon build.
ICON_FILE = PROJECT_ROOT / "assets" / "icon.ico"
if not ICON_FILE.is_file():
    raise FileNotFoundError(
        f"missing {ICON_FILE} — regenerate it with: python tools/make_icon.py"
    )

# ── Excludes ───────────────────────────────────────────────────────────
# Anything dropped here must be unreachable from the app at runtime. Keep the
# list justified; the frozen smoke test is what proves it.
EXCLUDES = [
    # No Tk UI anywhere — the desktop app is pywebview + the bundled web app.
    "tkinter",
    # Doc/test helpers the app never imports (and we don't ship our tests).
    "unittest", "doctest", "pydoc_data", "test", "tests",
    # Legacy/stdlib demo packages.
    "lib2to3", "idlelib", "turtle", "turtledemo",
    # Settings are JSON (app/settings_manager.py); no embedded database.
    "sqlite3",
    # pywebview imports this lazily and only when started with ssl=True — it
    # even raises its own "SSL support requires cryptography package" if the
    # module is absent. FileSorter serves plain loopback HTTP, so the whole
    # OpenSSL stack (cryptography + libcrypto-3.dll + libssl-3.dll) is ~15 MB
    # of a ~35 MB build for a code path the app never takes. The smoke test is
    # what keeps this honest: it boots the frozen service and serves the UI.
    "cryptography",
    # Packaging tools: only needed while *building*, not at runtime.
    # ("distutils" and "PyInstaller" are deliberately absent: PyInstaller's
    # own hook-distutils aliases the module and dies if it is excluded.)
    "setuptools", "pip", "wheel",
    # Pillow is used by tools/make_icon.py (build time) and nothing else.
    "PIL", "numpy",
]

a = Analysis(
    ["main_web.py"],
    pathex=[PROJECT_ROOT],
    binaries=[],
    # The React build is served by the app at runtime, so it travels as data.
    datas=[(str(PROJECT_ROOT / "ui" / "dist"), "ui/dist")],
    # Listed explicitly because BaseApi/AppController wire them up
    # dynamically; a missed one only shows up as a broken frozen feature.
    hiddenimports=["app", "app.api", "app.autostart", "app.cleanup",
                   "app.constants", "app.controller", "app.disk_scan",
                   "app.duplicates", "app.i18n", "app.protocol",
                   "app.service", "app.settings_manager", "app.sorter",
                   "app.tasks", "app.tray", "app.watcher",
                   # pywebview picks its backend at runtime; on Windows the
                   # winforms backend pulls in edgechromium + mshtml itself.
                   "webview.platforms.winforms",
                   "webview.platforms.edgechromium",
                   "webview.platforms.mshtml"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=EXCLUDES,
    noarchive=False,
    optimize=2,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,   # onedir: binaries are collected beside the exe
    name=APP_NAME,
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,               # see module docstring
    console=False,
    # A crashing packaged app should say so instead of vanishing; the window
    # title bar is also where users can copy the traceback from.
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=[str(ICON_FILE)],
    version=VERSION_INFO,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name=APP_NAME,
)
