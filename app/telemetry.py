"""Recolección de errores (Sentry) de todas las instalaciones de la app.

Igual que app/updater.py, esto debe ser totalmente inofensivo si algo falla:
sin internet, sin DSN configurado, con sentry_sdk roto o lo que sea, la app
tiene que funcionar exactamente igual que si este módulo no existiera. Nunca
debe lanzar una excepción hacia quien lo llama ni bloquear el arranque (el
envío real ocurre en un hilo de fondo propio del SDK, nunca en el hilo
principal).

IMPORTANTE - qué SÍ captura y qué NO: esto reporta excepciones de Python no
manejadas (bugs reales, tanto en el arranque como en cualquier método de
Api). NO puede reportar un cuelgue/congelamiento (la ventana "no responde"
sin que salte ninguna excepción) porque ahí no hay ningún error de Python que
capturar -- para eso sigue siendo la bitácora de arranque en disco
(app/diag.py) la herramienta, ya que se escribe paso a paso y sobrevive
aunque el proceso termine matado desde el Administrador de tareas.

DSN: se obtiene gratis creando un proyecto en https://sentry.io (tipo
"Python"). El DSN de un cliente está pensado para ir embebido en la app que
se distribuye -- no es un secreto como una contraseña, solo identifica a
dónde mandar los reportes.
"""
import sentry_sdk

from app.database import get_data_dir
from app.version import APP_VERSION

# TODO: reemplazar con el DSN real del proyecto en sentry.io. Mientras esté
# vacío, iniciar() no hace nada y la app se comporta como si esto no existiera.
SENTRY_DSN = ""

_activo = False


def iniciar() -> None:
    """Debe llamarse una sola vez, al principio de main(), antes de crear la
    ventana -- así también quedan cubiertas las excepciones del arranque."""
    global _activo
    if not SENTRY_DSN:
        return
    try:
        sentry_sdk.init(
            dsn=SENTRY_DSN,
            release=f"control-pases-seseq@{APP_VERSION}",
            # Sin integraciones automáticas: esto no es una app web/Flask/Django,
            # solo se reportan las excepciones que se capturan explícitamente
            # (ver reportar() abajo), así que no hace falta que el SDK intente
            # detectar frameworks que no están instalados.
            default_integrations=False,
            integrations=[],
            send_default_pii=False,
        )
        _activo = True
    except Exception:
        _activo = False


def establecer_usuario(perfil: dict | None) -> None:
    """Asocia los reportes de esta sesión con el trabajador de este equipo
    (un solo trabajador por instalación, ver perfil), para saber de quién es
    cada reporte sin tener que preguntar."""
    if not _activo or not perfil:
        return
    try:
        sentry_sdk.set_user({
            "id": (perfil.get("no_empleado") or "").strip() or "desconocido",
            "username": (perfil.get("nombre") or "").strip() or "desconocido",
        })
    except Exception:
        pass


def reportar_mensaje(mensaje: str, adjuntar_bitacora: bool = True) -> None:
    """Como reportar(), pero para errores que no llegan como excepción de
    Python (ej. errores de JS capturados en el frontend vía window.onerror /
    unhandledrejection, ver registrar_error_js en app/api.py)."""
    if not _activo:
        return
    try:
        with sentry_sdk.push_scope() as alcance:
            if adjuntar_bitacora:
                ruta_log = get_data_dir() / "startup.log"
                if ruta_log.exists():
                    alcance.add_attachment(path=str(ruta_log))
            sentry_sdk.capture_message(mensaje, level="error")
    except Exception:
        pass


def reportar(excepcion: BaseException, adjuntar_bitacora: bool = True) -> None:
    """Envía una excepción ya capturada. `adjuntar_bitacora` incluye el
    startup.log de esta sesión (ver app/diag.py) como adjunto del reporte --
    útil sobre todo para excepciones durante el arranque, para ver hasta qué
    paso se llegó antes de fallar."""
    if not _activo:
        return
    try:
        with sentry_sdk.push_scope() as alcance:
            if adjuntar_bitacora:
                ruta_log = get_data_dir() / "startup.log"
                if ruta_log.exists():
                    alcance.add_attachment(path=str(ruta_log))
            sentry_sdk.capture_exception(excepcion)
    except Exception:
        pass
