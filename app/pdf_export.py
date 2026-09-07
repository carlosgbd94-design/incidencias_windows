"""Generación de los PDF oficiales (Pases U400-DRHSRL-P18-F02 y
Vacaciones U400-DRHSRL-P18-F03).

El layout (tamaño A4, márgenes, columnas, alto de fila, tamaño y posición del
logo) fue medido punto por punto sobre los PDF oficiales originales (con
pymupdf: posiciones de texto, líneas/rectángulos del grid, y bbox real de la
imagen del logo) para que la plantilla quede calcada 1 a 1 — el código solo
debe llenarla con los datos capturados en la herramienta, nunca alterar su
estructura ni agregar líneas/divisiones que el original no tiene. Las tablas
de pases y comisiones oficiales siempre pintan como mínimo los renglones que
trae el formato en blanco (4 particulares, 5 oficiales) y solo crecen más
allá de eso si hay más datos capturados.
"""
import os

from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import Paragraph, Table, TableStyle

from app.business_rules import ORDEN_TIPOS, formatear_duracion, ordinal_es
from app.paths import assets_dir

LOGO_PATH = assets_dir() / "logo_seseq.png"

PAGE_W, PAGE_H = 595.28, 841.89  # A4, tamaño real del formato oficial

MESES_ES = [
    "", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
    "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

MARGEN_IZQ = 28.2
MARGEN_DER = 572.6

MIN_FILAS_PARTICULARES = 4
MIN_FILAS_OFICIALES = 5


def Y(y_desde_arriba: float) -> float:
    """Convierte una coordenada medida desde arriba de la página (como se
    mide en el PDF original) a la coordenada Y de reportlab (origen abajo)."""
    return PAGE_H - y_desde_arriba


def _mayus(texto: str) -> str:
    return (texto or "").upper()


# Tamaños de fuente medidos directamente del texto real del PDF oficial
# (pymupdf: get_text("dict"), bbox y "size" de cada span) -- no son los
# mismos entre Pases y Vacaciones para cada rol (ver los _vac de abajo),
# así que no conviene compartir un solo estilo "genérico" entre ambos
# formatos aunque el nombre del rol se parezca.
_estilo_celda = ParagraphStyle("celda", fontName="Helvetica", fontSize=8.0, leading=9.5)
# Solo para el nombre/firma del jefe en las tablas de Pases: medido contra el
# PDF de referencia real, esa columna centra el texto (a diferencia de las
# demás celdas de esas tablas, que alinean a la izquierda).
_estilo_celda_centrada = ParagraphStyle("celda_centrada", fontName="Helvetica", fontSize=8.0,
                                          leading=9.5, alignment=TA_CENTER)
_estilo_celda_b = ParagraphStyle("celda_b", fontName="Helvetica-Bold", fontSize=8.0, leading=9.5)
_estilo_celda_b_vac = ParagraphStyle("celda_b_vac", fontName="Helvetica-Bold", fontSize=9.0, leading=10.6,
                                       alignment=TA_CENTER)
_estilo_encab = ParagraphStyle("encab", fontName="Helvetica-Bold", fontSize=8.0, leading=9.4,
                                alignment=TA_CENTER)
_estilo_perfil = ParagraphStyle("perfil", fontName="Helvetica", fontSize=10, leading=11.8)
_estilo_nota = ParagraphStyle("nota", fontName="Helvetica", fontSize=7.0, leading=8.8)
_estilo_nota_vac = ParagraphStyle("nota_vac", fontName="Helvetica", fontSize=8.0, leading=10.0)


def fecha_es(fecha_iso: str) -> str:
    anio, mes, dia = fecha_iso.split("-")
    return f"{dia}/{mes}/{anio}"


def _dibujar_encabezado(c: pdfcanvas.Canvas, titulo: str, folio: str,
                         x: float, w: float, h: float) -> None:
    """Título y folio arriba a la derecha; logo con el tamaño y posición
    reales medidos del PDF oficial (bbox de la imagen, no una aproximación)."""
    if LOGO_PATH.exists():
        c.drawImage(str(LOGO_PATH), x, Y(14.2 + h), width=w, height=h, mask="auto")

    estilo_titulo = ParagraphStyle("titulo_pdf", fontName="Helvetica-Bold", fontSize=10,
                                    leading=12, alignment=TA_RIGHT)
    estilo_folio = ParagraphStyle("folio_pdf", fontName="Helvetica-Bold", fontSize=10,
                                   leading=12, alignment=TA_RIGHT)
    p_titulo = Paragraph(titulo, estilo_titulo)
    ancho_bloque = MARGEN_DER - 220
    w, h = p_titulo.wrapOn(c, ancho_bloque, 40)
    p_titulo.drawOn(c, MARGEN_DER - ancho_bloque, Y(14) - h)

    p_folio = Paragraph(folio, estilo_folio)
    w2, h2 = p_folio.wrapOn(c, ancho_bloque, 20)
    p_folio.drawOn(c, MARGEN_DER - ancho_bloque, Y(8) - h - h2 - 6.6)


def _campo(etiqueta: str, valor: str) -> Paragraph:
    return Paragraph(f"<b>{etiqueta}</b> {_mayus(valor)}", _estilo_perfil)


def _horario_texto(perfil: dict) -> str:
    dias_lista = (perfil["dias_laborables"] or "").split(",")
    if len(dias_lista) >= 2:
        rango_dias = f"{dias_lista[0]} A {dias_lista[-1]}"
    else:
        rango_dias = dias_lista[0] if dias_lista else ""
    return f"{rango_dias} {perfil['hora_entrada']}-{perfil['hora_fin_turno']}"


def _dibujar_caja_perfil(c: pdfcanvas.Canvas, perfil: dict, etiqueta_no: str,
                          x0: float, x1: float, y0_arriba: float, y1_arriba: float,
                          x_col_der: float) -> None:
    """Caja de datos del trabajador: 5 filas separadas por líneas horizontales
    a todo lo ancho (la última va en blanco -- así es el formato oficial,
    medido con pymupdf sobre las líneas reales del PDF: la fila 1 mide ~25.4pt
    y las 4 restantes ~12.7pt cada una, no 4 filas como antes). El original
    NO tiene ninguna línea vertical divisoria dentro de la caja (verificado
    contra los dibujos reales del PDF) — los pares Nombre/No.Empleado y
    Turno-Horario/Recurso solo van uno junto al otro, sin separador;
    x_col_der es la posición horizontal (medida del original) donde arranca
    el texto de la columna derecha."""
    alto_r1 = 25.4
    alto_rn = 12.7  # filas 2-5, todas iguales
    y_r1_bottom = y0_arriba + alto_r1
    y_r2_bottom = y_r1_bottom + alto_rn
    y_r3_bottom = y_r2_bottom + alto_rn
    y_r4_bottom = y_r3_bottom + alto_rn
    col_der_x = x_col_der

    c.setLineWidth(0.75)
    c.rect(x0, Y(y1_arriba), x1 - x0, y1_arriba - y0_arriba, stroke=1, fill=0)
    for y in (y_r1_bottom, y_r2_bottom, y_r3_bottom, y_r4_bottom):
        c.line(x0, Y(y), x1, Y(y))

    filas = [
        (y_r1_bottom, y_r2_bottom, _campo("Centro de trabajo:", perfil["centro_trabajo"]), None),
        (y_r2_bottom, y_r3_bottom, _campo("Área y Dirección a la que pertenece:", perfil["area_direccion"]), None),
        (y_r3_bottom, y_r4_bottom,
         Paragraph(f"<b>Turno:</b> {_mayus(perfil['turno'])}    <b>Horario:</b> {_horario_texto(perfil)}",
                   _estilo_perfil),
         _campo("Recurso:", perfil["recurso"])),
        # Fila 5: en blanco a propósito, tal como el formato oficial.
    ]
    pad = 5

    # Fila 1 (Nombre / No. Empleado) es especial: en el formato oficial el
    # valor NO arranca justo después de la etiqueta (ancho variable), sino en
    # una columna fija -- medido con pymupdf sobre el PDF de referencia real
    # (etiqueta "Nombre:" en x0+pad, valor a x0+68.2; etiqueta derecha en
    # col_der_x+pad, valor a col_der_x+72.1). Por eso se dibuja aparte del
    # resto de filas, que sí concatenan etiqueta+valor en un solo Paragraph.
    alto_r1 = y_r1_bottom - y0_arriba

    def _fila_fija(etiqueta: str, valor: str, x_etiqueta: float, x_valor: float) -> None:
        et = Paragraph(f"<b>{etiqueta}</b>", _estilo_perfil)
        # Ancho generoso (no acotado al hueco hasta x_valor): la etiqueta no
        # debe partirse en dos líneas aunque, como "No. Empleado:", su ancho
        # natural sea mayor que la separación hasta la columna del valor --
        # así es también en el original (una sola línea).
        # -5.8: la fila 1 en el original NO centra el texto verticalmente
        # como las demás filas -- se asienta más abajo, medido contra el PDF
        # de referencia real (a diferencia de las filas 2-5, que sí centran
        # limpio).
        w, h = et.wrapOn(c, x1 - x_etiqueta, alto_r1)
        et.drawOn(c, x_etiqueta, Y(y_r1_bottom) + (alto_r1 - h) / 2 - 5.8)
        val = Paragraph(_mayus(valor), _estilo_perfil)
        ancho_val = (col_der_x if x_etiqueta == x0 else x1) - x_valor - pad
        w2, h2 = val.wrapOn(c, ancho_val, alto_r1)
        val.drawOn(c, x_valor, Y(y_r1_bottom) + (alto_r1 - h2) / 2 - 5.8)

    _fila_fija("Nombre:", perfil["nombre"], x0 + pad, x0 + 68.2)
    _fila_fija(f"{etiqueta_no}:", perfil["no_empleado"], col_der_x + pad, col_der_x + 72.1)

    for y_top, y_bot, izq, der in filas:
        alto_fila = y_bot - y_top
        if der is not None:
            w, h = izq.wrapOn(c, col_der_x - x0 - 2 * pad, alto_fila)
            izq.drawOn(c, x0 + pad, Y(y_bot) + (alto_fila - h) / 2)
            w2, h2 = der.wrapOn(c, x1 - col_der_x - 2 * pad, alto_fila)
            der.drawOn(c, col_der_x + pad, Y(y_bot) + (alto_fila - h2) / 2)
        else:
            w, h = izq.wrapOn(c, x1 - x0 - 2 * pad, alto_fila)
            izq.drawOn(c, x0 + pad, Y(y_bot) + (alto_fila - h) / 2)


def _titulo_seccion(c: pdfcanvas.Canvas, texto: str, y_arriba: float) -> None:
    c.setFont("Helvetica-Bold", 10)
    c.drawCentredString(PAGE_W / 2, Y(y_arriba), texto)


def _altura_fila(c: pdfcanvas.Canvas, celdas: list, anchos: list[float], alto_min: float,
                  pad: float = 6) -> float:
    """Alto de fila que garantiza que todas sus celdas quepan sin desbordar
    el renglón -- un jefe_nombre largo (p.ej. varios nombres/apellidos
    compuestos) puede necesitar más líneas de las que caben en el alto fijo
    del formato oficial; en ese caso la fila crece en vez de que el texto se
    salga de sus líneas.

    `pad` se resta del ANCHO disponible para el wrap (deja aire a los lados,
    como el LEFTPADDING/RIGHTPADDING reales de la tabla) Y TAMBIÉN se suma a
    la altura del texto ya envuelto (mismo valor: TOPPADDING+BOTTOMPADDING
    suman igual que LEFTPADDING+RIGHTPADDING en _dibujar_tabla_en, 3+3). Sin
    esa suma vertical, el bloque fijo "Regresa/Hora de salida/Hora de
    regreso" (3 líneas, h=28.5) quedaba con menos de 2pt libres dentro de una
    fila de 30 -- casi nada para repartir entre TOPPADDING y BOTTOMPADDING, y
    el texto terminaba pegado al borde inferior de la fila (confirmado
    visualmente, no solo en teoría: se veía crecer hasta la línea divisoria).
    """
    alto = alto_min
    for celda, ancho in zip(celdas, anchos):
        if isinstance(celda, Paragraph):
            _, h = celda.wrapOn(c, ancho - pad, 1000)
            alto = max(alto, h + pad)
    return alto


def _dibujar_tabla_en(c: pdfcanvas.Canvas, filas: list, col_widths: list[float],
                       row_heights: list[float], x0: float, y0_arriba: float,
                       spans: list[tuple] | None = None,
                       estilo_extra: list[tuple] | None = None) -> float:
    """Dibuja una tabla con Platypus posicionada en coordenadas exactas
    (mismas columnas/renglones que el formato oficial). Devuelve la
    coordenada Y (desde arriba) donde terminó la tabla."""
    estilo = [
        ("BOX", (0, 0), (-1, -1), 0.75, colors.black),
        ("INNERGRID", (0, 0), (-1, -1), 0.5, colors.black),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 3),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]
    for span_start, span_end in spans or []:
        estilo.append(("SPAN", span_start, span_end))
    estilo.extend(estilo_extra or [])
    tabla = Table(filas, colWidths=col_widths, rowHeights=row_heights)
    tabla.setStyle(TableStyle(estilo))
    alto_total = sum(row_heights)
    w, h = tabla.wrapOn(c, sum(col_widths), alto_total)
    tabla.drawOn(c, x0, Y(y0_arriba) - h)
    return y0_arriba + h


