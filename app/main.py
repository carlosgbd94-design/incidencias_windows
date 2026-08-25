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

_ANCHO_POR_DEFECTO, _ALTO_POR_DEFECTO = 1180, 820


def _leer_geometria_ventana() -> tuple[int, int, bool]:
    try:
        datos = json.loads((get_data_dir() / "ventana.json").read_text(encoding="utf-8"))
        ancho = max(int(datos.get("width", _ANCHO_POR_DEFECTO)), 1000)
        alto = max(int(datos.get("height", _ALTO_POR_DEFECTO)), 680)
        return ancho, alto, bool(datos.get("maximized", False))
    except Exception:
        return _ANCHO_POR_DEFECTO, _ALTO_POR_DEFECTO, False


def _transparencia_habilitada_en_windows() -> bool:
    """"Efectos de transparencia" de Windows (Configuración > Personalización
    > Colores) -- si el usuario o su área de sistemas ya lo apagó (típico en
    equipos con GPU débil, para aliviar el compositor de toda la interfaz de
    Windows), el vidrio esmerilado real (backdrop-filter) de esta app es
    justo el tipo de efecto que esa opción existe para evitar. Se respeta en
    vez de forzar el blur igual -- ver [data-transparencia="off"] en
    web/css/tokens.css. Si no se puede leer el registro por lo que sea, se
    asume que sí está habilitada (comportamiento actual, sin cambios)."""
    try:
        import winreg
        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize",
        ) as clave:
            valor, _ = winreg.QueryValueEx(clave, "EnableTransparency")
            return bool(valor)
    except Exception:
        return True


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

    # pywebview inyecta su propio puente JS (webview/js/*.js: api.js,
    # customize.js, finish.js, state.js, lib/dom_json.js, lib/polyfill.js --
    # 6 archivos, código de la librería, no nuestro) leyéndolos de disco de
    # forma SÍNCRONA sobre el hilo principal de la ventana, dentro de
    # on_navigation_completed -- justo en el mismo hueco entre "shown" y
    # "loaded" donde el startup.log confirmó el cuelgue real. No se puede
    # reducir cuántos archivos son (es código de pywebview, no se edita),
    # pero si el retraso es un antivirus escaneando cada archivo leído, se
    # puede "precalentarlos" antes en un hilo de fondo -- así ya deberían
    # estar recién escaneados y en caché para cuando WebView2 los lea de
    # verdad, de forma síncrona, unos segundos después.
    def _precalentar_js_de_pywebview():
        try:
            import glob
            from webview.util import get_js_dir
            for ruta in glob.glob(os.path.join(get_js_dir(), "**", "*.js"), recursive=True):
                with open(ruta, "rb") as f:
                    f.read()
            diag.log("precalentamiento de JS interno de pywebview: completo")
        except Exception as e:
            diag.log(f"precalentamiento de JS interno de pywebview: FALLÓ ({e!r}), se ignora")

    threading.Thread(target=_precalentar_js_de_pywebview, daemon=True).start()

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
    # --no-proxy-server: nuevo 2026-08-25, tras ver un cuelgue reproducido en
    # una máquina que el propio usuario describe como "no tan lenta" -- eso
    # descarta que sea solo hardware viejo/GPU débil. Cuando Windows tiene
    # activado "Detectar automáticamente la configuración" de proxy (WPAD,
    # muy común como ajuste por defecto en redes corporativas/de gobierno),
    # Chromium intenta resolverlo por su cuenta al inicializar su red --
    # si esa red no responde limpio a la búsqueda WPAD, la resolución puede
    # tardar muchos segundos o colgarse, independientemente de qué tan rápida
    # sea la máquina. Nuestra página es 100% archivos locales (file://), así
    # que no necesita NINGÚN proxy para cargar -- desactivarlo por completo
    # para WebView2 es seguro y elimina esta posibilidad de raíz. No se toca
    # el proxy de updater.py (si lo tuviera) porque ESE sí necesita salir a
    # internet de verdad (GitHub) y podría depender de un proxy real.
    os.environ["WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS"] = (
        "--disable-background-networking --disable-component-update "
        "--disable-domain-reliability --disable-client-side-phishing-detection "
        "--disable-sync --no-first-run --no-pings --no-service-autorun "
        "--no-proxy-server"
    )
    diag.log("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS fijado (sin red de fondo ni resolución de proxy/WPAD)")

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

    transparencia_ok = _transparencia_habilitada_en_windows()
    diag.log(f"Efectos de transparencia de Windows habilitados: {transparencia_ok}")

    api = Api()
    diag.log("Api() creada (conexión SQLite abierta)")
    try:
        telemetry.establecer_usuario(dict(obtener_perfil(api.conn)))
    except Exception:
        pass

    ancho_guardado, alto_guardado, maximizada_guardada = _leer_geometria_ventana()
    web_dir = assets_dir().parent / "web"
    ventana = webview.create_window(
        "Control de Pases e Incidencias - SESEQ",
        url=str(web_dir / "index.html"),
        js_api=api,
        width=ancho_guardado,
        height=alto_guardado,
        maximized=maximizada_guardada,
        min_size=(1000, 680),
        background_color="#EDF1FB",
    )
    api.window = ventana
    diag.log("create_window() devolvió (aún no se muestra ni se carga nada)")

    # Recordar tamaño/estado de la ventana entre sesiones -- lo mínimo que se
    # espera de cualquier programa de Windows hecho con cuidado, y no lo
    # traía. No se guarda x/y (posición): con varios monitores, un monitor
    # desconectado entre sesiones dejaría la ventana fuera de pantalla.
    # _ultimo_tamano se actualiza solo mientras NO está maximizada (vía el
    # evento resized) para no perder el tamaño real si el usuario redimensiona
    # y luego maximiza antes de cerrar -- guardar el tamaño maximizado como si
    # fuera el "restaurado" reabriría la ventana gigante la próxima vez.
    _estado_ventana = {"maximizada": maximizada_guardada}
    _ultimo_tamano = {"width": ancho_guardado, "height": alto_guardado}

    def _en_resized():
        if not _estado_ventana["maximizada"]:
            try:
                _ultimo_tamano["width"], _ultimo_tamano["height"] = ventana.width, ventana.height
            except Exception:
                pass

    ventana.events.maximized += lambda: _estado_ventana.__setitem__("maximizada", True)
    ventana.events.restored += lambda: _estado_ventana.__setitem__("maximizada", False)
    ventana.events.resized += _en_resized

    def _guardar_geometria_ventana():
        try:
            datos = {
                "maximized": _estado_ventana["maximizada"],
                "width": _ultimo_tamano["width"],
                "height": _ultimo_tamano["height"],
            }
            (get_data_dir() / "ventana.json").write_text(json.dumps(datos), encoding="utf-8")
        except Exception:
            pass

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

    def _aplicar_preferencia_transparencia():
        if transparencia_ok:
            return  # ya es el valor por defecto del CSS, no hace falta tocar nada
        try:
            ventana.evaluate_js('document.documentElement.dataset.transparencia = "off"')
        except Exception:
            pass

    ventana.events.before_show += lambda: diag.log("evento before_show")
    ventana.events.shown += lambda: diag.log("evento shown (ventana nativa visible en pantalla)")
    ventana.events.loaded += lambda: diag.log("evento loaded (HTML/CSS/JS ya cargados en WebView2)")
    ventana.events.loaded += _aplicar_preferencia_transparencia
    ventana.events.loaded += lambda: threading.Timer(4.0, _revisar_puente_js).start()
    ventana.events.shown += _iniciar_revision_diferida
    ventana.events.shown += _avisar_si_se_actualizo
    ventana.events.closing += lambda: diag.log("evento closing")
    ventana.events.closing += _guardar_geometria_ventana
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
