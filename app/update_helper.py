"""Proceso auxiliar independiente para la instalación silenciosa de
actualizaciones -- ver app/updater.py para el porqué.

La app principal (QtWebEngine) tiene que cerrarse del todo antes de que el
instalador pueda reemplazar sus propios archivos, así que no hay forma de
que SU ventana se quede visible durante el tramo real de instalación. Este
proceso, deliberadamente separado y sin ninguna dependencia de la carpeta de
instalación que se está reemplazando, cubre exactamente ese tramo: espera a
que la app principal termine de cerrarse, corre el instalador, y se cierra
solo -- NO relanza la app él mismo: eso ya lo hace el propio instalador (ver
[Run]/InstalacionSilenciosa en installer/setup.iss, que corre siempre que el
instalador se ejecute con /VERYSILENT, sin importar quién lo haya lanzado).
Si este helper TAMBIÉN relanzara la app, quedarían dos instancias abiertas
a la vez.

A propósito NO usa QtWebEngine (solo QtWidgets): un motor Chromium completo
para mostrar una ventanita con un spinner sería un desperdicio y tardaría
varios segundos en arrancar -- justo el tiempo que se quiere evitar que se
sienta "colgado". Con solo QtWidgets arranca casi al instante.

El trabajo de fondo (esperar + correr el instalador) usa threading.Thread
normal, NO QThread -- se probó con QThread primero y el proceso se quedaba
colgado para siempre: QThread.started se dispara ANTES de que ese hilo
arranque su propio bucle de eventos (exec()), así que si el trabajo termina
rápido (como en cualquier corrida real, instalar toma segundos, no minutos),
la llamada a quit() puede llegar antes de que exista un bucle que la reciba,
y se pierde -- el hilo se queda corriendo exec() para siempre y con él todo
el proceso. QApplication.quit() en cambio SÍ es seguro de llamar desde
cualquier hilo (está documentado así en Qt), así que un hilo de Python
normal que lo llama directo al terminar evita todo ese problema.

Uso:
    ControlPasesSESEQ_UpdateHelper.exe --installer <ruta.exe> [--wait-pid <pid>]
"""
import argparse
import ctypes
import subprocess
import sys
import threading

from PySide6.QtCore import Qt, QTimer
from PySide6.QtGui import QColor, QPainter, QPen
from PySide6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget

from app import diag

_ACCENT = QColor("#0A84FF")
_FONDO = QColor(30, 30, 32, 240)
_TEXTO = QColor("#F2F2F7")
_SUBTEXTO = QColor("#98989F")
_TRACK = QColor(120, 120, 128, 70)

_PROCESS_SYNCHRONIZE = 0x00100000


def _esperar_a_que_termine(pid: int, timeout_seg: float = 15.0) -> None:
    """Bloquea hasta que el proceso `pid` (la app principal, ya cerrando)
    termine de verdad -- sin esto, el instalador podría toparse con archivos
    que ese proceso todavía tiene abiertos. Vía WinAPI directa (ctypes): el
    proyecto no depende de pywin32 ni psutil, y no vale la pena agregar esa
    dependencia solo para esto."""
    kernel32 = ctypes.windll.kernel32
    handle = kernel32.OpenProcess(_PROCESS_SYNCHRONIZE, False, pid)
    if not handle:
        return  # ya no existe -- nada que esperar
    try:
        kernel32.WaitForSingleObject(handle, int(timeout_seg * 1000))
    finally:
        kernel32.CloseHandle(handle)


def _trabajo_de_fondo(listo: threading.Event, ruta_instalador: str, pid_esperar: int | None) -> None:
    """Corre en un threading.Thread normal -- ver la nota del módulo sobre
    por qué NO es un QThread. Señaliza el fin con un threading.Event en vez
    de llamar app.quit() directo desde este hilo: se probó eso primero y
    resultó NO ser confiable (el bucle de eventos tardaba varios segundos de
    más en darse cuenta, a veces ni siquiera lo hacía) -- ver main(), que
    sondea este Event con un QTimer corriendo en el hilo principal, así el
    quit() real siempre se llama desde donde vive el bucle de eventos."""
    if pid_esperar:
        diag.log(f"update_helper: esperando a que termine pid={pid_esperar}")
        _esperar_a_que_termine(pid_esperar)
    try:
        diag.log(f"update_helper: corriendo instalador ({ruta_instalador})")
        # El instalador mismo reabre la app al terminar (ver
        # [Run]/InstalacionSilenciosa en installer/setup.iss) -- este helper
        # no lo hace por su cuenta para no abrir dos instancias.
        resultado = subprocess.run(
            [ruta_instalador, "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"],
            timeout=120,
        )
        diag.log(f"update_helper: instalador terminó, returncode={resultado.returncode}")
    except Exception as e:
        diag.log(f"update_helper: excepción corriendo el instalador -> {type(e).__name__}: {e}")
    listo.set()


