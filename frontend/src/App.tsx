
import { useMemo, useState } from 'react'
import {
  Activity, Flame, Thermometer, ShieldCheck,
  Wifi, SlidersHorizontal, Power, AlertTriangle,
  Clock3, Cpu
} from 'lucide-react'
import './App.css'

const DEMO_SETPOINT = 65

const initialHistory = [
  26, 28, 30, 33, 37, 41, 46, 51,
  55, 59, 62, 64, 65, 64, 65, 66
]

function OvenAnimation({
  temperature,
  heaterOn,
}: {
  temperature: number
  heaterOn: boolean
}) {
  const intensity = Math.max(
    0, Math.min(1, (temperature - 25) / 55)
  )

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
              backgroundColor: `rgba(234, 88, 12, ${
                0.06 + intensity * 0.48
              })`,
              boxShadow: `inset 0 0 ${
                15 + intensity * 65
              }px rgba(249,115,22,${intensity * 0.7})`,
            }}
          >
            <div className="chamber-grid" />

            <div className="oven-temperature">
              <span>{temperature.toFixed(1)}°</span>
              <small>TEMPERATURA INTERNA</small>
            </div>

            <div
              className={
                heaterOn
                  ? 'heating-element active'
                  : 'heating-element'
              }
            >
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
  setpoint: number
}) {
  const width = 700
  const height = 230
  const left = 38
  const right = 12
  const top = 14
  const bottom = 28
  const plotW = width - left - right
  const plotH = height - top - bottom

  const low = Math.floor(
    (Math.min(...values, setpoint) - 5) / 10
  ) * 10

  const high = Math.ceil(
    (Math.max(...values, setpoint) + 5) / 10
  ) * 10

  const y = (value: number) =>
    top + (high - value) / (high - low) * plotH

  const x = (index: number) =>
    left + index / Math.max(1, values.length - 1) * plotW

  const path = values
    .map((value, i) =>
      `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(value)}`
    )
    .join(' ')

  const ticks = Array.from(
    { length: 5 },
    (_, i) => low + (high - low) * i / 4
  )

  return (
    <svg
      className="temperature-chart"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="Gráfica simulada de temperatura y setpoint"
    >
      {ticks.map(tick => (
        <g key={tick}>
          <line
            x1={left} y1={y(tick)}
            x2={width - right} y2={y(tick)}
            stroke="#283348"
            strokeDasharray="4 5"
          />
          <text
            x={left - 8} y={y(tick) + 4}
            textAnchor="end"
            fill="#8794AA"
            fontSize="11"
          >
            {tick.toFixed(0)}°
          </text>
        </g>
      ))}

      <line
        x1={left} y1={y(setpoint)}
        x2={width - right} y2={y(setpoint)}
        stroke="#60A5FA"
        strokeWidth="2"
        strokeDasharray="7 5"
      />

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
        stroke="#FFF"
        strokeWidth="1.5"
      />

      <text x={left} y={height - 5} fill="#8794AA" fontSize="11">
        Inicio de muestra
      </text>
      <text
        x={width - right} y={height - 5}
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
  const [temperature, setTemperature] = useState(58)
  const [heaterOn, setHeaterOn] = useState(true)
  const [history, setHistory] = useState(initialHistory)

  const difference = temperature - DEMO_SETPOINT

  const stateText = useMemo(() => {
    if (temperature > 68) return 'Sobre banda objetivo'
    if (temperature < 62) return 'Debajo del objetivo'
    return 'Dentro de banda objetivo'
  }, [temperature])

  function updateTemperature(value: number) {
    setTemperature(value)
    setHistory(previous => [...previous.slice(-29), value])
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="logo">
          <div className="logo-icon"><Flame size={23} /></div>
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
            <div className="eyebrow">SISTEMA DE MONITOREO TÉRMICO</div>
            <h1>Panel de supervisión</h1>
            <p>Visualización del horno y su comportamiento térmico.</p>
          </div>

          <div className="demo-badge">
            <Wifi size={16} />
            MODO DEMOSTRACIÓN
          </div>
        </header>

        <div className="notice">
          <AlertTriangle size={17} />
          Datos simulados. El ESP32 todavía no está conectado
          a esta interfaz.
        </div>

        <section className="metric-grid">
          <article className="metric-card">
            <div className="metric-heading">
              <span>TEMPERATURA ACTUAL</span>
              <Thermometer size={19} />
            </div>
            <div className="metric-number">
              {temperature.toFixed(1)}
              <span>°C</span>
            </div>
            <div className="metric-foot">Termopar tipo K · Simulación</div>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>SETPOINT DE REFERENCIA</span>
              <SlidersHorizontal size={19} />
            </div>
            <div className="metric-number">
              {DEMO_SETPOINT.toFixed(1)}
              <span>°C</span>
            </div>
            <div className="metric-foot">Valor provisional de diseño</div>
          </article>

          <article className="metric-card">
            <div className="metric-heading">
              <span>ERROR TÉRMICO</span>
              <Activity size={19} />
            </div>
            <div className="metric-number">
              {difference > 0 ? '+' : ''}
              {difference.toFixed(1)}
              <span>°C</span>
            </div>
            <div className="metric-foot">{stateText}</div>
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
              <span className={heaterOn ? 'status-dot on' : 'status-dot'} />
              <div>
                <strong>
                  Calefactor {heaterOn ? 'activado' : 'desactivado'}
                </strong>
                <small>Estado simulado de la salida GPIO18</small>
              </div>
            </div>
          </article>

          <article className="panel info-panel">
            <div className="panel-header">
              <div>
                <h2>Estado del sistema</h2>
                <p>Variables y operación</p>
              </div>
              <ShieldCheck size={20} className="header-icon" />
            </div>

            <div className="status-row">
              <span>Comunicación serial</span>
              <strong className="neutral">No conectada</strong>
            </div>
            <div className="status-row">
              <span>Modo</span>
              <strong>Demostración</strong>
            </div>
            <div className="status-row">
              <span>Sensor</span>
              <strong>MAX6675 (simulado)</strong>
            </div>
            <div className="status-row">
              <span>Banda objetivo provisional</span>
              <strong>62–68 °C</strong>
            </div>

            <div className="simulator">
              <div className="sim-title">
                <SlidersHorizontal size={17} />
                Simulador visual
              </div>
              <p>
                Ajusta la temperatura para observar
                cómo cambia la cámara térmica.
              </p>

              <div className="range-label">
                <span>Temperatura simulada</span>
                <strong>{temperature} °C</strong>
              </div>

              <input
                type="range"
                min="20"
                max="100"
                value={temperature}
                onChange={event =>
                  updateTemperature(Number(event.target.value))
                }
              />

              <button
                type="button"
                className="heater-button"
                onClick={() => setHeaterOn(!heaterOn)}
              >
                <Power size={17} />
                {heaterOn
                  ? 'Simular apagado del calefactor'
                  : 'Simular encendido del calefactor'}
              </button>
            </div>
          </article>
        </section>

        <section className="panel chart-panel">
          <div className="panel-header">
            <div>
              <h2>Tendencia de temperatura</h2>
              <p>Datos de ejemplo y cambios del simulador</p>
            </div>
            <span className="small-label">SIMULACIÓN</span>
          </div>

          <div className="chart-legend">
            <span><i className="orange-line" /> Temperatura</span>
            <span><i className="blue-line" /> Setpoint</span>
          </div>

          <TemperatureChart
            values={history}
            setpoint={DEMO_SETPOINT}
          />
        </section>

        <footer className="footer">
          POWERGuard © 2026 · Proyecto PBL
          <span>Interfaz de demostración · Sin control físico</span>
        </footer>
      </main>
    </div>
  )
}

export default App
