
import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react'

const API_URL = 'http://127.0.0.1:8000'
const WS_URL = 'ws://127.0.0.1:8000/ws/telemetry'

export type ControlMode = 'AUTO' | 'MANUAL'
export type ManualOutput = 'HIGH' | 'LOW'

export interface Measurement {
  timestamp: string
  temperature: number | null
  sensor_ok: boolean
  uptime_ms?: number | null
  setpoint: number | null
  heater_on: boolean | null
  mode: string | null
  pid_percent?: number | null
  command_on?: boolean | null
  temperature_filtered?: number | null
  slope_c_per_s?: number | null
  alarm?: boolean | null
  fault?: string | null
  control_protocol?: string | null
  bench_interlock?: boolean
}

export interface ControlCapabilities {
  enabled: boolean
  logical_enabled?: boolean
  ready: boolean
  bench_interlock: boolean
  manual_high_available: boolean
  setpoint_min: number
  setpoint_max: number
  message: string
}

export interface TelemetryStatus {
  connected: boolean
  port: string | null
  receiving: boolean
  last_measurement: Measurement | null
  age_seconds: number | null
  error: string | null
  control: ControlCapabilities
}

const NO_CONTROL: ControlCapabilities = {
  enabled: false,
  logical_enabled: false,
  ready: false,
  bench_interlock: false,
  manual_high_available: false,
  setpoint_min: 20,
  setpoint_max: 100,
  message: 'Sin comunicación con FastAPI'
}

const INITIAL_STATUS: TelemetryStatus = {
  connected: false,
  port: null,
  receiving: false,
  last_measurement: null,
  age_seconds: null,
  error: null,
  control: NO_CONTROL
}

function normalizeStatus(
  raw: unknown
): TelemetryStatus {

  const source = raw as Partial<TelemetryStatus> | null

  return {
    connected: source?.connected === true,

    port:
      typeof source?.port === 'string'
        ? source.port
        : null,

    receiving: source?.receiving === true,

    last_measurement:
      source?.last_measurement ?? null,

    age_seconds:
      typeof source?.age_seconds === 'number'
        ? source.age_seconds
        : null,

    error:
      typeof source?.error === 'string'
        ? source.error
        : null,

    control: source?.control ?? NO_CONTROL
  }
}

async function postControl(
  path: string,
  body?: object
): Promise<void> {

  const response = await fetch(`${API_URL}${path}`, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      'X-PowerGuard-Local': '1'
    },

    body: JSON.stringify(body ?? {})
  })

  if (!response.ok) {
    let detail =
      `FastAPI respondió HTTP ${response.status}`

    try {
      const data: {
        detail?: string
      } = await response.json()

      if (typeof data.detail === 'string') {
        detail = data.detail
      }
    } catch {
      // Conservar el error HTTP.
    }

    throw new Error(detail)
  }

  const data: {
    confirmed?: boolean
  } = await response.json()

  if (data.confirmed !== true) {
    throw new Error(
      'ESP32 no confirmó la orden'
    )
  }
}

export function useTelemetry() {
  const [status, setStatus] =
    useState<TelemetryStatus>(INITIAL_STATUS)

  const [
    websocketConnected,
    setWebsocketConnected
  ] = useState(false)

  const [commandBusy, setCommandBusy] =
    useState(false)

  const commandInFlight = useRef(false)

  const [
    commandError,
    setCommandError
  ] = useState<string | null>(null)

  useEffect(() => {
    let closed = false
    let socket: WebSocket | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      if (closed) return

      socket = new WebSocket(WS_URL)

      socket.onopen = () => {
        if (!closed) {
          setWebsocketConnected(true)
        }
      }

      socket.onmessage = event => {
        if (closed) return

        try {
          const received = JSON.parse(
            event.data as string
          )

          const rawStatus =
            received?.status ?? received

          setStatus(
            normalizeStatus(rawStatus)
          )

        } catch {
          // Ignorar mensajes malformados.
        }
      }

      socket.onclose = () => {
        if (closed) return

        setWebsocketConnected(false)
        setStatus(INITIAL_STATUS)

        retry = setTimeout(
          connect,
          2000
        )
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      closed = true

      if (retry !== null) {
        clearTimeout(retry)
      }

      socket?.close()
    }
  }, [])

  const issue = useCallback(
    async (
      path: string,
      body?: object
    ) => {

      if (commandInFlight.current) {
        throw new Error(
          'Ya hay una orden pendiente.'
        )
      }

      commandInFlight.current = true
      setCommandBusy(true)
      setCommandError(null)

      try {
        await postControl(path, body)

      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : 'Error de control'

        setCommandError(message)
        throw error

      } finally {
        commandInFlight.current = false
        setCommandBusy(false)
      }
    },
    []
  )

  const setMode = useCallback(
    (mode: ControlMode) =>
      issue('/api/control/mode', { mode }),
    [issue]
  )

  const setSetpoint = useCallback(
    (setpoint: number) =>
      issue('/api/control/setpoint', {
        setpoint
      }),
    [issue]
  )

  const setManualOutput = useCallback(
    (output: ManualOutput) =>
      issue('/api/control/manual', {
        output
      }),
    [issue]
  )

  const requestStop = useCallback(
    () => issue('/api/control/stop'),
    [issue]
  )

  return {
    status,
    websocketConnected,
    commandBusy,
    commandError,
    setMode,
    setSetpoint,
    setManualOutput,
    requestStop
  }
}
