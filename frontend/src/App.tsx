
import { useEffect, useRef, useState } from 'react'
import {
  Activity, Flame, Thermometer, ShieldCheck,
  Wifi, WifiOff, SlidersHorizontal, Power,
  AlertTriangle, Clock3, Cpu
} from 'lucide-react'
import { useTelemetry } from './hooks/useTelemetry'
import './App.css'

const DEMO_SETPOINT = 65
const INITIAL_DEMO_HISTORY = [
  26, 28, 30, 33, 37, 41, 46, 51,
  55, 59, 62, 64, 65, 64, 65, 66
]

function OvenAnimation({
  temperature,
  heaterOn,
}: {
  temperature: number | null
  heaterOn: boolean | null
}) {
  const intensity = temperature === null
    ? 0
    : Math.max(0, Math.min(1, (temperature - 25) / 55))

  return (
    <div className="oven-scene">
      <div
        className="oven-glow"
        style={{ opacity: intensity }}
      />

      <div className="oven-machine">
        <div className="oven-top">
          <span className="machine-brand">POWERGUARD</span>
          <div className="machine-light" />
        </div>

        <div className="oven-door">
          <div
            className="oven-chamber"
            style={{
              backgroundColor: `rgba(234,88,12,${
                0.06 + intensity * 0.48
              })`,
              boxShadow: `inset 0 0 ${
                15 + intensity * 65
              }px rgba(249,115,22,${intensity * 0.7})`,
            }}
          >
            <div className="chamber-grid" />

            <div className="oven-temperature">
              <span>
                {temperature === null
                  ? '--'
                  : `${temperature.toFixed(1)}°`}
              </span>
              <small>TEMPERATURA INTERNA</small>
            </div>

            <div className={
              heaterOn === true
                ? 'heating-element active'
                : 'heating-element'
            }>
              <svg viewBox="0 0 240 44">
                <path
                  d="M5 25 Q24 3 43 25 T81 25 T119 25
                     T157 25 T195 25 T233 25"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="6"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
        </div>

        <div className="oven-base">
          <span>THERMAL CHAMBER / V1.0</span>
          <span>ESP32</span>
        </div>

        <div className="oven-feet">
          <span /><span />
        </div>
      </div>
    </div>
  )
}

function TemperatureChart({
  values,
  setpoint,
}: {
  values: number[]
  setpoint: number | null
}) {
  if (values.length === 0) {
    return (
      <div className="chart-empty">
        Esperando mediciones de temperatura...
      </div>
    )
  }

  const width = 700
  const height = 230
  const left = 38
  const right = 12
  const top = 14
  const bottom = 28
  const plotW = width - left - right
  const plotH = height - top - bottom

  const allValues = setpoint === null
    ? values
    : [...values, setpoint]

  const low = Math.floor(
    (Math.min(...allValues) - 5) / 10
  ) * 10

  const high = Math.ceil(
    (Math.max(...allValues) + 5) / 10
  ) * 10

  const y = (value: number) =>
    top + (high - value) / (high - low) * plotH

  const x = (index: number) =>
    left + index / Math.max(1, values.length - 1) * plotW

  const path = values
    .map((value, index) =>
      `${index === 0 ? 'M' : 'L'} ${x(index)} ${y(value)}`
    )
    .join(' ')

  const ticks = Array.from(
    { length: 5 },
    (_, index) => low + (high - low) * index / 4
  )

  return (
    <svg
      className="temperature-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Tendencia de temperatura"
    >
      {ticks.map(tick => (
        <g key={tick}>
          <line
            x1={left}
            y1={y(tick)}
            x2={width - right}
            y2={y(tick)}
            stroke="#283348"
            strokeDasharray="4 5"
          />
          <text
            x={left - 8}
            y={y(tick) + 4}
            textAnchor="end"
            fill="#8794AA"
            fontSize="11"
          >
            {tick.toFixed(0)}°
          </text>
        </g>
      ))}

      {setpoint !== null && (
        <line
          x1={left}
          y1={y(setpoint)}
          x2={width - right}
          y2={y(setpoint)}
          stroke="#60A5FA"
          strokeWidth="2"
          strokeDasharray="7 5"
        />
      )}

      <path
        d={path}
        fill="none"
        stroke="#FB923C"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle
        cx={x(values.length - 1)}
        cy={y(values[values.length - 1])}
        r="5"
        fill="#FB923C"
        stroke="#fff"
        strokeWidth="1.5"
      />

      <text x={left} y={height - 5} fill="#8794AA" fontSize="11">
        Inicio de muestra
      </text>
      <text
        x={width - right}
        y={height - 5}
        textAnchor="end"
        fill="#8794AA"
        fontSize="11"
      >
        Última muestra
      </text>
    </svg>
  )
}

