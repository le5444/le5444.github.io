# -*- mode: python ; coding: utf-8 -*-

from pathlib import Path

project_root = Path(SPECPATH).resolve().parent

datas = [
    (str(project_root / "dist"), "dist"),
    (str(project_root / "bridge"), "bridge"),
    (str(project_root / "desktop"), "desktop"),
    (str(project_root / "打包织梦PersonalOS桌面版.cmd"), "."),
]

block_cipher = None

a = Analysis(
    [str(project_root / "desktop" / "zhimeng_desktop_launcher.py")],
    pathex=[str(project_root)],
    binaries=[],
    datas=datas,
    hiddenimports=[
        "argparse",
        "base64",
        "calendar",
        "concurrent.futures",
        "copy",
        "difflib",
        "email",
        "email.message",
        "email.parser",
        "email.policy",
        "fnmatch",
        "hashlib",
        "html",
        "html.parser",
        "http.client",
        "ipaddress",
        "json",
        "logging",
        "mimetypes",
        "queue",
        "re",
        "shutil",
        "socketserver",
        "subprocess",
        "tempfile",
        "textwrap",
        "threading",
        "urllib.error",
        "urllib.parse",
        "urllib.request",
        "uuid",
        "xml",
        "xml.etree.ElementTree",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["tkinter", "unittest", "email.test"],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)
pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="ZhimengPersonalOS",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name="ZhimengPersonalOS",
)
