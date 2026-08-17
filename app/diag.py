"""Bitácora de arranque para diagnosticar cuelgues que no se pueden
reproducir en el entorno de desarrollo.

Deliberadamente NO depende de webview/JS ni de nada que pueda estar roto
durante el cuelgue que se quiere diagnosticar -- solo escribe líneas con
fecha/hora a un archivo de texto plano en disco. Si escribir el log mismo
falla por cualquier razón, se ignora en silencio: nunca debe ser la app
"otra cosa más que se puede romper".
"""
import datetime

from app.database import get_data_dir


def reiniciar() -> None:
    """Trunca el log al inicio de cada sesión, para que siempre refleje solo
    el arranque más reciente (más fácil de mandar/leer que un historial que
    crece para siempre)."""
    try:
        (get_data_dir() / "startup.log").write_text("", encoding="utf-8")
    except Exception:
        pass


def log(mensaje: str) -> None:
    try:
        ruta = get_data_dir() / "startup.log"
        linea = f"[{datetime.datetime.now().isoformat(timespec='milliseconds')}] {mensaje}\n"
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(linea)
    except Exception:
        pass
