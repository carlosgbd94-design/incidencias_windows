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

MAX_BYTES = 300_000  # recorta el log si crece demasiado, en vez de borrarlo


def reiniciar() -> None:
    """Marca el inicio de una nueva sesión con un separador, SIN borrar
    sesiones anteriores -- el cuelgue que se está diagnosticando es
    intermitente, así que si el usuario mata una sesión colgada y vuelve a
    abrir la app, la corrida colgada debe seguir en el archivo, no perderse
    al pisarla con la siguiente. Si el archivo crece demasiado, se recorta
    por el principio (se conserva lo más reciente)."""
    try:
        ruta = get_data_dir() / "startup.log"
        if ruta.exists() and ruta.stat().st_size > MAX_BYTES:
            contenido = ruta.read_text(encoding="utf-8", errors="ignore")
            ruta.write_text(contenido[-MAX_BYTES:], encoding="utf-8")
        marca = datetime.datetime.now().isoformat(timespec="seconds")
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(f"\n===== NUEVA SESIÓN: {marca} =====\n")
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
