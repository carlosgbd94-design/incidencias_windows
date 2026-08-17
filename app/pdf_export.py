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
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfgen import canvas as pdfcanvas
from reportlab.platypus import Paragraph, Table, TableStyle

from app.business_rules import ORDEN_TIPOS, formatear_duracion
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


_estilo_celda = ParagraphStyle("celda", fontName="Helvetica", fontSize=7.2, leading=8.6)
_estilo_celda_b = ParagraphStyle("celda_b", fontName="Helvetica-Bold", fontSize=7.2, leading=8.6)
_estilo_encab = ParagraphStyle("encab", fontName="Helvetica-Bold", fontSize=6.6, leading=7.8)
_estilo_perfil = ParagraphStyle("perfil", fontName="Helvetica", fontSize=8, leading=9.5)
_estilo_nota = ParagraphStyle("nota", fontName="Helvetica", fontSize=7.3, leading=9.2)


def fecha_es(fecha_iso: str) -> str:
    anio, mes, dia = fecha_iso.split("-")
    return f"{dia}/{mes}/{anio}"


def _dibujar_encabezado(c: pdfcanvas.Canvas, titulo: str, folio: str,
                         x: float, w: float, h: float) -> None:
    """Título y folio arriba a la derecha; logo con el tamaño y posición
    reales medidos del PDF oficial (bbox de la imagen, no una aproximación)."""
    if LOGO_PATH.exists():
        c.drawImage(str(LOGO_PATH), x, Y(14.2 + h), width=w, height=h, mask="auto")

    estilo_titulo = ParagraphStyle("titulo_pdf", fontName="Helvetica-Bold", fontSize=11.5,
                                    leading=13.5, alignment=TA_RIGHT)
    estilo_folio = ParagraphStyle("folio_pdf", fontName="Helvetica-Bold", fontSize=10,
                                   leading=12, alignment=TA_RIGHT)
    p_titulo = Paragraph(titulo, estilo_titulo)
    ancho_bloque = MARGEN_DER - 220
    w, h = p_titulo.wrapOn(c, ancho_bloque, 40)
    p_titulo.drawOn(c, MARGEN_DER - ancho_bloque, Y(8) - h)

    p_folio = Paragraph(folio, estilo_folio)
    w2, h2 = p_folio.wrapOn(c, ancho_bloque, 20)
    p_folio.drawOn(c, MARGEN_DER - ancho_bloque, Y(8) - h - h2 - 2)


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
    """Caja de datos del trabajador: 4 filas separadas por líneas horizontales
    a todo lo ancho. El original NO tiene ninguna línea vertical divisoria
    dentro de la caja (verificado contra los dibujos reales del PDF) — los
    pares Nombre/No.Empleado y Turno-Horario/Recurso solo van uno junto al
    otro, sin separador; x_col_der es la posición horizontal (medida del
    original) donde arranca el texto de la columna derecha."""
    alto_r1, alto_r2, alto_r3 = 24, 14, 14
    y_r1_bottom = y0_arriba + alto_r1
    y_r2_bottom = y_r1_bottom + alto_r2
    y_r3_bottom = y_r2_bottom + alto_r3
    col_der_x = x_col_der

    c.setLineWidth(0.75)
    c.rect(x0, Y(y1_arriba), x1 - x0, y1_arriba - y0_arriba, stroke=1, fill=0)
    for y in (y_r1_bottom, y_r2_bottom, y_r3_bottom):
        c.line(x0, Y(y), x1, Y(y))

    filas = [
        (y0_arriba, y_r1_bottom, _campo("Nombre:", perfil["nombre"]),
         _campo(f"{etiqueta_no}:", perfil["no_empleado"])),
        (y_r1_bottom, y_r2_bottom, _campo("Centro de trabajo:", perfil["centro_trabajo"]), None),
        (y_r2_bottom, y_r3_bottom, _campo("Área y Dirección a la que pertenece:", perfil["area_direccion"]), None),
        (y_r3_bottom, y1_arriba,
         Paragraph(f"<b>Turno:</b> {_mayus(perfil['turno'])}    <b>Horario:</b> {_horario_texto(perfil)}",
                   _estilo_perfil),
         _campo("Recurso:", perfil["recurso"])),
    ]
    pad = 5
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
    c.setFont("Helvetica-Bold", 11)
    c.drawCentredString(PAGE_W / 2, Y(y_arriba), texto)


