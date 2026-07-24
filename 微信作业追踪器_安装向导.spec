# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['installer.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('server.py', '.'),
        ('ai_classifier.py', '.'),
        ('restart_helper.py', '.'),
        ('dashboard.html', '.'),
        ('dashboard_modern.html', '.'),
        ('static/classic.css', 'static'),
        ('static/classic.js', 'static'),
        ('static/modern.css', 'static'),
        ('static/modern.js', 'static'),
        ('pack.py', '.'),
        ('repair_update.py', '.'),
        ('requirements.txt', '.'),
        ('repair_update.bat', '.'),
        ('更新修复工具.bat', '.'),
        ('start.sh', '.'),
    ],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='作业追踪器v0.1.1',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