# ---------------------------------------------------------------------------
# PASES DE SALIDA (U400-DRHSRL-P18-F02)
# ---------------------------------------------------------------------------

# Anchos de columna medidos directamente del PDF oficial (con pymupdf,
# page.get_drawings() sobre los rectángulos reales del grid). No modificar
# sin re-medir. COLS_PARTICULARES suma 544.4 (llega hasta MARGEN_DER), pero
# OJO: la tabla de Oficiales de Pases NO llega hasta MARGEN_DER en el
# original -- su borde derecho real está en x=567.2, no 572.6 (suma 539.0).
COLS_PARTICULARES = [43.6, 54.4, 108.9, 54.4, 87.1, 98.0, 98.0]
COLS_OFICIALES = [54.5, 81.6, 70.8, 70.8, 125.2, 136.1]

LOGO_PASES = dict(x=31.0, w=106.1, h=32.1)
LOGO_VACACIONES = dict(x=36.7, w=103.8, h=31.4)


def _detalle_pase(pase: dict | None) -> str:
    """El texto 'Regresa:SI( ) No ( )' / 'Hora de salida:' / 'Hora de
    regreso:' es parte fija del formato impreso — se muestra siempre, con o
    sin datos (solo la marca X y las horas son variables)."""
    if pase is None:
        return "Regresa: SI ( &nbsp; ) No ( &nbsp; )<br/>Hora de salida:<br/>Hora de regreso:"
    marca_si = "X" if pase["regresa"] else "&nbsp;"
    marca_no = "&nbsp;" if pase["regresa"] else "X"
    return (
        f"Regresa: SI ( {marca_si} ) No ( {marca_no} )<br/>"
        f"Hora de salida: {pase['hora_salida']}<br/>"
        f"Hora de regreso: {pase['hora_regreso'] or ''}"
    )