def _dibujar_tabla_en(c: pdfcanvas.Canvas, filas: list, col_widths: list[float],
                       row_heights: list[float], x0: float, y0_arriba: float,
                       spans: list[tuple] | None = None) -> float:
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
    tabla = Table(filas, colWidths=col_widths, rowHeights=row_heights)
    tabla.setStyle(TableStyle(estilo))
    alto_total = sum(row_heights)
    w, h = tabla.wrapOn(c, sum(col_widths), alto_total)
    tabla.drawOn(c, x0, Y(y0_arriba) - h)
    return y0_arriba + h


# ---------------------------------------------------------------------------
# PASES DE SALIDA (U400-DRHSRL-P18-F02)
# ---------------------------------------------------------------------------

# Anchos de columna medidos directamente del PDF oficial (deben sumar 544.4,
# el ancho útil entre MARGEN_IZQ y MARGEN_DER). No modificar sin re-medir.
COLS_PARTICULARES = [43.6, 54.4, 108.9, 54.4, 87.1, 98.0, 98.0]
COLS_OFICIALES = [54.5, 81.6, 70.8, 70.8, 125.2, 141.5]

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
    jefe_nombre = _mayus(jefe_nombre)

    _dibujar_encabezado(c, "Control Mensual de Pases de Salida Particulares y Oficiales",
                         "U400-DRHSRL-P18-F02", **LOGO_PASES)
    _dibujar_caja_perfil(c, perfil, "No. Empleado", MARGEN_IZQ, MARGEN_DER, 61.3, 137.3, x_col_der=410.0)

    _titulo_seccion(c, "Particulares", 158)

    filas = [[
        Paragraph("<b>Pase</b>", _estilo_encab),
        Paragraph("<b>Fecha<br/>Día/Mes/Año</b>", _estilo_encab),
        Paragraph("", _estilo_encab),
        Paragraph("<b>Tiempo<br/>utilizado</b>", _estilo_encab),
        Paragraph("<b>Firma del<br/>Trabajador</b>", _estilo_encab),
        Paragraph("<b>Autorización Nombre y<br/>Firma Jefe Inmediato</b>", _estilo_encab),
        Paragraph("<b>Firma y Fecha de<br/>recibido (RRHUA)</b>", _estilo_encab),
    ]]
    alturas = [30]
    pases_ordenados = sorted(pases_particulares, key=lambda p: (p["fecha"], p["hora_salida"]))
    n_filas_part = max(MIN_FILAS_PARTICULARES, len(pases_ordenados))
    for i in range(n_filas_part):
        pase = pases_ordenados[i] if i < len(pases_ordenados) else None
        filas.append([
            Paragraph(str(i + 1), _estilo_celda_b),
            Paragraph(fecha_es(pase["fecha"]) if pase else "", _estilo_celda),
            Paragraph(_detalle_pase(pase), _estilo_celda),
            Paragraph(formatear_duracion(pase["minutos"]) if pase else "", _estilo_celda),
            Paragraph("", _estilo_celda),
            Paragraph(jefe_nombre if pase else "", _estilo_celda),
            Paragraph("", _estilo_celda),
        ])
        alturas.append(32)

    y_fin = _dibujar_tabla_en(c, filas, COLS_PARTICULARES, alturas, MARGEN_IZQ, 174)

    nota = Paragraph(
        "-Aplica: Personal de Base Federal, Estatal, Regularizado y Formalizado. "
        "Art. 92 fracciones I, III de las C.G.T.", _estilo_nota,
    )
    w, h = nota.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 20)
    nota.drawOn(c, MARGEN_IZQ, Y(y_fin) - h - 6)
    y_fin += h + 10

    _titulo_seccion(c, "Oficiales", y_fin + 12)

    filas_of = [[
        Paragraph("<b>Fecha<br/>Día/Mes/Año</b>", _estilo_encab),
        Paragraph("<b>Asunto</b>", _estilo_encab),
        Paragraph("<b>Dependencia<br/>a la que asiste</b>", _estilo_encab),
        Paragraph("<b>Horario<br/>de comisión</b>", _estilo_encab),
        Paragraph("<b>Nombre y firma de<br/>autorización</b>", _estilo_encab),
        Paragraph("<b>Sello de<br/>Permanencia</b>", _estilo_encab),
    ]]
    alturas_of = [36]
    oficiales_ordenados = sorted(pases_oficiales, key=lambda p: p["fecha"])
    n_filas_of = max(MIN_FILAS_OFICIALES, len(oficiales_ordenados))
    for i in range(n_filas_of):
        of = oficiales_ordenados[i] if i < len(oficiales_ordenados) else None
        filas_of.append([
            Paragraph(fecha_es(of["fecha"]) if of else "", _estilo_celda),
            Paragraph(_mayus(of["asunto"]) if of else "", _estilo_celda),
            Paragraph(_mayus(of["dependencia"]) if of else "", _estilo_celda),
            Paragraph(of["horario_comision"] if of else "", _estilo_celda),
            Paragraph(jefe_nombre if of else "", _estilo_celda),
            Paragraph("", _estilo_celda),
        ])
        alturas_of.append(44)

    _dibujar_tabla_en(c, filas_of, COLS_OFICIALES, alturas_of, MARGEN_IZQ, y_fin + 30)

    c.setFont("Helvetica", 9)
    c.line(MARGEN_IZQ + 160, Y(720), MARGEN_DER - 160, Y(720))
    c.drawCentredString(PAGE_W / 2, Y(732), "Firma del Trabajador")
    c.setFont("Helvetica", 7.5)
    c.drawRightString(MARGEN_DER, Y(766), "Actualización, julio 2019")

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
COLS_VACACIONES = [110.8, 158.3, 153.1, 116.9]


