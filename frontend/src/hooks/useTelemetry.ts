
import { useEffect, useState } from 'react'

// Formato real que devuelve FastAPI
export interface Measurement {
  timestamp: string
  temperature: number | null
  sensor_ok: boolean
  setpoint: number | null
  heater_on: boolean | null
  mode: string | null
}

export interface TelemetryStatus {
  connected: boolean
  port: string | null
  receiving: boolean
  last_measurement: Measurement | null
  age_seconds: number | null
  error: string | null
}

const INITIAL_STATUS: TelemetryStatus = {
  connected: false,
  port: null,
  receiving: false,
  last_measurement: null,
  age_seconds: null,
  error: null,
}

export function useTelemetry() {
  const [status, setStatus] = useState<TelemetryStatus>(
    INITIAL_STATUS
  )

  const [websocketConnected, setWebsocketConnected] =
    useState(false)

  useEffect(() => {
    let active = true
    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null =
      null

    function connect() {
      if (!active) return

      socket = new WebSocket(
        'ws://127.0.0.1:8000/ws/telemetry'
      )

      socket.onopen = () => {
        if (active) setWebsocketConnected(true)
      }

      socket.onmessage = (event: MessageEvent) => {
        if (!active) return

        try {
          const data: TelemetryStatus =
            JSON.parse(event.data)

          setStatus(data)
        } catch {
          console.error('Mensaje WebSocket inválido')
        }
      }

      socket.onclose = () => {
        if (!active) return

        setWebsocketConnected(false)
        setStatus(INITIAL_STATUS)

        reconnectTimer = setTimeout(connect, 2000)
      }

      socket.onerror = () => {
        socket?.close()
      }
    }

    connect()

    return () => {
      active = false

      if (reconnectTimer !== null) {
        clearTimeout(reconnectTimer)
      }

      socket?.close()
    }
  }, [])

  return { status, websocketConnected }
}