class _VentanaActualizando(QWidget):
    """Tarjeta flotante, sin bordes, siempre visible -- mismo lenguaje visual
    que el resto de la app (acento azul, tarjeta oscura redondeada) aunque
    esté escrita con QtWidgets normal en vez del HTML/CSS del resto de la
    interfaz (ver el módulo: no puede depender de QtWebEngine)."""

    def __init__(self):
        super().__init__()
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.setFixedSize(300, 168)

        self._angulo = 0
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._girar)
        self._timer.start(16)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 76, 24, 22)
        layout.setSpacing(5)
        titulo = QLabel("Actualizando…")
        titulo.setAlignment(Qt.AlignCenter)
        titulo.setStyleSheet(f"color: {_TEXTO.name()}; font-size: 15px; font-weight: 700; background: transparent;")
        subtitulo = QLabel("Control de Pases e Incidencias SESEQ\nesto tomará solo un momento")
        subtitulo.setAlignment(Qt.AlignCenter)
        subtitulo.setWordWrap(True)
        subtitulo.setStyleSheet(f"color: {_SUBTEXTO.name()}; font-size: 11px; background: transparent;")
        layout.addWidget(titulo)
        layout.addWidget(subtitulo)

        pantalla = QApplication.primaryScreen().geometry()
        self.move(pantalla.center() - self.rect().center())

    def _girar(self):
        self._angulo = (self._angulo + 6) % 360
        self.update()

    def paintEvent(self, event):
        pintor = QPainter(self)
        pintor.setRenderHint(QPainter.Antialiasing)
        pintor.setPen(Qt.NoPen)
        pintor.setBrush(_FONDO)
        pintor.drawRoundedRect(self.rect(), 20, 20)

        cx, cy, radio = self.width() / 2, 42, 18
        pen_track = QPen(_TRACK, 3.5)
        pen_track.setCapStyle(Qt.RoundCap)
        pintor.setPen(pen_track)
        pintor.drawArc(int(cx - radio), int(cy - radio), int(radio * 2), int(radio * 2), 0, 360 * 16)

        pen_relleno = QPen(_ACCENT, 3.5)
        pen_relleno.setCapStyle(Qt.RoundCap)
        pintor.setPen(pen_relleno)
        pintor.drawArc(int(cx - radio), int(cy - radio), int(radio * 2), int(radio * 2), -self._angulo * 16, 100 * 16)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--installer", required=True)
    parser.add_argument("--wait-pid", type=int, default=None)
    args = parser.parse_args()

    diag.log(f"update_helper: iniciado (installer={args.installer!r}, wait_pid={args.wait_pid!r})")
    app = QApplication(sys.argv)
    ventana = _VentanaActualizando()
    ventana.show()
    # WindowStaysOnTopHint (puesto en el constructor) ya la pone por encima
    # de las demás ventanas, pero sin esto puede aparecer sin el foco real
    # (ej. detrás de la ventana que se acaba de cerrar, un instante nada más,
    # pero visible) -- raise_() + activateWindow() la fuerzan al frente desde
    # el primer cuadro.
    ventana.raise_()
    ventana.activateWindow()

    listo = threading.Event()
    threading.Thread(
        target=_trabajo_de_fondo, args=(listo, args.installer, args.wait_pid), daemon=True,
    ).start()

    verificador = QTimer()
    verificador.timeout.connect(lambda: app.quit() if listo.is_set() else None)
    verificador.start(100)

    app.exec()
    diag.log("update_helper: terminó")


if __name__ == "__main__":
    main()