def generar_pdf_vacaciones(perfil: dict, periodos_por_tipo: dict, dia_especial: dict | None,
                            jefe_nombre: str, anio: int, output_path: str) -> None:
    c = pdfcanvas.Canvas(output_path, pagesize=(PAGE_W, PAGE_H))
    jefe_nombre = _mayus(jefe_nombre)

    _dibujar_encabezado(c, "Control Anual de Períodos Vacacionales, Cumpleaños o Santoral",
                         "U400-DRHSRL-P18-F03", **LOGO_VACACIONES)
    _dibujar_caja_perfil(c, perfil, "Trabajador", MARGEN_IZQ, 567.2, 60.6, 136.7, x_col_der=404.0)

    _titulo_seccion(c, "Períodos Vacacionales", 156)

    filas = [[
        Paragraph(f"<b>Año: {anio}</b>", _estilo_encab),
        Paragraph("<b>Período</b>", _estilo_encab),
        Paragraph("<b>Autorización Jefe Inmediato:<br/>Nombre y Firma</b>", _estilo_encab),
        Paragraph("<b>Firma y Fecha de<br/>recibido (RRHUA)</b>", _estilo_encab),
    ]]
    alturas = [27]
    for tipo in ORDEN_TIPOS:
        periodos = periodos_por_tipo.get(tipo, [])
        if not periodos:
            filas.append([
                Paragraph(f"<b>{TIPO_ETIQUETA[tipo]}</b>", _estilo_celda_b),
                Paragraph("Del ___/___/___ al ___/___/___", _estilo_celda),
                Paragraph("", _estilo_celda), Paragraph("", _estilo_celda),
            ])
            alturas.append(30)
        else:
            for p in periodos:
                extra = f"<br/>Motivo: {p['motivo']}" if p.get("motivo") else ""
                filas.append([
                    Paragraph(f"<b>{TIPO_ETIQUETA[tipo]}</b>", _estilo_celda_b),
                    Paragraph(f"Del {fecha_es(p['fecha_inicio'])} al {fecha_es(p['fecha_fin'])} "
                              f"({p['dias_habiles']} días hábiles){extra}", _estilo_celda),
                    Paragraph(jefe_nombre, _estilo_celda), Paragraph("", _estilo_celda),
                ])
                alturas.append(30)

    y_fin = _dibujar_tabla_en(c, filas, COLS_VACACIONES, alturas, MARGEN_IZQ, 167)

    notas = [
        "<b>Ordinarias:</b> Art. 144, 145 CGT. En ningún caso, podrán acumularse entre sí cualquiera de los "
        "períodos vacacionales enunciados ni tampoco podrán disfrutarse de manera continua en períodos "
        "inmediatos a cualquier tipo de licencias o días económicos.",
        "<b>Alto, mediano y bajo riesgo:</b> Art. 140, 130 fracción XX de las CGT, y la fracción II de la "
        "sección segunda del manual para prevenir y disminuir riesgos de trabajo e indicar el otorgamiento "
        "de derechos adicionales.",
        "<b>Extraordinarias:</b> Art. 213 fracción VII CGT y las normas para el otorgamiento de estímulos y "
        "recompensas civiles.",
    ]
    y_cursor = y_fin + 8
    for texto in notas:
        p = Paragraph(texto, _estilo_nota)
        w, h = p.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 30)
        p.drawOn(c, MARGEN_IZQ, Y(y_cursor) - h)
        y_cursor += h + 2

    y_cursor += 14
    _titulo_seccion(c, "Cumpleaños o santoral", y_cursor)
    y_cursor += 12

    intro = Paragraph(
        "Este formato solo será válido para solicitar un día de acuerdo a lo establecido en el artículo 141, "
        "fracción I de las CGT. Si el día de cumpleaños o santoral cae en los días de fin de semana para los "
        "que laboran de lunes a viernes o festivo oficial no se otorgará. El trabajador determina desde el "
        "inicio de su relación laboral, si se considerará el cumpleaños o el santoral, siendo esta elección "
        "inamovible.", _estilo_nota,
    )
    w, h = intro.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 40)
    intro.drawOn(c, MARGEN_IZQ, Y(y_cursor) - h)
    y_cursor += h + 10

    tipo_dia = perfil.get("tipo_dia_especial") or ""
    c.setFont("Helvetica", 9)
    c.drawString(MARGEN_IZQ, Y(y_cursor + 9), "*Cumpleaños")
    c.rect(MARGEN_IZQ + 72, Y(y_cursor + 12), 13, 12, stroke=1, fill=0)
    if tipo_dia == "Cumpleaños":
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(MARGEN_IZQ + 78.5, Y(y_cursor + 9), "X")
        c.setFont("Helvetica", 9)
    c.drawString(MARGEN_IZQ + 150, Y(y_cursor + 9), "*Santoral")
    c.rect(MARGEN_IZQ + 213, Y(y_cursor + 12), 13, 12, stroke=1, fill=0)
    if tipo_dia == "Santoral":
        c.setFont("Helvetica-Bold", 9)
        c.drawCentredString(MARGEN_IZQ + 219.5, Y(y_cursor + 9), "X")
    y_cursor += 26

    fecha_corresponde = perfil.get("fecha_dia_especial") or "-"
    if dia_especial and dia_especial.get("aplico"):
        fecha_solicita = fecha_es(dia_especial["fecha_otorgada"])
    elif dia_especial and not dia_especial.get("aplico"):
        fecha_solicita = "No aplica este año"
    else:
        fecha_solicita = ""

    filas_dia = [
        [Paragraph("<b>Fecha (día que<br/>corresponde)</b>", _estilo_celda_b),
         Paragraph(fecha_corresponde, _estilo_celda),
         Paragraph("<b>Autoriza:</b><br/>Jefe del Departamento", _estilo_celda),
         Paragraph(jefe_nombre, _estilo_celda)],
        [Paragraph("<b>Fecha (día que<br/>solicita)</b>", _estilo_celda_b),
         Paragraph(fecha_solicita, _estilo_celda),
         Paragraph("<b>Nombre y Firma</b>", _estilo_celda_b),
         Paragraph("", _estilo_celda)],
    ]
    _dibujar_tabla_en(c, filas_dia, [140, 90, 130, 179.1], [30, 30], MARGEN_IZQ, y_cursor)
    y_cursor += 60 + 6

    pie = Paragraph(
        "Art. 141 Fracción I de las CGT y las normas para el otorgamiento del día de cumpleaños o santoral.",
        _estilo_nota,
    )
    w, h = pie.wrapOn(c, MARGEN_DER - MARGEN_IZQ, 16)
    pie.drawOn(c, MARGEN_IZQ, Y(y_cursor) - h)

    c.setFont("Helvetica", 9)
    c.line(MARGEN_IZQ + 150, Y(763), MARGEN_DER - 150, Y(763))
    c.drawCentredString(PAGE_W / 2, Y(775), "Firma del Trabajador")
    c.setFont("Helvetica", 7.5)
    c.drawRightString(MARGEN_DER, Y(785), "Actualización, julio 2019")

    c.save()


def abrir_pdf(ruta: str) -> None:
    """Abre el PDF generado con el visor predeterminado del sistema."""
    try:
        os.startfile(ruta)  # noqa: S606 - abrir con la app predeterminada de Windows
    except OSError:
        pass
