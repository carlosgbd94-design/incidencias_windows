"""Punto de entrada de Control de Pases e Incidencias SESEQ.
Lanza la interfaz (HTML/CSS con vidrio esmerilado real) en una ventana nativa
vía pywebview, con el backend de Python expuesto como API a JavaScript.
"""
import json

import webview

from app.api import Api
from app.database import get_data_dir
from app.paths import assets_dir
from app import updater


def main():
    api = Api()
    web_dir = assets_dir().parent / "web"
    ventana = webview.create_window(
        "Control de Pases e Incidencias - SESEQ",
        url=str(web_dir / "index.html"),
        js_api=api,
        width=1180,
        height=820,
        min_size=(1000, 680),
        background_color="#EDF1FB",
    )
    api.window = ventana

    def _avisar_actualizacion_lista(version):
        mensaje = f"Nueva versión {version} descargada. Se instalará sola al cerrar la app."
        try:
            ventana.evaluate_js(f"window.Api && Api.mostrarToast({json.dumps(mensaje)}, 'success')")
        except Exception:
            pass  # la ventana pudo haberse cerrado ya; no es crítico

    # Revisa GitHub Releases en un hilo aparte (nunca bloquea el arranque) y,
    # si hay versión nueva, la descarga+verifica en silencio. La instalación
    # real solo ocurre al cerrar la ventana (ver events.closing abajo), nunca
    # a media sesión.
    updater.iniciar_revision_en_segundo_plano(al_terminar=_avisar_actualizacion_lista)
    ventana.events.closing += updater.instalar_al_cerrar

    icono = assets_dir() / "icon.ico"
    # private_mode=False: reutiliza el perfil de WebView2 entre ejecuciones
    # (con private_mode=True, Windows tenía que crear un entorno WebView2
    # nuevo en cada arranque -> ventana lenta en abrir).
    #
    # storage_path explícito: sin esto, pywebview guarda el perfil en
    # %APPDATA%\pywebview (carpeta "roaming"). En un equipo de dependencia de
    # gobierno con perfil de usuario itinerante, %APPDATA% puede vivir en un
    # recurso de red, y el perfil de WebView2 (muchos archivos pequeños tipo
    # Chromium) es extremadamente lento sobre SMB/red -> cuelga por completo
    # la creación del entorno WebView2 ("no responde"). %LOCALAPPDATA% (donde
    # ya vive la base de datos, ver app/database.py) nunca se itinera, así
    # que forzamos ahí el perfil para garantizar disco local.
    webview.start(
        icon=str(icono) if icono.exists() else None,
        private_mode=False,
        storage_path=str(get_data_dir() / "webview2_cache"),
    )


if __name__ == "__main__":
    main()