def generar_pdf_pases(perfil: dict, pases_particulares: list[dict], pases_oficiales: list[dict],
                       jefe_nombre: str, mes: int, anio: int, output_path: str) -> None:
    c = pdfcanvas.Canvas(output_path, pagesize=(PAGE_W, PAGE_H))
    # A diferencia de "asunto"/"dependencia" (que sí van en mayúsculas en el
    # formato oficial), el nombre del jefe se imprime tal cual se capturó
    # (p.ej. "Dra. Claudia Vázquez Robledo"), no en mayúsculas -- confirmado
    # contra el PDF de referencia real.

    _dibujar_encabezado(c, "Control Mensual de Pases de Salida Particulares y Oficiales",
                         "U400-DRHSRL-P18-F02", **LOGO_PASES)
    _dibujar_caja_perfil(c, perfil, "No. Empleado", MARGEN_IZQ, MARGEN_DER, 61.3, 137.3, x_col_der=410.0)

    _titulo_seccion(c, "Particulares", 158)

    filas = [[
        Paragraph("<b>Pase</b>", _estilo_encab),
        Paragraph("<b>Fecha<br/>Día/Mes<br/>/Año</b>", _estilo_encab),
        Paragraph("", _estilo_encab),
        Paragraph("<b>Tiempo<br/>utilizado</b>", _estilo_encab),
        Paragraph("<b>Firma del Trabajador</b>", _estilo_encab),
        Paragraph("<b>Autorización Nombre y<br/>Firma Jefe Inmediato</b>", _estilo_encab),
        Paragraph("<b>Firma y Fecha de<br/>recibido (RRHUA)</b>", _estilo_encab),
    ]]
    alturas = [30]
    pases_ordenados = sorted(pases_particulares, key=lambda p: (p["fecha"], p["hora_salida"]))
    n_filas_part = max(MIN_FILAS_PARTICULARES, len(pases_ordenados))
    for i in range(n_filas_part):
        pase = pases_ordenados[i] if i < len(pases_ordenados) else None
        fila = [
            # Ordinal ("Primero"/"Segundo"/...), no el número -- así se ve
            # en el formato oficial, no "1"/"2"/"3".
            Paragraph(ordinal_es(i + 1), _estilo_celda_b),
            Paragraph(fecha_es(pase["fecha"]) if pase else "", _estilo_celda),
            Paragraph(_detalle_pase(pase), _estilo_celda),
            Paragraph(formatear_duracion(pase["minutos"]) if pase else "", _estilo_celda),
            Paragraph("", _estilo_celda),
            Paragraph(jefe_nombre if pase else "", _estilo_celda_centrada),
            Paragraph("", _estilo_celda),
        ]
        filas.append(fila)
        alturas.append(_altura_fila(c, fila, COLS_PARTICULARES, 30))

    # Columna "Autorización Nombre y Firma Jefe Inmediato" (índice 5): a
    # diferencia de las demás celdas (alineadas arriba), esta va centrada
    # verticalmente -- si no, cuando el nombre necesita más líneas y la fila
    # crece para no desbordarse, el texto queda pegado arriba con un hueco
    # feo debajo en vez de verse balanceado.
    estilo_extra_part = [("VALIGN", (5, 1), (5, -1), "MIDDLE")]
    y_fin = _dibujar_tabla_en(c, filas, COLS_PARTICULARES, alturas, MARGEN_IZQ, 171.6,
                               estilo_extra=estilo_extra_part)

    nota = Paragraph(
        "-Aplica: Personal de Base Federal, Estatal, Regularizado y Formalizado. "
        "Art. 92 fracciones I, III de las C.G.T.", _estilo_nota,
    )
    w, h = nota.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 20)
    nota.drawOn(c, 22.7, Y(y_fin) - h - 15.3)
    y_fin += h + 11.8

    _titulo_seccion(c, "Oficiales", y_fin + 26)

    filas_of = [[
        Paragraph("<b>Fecha<br/>Día/Mes<br/>/Año</b>", _estilo_encab),
        Paragraph("<b>Asunto</b>", _estilo_encab),
        Paragraph("<b>Dependencia<br/>a la que asiste</b>", _estilo_encab),
        Paragraph("<b>Horario<br/>de comisión</b>", _estilo_encab),
        Paragraph("<b>Nombre y firma de<br/>autorización</b>", _estilo_encab),
        Paragraph("<b>Sello de Permanencia</b>", _estilo_encab),
    ]]
    alturas_of = [38]
    oficiales_ordenados = sorted(pases_oficiales, key=lambda p: p["fecha"])
    n_filas_of = max(MIN_FILAS_OFICIALES, len(oficiales_ordenados))
    for i in range(n_filas_of):
        of = oficiales_ordenados[i] if i < len(oficiales_ordenados) else None
        fila_of = [
            Paragraph(fecha_es(of["fecha"]) if of else "", _estilo_celda),
            Paragraph(_mayus(of["asunto"]) if of else "", _estilo_celda),
            Paragraph(_mayus(of["dependencia"]) if of else "", _estilo_celda),
            Paragraph(of["horario_comision"] if of else "", _estilo_celda),
            Paragraph(jefe_nombre if of else "", _estilo_celda_centrada),
            Paragraph("", _estilo_celda),
        ]
        filas_of.append(fila_of)
        alturas_of.append(_altura_fila(c, fila_of, COLS_OFICIALES, 50))

    # Columna "Nombre y firma de autorización" (índice 4): mismo criterio
    # que en la tabla de Particulares -- centrada verticalmente.
    estilo_extra_of = [("VALIGN", (4, 1), (4, -1), "MIDDLE")]
    _dibujar_tabla_en(c, filas_of, COLS_OFICIALES, alturas_of, MARGEN_IZQ, y_fin + 42,
                       estilo_extra=estilo_extra_of)

    c.setFont("Helvetica", 10)
    # La línea va ARRIBA del texto, con margen suficiente para no cruzarlo
    # (antes quedaba entre el renglón base y el techo del texto, y el texto
    # se veía tachado).
    c.line(207.9, Y(712.4), 389.3, Y(712.4))
    c.drawCentredString(PAGE_W / 2, Y(731.1), "Firma del Trabajador")
    c.setFont("Helvetica", 7)
    # "Actulización" (sin la segunda "a") es el texto real del formato
    # oficial, no un error de este código -- se conserva tal cual para que
    # la réplica sea 1:1. El ancho de bloque (561.5, no MARGEN_DER) también
    # se midió del original: esta línea del pie no llega hasta el margen
    # derecho de la página.
    c.drawRightString(561.5, Y(765.7), "Actulización, julio 2019")

    c.save()


