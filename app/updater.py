"""Auto-actualización silenciosa vía GitHub Releases.

Al abrir la app, revisa en segundo plano (nunca bloquea el arranque) si hay
una versión más nueva publicada en GitHub. Si la hay, la descarga y verifica
su checksum SHA256 sin instalarla todavía; la instalación real ocurre en
silencio justo cuando el usuario cierra la ventana (patrón "Chrome/VSCode":
cero clics para el usuario, pero nunca interrumpe una sesión activa).

Cualquier fallo (sin internet, GitHub inalcanzable, límite de tasa, JSON
inesperado, checksum que no coincide, etc.) se ignora silenciosamente: la app
debe seguir funcionando exactamente igual que si este módulo no existiera.

IMPORTANTE - resiliencia ante cuelgues: si la ventana se queda "no responde"
(ej. por un problema de WebView2 en esa máquina en particular), el usuario
solo puede matar el proceso desde el Administrador de tareas -> el evento
"closing" de pywebview NUNCA se dispara en ese caso, así que instalar_al_cerrar()
nunca se llegaría a ejecutar y esa máquina quedaría atascada para siempre en
la versión rota, aunque ya exista una corregida. Por eso el estado "ya
verificado, listo para instalar" también se persiste en disco (no solo en
memoria): al iniciar, ANTES de crear la ventana, se revisa si ya había un
instalador verificado de una sesión anterior y, si lo hay, se lanza de una
vez -- así una máquina que se quedó colgada se autorepara la próxima vez que
alguien vuelva a abrir la app, sin depender de que el cierre haya sido
"limpio".
"""
import hashlib
import json
import os
import subprocess
import threading
import urllib.request

from app import diag
from app.database import get_data_dir
from app.version import APP_VERSION

REPO = "carlosgbd94-design/incidencias_windows"
API_LATEST = f"https://api.github.com/repos/{REPO}/releases/latest"
TIMEOUT_JSON = 6
TIMEOUT_DESCARGA = 60

_instalador_listo = {"ruta": None, "version": None}


def _archivo_marca():
    return get_data_dir() / "actualizaciones" / "listo.json"


def _guardar_marca(ruta_exe: str, version: str) -> None:
    try:
        _archivo_marca().write_text(
            json.dumps({"ruta": ruta_exe, "version": version}), encoding="utf-8"
        )
    except Exception:
        pass


def _leer_y_borrar_marca():
    marca = _archivo_marca()
    try:
        if not marca.exists():
            return None
        datos = json.loads(marca.read_text(encoding="utf-8"))
        marca.unlink(missing_ok=True)
        ruta = datos.get("ruta")
        if ruta and os.path.exists(ruta):
            return datos
        return None
    except Exception:
        return None


def _version_a_tupla(v: str) -> tuple:
    v = (v or "").strip().lstrip("vV")
    partes = []
    for p in v.split("."):
        try:
            partes.append(int(p))
        except ValueError:
            partes.append(0)
    return tuple(partes)


def _pedir_json(url: str) -> dict:
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "User-Agent": "ControlPasesSESEQ-updater",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT_JSON) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _descargar(url: str, destino) -> None:
    req = urllib.request.Request(url, headers={"User-Agent": "ControlPasesSESEQ-updater"})
    with urllib.request.urlopen(req, timeout=TIMEOUT_DESCARGA) as resp, open(destino, "wb") as f:
        while True:
            chunk = resp.read(65536)
            if not chunk:
                break
            f.write(chunk)


def _sha256_de(ruta) -> str:
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        while True:
            chunk = f.read(65536)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def _revisar_y_preparar(al_terminar=None) -> None:
    diag.log(f"updater: revisando actualizaciones (versión local instalada: {APP_VERSION})")
    try:
        release = _pedir_json(API_LATEST)
        version_remota = release.get("tag_name", "")
        diag.log(f"updater: GitHub respondió, última versión publicada = {version_remota!r}")
        if _version_a_tupla(version_remota) <= _version_a_tupla(APP_VERSION):
            diag.log("updater: ya está al día, no hay nada más nuevo -> no hace nada")
            return

        assets = {a["name"]: a["browser_download_url"] for a in release.get("assets", [])}
        exe_nombre = next((n for n in assets if n.lower().endswith("_setup.exe")), None)
        sha_nombre = next((n for n in assets if n.lower().endswith(".sha256")), None)
        diag.log(f"updater: assets del release = {list(assets.keys())} "
                  f"(exe encontrado: {exe_nombre!r}, sha encontrado: {sha_nombre!r})")
        if not exe_nombre or not sha_nombre:
            diag.log("updater: faltan assets esperados en el release -> aborta, no arriesga instalar sin verificar")
            return

        carpeta = get_data_dir() / "actualizaciones"
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta_exe = carpeta / exe_nombre
        ruta_sha = carpeta / sha_nombre

        diag.log(f"updater: descargando {sha_nombre}...")
        _descargar(assets[sha_nombre], ruta_sha)
        diag.log(f"updater: descargando {exe_nombre}...")
        _descargar(assets[exe_nombre], ruta_exe)
        diag.log("updater: descarga completa, verificando checksum...")

        esperado = ruta_sha.read_text(encoding="utf-8").strip().split()[0].lower()
        real = _sha256_de(ruta_exe)
        if real != esperado:
            diag.log(f"updater: CHECKSUM NO COINCIDE (esperado={esperado}, real={real}) -> descarta la descarga, no instala nada")
            ruta_exe.unlink(missing_ok=True)
            ruta_sha.unlink(missing_ok=True)
            return  # descarga corrupta o manipulada: NUNCA instalar esto

        diag.log(f"updater: checksum OK. Actualización {version_remota} lista para instalarse al cerrar la app")
        _instalador_listo["ruta"] = str(ruta_exe)
        _instalador_listo["version"] = version_remota
        _guardar_marca(str(ruta_exe), version_remota)
        if al_terminar:
            try:
                al_terminar(version_remota)
            except Exception:
                pass
    except Exception as e:
        diag.log(f"updater: FALLÓ la revisión ({type(e).__name__}: {e}) -> se ignora, se reintentará la próxima apertura")
        return


