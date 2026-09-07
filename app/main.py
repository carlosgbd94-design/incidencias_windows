"""Punto de entrada de Control de Pases e Incidencias SESEQ -- migración de
motor: pywebview (WebView2 embebido vía pythonnet + WinForms + llamadas COM
cruzadas de hilo) reemplazado por Qt/PySide6 + QWebEngineView (motor
Chromium propio de Qt, sin pythonnet ni COM). El HTML/CSS/JS de la interfaz
NO cambia -- ver la memoria del proyecto para el diagnóstico completo (con
WinDbg sobre un volcado de memoria en vivo) del interbloqueo real que tenía
la arquitectura anterior: un hilo de WinForms esperando el GIL de Python
para atender un Timer, mientras un hilo de Python sostenía el GIL haciendo
una llamada COM cruzada de hilo hacia WebView2. Esa arquitectura completa
desaparece aquí -- QWebEngineView usa el bucle de eventos propio de Qt, sin
ningún puente .NET/COM que pueda formar ese mismo triángulo.
"""
import json
import os
import sys

# Debe fijarse ANTES de crear QApplication (que es cuando Qt inicializa el
# motor QtWebEngine) -- mismo espíritu que WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS
# tenía en la versión anterior: red de fondo, resolución de proxy/WPAD y
# DNS-over-HTTPS desactivados, ya que esta página es 100% archivos locales
# (file://) y jamás necesita salir a ninguna red por su cuenta.
#
# --disable-gpu* y --disable-software-rasterizer: en equipos con gráficos
# muy viejos y sin driver propio (ej. Intel Q45/Q43 Express de 2008, que
# Windows termina cubriendo con el driver genérico "Microsoft Basic Display
# Adapter" WDDM 1.1) el proceso de GPU de Chromium no logra inicializar y la
# ventana se queda en blanco para siempre -- nunca llega a dispararse
# loadFinished. Forzar render por software evita depender de esa GPU.
os.environ["QTWEBENGINE_CHROMIUM_FLAGS"] = (
    "--disable-background-networking --disable-component-update "
    "--disable-domain-reliability --disable-client-side-phishing-detection "
    "--disable-sync --no-first-run --no-pings --no-service-autorun "
    "--no-proxy-server --disable-features=DnsOverHttps,DnsOverHttpsUpgrade --dns-over-https-mode=off "
    "--disable-gpu --disable-gpu-compositing --disable-software-rasterizer"
)
os.environ.setdefault("QT_OPENGL", "software")

from PySide6.QtCore import QTimer, QUrl
from PySide6.QtGui import QIcon
from PySide6.QtWebChannel import QWebChannel
from PySide6.QtWebEngineCore import QWebEnginePage, QWebEngineProfile
from PySide6.QtWebEngineWidgets import QWebEngineView
from PySide6.QtWidgets import QApplication, QMainWindow

from app import diag, telemetry, updater
from app.backend import Backend
from app.database import get_data_dir, obtener_perfil
from app.paths import assets_dir
from app.version import APP_VERSION
from app.webchannel_bridge import Puente

_ANCHO_POR_DEFECTO, _ALTO_POR_DEFECTO = 1180, 820
_ANCHO_MINIMO, _ALTO_MINIMO = 1000, 680


def _leer_geometria_ventana() -> tuple[int, int, bool]:
    try:
        datos = json.loads((get_data_dir() / "ventana.json").read_text(encoding="utf-8"))
        ancho = max(int(datos.get("width", _ANCHO_POR_DEFECTO)), _ANCHO_MINIMO)
        alto = max(int(datos.get("height", _ALTO_POR_DEFECTO)), _ALTO_MINIMO)
        return ancho, alto, bool(datos.get("maximized", False))
    except Exception:
        return _ANCHO_POR_DEFECTO, _ALTO_POR_DEFECTO, False


def _transparencia_habilitada_en_windows() -> bool:
    """"Efectos de transparencia" de Windows -- se respeta en vez de forzar
    el blur igual, igual que en la versión anterior."""
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