# ---------------------------------------------------------------------------
# VACACIONES / CUMPLEAÑOS O SANTORAL (U400-DRHSRL-P18-F03)
# ---------------------------------------------------------------------------

TIPO_ETIQUETA = {
    "primero": "Primero (ordinario)",
    "segundo": "Segundo (ordinario)",
    "riesgo_alto": "Alto Riesgo (12 días)",
    "riesgo_mediano": "Mediano Riesgo (8 días)",
    "riesgo_bajo": "Bajo Riesgo (5 días)",
    "extraordinario": "Extraordinarias",
}
# Medido igual que COLS_OFICIALES: esta tabla tampoco arranca en MARGEN_IZQ
# ni llega a MARGEN_DER en el original -- su borde real va de x=33.9 a
# x=561.6 (suma 527.7, no 544.4).
MARGEN_IZQ_TABLA_VAC = 33.9
COLS_VACACIONES = [110.8, 158.3, 153.1, 105.5]

# Posiciones X de la tabla de "Fecha que corresponde/solicita" -- el
# original divide la fecha en dos casillas chicas (Día, Mes) en vez de un
# solo campo de texto corrido, medidas con pymupdf sobre los rectángulos
# reales del grid.
_DIA_ESP_LABEL_X = (87.2, 247.1)
_DIA_ESP_DIA_X = (247.1, 273.8)
_DIA_ESP_MES_X = (284.4, 311.1)
_DIA_ESP_AUT_X = (321.7, 513.6)


