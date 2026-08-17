"""Punto de entrada de Control de Pases e Incidencias SESEQ.
Lanza la interfaz (HTML/CSS con vidrio esmerilado real) en una ventana nativa
vía pywebview, con el backend de Python expuesto como API a JavaScript.
"""
import webview

from app.api import Api
from app.database import get_data_dir
from app.paths import assets_dir


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
