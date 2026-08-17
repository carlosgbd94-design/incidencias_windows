# -*- mode: python ; coding: utf-8 -*-
# Compilar desde cualquier carpeta con:
#   pyinstaller installer/app.spec --distpath dist --workpath build
import os
PROJECT_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(PROJECT_DIR, "app", "main.py")],
    pathex=[PROJECT_DIR],
    binaries=[],
    datas=[
        (os.path.join(PROJECT_DIR, "assets"), "assets"),
        (os.path.join(PROJECT_DIR, "web"), "web"),
    ],
    hiddenimports=["webview.platforms.edgechromium", "webview.platforms.winforms", "clr_loader"],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # numpy: PyInstaller lo detecta como dependencia transitiva opcional de
    # Pillow, pero nada en app/ lo importa nunca en tiempo de ejecución
    # (confirmado: sys.modules no lo tiene tras importar toda la app). Son
    # ~7MB de DLLs muertas que además un antivirus corporativo escanea en la
    # primera instalación sin motivo.
    excludes=["numpy"],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

# onedir (no --onefile): --onefile re-extrae TODOS los binarios (incluye
# python313.dll, numpy, WebView2 nativo, etc.) a una carpeta temporal nueva
# en cada arranque, y un antivirus corporativo (típico en equipos de
# dependencia de gobierno) vuelve a escanear esos archivos "nuevos" cada vez
# -> arranque lento / app "no responde" durante ese escaneo. Con onedir los
# archivos quedan extraídos una sola vez en la carpeta de instalación; solo
# se escanean la primera vez.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ControlPasesSESEQ',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=os.path.join(PROJECT_DIR, "assets", "icon.ico"),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ControlPasesSESEQ',
)
