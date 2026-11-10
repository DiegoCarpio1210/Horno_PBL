
# ==========================================
# POWERGuard - Base de datos SQLite
# ==========================================

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent / "data" / "powerguard.db"


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    connection = sqlite3.connect(
        DB_PATH,
        timeout=10
    )

    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA busy_timeout = 10000")

    return connection


def init_database():
    with get_connection() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS measurements (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                temperature REAL,
                sensor_ok INTEGER NOT NULL,
                setpoint REAL,
                heater_on INTEGER,
                mode TEXT
            )
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_measurements_timestamp
            ON measurements(timestamp)
        """)


def save_measurement(measurement):
    with get_connection() as db:
        db.execute("""
            INSERT INTO measurements (
                timestamp,
                temperature,
                sensor_ok,
                setpoint,
                heater_on,
                mode
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            measurement["timestamp"],
            measurement["temperature"],
            int(measurement["sensor_ok"]),
            measurement["setpoint"],
            (
                None if measurement["heater_on"] is None
                else int(measurement["heater_on"])
            ),
            measurement["mode"]
        ))


def get_measurements(limit=300, start=None, end=None):
    conditions = []
    params = []

    if start:
        conditions.append("timestamp >= ?")
        params.append(start)

    if end:
        conditions.append("timestamp <= ?")
        params.append(end)

    where = (
        "WHERE " + " AND ".join(conditions)
        if conditions else ""
    )

    query = f"""
        SELECT *
        FROM measurements
        {where}
        ORDER BY timestamp DESC, id DESC
        LIMIT ?
    """

    params.append(limit)

    with get_connection() as db:
        rows = db.execute(query, params).fetchall()

    result = []

    for row in reversed(rows):
        item = dict(row)
        item["sensor_ok"] = bool(item["sensor_ok"])

        if item["heater_on"] is not None:
            item["heater_on"] = bool(item["heater_on"])

        result.append(item)

    return result