def _valor_dia_mes(texto: str) -> tuple[str, str] | None:
    """Si el texto es 'DD/MM' (o 'DD/MM/AAAA'), regresa (día, mes) para
    las casillas separadas del formato oficial; si no (ej. 'No aplica este
    año'), regresa None y ese texto se muestra corrido, sin dividir."""
    partes = (texto or "").split("/")
    if len(partes) >= 2 and partes[0].strip().isdigit() and partes[1].strip().isdigit():
        return partes[0].strip(), partes[1].strip()
    return None


def _dibujar_fila_dia_especial(c: pdfcanvas.Canvas, etiqueta: str, valor_texto: str,
                                lineas_autoriza: list[str], y0_arriba: float,
                                alto_valor: float, alto_caption: float) -> None:
    """Una fila del bloque 'Fecha que corresponde/solicita': celda de
    etiqueta, casillas separadas de Día y Mes (con su leyenda 'Día'/'Mes'
    debajo, tal como el formato oficial), y celda de autorización/firma."""
    y1_split = y0_arriba + alto_valor
    y1 = y1_split + alto_caption
    lx0, lx1 = _DIA_ESP_LABEL_X
    dx0, dx1 = _DIA_ESP_DIA_X
    mx0, mx1 = _DIA_ESP_MES_X
    ax0, ax1 = _DIA_ESP_AUT_X

    c.setLineWidth(0.75)
    c.rect(lx0, Y(y1), lx1 - lx0, y1 - y0_arriba, stroke=1, fill=0)
    et = Paragraph(f"<b>{etiqueta}</b>", _estilo_celda_b)
    w, h = et.wrapOn(c, lx1 - lx0 - 8, y1 - y0_arriba)
    et.drawOn(c, lx0 + 4, Y(y1) + (y1 - y0_arriba - h) / 2)

    c.rect(dx0, Y(y1), dx1 - dx0, y1 - y0_arriba, stroke=1, fill=0)
    c.line(dx0, Y(y1_split), dx1, Y(y1_split))
    c.rect(mx0, Y(y1), mx1 - mx0, y1 - y0_arriba, stroke=1, fill=0)
    c.line(mx0, Y(y1_split), mx1, Y(y1_split))

    dia_mes = _valor_dia_mes(valor_texto)
    if dia_mes:
        c.setFont("Helvetica", 10)
        c.drawCentredString((dx0 + dx1) / 2, Y(y1_split + 5.2), dia_mes[0])
        c.drawCentredString((mx0 + mx1) / 2, Y(y1_split + 5.2), dia_mes[1])
    elif valor_texto:
        c.setFont("Helvetica", 7.5)
        c.drawCentredString((dx0 + mx1) / 2, Y(y1_split + 5.2), valor_texto)
    c.setFont("Helvetica", 8)
    c.drawCentredString((dx0 + dx1) / 2, Y(y1 + 3.1), "Día")
    c.drawCentredString((mx0 + mx1) / 2, Y(y1 + 3.1), "Mes")

    c.rect(ax0, Y(y1), ax1 - ax0, y1 - y0_arriba, stroke=1, fill=0)
    aut = Paragraph("<br/>".join(lineas_autoriza), _estilo_celda)
    w, h = aut.wrapOn(c, ax1 - ax0 - 8, y1 - y0_arriba)
    aut.drawOn(c, ax0 + 4, Y(y1) + (y1 - y0_arriba - h) / 2)


