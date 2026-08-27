"""Capa de servicio que las vistas de Qt llaman directo (sin ningún puente
JS de por medio, a diferencia de la versión anterior). Puerto de
app/api.py: 25 de los 30 métodos son SQL + reglas de negocio puras y se
mueven sin ningún cambio de lógica; solo 5 tocaban `webview` y se adaptan
a QFileDialog / al cierre normal de la ventana de Qt (ver comentarios en
cada uno). Se conserva el contrato {"ok","error","data"} y el decorador de
telemetría -- ver la nota en app/ui/main_window.py sobre por qué."""
import functools
import inspect
from datetime import date, datetime

from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QFileDialog

from app.business_rules import (
    DIAS_ORDINARIO, ORDEN_TIPOS, calcular_minutos_pase, dias_habiles, dias_para_riesgo,
    fecha_fin_por_dias_habiles, formatear_duracion, validar_dia_especial,
    validar_limite_pase, MAX_MINUTOS_DIA, MAX_MINUTOS_MES,
)
from app.database import get_connection, init_db, obtener_perfil
from app.holidays import asegurar_festivos_para, obtener_festivos
from app.version import APP_VERSION
from app import telemetry
# app.pdf_export importa reportlab (~0.25s de arranque medidos en frío) para
# dibujar los PDF; se importa perezosamente dentro de exportar_pases()/
# exportar_vacaciones() en vez de aquí arriba, para que ese costo no se pague
# en cada apertura de la app sino solo cuando el usuario realmente exporta.

RIESGO_A_TIPO = {"Alto": "riesgo_alto", "Mediano": "riesgo_mediano", "Bajo": "riesgo_bajo"}


def _ok(data=None):
    return {"ok": True, "error": None, "data": data}


def _fail(mensaje: str):
    return {"ok": False, "error": mensaje, "data": None}


def _reportar_si_falla(metodo):
    """Envuelve un método para que un bug real (excepción no prevista,
    distinta de los _fail() deliberados de validación) quede reportado a la
    telemetría en vez de romper la vista en silencio."""
    @functools.wraps(metodo)
    def envoltura(self, *args, **kwargs):
        try:
            return metodo(self, *args, **kwargs)
        except Exception as e:
            telemetry.reportar(e)
            return _fail("Ocurrió un error inesperado. Ya quedó registrado para revisión.")
    return envoltura


def _envolver_metodos_publicos(cls):
    for nombre, atributo in list(vars(cls).items()):
        # inspect.isfunction() (no callable() a secas): un Signal de Qt
        # también es "callable" a nivel de clase, y envolverlo con
        # functools.wraps lo reemplazaba por una función normal, rompiendo
        # .connect() -- isfunction() solo acepta métodos de verdad.
        if nombre.startswith("_") or not inspect.isfunction(atributo):
            continue
        setattr(cls, nombre, _reportar_si_falla(atributo))
    return cls


