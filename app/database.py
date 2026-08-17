"""Acceso a la base de datos local SQLite.

La base vive en %LOCALAPPDATA%\\ControlPasesSESEQ\\control.db para que la
aplicación funcione sin permisos de administrador y sobreviva a
reinstalaciones del ejecutable.
"""
import os
import sqlite3
from pathlib import Path

APP_DIR_NAME = "ControlPasesSESEQ"


def get_data_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home())
    data_dir = Path(base) / APP_DIR_NAME
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir


def get_db_path() -> Path:
    return get_data_dir() / "control.db"


SCHEMA = """
CREATE TABLE IF NOT EXISTS perfil (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    nombre TEXT NOT NULL DEFAULT '',
    no_empleado TEXT NOT NULL DEFAULT '',
    centro_trabajo TEXT NOT NULL DEFAULT '',
    area_direccion TEXT NOT NULL DEFAULT '',
    turno TEXT NOT NULL DEFAULT '',
    recurso TEXT NOT NULL DEFAULT '',
    hora_entrada TEXT NOT NULL DEFAULT '',
    hora_fin_turno TEXT NOT NULL DEFAULT '',
    dias_laborables TEXT NOT NULL DEFAULT 'LUN,MAR,MIE,JUE,VIE',
    nivel_riesgo TEXT NOT NULL DEFAULT 'Ninguno',
    tipo_dia_especial TEXT,
    fecha_dia_especial TEXT,
    setup_completo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pases_particulares (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    hora_salida TEXT NOT NULL,
    regresa INTEGER NOT NULL,
    hora_regreso TEXT,
    minutos INTEGER NOT NULL,
    exportado INTEGER NOT NULL DEFAULT 0,
    fecha_exportado TEXT
);

CREATE TABLE IF NOT EXISTS pases_oficiales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    asunto TEXT NOT NULL,
    dependencia TEXT NOT NULL,
    horario_comision TEXT NOT NULL,
    exportado INTEGER NOT NULL DEFAULT 0,
    fecha_exportado TEXT
);

CREATE TABLE IF NOT EXISTS periodos_vacacionales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    fecha_inicio TEXT NOT NULL,
    fecha_fin TEXT NOT NULL,
    dias_habiles INTEGER NOT NULL,
    motivo TEXT,
    exportado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS dias_especiales_otorgados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    anio INTEGER NOT NULL UNIQUE,
    fecha_otorgada TEXT,
    aplico INTEGER NOT NULL,
    exportado INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS festivos (
    fecha TEXT PRIMARY KEY,
    descripcion TEXT NOT NULL,
    origen TEXT NOT NULL DEFAULT 'oficial'
);
"""


def get_connection() -> sqlite3.Connection:
    # check_same_thread=False: pywebview invoca los métodos de la Api desde su
    # propio hilo interno del puente JS, distinto del hilo donde se crea la
    # conexión al arrancar la app. La interacción del usuario ya es secuencial
    # (una acción a la vez), así que no hace falta más sincronización.
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL: los commits no bloquean lecturas concurrentes ni se esperan a un
    # fsync completo del archivo principal en cada escritura -> guardar un
    # pase/perfil se siente instantáneo en vez de con un pequeño "stutter".
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.row_factory = sqlite3.Row
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    cur = conn.execute("SELECT id FROM perfil WHERE id = 1")
    if cur.fetchone() is None:
        conn.execute("INSERT INTO perfil (id) VALUES (1)")
    conn.commit()


def obtener_perfil(conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM perfil WHERE id = 1").fetchone()
    return dict(row)