def generar_pdf_vacaciones(perfil: dict, periodos_por_tipo: dict, dia_especial: dict | None,
                            jefe_nombre: str, anio: int, output_path: str) -> None:
    c = pdfcanvas.Canvas(output_path, pagesize=(PAGE_W, PAGE_H))
    # Ver la nota equivalente en generar_pdf_pases(): el nombre del jefe no
    # va en mayúsculas en el formato oficial.

    _dibujar_encabezado(c, "Control Anual de Períodos Vacacionales, Cumpleaños o Santoral",
                         "U400-DRHSRL-P18-F03", **LOGO_VACACIONES)
    _dibujar_caja_perfil(c, perfil, "Trabajador", MARGEN_IZQ, 567.2, 60.6, 136.7, x_col_der=404.0)

    _titulo_seccion(c, "Períodos Vacacionales", 152.6)

    filas = [[
        Paragraph(f"<b>Año: {anio}</b>", _estilo_encab),
        Paragraph("<b>Período</b>", _estilo_encab),
        Paragraph("<b>Autorización Jefe Inmediato:<br/>Nombre y Firma</b>", _estilo_encab),
        Paragraph("<b>Firma y Fecha de<br/>recibido (RRHUA)</b>", _estilo_encab),
    ]]
    # El original tiene un pequeño salto en blanco entre el grupo de
    # ordinarios y el de riesgos, y entre el de riesgos y el de
    # extraordinarias -- medido con pymupdf sobre los rectángulos reales del
    # grid (dentro de un mismo grupo las filas son contiguas, sin salto).
    # Como cada fila usa VALIGN=TOP, el salto se logra sumando ese extra a la
    # ÚLTIMA fila del grupo ANTERIOR (el espacio de más queda debajo de su
    # contenido, no arriba del contenido siguiente).
    alturas = [21.3]
    _INICIO_GRUPO = {"riesgo_alto", "extraordinario"}
    for i, tipo in enumerate(ORDEN_TIPOS):
        periodos = periodos_por_tipo.get(tipo, [])
        siguiente = ORDEN_TIPOS[i + 1] if i + 1 < len(ORDEN_TIPOS) else None
        extra_al_final = 4 if siguiente in _INICIO_GRUPO else 0
        if not periodos:
            filas.append([
                Paragraph(f"<b>{TIPO_ETIQUETA[tipo]}</b>", _estilo_celda_b_vac),
                Paragraph("Del ___/___/___ al ___/___/___", _estilo_celda),
                Paragraph("", _estilo_celda), Paragraph("", _estilo_celda),
            ])
            alturas.append(30 + extra_al_final)
        else:
            for j, p in enumerate(periodos):
                extra = f"<br/>Motivo: {p['motivo']}" if p.get("motivo") else ""
                fila_periodo = [
                    Paragraph(f"<b>{TIPO_ETIQUETA[tipo]}</b>", _estilo_celda_b_vac),
                    Paragraph(f"Del {fecha_es(p['fecha_inicio'])} al {fecha_es(p['fecha_fin'])} "
                              f"({p['dias_habiles']} días hábiles){extra}", _estilo_celda),
                    Paragraph(jefe_nombre, _estilo_celda_centrada), Paragraph("", _estilo_celda),
                ]
                filas.append(fila_periodo)
                es_ultimo = j == len(periodos) - 1
                alto_min = 30 + (extra_al_final if es_ultimo else 0)
                alturas.append(_altura_fila(c, fila_periodo, COLS_VACACIONES, alto_min))

    # Columna 1 (período) en las filas de datos tiene más margen izquierdo
    # que el resto de las tablas -- medido del original (144.7+10.7). La
    # columna 0 (etiqueta) no necesita override: va centrada (ver
    # _estilo_celda_b_vac) y el padding simétrico por defecto ya la centra
    # bien.
    estilo_extra = [
        ("LEFTPADDING", (1, 1), (1, -1), 10.7),
        # Columna 2 (jefe_nombre), igual que en las tablas de Pases: centrada
        # verticalmente en vez de pegada arriba.
        ("VALIGN", (2, 1), (2, -1), "MIDDLE"),
    ]
    y_fin = _dibujar_tabla_en(c, filas, COLS_VACACIONES, alturas, MARGEN_IZQ_TABLA_VAC, 166.4,
                               estilo_extra=estilo_extra)

    # Texto exacto del formato oficial (asteriscos y puntuación incluidos --
    # p.ej. "CGT En" sin coma/punto entre ambos, y "**Extraordinarias" con
    # doble asterisco, tal como el original, no "Extraordinarias" a secas).
    notas = [
        "<b>*Ordinarias:</b>  Art. 144, 145 CGT En ningún caso, podrán acumularse entre sí cualquiera de los "
        "períodos vacacionales enunciados ni tampoco podrán disfrutarse de manera continua en períodos "
        "inmediatos a cualquier tipo de licencias o días económicos.",
        "<b>*Alto, mediano y bajo riesgo:</b>  Art. 140, 130 fracción XX de las CGT, y la fracción II de la "
        "sección segunda del manual para prevenir y disminuir riesgos de trabajo e indicar el otorgamiento "
        "de derechos adicionales.",
        "<b>**Extraordinarias:</b> Art. 213 fracción VII CGT y las normas para el otorgamiento de estímulos y "
        "recompensas civiles.",
    ]
    y_cursor = y_fin + 8
    for texto in notas:
        p = Paragraph(texto, _estilo_nota_vac)
        # Ancho medido del original (los saltos de línea caen en la misma
        # palabra que en el PDF de referencia real: MARGEN_DER da un ancho
        # ligeramente mayor y adelanta una palabra de más a la primera línea).
        w, h = p.wrapOn(c, 556.5 - 36.3, 30)
        p.drawOn(c, 36.3, Y(y_cursor) - h)
        y_cursor += h + 2

    y_cursor += 37.5
    _titulo_seccion(c, "Cumpleaños o santoral", y_cursor)
    y_cursor += 12

    # El original no envuelve esto como un solo párrafo corrido: cada
    # oración va en su propio renglón (solo la última, más larga, sí hace
    # wrap real por ancho) -- medido contra el PDF de referencia real.
    intro_lineas = [
        "  Este formato solo será válido para solicitar un día de acuerdo a lo establecido en el artículo "
        "141, fracción I de las CGT.",
        "  Si el día de cumpleaños o santoral cae en los días de fin de semana para los que laboran de "
        "lunes a viernes o festivo oficial no se otorgará.",
        "*Él trabajador determina desde el inicio de su relación laboral, si se considerará el cumpleaños "
        "o el santoral, siendo esta elección inamovible.",
    ]
    for linea in intro_lineas:
        p = Paragraph(linea, _estilo_nota_vac)
        # 499, no MARGEN_DER-MARGEN_IZQ: al ancho completo la tercera oración
        # ("...siendo esta elección inamovible.") no hace wrap, pero en el
        # original sí -- "inamovible." cae sola en su propio renglón.
        w, h = p.wrapOn(c, 499, 30)
        p.drawOn(c, MARGEN_IZQ, Y(y_cursor) - h)
        y_cursor += h
    y_cursor += 21.8

    # Fila de casillas Cumpleaños/Santoral: posiciones X medidas del
    # original (no van pegadas al margen izquierdo como antes).
    tipo_dia = perfil.get("tipo_dia_especial") or ""
    c.setFont("Helvetica", 10)
    c.drawString(168.7, Y(y_cursor + 9), "*Cumpleaños")
    c.rect(255.5, Y(y_cursor + 12.5), 21.1, 12.5, stroke=1, fill=0)
    if tipo_dia == "Cumpleaños":
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(266.1, Y(y_cursor + 9), "X")
        c.setFont("Helvetica", 10)
    c.drawString(321.7, Y(y_cursor + 9), "*Santoral")
    c.rect(371.6, Y(y_cursor + 12.5), 21.1, 12.5, stroke=1, fill=0)
    if tipo_dia == "Santoral":
        c.setFont("Helvetica-Bold", 10)
        c.drawCentredString(382.2, Y(y_cursor + 9), "X")
    y_cursor += 5.3

    fecha_corresponde = perfil.get("fecha_dia_especial") or "-"
    if dia_especial and dia_especial.get("aplico"):
        fecha_solicita = fecha_es(dia_especial["fecha_otorgada"])
    elif dia_especial and not dia_especial.get("aplico"):
        fecha_solicita = "No aplica este año"
    else:
        fecha_solicita = ""

    y_fila1 = y_cursor
    _dibujar_fila_dia_especial(
        # Sin <br/>: en el original "Fecha (día que corresponde)" va en UNA
        # sola línea (cabe de sobra en el ancho de la celda), no partida en
        # dos.
        c, "Fecha (día que corresponde)", fecha_corresponde,
        ["<b>Autoriza:</b>", "Jefe del Departamento", jefe_nombre],
        y_fila1, alto_valor=18.0, alto_caption=18.0,
    )
    y_fila2 = y_fila1 + 36.0 + 18.0  # 18pt de separación entre filas, medido del original
    _dibujar_fila_dia_especial(
        c, "Fecha (día que solicita)", fecha_solicita,
        ["<b>Nombre y Firma</b>"],
        y_fila2, alto_valor=12.5, alto_caption=18.0,
    )
    y_cursor = y_fila2 + 12.5 + 18.0 + 6

    pie = Paragraph(
        "Art. 141 Fracción I de las CGT y las normas para el otorgamiento del día de cumpleaños o santoral.",
        _estilo_nota_vac,
    )
    w, h = pie.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 16)
    pie.drawOn(c, MARGEN_IZQ, Y(y_cursor) - h)

    c.setFont("Helvetica-Bold", 10)
    # Ver la nota equivalente en generar_pdf_pases(): la línea va arriba del
    # texto con margen, no cruzándolo.
    c.line(189.9, Y(755.5), 405.4, Y(755.5))
    c.drawCentredString(PAGE_W / 2, Y(774.2), "Firma del Trabajador")
    c.setFont("Helvetica", 7)
    c.drawRightString(561.3, Y(783.6), "Actulización, julio 2019")

    c.save()


def abrir_pdf(ruta: str) -> None:
    """Abre el PDF generado con el visor predeterminado del sistema."""
    try:
        os.startfile(ruta)  # noqa: S606 - abrir con la app predeterminada de Windows
    except OSError:
        pass
