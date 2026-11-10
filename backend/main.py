
import asyncio
import json
import math
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import serial
import serial.tools.list_ports
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import csv
import io
import sqlite3

from fastapi import Query
from fastapi.responses import StreamingResponse

from database import (
    init_database,
    save_measurement,
    get_measurements
)



# ==========================================
# POWERGuard - Backend v1
# ESP32 + MAX6675 + FastAPI
# ==========================================

BAUDRATE = 115200
STALE_AFTER = 3.0

lock = threading.Lock()
stop_event = threading.Event()

connection = None
reader_thread = None
active_port = None
last_measurement = None
last_received = None
last_error = None


class ConnectionRequest(BaseModel):
    port: str


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def parse_measurement(line):
    """Convierte el JSON del ESP32 en datos validados."""

    try:
        data = json.loads(line)

        if not isinstance(data, dict):
            return None

        sensor_ok = data.get("sensor_ok")

        if not isinstance(sensor_ok, bool):
            return None

        temp = data.get("temp")

        if sensor_ok:
            if isinstance(temp, bool) or temp is None:
                return None

            temp = float(temp)

            if not math.isfinite(temp):
                return None

            # Rango físico del MAX6675
            if temp < 0 or temp > 1024:
                return None

        else:
            temp = None

        return {
            "timestamp": utc_now(),
            "temperature": temp,
            "sensor_ok": sensor_ok,
            "setpoint": None,
            "heater_on": None,
            "mode": None,
        }

    except (ValueError, TypeError, json.JSONDecodeError):
        return None


def serial_reader(ser, stop):
    """Lee el puerto sin bloquear FastAPI."""

    global connection, active_port
    global last_measurement, last_received, last_error

    try:
        # Algunas placas se reinician al abrir USB.
        time.sleep(2)

        while not stop.is_set():
            raw = ser.readline()

            if not raw:
                continue

            line = raw.decode(
                "utf-8", errors="replace"
            ).strip()

            measurement = parse_measurement(line)

            if measurement is None:
                continue

            with lock:
                last_measurement = measurement
                last_received = time.monotonic()

            try:
                save_measurement(measurement)
            except sqlite3.Error as exc:
                print(
                    f"POWERGuard: error guardando medición: {exc}"
                )


    except (serial.SerialException, OSError) as exc:
        with lock:
            last_error = str(exc)

    finally:
        try:
            ser.close()
        except (serial.SerialException, OSError):
            pass

        with lock:
            if connection is ser:
                connection = None
                active_port = None


def disconnect_serial():
    global connection, active_port
    global last_measurement, last_received

    stop_event.set()

    with lock:
        ser = connection
        connection = None
        active_port = None
        last_measurement = None
        last_received = None

    if ser is not None:
        try:
            ser.close()
        except (serial.SerialException, OSError):
            pass

    if reader_thread is not None:
        reader_thread.join(timeout=2)



@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()

    try:
        yield
    finally:
        disconnect_serial()



app = FastAPI(
    title="POWERGuard API",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173",
                   "http://127.0.0.1:5173"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.get("/")
def home():
    return {
        "name": "POWERGuard",
        "status": "Backend funcionando"
    }


@app.get("/api/ports")
def list_ports():
    return [
        {
            "device": p.device,
            "description": p.description
        }
        for p in serial.tools.list_ports.comports()
    ]


@app.post("/api/connection")
def connect_esp32(request: ConnectionRequest):
    global connection, reader_thread, stop_event
    global active_port, last_error
    global last_measurement, last_received

    available = {
        p.device for p in serial.tools.list_ports.comports()
    }

    if request.port not in available:
        raise HTTPException(
            status_code=400,
            detail="Puerto no disponible"
        )

    disconnect_serial()

    try:
        ser = serial.Serial(
            request.port,
            BAUDRATE,
            timeout=0.5
        )

    except serial.SerialException as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc)
        )

    stop_event = threading.Event()

    with lock:
        connection = ser
        active_port = request.port
        last_measurement = None
        last_received = None
        last_error = None

    reader_thread = threading.Thread(
        target=serial_reader,
        args=(ser, stop_event),
        daemon=True
    )
    reader_thread.start()

    return {
        "connected": True,
        "port": request.port
    }


@app.delete("/api/connection")
def disconnect_esp32():
    disconnect_serial()

    return {"connected": False}


def get_status():
    with lock:
        connected = (
            connection is not None
            and connection.is_open
        )

        age = (
            time.monotonic() - last_received
            if last_received is not None
            else None
        )

        return {
            "connected": connected,
            "port": active_port,
            "receiving": (
                connected
                and age is not None
                and age < STALE_AFTER
            ),
            "last_measurement": last_measurement,
            "age_seconds": age,
            "error": last_error,
        }


@app.get("/api/status")
def status():
    return get_status()


@app.websocket("/ws/telemetry")
async def telemetry(websocket: WebSocket):
    await websocket.accept()

    try:
        while True:
            await websocket.send_json(get_status())
            await asyncio.sleep(0.5)

    except (WebSocketDisconnect, RuntimeError):
        pass


# ==========================================
# HISTORIAL DE MEDICIONES
# ==========================================

@app.get("/api/history")
def history(
    limit: int = Query(default=300, ge=1, le=10000),
    start: str | None = None,
    end: str | None = None
):
    records = get_measurements(
        limit=limit,
        start=start,
        end=end
    )

    return {
        "count": len(records),
        "measurements": records
    }


# ==========================================
# EXPORTACIÓN CSV
# ==========================================

@app.get("/api/export")
def export_csv(
    limit: int = Query(default=10000, ge=1, le=100000),
    start: str | None = None,
    end: str | None = None
):
    records = get_measurements(
        limit=limit,
        start=start,
        end=end
    )

    output = io.StringIO()

    columns = [
        "timestamp",
        "temperature",
        "sensor_ok",
        "setpoint",
        "heater_on",
        "mode"
    ]

    writer = csv.DictWriter(
        output,
        fieldnames=columns,
        extrasaction="ignore"
    )

    writer.writeheader()
    writer.writerows(records)

    content = output.getvalue().encode("utf-8-sig")

    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition":
                'attachment; filename="powerguard_mediciones.csv"'
        }
    )