@_envolver_metodos_publicos
class Backend(QObject):
    # actualizar_ahora() emite esto en vez de sostener una referencia a la
    # ventana y llamarle .destroy() directo -- MainWindow se conecta a esta
    # señal y decide cómo cerrarse, Backend queda desacoplado de la UI.
    cierre_solicitado = Signal()

    def __init__(self, ventana_padre=None):
        super().__init__()
        # Solo se usa como parent= de los QFileDialog (para que salgan bien
        # centrados/modales) -- Backend no le llama ningún otro método.
        self.ventana_padre = ventana_padre
        self.conn = get_connection()
        init_db(self.conn)

    # ---------------- Meta ----------------
    def version_actual(self):
        return _ok(APP_VERSION)

    def actualizacion_lista(self):
        from app import updater
        return _ok(updater.hay_actualizacion_lista())

    def actualizar_ahora(self):
        from app import updater
        if not updater.hay_actualizacion_lista():
            return _fail("No hay ninguna actualización lista para instalar todavía.")
        self.cierre_solicitado.emit()
        return _ok()

    # ---------------- Perfil ----------------
    def perfil_obtener(self):
        return _ok(dict(obtener_perfil(self.conn)))

    def perfil_guardar(self, datos):
        campos_obligatorios = ["nombre", "no_empleado", "centro_trabajo", "area_direccion",
                                "turno", "recurso", "hora_entrada", "hora_fin_turno"]
        for campo in campos_obligatorios:
            if not (datos.get(campo) or "").strip():
                return _fail(f"Falta el campo '{campo}'.")
        try:
            he = datetime.strptime(datos["hora_entrada"], "%H:%M")
            hf = datetime.strptime(datos["hora_fin_turno"], "%H:%M")
        except ValueError:
            return _fail("El horario debe tener formato HH:MM.")
        if hf <= he:
            return _fail("La hora de fin de turno debe ser posterior a la hora de entrada.")
        dias_sel = datos.get("dias_laborables") or []
        if not dias_sel:
            return _fail("Selecciona al menos un día laborable.")

        tipo_dia = (datos.get("tipo_dia_especial") or "").strip() or None
        fecha_dia = (datos.get("fecha_dia_especial") or "").strip() or None
        if tipo_dia and fecha_dia:
            try:
                dia_n, mes_n = fecha_dia.split("/")
                date(2000, int(mes_n), int(dia_n))
            except (ValueError, IndexError):
                return _fail("La fecha de día especial debe tener formato DD/MM válido.")

        self.conn.execute(
            """
            UPDATE perfil SET nombre=?, no_empleado=?, centro_trabajo=?, area_direccion=?, turno=?, recurso=?,
                hora_entrada=?, hora_fin_turno=?, dias_laborables=?, nivel_riesgo=?,
                tipo_dia_especial=?, fecha_dia_especial=?, setup_completo=1
            WHERE id=1
            """,
            (
                datos["nombre"].strip(), datos["no_empleado"].strip(), datos["centro_trabajo"].strip(),
                datos["area_direccion"].strip(), datos["turno"], datos["recurso"],
                datos["hora_entrada"], datos["hora_fin_turno"], ",".join(dias_sel),
                datos.get("nivel_riesgo") or "Ninguno", tipo_dia, fecha_dia,
            ),
        )
        self.conn.commit()
        return _ok(dict(obtener_perfil(self.conn)))

    # ---------------- Pases particulares ----------------
    def pases_listar(self, anio, mes):
        prefijo = f"{int(anio):04d}-{int(mes):02d}"
        filas = self.conn.execute(
            "SELECT * FROM pases_particulares WHERE substr(fecha,1,7)=? ORDER BY fecha, hora_salida",
            (prefijo,),
        ).fetchall()
        pases = []
        total_mes = 0
        for fila in filas:
            total_mes += fila["minutos"]
            pases.append({
                "id": fila["id"], "fecha": fila["fecha"], "hora_salida": fila["hora_salida"],
                "regresa": bool(fila["regresa"]), "hora_regreso": fila["hora_regreso"],
                "minutos": fila["minutos"], "duracion_texto": formatear_duracion(fila["minutos"]),
                "exportado": bool(fila["exportado"]),
            })
        return _ok({
            "pases": pases,
            "resumen": {
                "usado_min": total_mes, "restante_min": max(0, MAX_MINUTOS_MES - total_mes),
                "usado_texto": formatear_duracion(total_mes),
                "restante_texto": formatear_duracion(max(0, MAX_MINUTOS_MES - total_mes)),
                "limite_dia_texto": formatear_duracion(MAX_MINUTOS_DIA),
                "limite_mes_texto": formatear_duracion(MAX_MINUTOS_MES),
            },
        })

    def pases_registrar(self, datos):
        perfil = obtener_perfil(self.conn)
        if not perfil["setup_completo"]:
            return _fail("Primero completa tu Perfil (horario) antes de registrar pases.")
        fecha = datos.get("fecha")
        hora_salida = datos.get("hora_salida")
        regresa = bool(datos.get("regresa"))
        hora_regreso = datos.get("hora_regreso") or None
        if not fecha or not hora_salida:
            return _fail("Captura la fecha y la hora de salida.")
        if regresa and not hora_regreso:
            return _fail("Captura la hora de regreso, o marca que no regresa.")
        try:
            minutos = calcular_minutos_pase(hora_salida, regresa, hora_regreso, perfil["hora_fin_turno"])
        except ValueError as e:
            return _fail(str(e))
        ok, motivo = validar_limite_pase(self.conn, fecha, minutos)
        if not ok:
            return _fail(motivo)
        self.conn.execute(
            "INSERT INTO pases_particulares (fecha, hora_salida, regresa, hora_regreso, minutos) "
            "VALUES (?, ?, ?, ?, ?)",
            (fecha, hora_salida, int(regresa), hora_regreso, minutos),
        )
        self.conn.commit()
        return _ok({"minutos": minutos, "duracion_texto": formatear_duracion(minutos)})

    def pases_eliminar(self, id_pase):
        fila = self.conn.execute("SELECT id FROM pases_particulares WHERE id=?", (id_pase,)).fetchone()
        if not fila:
            return _fail("El pase ya no existe.")
        self.conn.execute("DELETE FROM pases_particulares WHERE id=?", (id_pase,))
        self.conn.commit()
        return _ok()

    def pases_editar(self, id_pase, datos):
        perfil = obtener_perfil(self.conn)
        fila = self.conn.execute("SELECT id FROM pases_particulares WHERE id=?", (id_pase,)).fetchone()
        if not fila:
            return _fail("El pase ya no existe.")
        fecha = datos.get("fecha")
        hora_salida = datos.get("hora_salida")
        regresa = bool(datos.get("regresa"))
        hora_regreso = datos.get("hora_regreso") or None
        if not fecha or not hora_salida:
            return _fail("Captura la fecha y la hora de salida.")
        if regresa and not hora_regreso:
            return _fail("Captura la hora de regreso, o marca que no regresa.")
        try:
            minutos = calcular_minutos_pase(hora_salida, regresa, hora_regreso, perfil["hora_fin_turno"])
        except ValueError as e:
            return _fail(str(e))
        ok, motivo = validar_limite_pase(self.conn, fecha, minutos, excluir_id=id_pase)
        if not ok:
            return _fail(motivo)
        self.conn.execute(
            "UPDATE pases_particulares SET fecha=?, hora_salida=?, regresa=?, hora_regreso=?, minutos=? WHERE id=?",
            (fecha, hora_salida, int(regresa), hora_regreso, minutos, id_pase),
        )
        self.conn.commit()
        return _ok({"minutos": minutos, "duracion_texto": formatear_duracion(minutos)})

    # ---------------- Pases oficiales ----------------
    def oficiales_listar(self, anio, mes):
        prefijo = f"{int(anio):04d}-{int(mes):02d}"
        filas = self.conn.execute(
            "SELECT * FROM pases_oficiales WHERE substr(fecha,1,7)=? ORDER BY fecha", (prefijo,),
        ).fetchall()
        return _ok([dict(f) | {"exportado": bool(f["exportado"])} for f in filas])

    def oficiales_registrar(self, datos):
        for campo in ("fecha", "asunto", "dependencia", "horario_comision"):
            if not (datos.get(campo) or "").strip():
                return _fail("Completa fecha, asunto, dependencia y horario de comisión.")
        self.conn.execute(
            "INSERT INTO pases_oficiales (fecha, asunto, dependencia, horario_comision) VALUES (?, ?, ?, ?)",
            (datos["fecha"], datos["asunto"].strip(), datos["dependencia"].strip(),
             datos["horario_comision"].strip()),
        )
        self.conn.commit()
        return _ok()

    def oficiales_eliminar(self, id_oficial):
        fila = self.conn.execute("SELECT id FROM pases_oficiales WHERE id=?", (id_oficial,)).fetchone()
        if not fila:
            return _fail("La comisión ya no existe.")
        self.conn.execute("DELETE FROM pases_oficiales WHERE id=?", (id_oficial,))
        self.conn.commit()
        return _ok()

    def oficiales_editar(self, id_oficial, datos):
        fila = self.conn.execute("SELECT id FROM pases_oficiales WHERE id=?", (id_oficial,)).fetchone()
        if not fila:
            return _fail("La comisión ya no existe.")
        for campo in ("fecha", "asunto", "dependencia", "horario_comision"):
            if not (datos.get(campo) or "").strip():
                return _fail("Completa fecha, asunto, dependencia y horario de comisión.")
        self.conn.execute(
            "UPDATE pases_oficiales SET fecha=?, asunto=?, dependencia=?, horario_comision=? WHERE id=?",
            (datos["fecha"], datos["asunto"].strip(), datos["dependencia"].strip(),
             datos["horario_comision"].strip(), id_oficial),
        )
        self.conn.commit()
        return _ok()

    # ---------------- Vacaciones ----------------
    def _festivos(self, anio):
        asegurar_festivos_para(self.conn, int(anio))
        return obtener_festivos(self.conn)

    def vacaciones_listar(self, anio):
        anio = int(anio)
        filas = self.conn.execute(
            "SELECT * FROM periodos_vacacionales WHERE anio=? ORDER BY tipo, fecha_inicio", (anio,),
        ).fetchall()
        periodos = {t: [] for t in ORDEN_TIPOS}
        for f in filas:
            periodos[f["tipo"]].append(dict(f) | {"exportado": bool(f["exportado"])})

        registro_dia = self.conn.execute(
            "SELECT * FROM dias_especiales_otorgados WHERE anio=?", (anio,),
        ).fetchone()

        perfil = obtener_perfil(self.conn)
        return _ok({
            "periodos": periodos,
            "nivel_riesgo": perfil["nivel_riesgo"],
            "tipo_dia_especial": perfil["tipo_dia_especial"],
            "fecha_dia_especial": perfil["fecha_dia_especial"],
            "dia_especial": (dict(registro_dia) | {"aplico": bool(registro_dia["aplico"])}) if registro_dia else None,
        })

    def _dias_usados_ordinario(self, anio: int, tipo: str) -> int:
        filas = self.conn.execute(
            "SELECT dias_habiles FROM periodos_vacacionales WHERE anio=? AND tipo=?", (anio, tipo),
        ).fetchall()
        return sum(f["dias_habiles"] for f in filas)

    def vacaciones_sugerir_fin_ordinario(self, tipo, anio, fecha_inicio):
        if tipo not in ("primero", "segundo"):
            return _fail("Tipo de periodo inválido.")
        anio = int(anio)
        dias_restantes = DIAS_ORDINARIO - self._dias_usados_ordinario(anio, tipo)
        if dias_restantes <= 0:
            return _fail(f"Ya se agotaron los {DIAS_ORDINARIO} días hábiles de este periodo en {anio}.")
        inicio = date.fromisoformat(fecha_inicio)
        festivos = self._festivos(anio)
        fin = fecha_fin_por_dias_habiles(inicio, dias_restantes, festivos)
        return _ok({"fecha_fin": fin.isoformat(), "dias_restantes": dias_restantes})

    def vacaciones_registrar_ordinario(self, tipo, anio, fecha_inicio, fecha_fin):
        if tipo not in ("primero", "segundo"):
            return _fail("Tipo de periodo inválido.")
        anio = int(anio)
        inicio = date.fromisoformat(fecha_inicio)
        fin = date.fromisoformat(fecha_fin)
        if fin < inicio:
            return _fail("La fecha final debe ser igual o posterior a la fecha inicial.")
        festivos = self._festivos(anio)
        dias = dias_habiles(inicio, fin, festivos)
        dias_usados_previos = self._dias_usados_ordinario(anio, tipo)
        if dias_usados_previos + dias > DIAS_ORDINARIO:
            restantes = DIAS_ORDINARIO - dias_usados_previos
            return _fail(
                f"Este fragmento ({dias} días hábiles) rebasa lo disponible: "
                f"solo quedan {restantes} de los {DIAS_ORDINARIO} días hábiles de este periodo."
            )
        self.conn.execute(
            "INSERT INTO periodos_vacacionales (anio, tipo, fecha_inicio, fecha_fin, dias_habiles) "
            "VALUES (?, ?, ?, ?, ?)",
            (anio, tipo, inicio.isoformat(), fin.isoformat(), dias),
        )
        self.conn.commit()
        restantes = DIAS_ORDINARIO - dias_usados_previos - dias
        return _ok({"fecha_fin": fin.isoformat(), "dias_habiles": dias, "dias_restantes": restantes})

    def vacaciones_registrar_riesgo(self, anio, fecha_inicio):
        anio = int(anio)
        perfil = obtener_perfil(self.conn)
        nivel = perfil["nivel_riesgo"]
        if nivel not in RIESGO_A_TIPO:
            return _fail("Configura tu nivel de riesgo en tu Perfil primero.")
        tipo = RIESGO_A_TIPO[nivel]
        existente = self.conn.execute(
            "SELECT id FROM periodos_vacacionales WHERE anio=? AND tipo=?", (anio, tipo),
        ).fetchone()
        if existente:
            return _fail("Ya existe un periodo de riesgo registrado para este año.")
        dias_riesgo = dias_para_riesgo(nivel)
        inicio = date.fromisoformat(fecha_inicio)
        festivos = self._festivos(anio)
        fin = fecha_fin_por_dias_habiles(inicio, dias_riesgo, festivos)
        dias = dias_habiles(inicio, fin, festivos)
        self.conn.execute(
            "INSERT INTO periodos_vacacionales (anio, tipo, fecha_inicio, fecha_fin, dias_habiles) "
            "VALUES (?, ?, ?, ?, ?)",
            (anio, tipo, inicio.isoformat(), fin.isoformat(), dias),
        )
        self.conn.commit()
        return _ok({"fecha_fin": fin.isoformat(), "dias_habiles": dias})

    def vacaciones_registrar_extraordinario(self, anio, fecha_inicio, fecha_fin, motivo):
        anio = int(anio)
        inicio = date.fromisoformat(fecha_inicio)
        fin = date.fromisoformat(fecha_fin)
        if fin < inicio:
            return _fail("La fecha final debe ser igual o posterior a la fecha inicial.")
        festivos = self._festivos(anio)
        dias = dias_habiles(inicio, fin, festivos)
        self.conn.execute(
            "INSERT INTO periodos_vacacionales (anio, tipo, fecha_inicio, fecha_fin, dias_habiles, motivo) "
            "VALUES (?, 'extraordinario', ?, ?, ?, ?)",
            (anio, inicio.isoformat(), fin.isoformat(), dias, (motivo or "").strip()),
        )
        self.conn.commit()
        return _ok({"dias_habiles": dias})

    def vacaciones_eliminar_periodo(self, id_periodo):
        fila = self.conn.execute("SELECT exportado FROM periodos_vacacionales WHERE id=?", (id_periodo,)).fetchone()
        if not fila:
            return _fail("El periodo ya no existe.")
        if fila["exportado"]:
            return _fail("Este periodo ya fue exportado y no se puede eliminar.")
        self.conn.execute("DELETE FROM periodos_vacacionales WHERE id=?", (id_periodo,))
        self.conn.commit()
        return _ok()

    def dia_especial_solicitar(self, anio):
        anio = int(anio)
        perfil = obtener_perfil(self.conn)
        if not perfil["tipo_dia_especial"] or not perfil["fecha_dia_especial"]:
            return _fail("Configura tu día de cumpleaños/santoral en tu Perfil primero.")
        existente = self.conn.execute(
            "SELECT id FROM dias_especiales_otorgados WHERE anio=?", (anio,),
        ).fetchone()
        if existente:
            return _fail("Ya hay una solicitud registrada para este año.")
        dia_n, mes_n = perfil["fecha_dia_especial"].split("/")
        fecha = date(anio, int(mes_n), int(dia_n))
        festivos = self._festivos(anio)
        aplica, motivo = validar_dia_especial(fecha, festivos)
        self.conn.execute(
            "INSERT INTO dias_especiales_otorgados (anio, fecha_otorgada, aplico) VALUES (?, ?, ?)",
            (anio, fecha.isoformat() if aplica else None, int(aplica)),
        )
        self.conn.commit()
        return _ok({"aplica": aplica, "motivo": motivo, "fecha": fecha.isoformat() if aplica else None})

    def dia_especial_quitar(self, id_registro):
        fila = self.conn.execute(
            "SELECT exportado FROM dias_especiales_otorgados WHERE id=?", (id_registro,),
        ).fetchone()
        if not fila:
            return _fail("El registro ya no existe.")
        if fila["exportado"]:
            return _fail("Esta solicitud ya fue exportada y no se puede quitar.")
        self.conn.execute("DELETE FROM dias_especiales_otorgados WHERE id=?", (id_registro,))
        self.conn.commit()
        return _ok()

    # ---------------- Festivos ----------------
    def festivos_listar(self, anio):
        anio = int(anio)
        asegurar_festivos_para(self.conn, anio)
        filas = self.conn.execute(
            "SELECT * FROM festivos WHERE substr(fecha,1,4)=? ORDER BY fecha", (str(anio),),
        ).fetchall()
        return _ok([dict(f) for f in filas])

    def festivos_agregar(self, fecha, descripcion):
        if not (descripcion or "").strip():
            return _fail("Escribe una descripción para el festivo.")
        self.conn.execute(
            "INSERT INTO festivos (fecha, descripcion, origen) VALUES (?, ?, 'personalizado') "
            "ON CONFLICT(fecha) DO UPDATE SET descripcion=excluded.descripcion",
            (fecha, descripcion.strip()),
        )
        self.conn.commit()
        return _ok()

    def festivos_eliminar(self, fecha):
        fila = self.conn.execute("SELECT origen FROM festivos WHERE fecha=?", (fecha,)).fetchone()
        if fila and fila["origen"] == "oficial":
            return _fail("Los festivos oficiales no se pueden eliminar (se agregarían de nuevo automáticamente).")
        self.conn.execute("DELETE FROM festivos WHERE fecha=?", (fecha,))
        self.conn.commit()
        return _ok()

    # ---------------- Exportar ----------------
    def exportar_contar_pendientes_pases(self, fecha_inicio, fecha_fin, incluir_exportados):
        """Nuevo -- reemplaza el conteo que web/js/views/exportar.js hacía
        del lado del cliente (traer las listas completas y filtrar en JS)."""
        clausula = "" if incluir_exportados else "AND exportado=0"
        n_part = self.conn.execute(
            f"SELECT COUNT(*) FROM pases_particulares WHERE fecha BETWEEN ? AND ? {clausula}",
            (fecha_inicio, fecha_fin),
        ).fetchone()[0]
        n_ofic = self.conn.execute(
            f"SELECT COUNT(*) FROM pases_oficiales WHERE fecha BETWEEN ? AND ? {clausula}",
            (fecha_inicio, fecha_fin),
        ).fetchone()[0]
        return _ok({"total": n_part + n_ofic})

    def exportar_contar_pendientes_vacaciones(self, anio, incluir_exportados):
        clausula = "" if incluir_exportados else "AND exportado=0"
        n_periodos = self.conn.execute(
            f"SELECT COUNT(*) FROM periodos_vacacionales WHERE anio=? {clausula}", (int(anio),),
        ).fetchone()[0]
        n_dia = self.conn.execute(
            f"SELECT COUNT(*) FROM dias_especiales_otorgados WHERE anio=? {clausula}", (int(anio),),
        ).fetchone()[0]
        return _ok({"total": n_periodos + n_dia})

    def exportar_pases(self, fecha_inicio, fecha_fin, jefe_nombre, incluir_exportados):
        from app.pdf_export import abrir_pdf, generar_pdf_pases
        if not (jefe_nombre or "").strip():
            return _fail("Ingresa el nombre y firma del jefe inmediato.")
        perfil = obtener_perfil(self.conn)
        if not perfil["setup_completo"]:
            return _fail("Completa tu Perfil antes de exportar.")
        try:
            inicio = date.fromisoformat(fecha_inicio)
            fin = date.fromisoformat(fecha_fin)
        except ValueError:
            return _fail("El rango de fechas no es válido.")
        if fin < inicio:
            return _fail("La fecha final debe ser igual o posterior a la fecha inicial.")
        if (inicio.year, inicio.month) != (fin.year, fin.month):
            return _fail(
                "El formato oficial es mensual: el rango debe caer dentro del mismo mes "
                "(por ejemplo, una quincena)."
            )
        anio, mes = inicio.year, inicio.month
        clausula = "" if incluir_exportados else "AND exportado=0"
        particulares = [dict(r) for r in self.conn.execute(
            f"SELECT * FROM pases_particulares WHERE fecha BETWEEN ? AND ? {clausula} ORDER BY fecha, hora_salida",
            (fecha_inicio, fecha_fin),
        ).fetchall()]
        oficiales = [dict(r) for r in self.conn.execute(
            f"SELECT * FROM pases_oficiales WHERE fecha BETWEEN ? AND ? {clausula} ORDER BY fecha",
            (fecha_inicio, fecha_fin),
        ).fetchall()]
        if not particulares and not oficiales:
            return _fail("No hay pases pendientes por exportar en ese rango de fechas.")

        nombre_sugerido = f"Pases_{perfil['no_empleado']}_{inicio.strftime('%d%m')}-{fin.strftime('%d%m')}_{anio}.pdf"
        # Antes: self.window.create_file_dialog(webview.SAVE_DIALOG, ...) --
        # QFileDialog.getSaveFileName regresa (ruta, filtro), no una lista.
        ruta, _filtro = QFileDialog.getSaveFileName(
            self.ventana_padre, "Guardar PDF de pases", nombre_sugerido, "Archivos PDF (*.pdf)",
        )
        if not ruta:
            return _ok({"cancelado": True})

        generar_pdf_pases(perfil, particulares, oficiales, jefe_nombre.strip(), int(mes), int(anio), ruta)

        hoy_iso = datetime.today().date().isoformat()
        for p in particulares:
            if not p["exportado"]:
                self.conn.execute("UPDATE pases_particulares SET exportado=1, fecha_exportado=? WHERE id=?",
                                   (hoy_iso, p["id"]))
        for o in oficiales:
            if not o["exportado"]:
                self.conn.execute("UPDATE pases_oficiales SET exportado=1, fecha_exportado=? WHERE id=?",
                                   (hoy_iso, o["id"]))
        self.conn.commit()
        abrir_pdf(ruta)
        return _ok({"ruta": ruta})

    def exportar_vacaciones(self, anio, jefe_nombre, incluir_exportados):
        from app.pdf_export import abrir_pdf, generar_pdf_vacaciones
        if not (jefe_nombre or "").strip():
            return _fail("Ingresa el nombre y firma del jefe inmediato.")
        perfil = obtener_perfil(self.conn)
        if not perfil["setup_completo"]:
            return _fail("Completa tu Perfil antes de exportar.")
        anio = int(anio)
        clausula = "" if incluir_exportados else "AND exportado=0"
        filas = [dict(r) for r in self.conn.execute(
            f"SELECT * FROM periodos_vacacionales WHERE anio=? {clausula} ORDER BY tipo, fecha_inicio", (anio,),
        ).fetchall()]
        periodos_por_tipo = {t: [] for t in ORDEN_TIPOS}
        for f in filas:
            periodos_por_tipo[f["tipo"]].append(f)

        registro_dia = self.conn.execute(
            f"SELECT * FROM dias_especiales_otorgados WHERE anio=? {clausula}", (anio,),
        ).fetchone()
        dia_especial = dict(registro_dia) if registro_dia else None

        if not filas and not dia_especial:
            return _fail("No hay periodos vacacionales pendientes por exportar en ese año.")

        nombre_sugerido = f"Vacaciones_{perfil['no_empleado']}_{anio}.pdf"
        ruta, _filtro = QFileDialog.getSaveFileName(
            self.ventana_padre, "Guardar PDF de vacaciones", nombre_sugerido, "Archivos PDF (*.pdf)",
        )
        if not ruta:
            return _ok({"cancelado": True})

        generar_pdf_vacaciones(perfil, periodos_por_tipo, dia_especial, jefe_nombre.strip(), anio, ruta)

        for f in filas:
            if not f["exportado"]:
                self.conn.execute("UPDATE periodos_vacacionales SET exportado=1 WHERE id=?", (f["id"],))
        if dia_especial and not dia_especial["exportado"]:
            self.conn.execute("UPDATE dias_especiales_otorgados SET exportado=1 WHERE id=?", (dia_especial["id"],))
        self.conn.commit()
        abrir_pdf(ruta)
        return _ok({"ruta": ruta})

    # ---------------- Respaldo ----------------
    def respaldo_generar(self):
        import sqlite3
        from datetime import datetime as dt
        nombre_sugerido = f"Respaldo_ControlPasesSESEQ_{dt.today().strftime('%Y%m%d_%H%M')}.db"
        ruta, _filtro = QFileDialog.getSaveFileName(
            self.ventana_padre, "Guardar respaldo", nombre_sugerido, "Base de datos SQLite (*.db)",
        )
        if not ruta:
            return _ok({"cancelado": True})
        destino = sqlite3.connect(ruta)
        try:
            self.conn.backup(destino)
        finally:
            destino.close()
        return _ok({"ruta": ruta})

    def respaldo_restaurar(self):
        import sqlite3
        ruta, _filtro = QFileDialog.getOpenFileName(
            self.ventana_padre, "Restaurar respaldo", "", "Base de datos SQLite (*.db)",
        )
        if not ruta:
            return _ok({"cancelado": True})
        try:
            origen = sqlite3.connect(ruta)
            origen.execute("SELECT id FROM perfil LIMIT 1")
        except sqlite3.Error:
            return _fail("El archivo seleccionado no es un respaldo válido de esta aplicación.")
        try:
            origen.backup(self.conn)
        finally:
            origen.close()
        return _ok()

    def obtener_ruta_bd(self):
        from app.database import get_db_path
        return _ok(str(get_db_path()))

    def registrar_error_js(self, mensaje):
        """Recibe errores no controlados del frontend (window.onerror /
        unhandledrejection), los agrega a un log local (diagnóstico sin
        herramientas de depuración) y además los manda a la telemetría
        centralizada, ya que un error de JS nunca lanza una excepción de
        Python que el decorador de Api pudiera capturar solo."""
        from datetime import datetime as dt
        from app.database import get_data_dir
        log_path = get_data_dir() / "debug.log"
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{dt.now().isoformat(timespec='seconds')}] {mensaje}\n")
        telemetry.reportar_mensaje(f"JS: {mensaje}")
        return _ok()
