"""Resolución de rutas de recursos (assets), válida tanto en desarrollo como
empaquetado con PyInstaller (--onefile), donde los archivos de datos se
extraen a una carpeta temporal referenciada por sys._MEIPASS.
"""
import sys
from pathlib import Path


def assets_dir() -> Path:
    if hasattr(sys, "_MEIPASS"):
        return Path(sys._MEIPASS) / "assets"
    return Path(__file__).resolve().parent.parent / "assets"
