"""Reglas de negocio: tiempo de pases, límites, días hábiles y días especiales."""
import sqlite3
from datetime import date, datetime, timedelta

MAX_MINUTOS_DIA = 120
MAX_MINUTOS_MES = 360

_ORDINALES = [
    "Primero", "Segundo", "Tercero", "Cuarto", "Quinto",
    "Sexto", "Séptimo", "Octavo", "Noveno", "Décimo",
]

DIAS_ORDINARIO = 10
DIAS_RIESGO = {"Alto": 12, "Mediano": 8, "Bajo": 5}
ORDEN_TIPOS = ["primero", "segundo", "riesgo_alto", "riesgo_mediano", "riesgo_bajo", "extraordinario"]


def _parse_hora(hora: str) -> datetime:
    return datetime.strptime(hora, "%H:%M")


def calcular_minutos_pase(hora_salida: str, regresa: bool, hora_regreso: str | None,
                           hora_fin_turno: str) -> int:
    """Implementa la regla confirmada:
    - Si regresa=True: minutos = hora_regreso - hora_salida.
    - Si regresa=False: minutos = hora_fin_turno - hora_salida (el pase consume
      el resto del turno porque el trabajador ya no vuelve).
    """
    salida = _parse_hora(hora_salida)
    if regresa:
        if not hora_regreso:
            raise ValueError("Falta la hora de regreso.")
        regreso = _parse_hora(hora_regreso)
        if regreso <= salida:
            raise ValueError("La hora de regreso debe ser posterior a la hora de salida.")
        minutos = (regreso - salida).total_seconds() / 60
    else:
        fin_turno = _parse_hora(hora_fin_turno)
        if fin_turno <= salida:
            raise ValueError("La hora de salida del pase debe ser antes del fin de tu turno.")
        minutos = (fin_turno - salida).total_seconds() / 60
    return int(round(minutos))


def validar_limite_pase(conn: sqlite3.Connection, fecha: str, minutos_nuevos: int,
                         excluir_id: int | None = None) -> tuple[bool, str]:
    """Verifica que el pase no exceda 2h/día ni 6h/mes. Bloquea si se excede."""
    mes = fecha[:7]

    query_dia = "SELECT COALESCE(SUM(minutos), 0) FROM pases_particulares WHERE fecha = ?"
    params_dia = [fecha]
    if excluir_id is not None:
        query_dia += " AND id != ?"
        params_dia.append(excluir_id)
    acumulado_dia = conn.execute(query_dia, params_dia).fetchone()[0]

    query_mes = "SELECT COALESCE(SUM(minutos), 0) FROM pases_particulares WHERE substr(fecha, 1, 7) = ?"
    params_mes = [mes]
    if excluir_id is not None:
        query_mes += " AND id != ?"
        params_mes.append(excluir_id)
    acumulado_mes = conn.execute(query_mes, params_mes).fetchone()[0]

    if acumulado_dia + minutos_nuevos > MAX_MINUTOS_DIA:
        return False, (
            f"Este pase excede el límite de 2 horas por día. "
            f"Ya tienes {acumulado_dia} min usados ese día."
        )
    if acumulado_mes + minutos_nuevos > MAX_MINUTOS_MES:
        return False, (
            f"Este pase excede el límite de 6 horas mensuales. "
            f"Ya tienes {acumulado_mes} min usados ese mes."
        )
    return True, ""


def ordinal_es(n: int) -> str:
    if 1 <= n <= len(_ORDINALES):
        return _ORDINALES[n - 1]
    return f"{n}°"


def es_dia_habil(d: date, festivos: set[str]) -> bool:
    return d.weekday() < 5 and d.isoformat() not in festivos


def dias_habiles(fecha_inicio: date, fecha_fin: date, festivos: set[str]) -> int:
    if fecha_fin < fecha_inicio:
        return 0
    total = 0
    d = fecha_inicio
    while d <= fecha_fin:
        if es_dia_habil(d, festivos):
            total += 1
        d += timedelta(days=1)
    return total


def fecha_fin_por_dias_habiles(fecha_inicio: date, n: int, festivos: set[str]) -> date:
    """Devuelve la fecha del n-ésimo día hábil contando desde fecha_inicio (inclusive)."""
    if n <= 0:
        return fecha_inicio
    d = fecha_inicio
    contados = 0
    while True:
        if es_dia_habil(d, festivos):
            contados += 1
            if contados == n:
                return d
        d += timedelta(days=1)


def validar_dia_especial(fecha: date, festivos: set[str]) -> tuple[bool, str]:
    """Regla del formato F03: si cae en fin de semana o festivo oficial, no se otorga."""
    if fecha.weekday() >= 5:
        return False, "Ese día cae en fin de semana, así que no se otorga según la regla del formato."
    if fecha.isoformat() in festivos:
        return False, "Ese día es festivo oficial, así que no se otorga según la regla del formato."
    return True, ""


def dias_para_riesgo(nivel_riesgo: str) -> int | None:
    return DIAS_RIESGO.get(nivel_riesgo)


def formatear_duracion(minutos: int) -> str:
    """Convierte minutos a un texto legible: '1 hora, 30 minutos', '2 horas', '45 minutos'."""
    horas, mins = divmod(minutos, 60)
    partes = []
    if horas:
        partes.append(f"{horas} hora" + ("s" if horas != 1 else ""))
    if mins or not partes:
        partes.append(f"{mins} minuto" + ("s" if mins != 1 else ""))
    return ", ".join(partes)
