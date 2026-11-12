
"""POWERGuard 5B - API local de telemetría y control térmico.

Conserva: serial, status, WebSocket, SQLite, historial, CSV.
Añade: comandos PGCTRL1 con confirmación ACK.

El PID funciona en ESP32.
HIGH manual está limitado por firmware a 2 segundos.
La etapa eléctrica necesita protección térmica independiente.
"""

import asyncio
import csv
import io
import json
import math
import threading
import time

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Literal

import serial
from serial.tools import list_ports

from fastapi import (
    FastAPI,
    HTTPException,
    Query,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from database import (
    get_measurements,
    init_database,
    save_measurement,
)

BAUD_RATE = 115200
STALE_SECONDS = 3.0
ACK_TIMEOUT = 1.5

ENABLE_LOGICAL_COMMANDS = True
ENABLE_BENCH_COMMANDS = True

SETPOINT_MIN =20.0
SETPOINT_MAX = 100.0

ALLOWED_ORIGINS = {
    "http://localhost:5173",
    "http://127.0.0.1:5173",
}

state_lock = threading.RLock()
serial_write_lock = threading.Lock()

serial_port: serial.Serial | None = None
reader_stop: threading.Event | None = None
reader_thread: threading.Thread | None = None

last_measurement: dict[str, Any] | None = None
last_received_monotonic: float | None = None
last_error: str | None = None

next_command_id = 0


class PendingCommand:
    def __init__(self):
        self.event = threading.Event()
        self.response: dict[str, Any] | None = None


pending_commands: dict[int, PendingCommand] = {}


class ConnectionRequest(BaseModel):
    port: str = Field(min_length=1, max_length=50)


class ModeRequest(BaseModel):
    mode: Literal["AUTO", "MANUAL"]


class SetpointRequest(BaseModel):
    setpoint: float = Field(
        ge=SETPOINT_MIN,
        le=SETPOINT_MAX,
    )


class ManualRequest(BaseModel):
    output: Literal["HIGH", "LOW"]


def finite_number(
    value: Any,
    lower: float,
    upper: float,
) -> float | None:
    if isinstance(value, bool):
        return None

    if not isinstance(value, (int, float)):
        return None

    number = float(value)

    if not math.isfinite(number):
        return None

    if not lower <= number <= upper:
        return None

    return number


def parse_measurement(
    message: dict[str, Any],
) -> dict[str, Any] | None:

    if "temp" not in message:
        return None

    if "sensor_ok" not in message:
        return None

    raw_temp = finite_number(
        message.get("temp"),
        0.0,
        1023.75,
    )

    sensor_ok = (
        message.get("sensor_ok") is True
        and raw_temp is not None
    )

    mode = message.get("mode")
    fault = message.get("fault")
    protocol = message.get("control_protocol")

    return {
        "timestamp": datetime.now(
            timezone.utc
        ).isoformat(timespec="microseconds"),

        "temperature": (
            raw_temp if sensor_ok else None
        ),

        "sensor_ok": sensor_ok,

        "uptime_ms": (
            message.get("uptime_ms")
            if isinstance(
                message.get("uptime_ms"),
                int,
            )
            else None
        ),

        "setpoint": finite_number(
            message.get("setpoint"),
            0.0,
            150.0,
        ),

        "heater_on": (
            message.get("heater_on")
            if isinstance(
                message.get("heater_on"),
                bool,
            )
            else None
        ),

        "mode": (
            mode[:40]
            if isinstance(mode, str)
            else None
        ),

        "pid_percent": finite_number(
            message.get("pid_percent"),
            0.0,
            100.0,
        ),

        "command_on": (
            message.get("command_on")
            if isinstance(
                message.get("command_on"),
                bool,
            )
            else None
        ),

        "temperature_filtered": finite_number(
            message.get("temperature_filtered"),
            0.0,
            1023.75,
        ),

        "slope_c_per_s": finite_number(
            message.get("slope_c_per_s"),
            -100.0,
            100.0,
        ),

        "alarm": (
            message.get("alarm")
            if isinstance(
                message.get("alarm"),
                bool,
            )
            else None
        ),

        "fault": (
            fault[:64]
            if isinstance(fault, str)
            else None
        ),

        "control_protocol": (
            protocol
            if isinstance(protocol, str)
            else None
        ),

        "bench_interlock": (
            message.get("bench_interlock") is True
        ),
    }


def snapshot() -> dict[str, Any]:
    with state_lock:
        connected = (
            serial_port is not None
            and serial_port.is_open
        )

        age = (
            time.monotonic() - last_received_monotonic
            if last_received_monotonic is not None
            else None
        )

        receiving = bool(
            connected
            and age is not None
            and age <= STALE_SECONDS
        )

        measurement = (
            last_measurement.copy()
            if last_measurement
            else None
        )

        ready = bool(
            receiving
            and measurement
            and measurement.get(
                "control_protocol"
            ) == "PGCTRL1"
        )

        bench_interlock = bool(
            ready
            and measurement
            and measurement.get(
                "bench_interlock"
            ) is True
        )

        manual_available = bool(
            ENABLE_BENCH_COMMANDS
            and ready
            and bench_interlock
            and measurement
            and measurement.get("mode") == "MANUAL"
            and measurement.get("sensor_ok") is True
            and measurement.get("alarm") is False
            and measurement.get("temperature") is not None
            and measurement["temperature"] < 65.0
        )

        return {
            "connected": bool(connected),

            "port": (
                serial_port.port
                if connected
                else None
            ),

            "receiving": receiving,

            "age_seconds": (
                round(age, 2)
                if age is not None
                else None
            ),

            "last_measurement": measurement,

            "error": last_error,

            "control": {
                "enabled": ENABLE_BENCH_COMMANDS,
                "logical_enabled": ENABLE_LOGICAL_COMMANDS,
                "ready": ready,
                "bench_interlock": bench_interlock,
                "manual_high_available": manual_available,
                "setpoint_min": SETPOINT_MIN,
                "setpoint_max": SETPOINT_MAX,
                "message": (
                    "HIGH manual máximo 2 s. "
                    "AUTO usa PID en ESP32. "
                    "GPIO18 no verifica la corriente del foco."
                ),
            },
        }


def resolve_ack(message: dict[str, Any]) -> bool:
    ack = message.get("ack")

    if isinstance(ack, bool):
        return False

    if not isinstance(ack, int):
        return False

    with state_lock:
        pending = pending_commands.get(ack)

        if pending:
            pending.response = {
                "confirmed": (
                    message.get("ok") is True
                ),
                "detail": str(
                    message.get("message", "")
                )[:160],
                "ack": ack,
            }

            pending.event.set()

    return True


def serial_reader(
    ser: serial.Serial,
    stop: threading.Event,
) -> None:
    global last_measurement
    global last_received_monotonic
    global last_error
    global serial_port

    try:
        while not stop.is_set():
            try:
                raw = ser.readline()

                if not raw:
                    continue

                message = json.loads(
                    raw.decode(
                        "utf-8",
                        errors="replace",
                    ).strip()
                )

                if not isinstance(message, dict):
                    continue

                if resolve_ack(message):
                    continue

                measurement = parse_measurement(
                    message
                )

                if measurement is None:
                    continue

                with state_lock:
                    if serial_port is not ser:
                        break

                    last_measurement = measurement
                    last_received_monotonic = time.monotonic()
                    last_error = None

                try:
                    save_measurement(measurement)

                except Exception as exc:
                    print(
                        "POWERGuard: error guardando "
                        f"medición: {exc}"
                    )

            except (ValueError, UnicodeError):
                continue

            except (
                serial.SerialException,
                OSError,
            ) as exc:

                with state_lock:
                    if (
                        serial_port is ser
                        and not stop.is_set()
                    ):
                        last_error = (
                            f"Conexión serial perdida: {exc}"
                        )

                break

    finally:
        with state_lock:
            if serial_port is ser:
                serial_port = None

            for pending in pending_commands.values():
                pending.response = {
                    "confirmed": False,
                    "detail": "Puerto serial desconectado.",
                }
                pending.event.set()

        try:
            ser.close()
        except Exception:
            pass


def disconnect_serial() -> None:
    global serial_port
    global reader_stop
    global reader_thread
    global last_measurement
    global last_received_monotonic
    global last_error

    with state_lock:
        ser = serial_port
        stop = reader_stop
        thread = reader_thread

        serial_port = None
        reader_stop = None
        reader_thread = None

        last_measurement = None
        last_received_monotonic = None
        last_error = None

    if stop:
        stop.set()

    if ser:
        try:
            ser.close()
        except Exception:
            pass

    if thread and thread.is_alive():
        thread.join(timeout=1.0)


def write_command(
    command: str,
    value: Any = None,
) -> dict[str, Any]:
    global next_command_id

    current = snapshot()

    if not current["connected"]:
        raise HTTPException(
            status_code=503,
            detail="ESP32 desconectado.",
        )

    if not current["control"]["ready"]:
        raise HTTPException(
            status_code=409,
            detail=(
                "Firmware sin protocolo PGCTRL1 "
                "confirmado."
            ),
        )

    with state_lock:
        ser = serial_port

        if ser is None or not ser.is_open:
            raise HTTPException(
                status_code=503,
                detail="Puerto serial no disponible.",
            )

        next_command_id += 1
        command_id = next_command_id

        pending = PendingCommand()
        pending_commands[command_id] = pending

    payload: dict[str, Any] = {
        "cmd": command,
        "id": command_id,
    }

    if value is not None:
        payload["value"] = value

    frame = (
        json.dumps(
            payload,
            separators=(",", ":"),
        ) + "\n"
    ).encode("utf-8")

    try:
        with serial_write_lock:
            ser.write(frame)
            ser.flush()

    except (
        serial.SerialException,
        OSError,
    ) as exc:

        with state_lock:
            pending_commands.pop(
                command_id,
                None,
            )

        raise HTTPException(
            status_code=503,
            detail=f"No se pudo enviar: {exc}",
        ) from exc

    received = pending.event.wait(
        timeout=ACK_TIMEOUT
    )

    with state_lock:
        pending_commands.pop(
            command_id,
            None,
        )

    if not received:
        raise HTTPException(
            status_code=504,
            detail=(
                "Sin confirmación del ESP32. "
                "El estado físico es desconocido."
            ),
        )

    answer = pending.response or {
        "confirmed": False,
        "detail": "ACK incompleto",
    }

    if not answer.get("confirmed"):
        raise HTTPException(
            status_code=409,
            detail=(
                answer.get("detail")
                or "Orden rechazada por firmware."
            ),
        )

    return {
        "accepted": True,
        "confirmed": True,
        "command": command,
        "id": command_id,
    }


def require_local_control(
    request: Request,
) -> None:
    client_ip = (
        request.client.host
        if request.client
        else ""
    )

    if client_ip not in (
        "127.0.0.1",
        "::1",
    ):
        raise HTTPException(
            status_code=403,
            detail="Control solo local.",
        )

    origin = request.headers.get("origin")

    if (
        origin
        and origin not in ALLOWED_ORIGINS
    ):
        raise HTTPException(
            status_code=403,
            detail="Origen no permitido.",
        )

    if request.headers.get(
        "X-PowerGuard-Local"
    ) != "1":
        raise HTTPException(
            status_code=403,
            detail="Falta cabecera local.",
        )


def require_logical_ready() -> dict[str, Any]:
    current = snapshot()

    if not ENABLE_LOGICAL_COMMANDS:
        raise HTTPException(
            status_code=423,
            detail="Comandos lógicos deshabilitados.",
        )

    if (
        not current["control"]["ready"]
        or not current["receiving"]
    ):
        raise HTTPException(
            status_code=409,
            detail="Sin telemetría PGCTRL1 reciente.",
        )

    measurement = (
        current["last_measurement"] or {}
    )

    if (
        measurement.get("alarm") is not False
        or measurement.get("sensor_ok") is not True
    ):
        raise HTTPException(
            status_code=409,
            detail="Sensor inválido o alarma activa.",
        )

    return current


def require_bench_ready() -> dict[str, Any]:
    current = snapshot()

    if not ENABLE_BENCH_COMMANDS:
        raise HTTPException(
            status_code=423,
            detail="Control manual deshabilitado.",
        )

    if not current["control"]["ready"]:
        raise HTTPException(
            status_code=409,
            detail="Firmware PGCTRL1 no confirmado.",
        )

    if not current["control"]["bench_interlock"]:
        raise HTTPException(
            status_code=409,
            detail="Salida física no habilitada.",
        )

    if not current["receiving"]:
        raise HTTPException(
            status_code=409,
            detail="Telemetría vencida.",
        )

    measurement = (
        current["last_measurement"] or {}
    )

    if (
        measurement.get("alarm") is not False
        or measurement.get("sensor_ok") is not True
    ):
        raise HTTPException(
            status_code=409,
            detail="Control bloqueado por seguridad.",
        )

    return current


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_database()

    try:
        yield

    finally:
        disconnect_serial()


app = FastAPI(
    title="POWERGuard API",
    version="5B.1",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(ALLOWED_ORIGINS),
    allow_credentials=False,
    allow_methods=[
        "GET",
        "POST",
        "DELETE",
    ],
    allow_headers=[
        "Content-Type",
        "X-PowerGuard-Local",
    ],
)


@app.get("/api/ports")
def api_ports():
    return {
        "ports": [
            {
                "device": p.device,
                "description": p.description,
                "hwid": p.hwid,
            }
            for p in list_ports.comports()
        ]
    }


@app.post("/api/connection")
def api_connect(
    body: ConnectionRequest,
):
    global serial_port
    global reader_stop
    global reader_thread
    global last_measurement
    global last_received_monotonic
    global last_error

    available = {
        p.device
        for p in list_ports.comports()
    }

    if body.port not in available:
        raise HTTPException(
            status_code=404,
            detail=(
                f"Puerto {body.port} no disponible. "
                "Consulta /api/ports."
            ),
        )

    disconnect_serial()

    try:
        ser = serial.Serial(
            body.port,
            BAUD_RATE,
            timeout=0.25,
            write_timeout=1.0,
        )

    except (
        serial.SerialException,
        OSError,
    ) as exc:
        raise HTTPException(
            status_code=503,
            detail=f"No se pudo abrir puerto: {exc}",
        ) from exc

    stop = threading.Event()

    worker = threading.Thread(
        target=serial_reader,
        args=(ser, stop),
        daemon=True,
        name="PowerGuardSerial",
    )

    with state_lock:
        serial_port = ser
        reader_stop = stop
        reader_thread = worker

        last_measurement = None
        last_received_monotonic = None
        last_error = None

    worker.start()

    return {
        "ok": True,
        "status": snapshot(),
    }


@app.delete("/api/connection")
def api_disconnect():
    disconnect_serial()

    return {
        "ok": True,
        "status": snapshot(),
    }


@app.get("/api/status")
def api_status():
    return snapshot()


@app.get("/api/control")
def api_control():
    state = snapshot()

    return {
        "control": state["control"],
        "measurement": state["last_measurement"],
    }


@app.post("/api/control/mode")
def api_mode(
    body: ModeRequest,
    request: Request,
):
    require_local_control(request)
    require_logical_ready()

    return write_command(
        "SET_MODE",
        body.mode,
    )


@app.post("/api/control/setpoint")
def api_setpoint(
    body: SetpointRequest,
    request: Request,
):
    require_local_control(request)
    require_logical_ready()

    if not math.isfinite(body.setpoint):
        raise HTTPException(
            status_code=422,
            detail="Setpoint no válido.",
        )

    return write_command(
        "SET_SETPOINT",
        round(body.setpoint, 2),
    )


@app.post("/api/control/manual")
def api_manual(
    body: ManualRequest,
    request: Request,
):
    require_local_control(request)

    if body.output == "LOW":
        current = snapshot()

        if not current["control"]["ready"]:
            raise HTTPException(
                status_code=409,
                detail="PGCTRL1 no confirmado.",
            )

        measurement = (
            current["last_measurement"] or {}
        )

        if (
            measurement.get("alarm") is True
            or measurement.get("sensor_ok") is not True
            or measurement.get("mode") != "MANUAL"
        ):
            result = write_command("SAFE_OFF")

            result["detail"] = (
                "SAFE_OFF enclavado hasta reinicio."
            )

            return result

        return write_command(
            "MANUAL_PULSE",
            {
                "output": "LOW",
                "duration_ms": 0,
            },
        )

    current = require_bench_ready()

    measurement = (
        current["last_measurement"] or {}
    )

    if measurement.get("mode") != "MANUAL":
        raise HTTPException(
            status_code=409,
            detail="Selecciona primero MANUAL.",
        )

    return write_command(
        "MANUAL_PULSE",
        {
            "output": "HIGH",
            "duration_ms": 2000,
        },
    )


@app.post("/api/control/stop")
def api_stop(request: Request):
    require_local_control(request)

    return write_command("SAFE_OFF")


@app.get("/api/history")
def api_history(
    limit: int = Query(
        default=300,
        ge=1,
        le=10000,
    ),
    start: str | None = None,
    end: str | None = None,
):
    rows = get_measurements(
        limit=limit,
        start=start,
        end=end,
    )

    return {
        "count": len(rows),
        "measurements": rows,
    }


@app.get("/api/export")
def api_export(
    limit: int = Query(
        default=10000,
        ge=1,
        le=100000,
    ),
    start: str | None = None,
    end: str | None = None,
):
    rows = get_measurements(
        limit=limit,
        start=start,
        end=end,
    )

    output = io.StringIO()

    columns = [
        "timestamp",
        "temperature",
        "sensor_ok",
        "setpoint",
        "heater_on",
        "mode",
        "pid_percent",
        "command_on",
        "temperature_filtered",
        "slope_c_per_s",
        "alarm",
        "fault",
        "control_protocol",
        "bench_interlock",
        "uptime_ms",
    ]

    writer = csv.DictWriter(
        output,
        fieldnames=columns,
        extrasaction="ignore",
    )

    writer.writeheader()
    writer.writerows(rows)

    content = output.getvalue().encode(
        "utf-8-sig"
    )

    return StreamingResponse(
        iter([content]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": (
                'attachment; filename="powerguard_mediciones.csv"'
            )
        },
    )


@app.websocket("/ws/telemetry")
async def websocket_telemetry(
    ws: WebSocket,
):
    await ws.accept()

    try:
        while True:
            await ws.send_json(snapshot())
            await asyncio.sleep(0.5)

    except (
        WebSocketDisconnect,
        RuntimeError,
        OSError,
    ):
        pass
