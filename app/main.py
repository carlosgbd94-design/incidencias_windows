"""Punto de entrada de Control de Pases e Incidencias SESEQ.
Lanza la interfaz (HTML/CSS con vidrio esmerilado real) en una ventana nativa
vía pywebview, con el backend de Python expuesto como API a JavaScript.
"""
import json
import os
import threading

import webview

from app.api import Api
from app.database import get_data_dir, obtener_perfil
from app.paths import assets_dir
from app import diag, telemetry, updater
from app.version import APP_VERSION


def main():
    # Recolección de errores (Sentry): se inicia antes que cualquier otra
    # cosa para que un fallo durante el arranque mismo también quede
    # cubierto. No puede capturar un cuelgue (eso sigue siendo trabajo de la
    # bitácora de abajo), solo excepciones de Python -- ver app/telemetry.py.
    telemetry.iniciar()
    try:
        _ejecutar()
    except Exception as e:
        diag.log(f"main(): excepción no manejada -> {type(e).__name__}: {e}")
        telemetry.reportar(e)
        raise


def _ejecutar():
    # Bitácora de arranque: como el cuelgue reportado no se puede reproducir
    # en el entorno de desarrollo (sin sesión de escritorio real), este log
    # queda en %LOCALAPPDATA%\ControlPasesSESEQ\startup.log en la máquina
    # real y muestra hasta qué paso se llegó la última vez que se abrió la
    # app -- así ya no hay que adivinar dónde se atora.
    diag.reiniciar()
    diag.log("main() inicio")

    # Se revisó todo app/ y confirmado que el ÚNICO código propio que toca la
    # red es updater.py, y ya corre en un hilo de fondo aparte, disparado
    # hasta que la ventana ya está mostrada (ver más abajo) -- no puede ser
    # la causa de que la ventana nativa se marque "no responde" antes de
    # aparecer. El sospechoso real es WebView2/Chromium mismo: en un arranque
    # "en frío" intenta por su cuenta varias llamadas de red de fondo
    # (actualización de componentes, listas de Safe Browsing, "variations",
    # telemetría) que nada en este código controla. En una red corporativa
    # que descarta esos paquetes en silencio (en vez de rechazarlos), cada
    # una de esas llamadas agota su propio tiempo de espera (20-30s) antes de
    # rendirse -- varias de ellas sumadas explican perfectamente un arranque
    # que se "cuelga" un par de minutos y luego funciona solo. Esta variable
    # de entorno es el mecanismo oficial de Microsoft para desactivarlas sin
    # necesitar que pywebview exponga CoreWebView2EnvironmentOptions
    # directamente (pywebview 6.2.1 no lo expone). Debe fijarse antes de que
    # se cree el entorno de WebView2 (create_window()/webview.start() abajo).
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
        "--disable-background-networking --disable-component-update "
        "--disable-domain-reliability --disable-client-side-phishing-detection "
        "--disable-sync --no-first-run --no-pings --no-service-autorun"
    )
    diag.log("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS fijado (sin llamadas de red de fondo de Chromium)")

    # Autoreparación: si una sesión anterior dejó un instalador ya verificado
    # sin poder aplicarse (ej. la ventana se quedó "no responde" y alguien
    # tuvo que matar el proceso desde el Administrador de tareas, por lo que
    # el cierre nunca fue "limpio"), se lanza aquí, ANTES de crear la ventana
    # -- así una máquina atascada se autorepara sola la siguiente vez que se
    # abre la app, sin depender de un cierre exitoso.
    hubo_reparacion = updater.reparar_si_quedo_pendiente()
    diag.log(f"reparar_si_quedo_pendiente() -> {hubo_reparacion}")

    # Si la app se acaba de abrir con una versión distinta a la última
    # registrada, la actualización silenciosa sí se aplicó desde el cierre
    # anterior -- se avisa una vez con un toast (antes no había ninguna
    # confirmación de que la instalación en sí hubiera funcionado).
    version_anterior = updater.revisar_si_se_acaba_de_actualizar()

    api = Api()
    diag.log("Api() creada (conexión SQLite abierta)")
    try:
        telemetry.establecer_usuario(dict(obtener_perfil(api.conn)))
    except Exception:
        pass
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
    diag.log("create_window() devolvió (aún no se muestra ni se carga nada)")

    def _avisar_actualizacion_lista(version):
        # tipo 'update' (no 'success'): este aviso no se debe confundir con
        # un "guardado correctamente" cualquiera -- es la única notificación
        # visible de todo el flujo de auto-actualización, tiene que notarse.
        # Además del toast (que desaparece solo) se deja una insignia fija en
        # el pie del menú durante el resto de la sesión, para que no dependa
        # de haber visto el toast a tiempo.
        mensaje_toast = f"Nueva versión {version} lista. Se instalará sola al cerrar la app."
        mensaje_badge = f"Actualización {version} lista — se instala al cerrar"
        try:
            ventana.evaluate_js(f"window.Api && Api.mostrarToast({json.dumps(mensaje_toast)}, 'update')")
            ventana.evaluate_js(f"window.Api && Api.mostrarBadgeActualizacion({json.dumps(mensaje_badge)})")
        except Exception:
            pass  # la ventana pudo haberse cerrado ya; no es crítico

    def _avisar_si_se_actualizo():
        if not version_anterior:
            return
        mensaje = f"Se actualizó a la versión {APP_VERSION}."
        try:
            ventana.evaluate_js(f"window.Api && Api.mostrarToast({json.dumps(mensaje)}, 'update')")
        except Exception:
            pass

    def _iniciar_revision_diferida():
        # Se dispara solo hasta que la ventana ya está mostrada y respondiendo
        # (evento "shown"), no al arrancar -- así la revisión de red queda
        # totalmente desacoplada de la ruta crítica de apertura, incluso como
        # posibilidad remota de que contribuyera a un cuelgue.
        updater.iniciar_revision_en_segundo_plano(al_terminar=_avisar_actualizacion_lista)

    def _revisar_puente_js():
        # Se corre unos segundos después de "loaded", para distinguir si lo
        # que se atora es cargar la página (evento "loaded" nunca llega) o
        # específicamente el puente window.pywebview.api.* hacia Python
        # (la página carga bien, pero perfil_obtener nunca queda enlazado).
        try:
            resultado = ventana.evaluate_js(
                "JSON.stringify({"
                "  tiene_pywebview: !!(window.pywebview),"
                "  tiene_api: !!(window.pywebview && window.pywebview.api),"
                "  tiene_perfil_obtener: !!(window.pywebview && window.pywebview.api "
                "    && window.pywebview.api.perfil_obtener),"
                "})"
            )
            diag.log(f"chequeo del puente JS (a los ~4s de loaded): {resultado}")
        except Exception as e:
            diag.log(f"chequeo del puente JS FALLÓ (evaluate_js lanzó excepción): {e!r}")

    ventana.events.before_show += lambda: diag.log("evento before_show")
    ventana.events.shown += lambda: diag.log("evento shown (ventana nativa visible en pantalla)")
    ventana.events.loaded += lambda: diag.log("evento loaded (HTML/CSS/JS ya cargados en WebView2)")
    ventana.events.loaded += lambda: threading.Timer(4.0, _revisar_puente_js).start()
    ventana.events.shown += _iniciar_revision_diferida
    ventana.events.shown += _avisar_si_se_actualizo
    ventana.events.closing += lambda: diag.log("evento closing")
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
    diag.log("a punto de llamar webview.start()")
    webview.start(
        icon=str(icono) if icono.exists() else None,
        private_mode=False,
        storage_path=str(get_data_dir() / "webview2_cache"),
    )
    diag.log("webview.start() retornó (la ventana ya se cerró)")


if __name__ == "__main__":
    main()
