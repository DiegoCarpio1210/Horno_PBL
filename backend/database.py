
"""POWERGuard 5B - SQLite persistente.

Conserva los registros anteriores y agrega columnas PID.
"""

from __future__ import annotations

import math
import sqlite3

from pathlib import Path
from typing import Any

DB_PATH = (
    Path(__file__).resolve().parent
    / "data"
    / "powerguard.db"
)

NEW_COLUMNS: dict[str, str] = {
    "uptime_ms": "INTEGER",
    "pid_percent": "REAL",
    "command_on": "INTEGER",
    "temperature_filtered": "REAL",
    "slope_c_per_s": "REAL",
    "alarm": "INTEGER",
    "fault": "TEXT",
    "control_protocol": "TEXT",
    "bench_interlock": "INTEGER",
}


def get_connection() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    db = sqlite3.connect(
        DB_PATH,
        timeout=10,
    )

    db.row_factory = sqlite3.Row
    db.execute(
        "PRAGMA busy_timeout=10000"
    )

    return db


def init_database() -> None:
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

        existing = {
            row["name"]
            for row in db.execute(
                "PRAGMA table_info(measurements)"
            ).fetchall()
        }

        for name, sql_type in NEW_COLUMNS.items():
            if name not in existing:
                db.execute(
                    f"ALTER TABLE measurements "
                    f"ADD COLUMN {name} {sql_type}"
                )

        db.execute("""
            CREATE INDEX IF NOT EXISTS
            idx_measurements_timestamp
            ON measurements(timestamp)
        """)


def _optional_float(
    value: Any,
) -> float | None:

    if isinstance(value, bool):
        return None

    if not isinstance(value, (float, int)):
        return None

    value = float(value)

    if not math.isfinite(value):
        return None

    return value


def _optional_bool(
    value: Any,
) -> int | None:

    if isinstance(value, bool):
        return int(value)

    return None


def save_measurement(
    measurement: dict[str, Any],
) -> None:

    data = {
        "timestamp": measurement["timestamp"],

        "temperature": _optional_float(
            measurement.get("temperature")
        ),

        "sensor_ok": int(
            measurement.get("sensor_ok") is True
        ),

        "setpoint": _optional_float(
            measurement.get("setpoint")
        ),

        "heater_on": _optional_bool(
            measurement.get("heater_on")
        ),

        "mode": measurement.get("mode"),

        "uptime_ms": (
            measurement.get("uptime_ms")
            if isinstance(
                measurement.get("uptime_ms"),
                int,
            )
            else None
        ),

        "pid_percent": _optional_float(
            measurement.get("pid_percent")
        ),

        "command_on": _optional_bool(
            measurement.get("command_on")
        ),

        "temperature_filtered": _optional_float(
            measurement.get("temperature_filtered")
        ),

        "slope_c_per_s": _optional_float(
            measurement.get("slope_c_per_s")
        ),

        "alarm": _optional_bool(
            measurement.get("alarm")
        ),

        "fault": measurement.get("fault"),

        "control_protocol": measurement.get(
            "control_protocol"
        ),

        "bench_interlock": _optional_bool(
            measurement.get("bench_interlock")
        ),
    }

    with get_connection() as db:
        db.execute("""
            INSERT INTO measurements (
                timestamp,
                temperature,
                sensor_ok,
                setpoint,
                heater_on,
                mode,
                uptime_ms,
                pid_percent,
                command_on,
                temperature_filtered,
                slope_c_per_s,
                alarm,
                fault,
                control_protocol,
                bench_interlock
            )
            VALUES (
                :timestamp,
                :temperature,
                :sensor_ok,
                :setpoint,
                :heater_on,
                :mode,
                :uptime_ms,
                :pid_percent,
                :command_on,
                :temperature_filtered,
                :slope_c_per_s,
                :alarm,
                :fault,
                :control_protocol,
                :bench_interlock
            )
        """, data)


def get_measurements(
    limit: int = 300,
    start: str | None = None,
    end: str | None = None,
) -> list[dict[str, Any]]:

    if not 1 <= limit <= 100000:
        raise ValueError(
            "El límite debe estar entre 1 y 100000"
        )

    clauses: list[str] = []
    params: list[Any] = []

    if start:
        clauses.append("timestamp >= ?")
        params.append(start)

    if end:
        clauses.append("timestamp <= ?")
        params.append(end)

    where = (
        " WHERE " + " AND ".join(clauses)
        if clauses
        else ""
    )

    params.append(limit)

    with get_connection() as db:
        rows = db.execute(
            "SELECT * FROM measurements"
            + where
            + " ORDER BY timestamp DESC, id DESC LIMIT ?",
            params,
        ).fetchall()

    result: list[dict[str, Any]] = []

    for row in reversed(rows):
        item = dict(row)

        item["sensor_ok"] = bool(
            item["sensor_ok"]
        )

        for flag in (
            "heater_on",
            "command_on",
            "alarm",
            "bench_interlock",
        ):
            if item[flag] is not None:
                item[flag] = bool(item[flag])

        result.append(item)

    return result
