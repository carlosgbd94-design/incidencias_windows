"""Genera web/css/bundle.css y web/js/bundle.js a partir de los archivos
fuente sueltos, e inlinea las 4 fuentes .woff2 como data: URIs dentro del
CSS. Correr ANTES de cada build (ver installer/app.spec y la memoria del
proyecto): `python scripts/bundle_web.py` desde la raíz del repo.

Por qué existe: la bitácora de arranque (app/diag.py, startup.log) mostró
que en máquinas lentas el hueco entre "evento shown" y "evento loaded" --
WebView2 leyendo del disco los ~19 archivos sueltos que carga index.html
(2 CSS, 12 JS, 4 fuentes) -- puede tardar de varios segundos a varios
minutos, con mucha variación entre corridas (9.5s en una corrida, colgado
indefinidamente en otra). El patrón encaja con un antivirus corporativo
escaneando cada archivo al leerlo. Este script no cambia nada del código en
sí, solo reduce cuántos archivos separados hay que leer al navegar,
concatenando todo en 2 archivos (más los que ya estaban inline en
index.html). Los .js/.css fuente siguen siendo la fuente de verdad para
editar -- este script se vuelve a correr después de cualquier cambio ahí.
"""
import base64
import pathlib

RAIZ = pathlib.Path(__file__).resolve().parent.parent
WEB = RAIZ / "web"

# Mismo orden que los <script src> que reemplaza en index.html -- el orden
# importa (api.js define window.Api antes de que los demás lo usen, etc.)
ARCHIVOS_JS = [
    "js/api.js",
    "js/components/segmented.js",
    "js/components/glass-select.js",
    "js/components/smart-date-input.js",
    "js/components/smart-time-input.js",
    "js/views/perfil.js",
    "js/views/pases.js",
    "js/views/vacaciones.js",
    "js/views/exportar.js",
    "js/views/festivos.js",
    "js/views/respaldo.js",
    "js/app.js",
]

FUENTES = {
    "Inter-Regular.woff2": 400,
    "Inter-Medium.woff2": 500,
    "Inter-SemiBold.woff2": 600,
    "Inter-Bold.woff2": 700,
}


def generar_css():
    tokens = (WEB / "css/tokens.css").read_text(encoding="utf-8")
    for nombre in FUENTES:
        datos = (WEB / "fonts" / nombre).read_bytes()
        data_uri = f"data:font/woff2;base64,{base64.b64encode(datos).decode('ascii')}"
        tokens = tokens.replace(f'url("../fonts/{nombre}") format("woff2")', f'url("{data_uri}") format("woff2")')
    glass = (WEB / "css/glass.css").read_text(encoding="utf-8")
    salida = (
        "/* GENERADO por scripts/bundle_web.py -- no editar a mano.\n"
        "   Fuente: css/tokens.css + css/glass.css (fuentes .woff2 inlineadas). */\n\n"
        + tokens + "\n" + glass
    )
    (WEB / "css/bundle.css").write_text(salida, encoding="utf-8")
    print(f"css/bundle.css generado ({len(salida) // 1024} KB)")


def generar_js():
    partes = [
        "/* GENERADO por scripts/bundle_web.py -- no editar a mano.\n"
        "   Fuente: " + ", ".join(ARCHIVOS_JS) + " */\n"
    ]
    for ruta in ARCHIVOS_JS:
        partes.append(f"\n/* ---- {ruta} ---- */\n")
        partes.append((WEB / ruta).read_text(encoding="utf-8"))
    salida = "".join(partes)
    (WEB / "js/bundle.js").write_text(salida, encoding="utf-8")
    print(f"js/bundle.js generado ({len(salida) // 1024} KB)")


if __name__ == "__main__":
    generar_css()
    generar_js()
