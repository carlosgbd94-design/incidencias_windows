# -*- mode: python ; coding: utf-8 -*-
# Proceso auxiliar de actualización (ver app/update_helper.py) -- build aparte
# del de la app principal (installer/app.spec) a propósito: NO debe arrastrar
# QtWebEngine (no lo usa), así que su Analysis tiene que partir de un entry
# point distinto para que PyInstaller no lo detecte como dependencia.
# Compilar desde cualquier carpeta con:
#   pyinstaller installer/app_helper.spec --distpath dist --workpath build
import os
PROJECT_DIR = os.path.abspath(os.path.join(SPECPATH, ".."))

a = Analysis(
    [os.path.join(PROJECT_DIR, "app", "update_helper.py")],
    pathex=[PROJECT_DIR],
    binaries=[],
    datas=[],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # El hook de PyInstaller para PySide6 arrastra TODO el ecosistema Qt
    # instalado (Qml/Quick, Network, Pdf, Svg, VirtualKeyboard...) aunque
    # este módulo solo use QtCore/QtGui/QtWidgets para pintar una tarjetita
    # con un spinner -- sin estos excludes el helper "ligero" pesaba lo mismo
    # que un PySide6 completo (~117MB), justo lo que se quería evitar al NO
    # usar QtWebEngine. numpy: ver la misma nota en installer/app.spec.
    excludes=[
        "numpy",
        "PySide6.QtQml", "PySide6.QtQuick", "PySide6.QtQuickWidgets",
        "PySide6.QtNetwork", "PySide6.QtPdf", "PySide6.QtSvg",
        "PySide6.QtVirtualKeyboard", "PySide6.QtOpenGL", "PySide6.Qt3DCore",
    ],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

# onedir, igual que la app principal (ver esa nota en app.spec): este .exe se
# copia entero fuera de la carpeta de instalación antes de correr (ver
# app/updater.py, _lanzar_con_ventana_de_progreso) así que --onefile
# re-extrayendo en cada uso sería trabajo doble sin ningún beneficio.
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ControlPasesSESEQ_UpdateHelper',
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
    name='ControlPasesSESEQ_UpdateHelper',
)
