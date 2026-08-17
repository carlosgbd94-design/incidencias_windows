"""Calendario oficial de días festivos de México (Art. 74 LFT).

Los festivos calculados aquí se usan solo para sembrar la tabla `festivos`
la primera vez que se necesita un año; después el usuario puede editarlos
libremente desde la pestaña de Festivos (agregar/quitar estatales, etc.).
"""
import sqlite3
from datetime import date, timedelta


def _n_esimo_lunes(anio: int, mes: int, n: int) -> date:
    d = date(anio, mes, 1)
    lunes_encontrados = 0
    while True:
        if d.weekday() == 0:  # lunes
            lunes_encontrados += 1
            if lunes_encontrados == n:
                return d
        d += timedelta(days=1)


def festivos_oficiales_anio(anio: int) -> list[tuple[date, str]]:
    festivos = [
        (date(anio, 1, 1), "Año Nuevo"),
        (_n_esimo_lunes(anio, 2, 1), "Día de la Constitución"),
        (_n_esimo_lunes(anio, 3, 3), "Natalicio de Benito Juárez"),
        (date(anio, 5, 1), "Día del Trabajo"),
        (date(anio, 9, 16), "Día de la Independencia"),
        (_n_esimo_lunes(anio, 11, 3), "Día de la Revolución"),
        (date(anio, 12, 25), "Navidad"),
    ]
    if (anio - 2024) % 6 == 0:
        festivos.append((date(anio, 12, 1), "Transmisión del Poder Ejecutivo Federal"))
    return festivos


def sembrar_festivos(conn: sqlite3.Connection, anios: list[int]) -> None:
    for anio in anios:
        for fecha, descripcion in festivos_oficiales_anio(anio):
            conn.execute(
                """
                INSERT INTO festivos (fecha, descripcion, origen)
                VALUES (?, ?, 'oficial')
                ON CONFLICT(fecha) DO NOTHING
                """,
                (fecha.isoformat(), descripcion),
            )
    conn.commit()


def asegurar_festivos_para(conn: sqlite3.Connection, anio: int) -> None:
    """Siembra festivos oficiales para anio-1, anio y anio+1 si aún no existen."""
    sembrar_festivos(conn, [anio - 1, anio, anio + 1])


def obtener_festivos(conn: sqlite3.Connection) -> set[str]:
    cur = conn.execute("SELECT fecha FROM festivos")
    return {row[0] for row in cur.fetchall()}