def iniciar_revision_en_segundo_plano(al_terminar=None) -> None:
    """Lanza la revisión en un hilo aparte para nunca demorar el arranque.

    `al_terminar(version)` (opcional) se invoca -desde ese mismo hilo de
    fondo- solo si se encontró, descargó y verificó una versión nueva.
    """
    threading.Thread(target=_revisar_y_preparar, args=(al_terminar,), daemon=True).start()


def hay_actualizacion_lista() -> dict | None:
    if _instalador_listo["ruta"]:
        return dict(_instalador_listo)
    return None


def _lanzar_instalador_silencioso(ruta: str) -> None:
    try:
        subprocess.Popen(
            # /SILENT (no /VERYSILENT): sin páginas del asistente ni clics
            # necesarios, pero SÍ muestra la ventanita de progreso de Inno
            # Setup -- el usuario pidió explícitamente poder ver que la
            # actualización se está instalando, en vez de que la app
            # simplemente desaparezca sin ninguna señal.
            [ruta, "/SILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/CLOSEAPPLICATIONS"],
            creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
            close_fds=True,
        )
    except Exception:
        pass


def instalar_al_cerrar() -> None:
    """Lanza el instalador ya verificado y sin esperar a que termine (la app
    está a punto de cerrarse). Se llama tanto desde el handler del evento de
    cierre de la ventana como desde el botón "Actualizar ahora" (ver
    Api.actualizar_ahora) -- por eso limpia _instalador_listo después de
    lanzarlo: si se llama dos veces (botón manual + el cierre normal que
    dispara igual, ya que el botón cierra la ventana) la segunda vez no debe
    relanzar el instalador otra vez.
    """
    ruta = _instalador_listo["ruta"]
    if not ruta:
        diag.log("updater: instalar_al_cerrar() llamado pero no hay nada listo -> no hace nada")
        return
    diag.log(f"updater: lanzando instalador ({ruta})")
    _lanzar_instalador_silencioso(ruta)
    _instalador_listo["ruta"] = None
    _instalador_listo["version"] = None


def _archivo_ultima_version():
    return get_data_dir() / "ultima_version_ejecutada.txt"


def revisar_si_se_acaba_de_actualizar() -> str | None:
    """Compara APP_VERSION con la última versión que se registró como
    ejecutada en esta máquina (queda escrita en disco en cada arranque).

    Si difieren y ya existía un registro previo (no es la primera vez que se
    abre la app), la actualización silenciosa se aplicó desde la última vez
    que se cerró -- devuelve la versión anterior para poder avisarle al
    usuario que sí se actualizó correctamente (antes no había ningún aviso
    de esto, solo el de "hay una nueva versión lista para instalar", que se
    ve una sola vez y no confirma que la instalación en sí haya funcionado).
    Devuelve None si es la primera ejecución o si la versión no cambió.
    """
    ruta = _archivo_ultima_version()
    anterior = None
    try:
        if ruta.exists():
            anterior = ruta.read_text(encoding="utf-8").strip() or None
    except Exception:
        anterior = None
    try:
        ruta.write_text(APP_VERSION, encoding="utf-8")
    except Exception:
        pass
    if anterior and anterior != APP_VERSION:
        diag.log(f"updater: versión ejecutada ({APP_VERSION}) distinta a la última registrada "
                  f"({anterior}) -> la actualización silenciosa sí se aplicó")
        return anterior
    return None


def reparar_si_quedo_pendiente() -> bool:
    """Debe llamarse UNA vez, al inicio de main(), antes de crear la ventana.

    Si una sesión anterior dejó un instalador ya verificado pero nunca se
    pudo aplicar (p.ej. la ventana se quedó "no responde" y el usuario tuvo
    que matar el proceso desde el Administrador de tareas, así que el evento
    de cierre nunca se disparó), lo lanza de inmediato. Devuelve True si se
    lanzó algo -- el llamador puede decidir seguir abriendo la ventana igual
    (el instalador se encarga de cerrarla cuando esté listo para reemplazar
    los archivos).
    """
    datos = _leer_y_borrar_marca()
    if not datos:
        diag.log("updater: reparar_si_quedo_pendiente() -> no había ninguna marca pendiente de una sesión anterior")
        return False
    diag.log(f"updater: había una actualización verificada de una sesión anterior ({datos.get('version')}) "
              f"que nunca se pudo aplicar -> se lanza ahora, antes de abrir la ventana")
    _lanzar_instalador_silencioso(datos["ruta"])
    return True