class MainWindow(QMainWindow):
    """Solo la mecánica de la ventana (geometría, ícono, vista web, puente)
    -- el flujo de arranque (bitácora, actualizaciones) vive en _ejecutar(),
    igual que en la versión pywebview, para poder comparar ambos archivos
    lado a lado sin que la reestructuración esconda ningún paso."""

    def __init__(self, backend: Backend):
        super().__init__()
        self.setWindowTitle("Control de Pases e Incidencias - SESEQ")
        icono = assets_dir() / "icon.ico"
        if icono.exists():
            self.setWindowIcon(QIcon(str(icono)))

        ancho, alto, self.maximizada_al_iniciar = _leer_geometria_ventana()
        self.resize(ancho, alto)
        self.setMinimumSize(_ANCHO_MINIMO, _ALTO_MINIMO)
        self._maximizada = self.maximizada_al_iniciar
        self._ultimo_tamano = (ancho, alto)
        # Ver closeEvent(): permite mostrar la transición de "cerrando para
        # actualizar" antes de dejar que el cierre siga su curso de verdad,
        # en vez de que la ventana desaparezca de golpe sin avisar nada.
        self._cierre_confirmado = False

        # Perfil propio con rutas en %LOCALAPPDATA% (no %APPDATA% itinerante)
        # -- mismo motivo que storage_path tenía en la versión pywebview: un
        # perfil de usuario itinerante puede vivir en un recurso de red, y el
        # caché de un motor Chromium sobre SMB es extremadamente lento.
        self._perfil = QWebEngineProfile("ControlPasesSESEQ", self)
        cache_dir = get_data_dir() / "webengine_cache"
        self._perfil.setCachePath(str(cache_dir))
        self._perfil.setPersistentStoragePath(str(cache_dir / "storage"))

        self.vista = QWebEngineView(self)
        self.pagina = QWebEnginePage(self._perfil, self.vista)
        self.vista.setPage(self.pagina)
        self.setCentralWidget(self.vista)

        self._canal = QWebChannel(self.pagina)
        self._puente = Puente(backend)
        self._canal.registerObject("puente", self._puente)
        self.pagina.setWebChannel(self._canal)

        backend.cierre_solicitado.connect(self.close)

    def cargar_pagina(self):
        web_dir = assets_dir().parent / "web"
        self.vista.load(QUrl.fromLocalFile(str(web_dir / "index.html")))

    def mostrar_toast(self, mensaje: str, tipo: str = "success"):
        js = f"window.Api && Api.mostrarToast({json.dumps(mensaje)}, {json.dumps(tipo)})"
        self.pagina.runJavaScript(js)

    def mostrar_dialogo_actualizacion(self, version: str):
        js = f"window.Api && Api.mostrarDialogoActualizacion({json.dumps(version)})"
        self.pagina.runJavaScript(js)

    def mostrar_progreso_actualizacion(self, mensaje: str | None = None):
        js = f"window.Api && Api.mostrarProgresoActualizacion({json.dumps(mensaje)})"
        self.pagina.runJavaScript(js)

    def aplicar_preferencia_transparencia(self):
        self.pagina.runJavaScript('document.documentElement.dataset.transparencia = "off"')

    def resizeEvent(self, event):
        super().resizeEvent(event)
        if not self.isMaximized():
            self._ultimo_tamano = (self.width(), self.height())

    def changeEvent(self, event):
        super().changeEvent(event)
        if event.type() == event.Type.WindowStateChange:
            self._maximizada = self.isMaximized()

    def guardar_geometria(self):
        try:
            datos = {
                "maximized": self._maximizada,
                "width": self._ultimo_tamano[0],
                "height": self._ultimo_tamano[1],
            }
            (get_data_dir() / "ventana.json").write_text(json.dumps(datos), encoding="utf-8")
        except Exception:
            pass

    def closeEvent(self, event):
        # Si hay una actualización ya verificada y lista, el cierre real se
        # pospone una fracción de segundo para que la pantalla de "cerrando
        # para actualizar" (ver web/css/glass.css .update-overlay) alcance a
        # pintarse antes de que la ventana desaparezca de verdad -- así el
        # usuario ve la transición en vez de que la app simplemente se
        # esfume sin explicación, sea que haya llegado aquí por el botón
        # "Instalar ahora" del diálogo o por cerrar la ventana normal con una
        # actualización pendiente ("Después" en el diálogo, ver api.js).
        # _cierre_confirmado evita un bucle infinito: la segunda vuelta por
        # aquí (disparada por el QTimer) sí debe seguir su curso.
        if not self._cierre_confirmado and updater.hay_actualizacion_lista():
            event.ignore()
            self._cierre_confirmado = True
            self.mostrar_progreso_actualizacion("Cerrando para actualizar…")
            QTimer.singleShot(750, self.close)
            return
        diag.log("evento closing")
        self.guardar_geometria()
        updater.instalar_al_cerrar()
        super().closeEvent(event)


def main():
    telemetry.iniciar()
    try:
        _ejecutar()
    except Exception as e:
        diag.log(f"main(): excepción no manejada -> {type(e).__name__}: {e}")
        telemetry.reportar(e)
        raise


def _ejecutar():
    diag.reiniciar()
    diag.log("main() inicio")

    hubo_reparacion = updater.reparar_si_quedo_pendiente()
    diag.log(f"reparar_si_quedo_pendiente() -> {hubo_reparacion}")
    version_anterior = updater.revisar_si_se_acaba_de_actualizar()

    transparencia_ok = _transparencia_habilitada_en_windows()
    diag.log(f"Efectos de transparencia de Windows habilitados: {transparencia_ok}")

    app = QApplication(sys.argv)

    backend = Backend()
    diag.log("Backend creado (conexión SQLite abierta)")
    try:
        telemetry.establecer_usuario(dict(obtener_perfil(backend.conn)))
    except Exception:
        pass

    ventana = MainWindow(backend)
    backend.ventana_padre = ventana
    diag.log("MainWindow creada (aún no se muestra ni se carga nada)")

    def _avisar_actualizacion_lista(version):
        ventana.mostrar_dialogo_actualizacion(version)

    def _avisar_si_se_actualizo():
        if not version_anterior:
            return
        ventana.mostrar_toast(f"Se actualizó a la versión {APP_VERSION}.", "update")

    def _iniciar_revision_diferida():
        updater.iniciar_revision_en_segundo_plano(al_terminar=_avisar_actualizacion_lista)

    def _al_cargar(ok: bool):
        diag.log(f"evento loaded (HTML/CSS/JS ya cargados en QtWebEngine) -> ok={ok}")
        if not transparencia_ok:
            ventana.aplicar_preferencia_transparencia()
        _avisar_si_se_actualizo()

    ventana.pagina.loadFinished.connect(_al_cargar)
    ventana.cargar_pagina()

    if ventana.maximizada_al_iniciar:
        ventana.showMaximized()
    else:
        ventana.show()
    diag.log("evento shown (ventana visible)")

    _iniciar_revision_diferida()

    diag.log("a punto de iniciar el bucle de eventos de Qt")
    app.exec()
    diag.log("bucle de eventos de Qt terminó (la ventana ya se cerró)")


if __name__ == "__main__":
    main()