function App() {
  const { status, websocketConnected } = useTelemetry()

  const [demoMode, setDemoMode] = useState(false)
  const [demoTemp, setDemoTemp] = useState(58)
  const [demoHeater, setDemoHeater] = useState(true)

  const [realHistory, setRealHistory] = useState<number[]>([])
  const [demoHistory, setDemoHistory] =
    useState(INITIAL_DEMO_HISTORY)

  const lastTimestamp = useRef<string | null>(null)

  const measurement = status.last_measurement
  const live = websocketConnected &&
    status.receiving &&
    measurement?.sensor_ok === true &&
    measurement.temperature !== null &&
    measurement.temperature !== undefined

  // Agrega solo una vez cada medición real.
  // FastAPI publica estados cada 0.5 segundos,
  // pero el sensor mide aproximadamente cada 1 segundo.
  useEffect(() => {
    if (!websocketConnected || !status.receiving) return
    if (!measurement?.sensor_ok) return
    if (measurement.temperature === null) return

    if (measurement.timestamp === lastTimestamp.current) {
      return
    }

    lastTimestamp.current = measurement.timestamp

    const value = measurement.temperature

    if (Number.isFinite(value)) {
      setRealHistory(previous =>
        [...previous.slice(-59), value]
      )
    }
  }, [measurement, status.receiving, websocketConnected])

  const temperature = demoMode
    ? demoTemp
    : live
      ? measurement!.temperature
      : null

  const setpoint = demoMode
    ? DEMO_SETPOINT
    : measurement?.setpoint ?? null

  const heaterOn = demoMode
    ? demoHeater
    : live
      ? measurement?.heater_on ?? null
      : null

  const history = demoMode ? demoHistory : realHistory

  const difference =
    temperature !== null && setpoint !== null
      ? temperature - setpoint
      : null

  function updateDemoTemperature(value: number) {
    setDemoTemp(value)
    setDemoHistory(previous =>
      [...previous.slice(-59), value]
    )
  }

  const heaterText = heaterOn === null
    ? 'Estado no disponible'
    : heaterOn
      ? 'Calefactor activado'
      : 'Calefactor desactivado'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon">
            <Flame size={23} />
          </div>
          <div>
            <strong>POWERGuard</strong>
            <small>THERMAL SYSTEM</small>
          </div>
        </div>

        <div className="sidebar-label">PLATAFORMA</div>

        <div className="nav-link selected">
          <Activity size={18} />
          Supervisión
        </div>

        <div className="nav-link muted">
          <Clock3 size={18} />
          Historial (próximamente)
        </div>

        <div className="sidebar-bottom">
          <Cpu size={18} />
          <div>
            <strong>ESP32 + MAX6675</strong>
            <small>Proyecto PBL · 2026</small>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <div className="eyebrow">
              SISTEMA DE MONITOREO TÉRMICO
            </div>
            <h1>Panel de supervisión</h1>
            <p>
              Visualización del horno y su
              comportamiento térmico.
            </p>
          </div>

          <div className="demo-badge">
            {demoMode
              ? <SlidersHorizontal size={16} />
              : live
                ? <Wifi size={16} />
                : <WifiOff size={16} />}
            {demoMode
              ? 'SIMULACIÓN'
              : live
                ? `EN VIVO · ${status.port}`
                : 'SIN DATOS EN VIVO'}
          </div>
        </header>

        <div className="notice">
          <AlertTriangle size={17} />
          {demoMode
            ? 'Modo demostración: los datos son simulados.'
            : !websocketConnected
              ? 'Sin conexión con FastAPI.'
              : !status.connected
                ? 'ESP32 desconectado de FastAPI.'
                : !status.receiving
                  ? 'ESP32 conectado, pero sin datos recientes.'
                  : !measurement?.sensor_ok
                    ? 'Falla de lectura del termopar.'
                    : 'Monitoreo real activo. El control térmico todavía no está integrado.'}
        </div>

        <section className="metric-grid">
          <article className="metric-card">
            <div className="metric-heading">
              <span>TEMPERATURA ACTUAL</span>
              <Thermometer size={19} />
            </div>
            <div className="metric-number">
              {temperature === null
                ? '--'
                : temperature.toFixed(1)}
              <span>°C</span>
            </div>
            <div className="metric-foot">
              {demoMode
                ? 'Temperatura simulada'
                : live
                  ? 'MAX6675 · Medición real'
                  : 'Esperando medición válida'}
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>SETPOINT</span>
              <SlidersHorizontal size={19} />
            </div>
            <div className="metric-number">
              {setpoint === null
                ? '--'
                : setpoint.toFixed(1)}
              <span>°C</span>
            </div>
            <div className="metric-foot">
              {demoMode
                ? 'Referencia provisional de simulación'
                : 'Pendiente del firmware de control'}
            </div>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>ERROR TÉRMICO</span>
              <Activity size={19} />
            </div>
            <div className="metric-number">
              {difference === null
                ? '--'
                : `${difference > 0 ? '+' : ''}${difference.toFixed(1)}`}
              <span>°C</span>
            </div>
            <div className="metric-foot">
              {difference === null
                ? 'Se requiere setpoint'
                : 'Temperatura menos setpoint'}
            </div>
          </article>
        </section>

        <section className="main-grid">
          <article className="panel oven-panel">
            <div className="panel-header">
              <div>
                <h2>Cámara térmica</h2>
                <p>Representación visual de temperatura</p>
              </div>
              <span className="small-label">VISTA FRONTAL</span>
            </div>

            <OvenAnimation
              temperature={temperature}
              heaterOn={heaterOn}
            />

            <div className="oven-status">
              <span className={
                heaterOn === true
                  ? 'status-dot on'
                  : 'status-dot'
              } />
              <div>
                <strong>{heaterText}</strong>
                <small>
                  {demoMode
                    ? 'Estado simulado'
                    : 'El ESP32 todavía no reporta la salida GPIO18'}
                </small>
              </div>
            </div>
          </article>

          <article className="panel info-panel">
            <div className="panel-header">
              <div>
                <h2>Estado del sistema</h2>
                <p>Variables de comunicación</p>
              </div>
              <ShieldCheck size={20} className="header-icon" />
            </div>

            <div className="status-row">
              <span>FastAPI</span>
              <strong>
                {websocketConnected ? 'Conectado' : 'Desconectado'}
              </strong>
            </div>

            <div className="status-row">
              <span>ESP32</span>
              <strong>
                {status.receiving
                  ? `Recibiendo · ${status.port}`
                  : status.connected
                    ? 'Esperando datos'
                    : 'Desconectado'}
              </strong>
            </div>

            <div className="status-row">
              <span>MAX6675</span>
              <strong>
                {live ? 'Lectura válida' : 'Sin lectura válida reciente'}
              </strong>
            </div>

            <div className="status-row">
              <span>Modo</span>
              <strong>
                {demoMode
                  ? 'Demostración'
                  : measurement?.mode ?? 'Monitoreo'}
              </strong>
            </div>

            <div className="simulator">
              <div className="sim-title">
                <SlidersHorizontal size={17} />
                Modo de visualización
              </div>

              <button
                type="button"
                className="heater-button"
                onClick={() => setDemoMode(!demoMode)}
              >
                {demoMode
                  ? 'Volver a datos reales'
                  : 'Activar simulación'}
              </button>

              {demoMode && (
                <>
                  <p>
                    Estos controles no afectan al ESP32 ni a la PCB.
                  </p>

                  <div className="range-label">
                    <span>Temperatura simulada</span>
                    <strong>{demoTemp} °C</strong>
                  </div>

                  <input
                    type="range"
                    min="20"
                    max="100"
                    value={demoTemp}
                    onChange={event =>
                      updateDemoTemperature(
                        Number(event.target.value)
                      )}
                  />

                  <button
                    type="button"
                    className="heater-button"
                    onClick={() => setDemoHeater(!demoHeater)}
                  >
                    <Power size={17} />
                    Simular calefactor:
                    {demoHeater ? ' ON' : ' OFF'}
                  </button>
                </>
              )}
            </div>
          </article>
        </section>

        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h2>Tendencia de temperatura</h2>
              <p>
                {demoMode
                  ? 'Historial de demostración'
                  : 'Últimas 60 mediciones válidas de esta sesión'}
              </p>
            </div>
            <span className="small-label">
              {demoMode ? 'SIMULACIÓN' : 'DATOS RECIBIDOS'}
            </span>
          </div>

          <div className="chart-legend">
            <span>
              <i className="orange-line" /> Temperatura
            </span>
            {setpoint !== null && (
              <span>
                <i className="blue-line" /> Setpoint
              </span>
            )}
          </div>

          <TemperatureChart
            values={history}
            setpoint={setpoint}
          />
        </section>

        <footer className="footer">
          POWERGuard © 2026 · Proyecto PBL
          <span>
            {demoMode
              ? 'Datos simulados'
              : 'Supervisión de temperatura · Sin control remoto'}
          </span>
        </footer>
      </main>
    </div>
  )
}

export default App
