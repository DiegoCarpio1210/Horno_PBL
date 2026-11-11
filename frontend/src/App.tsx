
import HistoryPage from './pages/HistoryPage'

import {
  useEffect,
  useRef,
  useState
} from 'react'

import {
  Activity,
  Flame,
  Thermometer,
  ShieldCheck,
  Wifi,
  WifiOff,
  SlidersHorizontal,
  Power,
  AlertTriangle,
  Clock3,
  Cpu
} from 'lucide-react'

import {
  useTelemetry,
  type ControlMode
} from './hooks/useTelemetry'

import './App.css'

const DEMO_SETPOINT = 65

const INITIAL_DEMO_HISTORY = [
  26, 28, 30, 33, 37, 41, 46, 51,
  55, 59, 62, 64, 65, 64, 65, 66
]

// ==========================================
// ANIMACIÓN ORIGINAL DEL HORNO
// ==========================================

function OvenAnimation({
  temperature,
  heaterOn
}: {
  temperature: number | null
  heaterOn: boolean | null
}) {
  const intensity = temperature === null
    ? 0
    : Math.max(
        0,
        Math.min(
          1,
          (temperature - 25) / 55
        )
      )

  return (
    <div className="oven-scene">

      <div
        className="oven-glow"
        style={{
          opacity: intensity
        }}
      />

      <div className="oven-machine">

        <div className="oven-top">
          <span className="machine-brand">
            POWERGUARD
          </span>

          <div className="machine-light" />
        </div>

        <div className="oven-door">

          <div
            className="oven-chamber"
            style={{
              backgroundColor:
                `rgba(234,88,12,${
                  0.06 + intensity * 0.48
                })`,

              boxShadow:
                `inset 0 0 ${
                  15 + intensity * 65
                }px rgba(249,115,22,${
                  intensity * 0.7
                })`
            }}
          >

            <div className="chamber-grid" />

            <div className="oven-temperature">

              <span>
                {temperature === null
                  ? '--'
                  : `${temperature.toFixed(1)}°`
                }
              </span>

              <small>
                TEMPERATURA INTERNA
              </small>

            </div>

            <div
              className={
                heaterOn === true
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
          <span>
            THERMAL CHAMBER / V1.0
          </span>
          <span>
            ESP32
          </span>
        </div>

        <div className="oven-feet">
          <span />
          <span />
        </div>

      </div>

    </div>
  )
}

// ==========================================
// GRÁFICA ORIGINAL DE TEMPERATURA
// ==========================================

function TemperatureChart({
  values,
  setpoint
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

  const plotW =
    width - left - right

  const plotH =
    height - top - bottom

  const allValues =
    setpoint === null
      ? values
      : [...values, setpoint]

  const low = Math.floor(
    (
      Math.min(...allValues) - 5
    ) / 10
  ) * 10

  const high = Math.ceil(
    (
      Math.max(...allValues) + 5
    ) / 10
  ) * 10

  const y = (value: number) =>
    top +
    (high - value) /
    (high - low) *
    plotH

  const x = (index: number) =>
    left +
    index /
    Math.max(
      1,
      values.length - 1
    ) *
    plotW

  const path = values
    .map((value, index) =>
      `${
        index === 0 ? 'M' : 'L'
      } ${x(index)} ${y(value)}`
    )
    .join(' ')

  const ticks = Array.from(
    { length: 5 },
    (_, index) =>
      low +
      (
        high - low
      ) * index / 4
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

      <text
        x={left}
        y={height - 5}
        fill="#8794AA"
        fontSize="11"
      >
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

// ==========================================
// DASHBOARD PRINCIPAL
// ==========================================

function App() {

  const {
    status,
    websocketConnected,
    commandBusy,
    commandError,
    setMode,
    setSetpoint,
    setManualOutput,
    requestStop
  } = useTelemetry()

  const [
    targetInput,
    setTargetInput
  ] = useState('65')

  const [
    controlMessage,
    setControlMessage
  ] = useState<string | null>(null)

  const [
    lastApplied,
    setLastApplied
  ] = useState<string | null>(null)

  const [
    currentPage,
    setCurrentPage
  ] = useState<
    'supervision' | 'history'
  >('supervision')

  // ========================================
  // SIMULACIÓN ORIGINAL
  // ========================================

  const [
    demoMode,
    setDemoMode
  ] = useState(false)

  const [
    demoTemp,
    setDemoTemp
  ] = useState(58)

  const [
    demoHeater,
    setDemoHeater
  ] = useState(true)

  const [
    realHistory,
    setRealHistory
  ] = useState<number[]>([])

  const [
    demoHistory,
    setDemoHistory
  ] = useState(
    INITIAL_DEMO_HISTORY
  )

  const lastTimestamp =
    useRef<string | null>(null)

  const measurement =
    status.last_measurement

  const control =
    status.control

  const ready =
    websocketConnected &&
    status.receiving &&
    control.ready &&
    measurement?.sensor_ok === true &&
    measurement.alarm === false

  const modeActual =
    measurement?.mode ?? null

  const manualAllowed =
    ready &&
    modeActual === 'MANUAL' &&
    !demoMode &&
    !commandBusy

  const highAllowed =
    manualAllowed &&
    control.manual_high_available

  const lowAllowed =
    websocketConnected &&
    status.connected &&
    control.ready &&
    modeActual === 'MANUAL' &&
    !demoMode &&
    !commandBusy

  const desired =
    Number(targetInput)

  const setpointInRange =
    targetInput.trim() !== '' &&
    Number.isFinite(desired) &&
    desired >= control.setpoint_min &&
    desired <= control.setpoint_max

  // ========================================
  // ENVÍO DE COMANDOS
  // ========================================

  async function executeControl(
    operation: () => Promise<void>,
    label: string
  ) {
    setControlMessage(null)

    try {
      await operation()

      setLastApplied(label)

      setControlMessage(
        `ESP32 confirmó: ${label}. ` +
        'Esperando telemetría actualizada.'
      )

    } catch (error) {
      setControlMessage(
        error instanceof Error
          ? error.message
          : 'Orden no confirmada.'
      )
    }
  }

  const live =
    websocketConnected &&
    status.receiving &&
    measurement?.sensor_ok === true &&
    measurement.temperature !== null &&
    measurement.temperature !== undefined

  // ========================================
  // REGISTRO DE GRÁFICA EN VIVO
  // ========================================

  useEffect(() => {
    if (
      !websocketConnected ||
      !status.receiving
    ) {
      return
    }

    if (!measurement?.sensor_ok) {
      return
    }

    if (
      measurement.temperature === null
    ) {
      return
    }

    if (
      measurement.timestamp ===
      lastTimestamp.current
    ) {
      return
    }

    lastTimestamp.current =
      measurement.timestamp

    const value =
      measurement.temperature

    if (Number.isFinite(value)) {
      setRealHistory(previous =>
        [
          ...previous.slice(-59),
          value
        ]
      )
    }

  }, [
    measurement,
    status.receiving,
    websocketConnected
  ])

  // ========================================
  // VALORES VISUALIZADOS
  // ========================================

  const temperature =
    demoMode
      ? demoTemp
      : live
        ? measurement!.temperature
        : null

  const setpoint =
    demoMode
      ? DEMO_SETPOINT
      : measurement?.setpoint ?? null

  const heaterOn =
    demoMode
      ? demoHeater
      : live
        ? measurement?.heater_on ?? null
        : null

  const history =
    demoMode
      ? demoHistory
      : realHistory

  const difference =
    temperature !== null &&
    setpoint !== null
      ? temperature - setpoint
      : null

  function updateDemoTemperature(
    value: number
  ) {
    setDemoTemp(value)

    setDemoHistory(previous =>
      [
        ...previous.slice(-59),
        value
      ]
    )
  }

  const heaterText =
    heaterOn === null
      ? 'Estado no disponible'
      : heaterOn
        ? 'Calefactor activado'
        : 'Calefactor desactivado'

  // ========================================
  // JSX
  // ========================================

  return (
    <div className="app-shell">

      {/* SIDEBAR ORIGINAL */}

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

        <div className="sidebar-label">
          PLATAFORMA
        </div>

        <button
          type="button"
          className={
            currentPage === 'supervision'
              ? 'nav-link selected'
              : 'nav-link'
          }
          onClick={() =>
            setCurrentPage('supervision')
          }
        >
          <Activity size={18} />
          Supervisión
        </button>

        <button
          type="button"
          className={
            currentPage === 'history'
              ? 'nav-link selected'
              : 'nav-link'
          }
          onClick={() =>
            setCurrentPage('history')
          }
        >
          <Clock3 size={18} />
          Historial y análisis
        </button>

        <div className="sidebar-bottom">
          <Cpu size={18} />

          <div>
            <strong>
              ESP32 + MAX6675
            </strong>

            <small>
              Proyecto PBL · 2026
            </small>
          </div>
        </div>

      </aside>

      {/* PANTALLA PRINCIPAL */}

      <main className="main-content">

        {currentPage === 'history' ? (

          <HistoryPage />

        ) : (

          <>

            {/* ENCABEZADO ORIGINAL */}

            <header className="topbar">

              <div>
                <div className="eyebrow">
                  SISTEMA DE MONITOREO TÉRMICO
                </div>

                <h1>
                  Panel de supervisión
                </h1>

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
                    : <WifiOff size={16} />
                }

                {demoMode
                  ? 'SIMULACIÓN'
                  : live
                    ? `EN VIVO · ${status.port}`
                    : 'SIN DATOS EN VIVO'
                }

              </div>

            </header>

            {/* NUEVO: CONTROL PID */}

            <section
              className="panel pg-control-panel"
              aria-label="Control de temperatura"
            >

              <div className="panel-header">

                <div>
                  <h2>
                    Control térmico
                  </h2>

                  <p>
                    Modo y referencia confirmados
                    por el ESP32
                  </p>
                </div>

                <span className="small-label">
                  {modeActual ?? 'SIN MODO'}
                </span>

              </div>

              <div className="pg-control-grid">

                <div className="pg-control-field">

                  <label>
                    Modo de operación
                  </label>

                  <div className="pg-toggle-row">

                    <button
                      type="button"
                      className={
                        modeActual === 'AUTO'
                          ? 'pg-mode active'
                          : 'pg-mode'
                      }
                      disabled={
                        !ready ||
                        demoMode ||
                        commandBusy
                      }
                      onClick={() =>
                        executeControl(
                          () =>
                            setMode(
                              'AUTO' as ControlMode
                            ),
                          'modo AUTO'
                        )
                      }
                    >
                      Automático PID
                    </button>

                    <button
                      type="button"
                      className={
                        modeActual === 'MANUAL'
                          ? 'pg-mode active'
                          : 'pg-mode'
                      }
                      disabled={
                        !ready ||
                        demoMode ||
                        commandBusy
                      }
                      onClick={() =>
                        executeControl(
                          () =>
                            setMode(
                              'MANUAL' as ControlMode
                            ),
                          'modo MANUAL'
                        )
                      }
                    >
                      Manual
                    </button>

                  </div>
                </div>

                <div className="pg-control-field">

                  <label htmlFor="pg-setpoint">
                    Setpoint (°C)
                  </label>

                  <div className="pg-setpoint-row">

                    <input
                      id="pg-setpoint"
                      type="number"
                      min={control.setpoint_min}
                      max={control.setpoint_max}
                      step="0.25"
                      value={targetInput}
                      onChange={event =>
                        setTargetInput(
                          event.target.value
                        )
                      }
                      aria-describedby="pg-setpoint-help"
                    />

                    <button
                      type="button"
                      className="pg-accent-button"
                      disabled={
                        !ready ||
                        demoMode ||
                        commandBusy ||
                        !setpointInRange
                      }
                      onClick={() =>
                        executeControl(
                          () =>
                            setSetpoint(desired),
                          `setpoint ${desired.toFixed(2)} °C`
                        )
                      }
                    >
                      Aplicar
                    </button>

                  </div>

                  <small id="pg-setpoint-help">
                    Rango permitido:
                    {' '}
                    {control.setpoint_min}–
                    {control.setpoint_max} °C.
                    {' '}
                    Actual:
                    {' '}
                    {setpoint === null
                      ? '--'
                      : `${setpoint.toFixed(2)} °C`
                    }
                  </small>

                </div>

                <div className="pg-control-field">

                  <label>
                    Estado PID
                  </label>

                  <div className="pg-pid-value">
                    {measurement?.pid_percent == null
                      ? '--'
                      : `${measurement.pid_percent.toFixed(1)} %`
                    }
                  </div>

                  <small>
                    Demanda calculada · orden temporal:
                    {' '}
                    {measurement?.command_on === true
                      ? 'ON'
                      : measurement?.command_on === false
                        ? 'OFF'
                        : '--'
                    }
                  </small>

                </div>

                <div className="pg-control-field">

                  <label>
                    Alarmas y protección
                  </label>

                  <div
                    className={
                      measurement?.alarm
                        ? 'pg-fault fault'
                        : 'pg-fault'
                    }
                  >
                    {measurement?.alarm
                      ? `Bloqueado: ${
                          measurement.fault ?? 'FAULT'
                        }`
                      : ready
                        ? 'Sin alarma reportada'
                        : 'Estado no confirmado'
                    }
                  </div>

                  <small>
                    {control.message}
                  </small>

                </div>

              </div>

              {controlMessage && (
                <p
                  className="pg-feedback"
                  role="status"
                >
                  {controlMessage}
                </p>
              )}

              {commandError && (
                <p
                  className="pg-feedback danger"
                  role="alert"
                >
                  {commandError}
                </p>
              )}

              {lastApplied && (
                <p className="pg-hint">
                  Última orden confirmada:
                  {' '}
                  {lastApplied}
                </p>
              )}

            </section>

            {/* AVISOS ORIGINALES */}

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
                        : measurement?.alarm
                          ? `ALARMA: ${
                              measurement.fault ??
                              'Fallo de control'
                            }`
                          : `Telemetría real · ${
                              modeActual ??
                              'Modo no disponible'
                            }`
              }

            </div>

            {/* TARJETAS ORIGINALES */}

            <section className="metric-grid">

              <article className="metric-card">

                <div className="metric-heading">
                  <span>
                    TEMPERATURA ACTUAL
                  </span>
                  <Thermometer size={19} />
                </div>

                <div className="metric-number">

                  {temperature === null
                    ? '--'
                    : temperature.toFixed(1)
                  }

                  <span>°C</span>

                </div>

                <div className="metric-foot">

                  {demoMode
                    ? 'Temperatura simulada'
                    : live
                      ? 'MAX6675 · Medición real'
                      : 'Esperando medición válida'
                  }

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
                    : setpoint.toFixed(1)
                  }

                  <span>°C</span>

                </div>

                <div className="metric-foot">

                  {demoMode
                    ? 'Referencia provisional de simulación'
                    : 'Referencia confirmada por ESP32'
                  }

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
                    : `${
                        difference > 0 ? '+' : ''
                      }${difference.toFixed(1)}`
                  }

                  <span>°C</span>

                </div>

                <div className="metric-foot">

                  {difference === null
                    ? 'Se requiere setpoint'
                    : 'Temperatura menos setpoint'
                  }

                </div>

              </article>

            </section>

            {/* HORNO ORIGINAL */}

            <section className="main-grid">

              <article className="panel oven-panel">

                <div className="panel-header">

                  <div>
                    <h2>
                      Cámara térmica
                    </h2>
                    <p>
                      Representación visual de temperatura
                    </p>
                  </div>

                  <span className="small-label">
                    VISTA FRONTAL
                  </span>

                </div>

                <OvenAnimation
                  temperature={temperature}
                  heaterOn={heaterOn}
                />

                <div className="oven-status">

                  <span
                    className={
                      heaterOn === true
                        ? 'status-dot on'
                        : 'status-dot'
                    }
                  />

                  <div>

                    <strong>
                      {heaterText}
                    </strong>

                    <small>
                      {demoMode
                        ? 'Estado simulado'
                        : 'Orden de salida reportada por el ESP32; no confirma conducción del foco'
                      }
                    </small>

                  </div>

                </div>

              </article>

              {/* ESTADO ORIGINAL */}

              <article className="panel info-panel">

                <div className="panel-header">

                  <div>
                    <h2>
                      Estado del sistema
                    </h2>

                    <p>
                      Variables de comunicación
                    </p>
                  </div>

                  <ShieldCheck
                    size={20}
                    className="header-icon"
                  />

                </div>

                <div className="status-row">

                  <span>FastAPI</span>

                  <strong>
                    {websocketConnected
                      ? 'Conectado'
                      : 'Desconectado'
                    }
                  </strong>

                </div>

                <div className="status-row">

                  <span>ESP32</span>

                  <strong>
                    {status.receiving
                      ? `Recibiendo · ${
                          status.port
                        }`
                      : status.connected
                        ? 'Esperando datos'
                        : 'Desconectado'
                    }
                  </strong>

                </div>

                <div className="status-row">

                  <span>MAX6675</span>

                  <strong>
                    {live
                      ? 'Lectura válida'
                      : 'Sin lectura válida reciente'
                    }
                  </strong>

                </div>

                <div className="status-row">

                  <span>Modo</span>

                  <strong>
                    {demoMode
                      ? 'Demostración'
                      : measurement?.mode ??
                        'Monitoreo'
                    }
                  </strong>

                </div>

                {/* SIMULADOR ORIGINAL */}

                <div className="simulator">

                  <div className="sim-title">
                    <SlidersHorizontal size={17} />
                    Modo de visualización
                  </div>

                  <button
                    type="button"
                    className="heater-button"
                    onClick={() =>
                      setDemoMode(!demoMode)
                    }
                  >
                    {demoMode
                      ? 'Volver a datos reales'
                      : 'Activar simulación'
                    }
                  </button>

                  {demoMode && (
                    <>

                      <p>
                        Estos controles no afectan
                        al ESP32 ni a la PCB.
                      </p>

                      <div className="range-label">

                        <span>
                          Temperatura simulada
                        </span>

                        <strong>
                          {demoTemp} °C
                        </strong>

                      </div>

                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={demoTemp}
                        onChange={event =>
                          updateDemoTemperature(
                            Number(
                              event.target.value
                            )
                          )
                        }
                      />

                      <button
                        type="button"
                        className="heater-button"
                        onClick={() =>
                          setDemoHeater(!demoHeater)
                        }
                      >
                        <Power size={17} />

                        Simular calefactor:
                        {demoHeater
                          ? ' ON'
                          : ' OFF'
                        }

                      </button>

                    </>
                  )}

                </div>

              </article>

            </section>

            {/* GRÁFICA ORIGINAL */}

            <section className="panel chart-panel">

              <div className="panel-header">

                <div>
                  <h2>
                    Tendencia de temperatura
                  </h2>

                  <p>
                    {demoMode
                      ? 'Historial de demostración'
                      : 'Últimas 60 mediciones válidas de esta sesión'
                    }
                  </p>

                </div>

                <span className="small-label">
                  {demoMode
                    ? 'SIMULACIÓN'
                    : 'DATOS RECIBIDOS'
                  }
                </span>

              </div>

              <div className="chart-legend">

                <span>
                  <i className="orange-line" />
                  Temperatura
                </span>

                {setpoint !== null && (
                  <span>
                    <i className="blue-line" />
                    Setpoint
                  </span>
                )}

              </div>

              <TemperatureChart
                values={history}
                setpoint={setpoint}
              />

            </section>

            {/* NUEVO: CONTROL MANUAL ABAJO */}

            <section
              className="panel pg-manual-panel"
              aria-label="Control manual"
            >

              <div className="panel-header">

                <div>
                  <h2>
                    Control manual · GPIO18
                  </h2>

                  <p>
                    HIGH solicita un pulso máximo
                    de 2 s; LOW solicita apagado.
                  </p>
                </div>

                <span className="small-label">
                  {manualAllowed
                    ? 'MANUAL DISPONIBLE'
                    : 'BLOQUEADO'
                  }
                </span>

              </div>

              <div className="pg-manual-actions">

                <button
                  type="button"
                  className="pg-high"
                  disabled={!highAllowed}
                  onClick={() =>
                    executeControl(
                      () => setManualOutput('HIGH'),
                      'pulso HIGH (2 s máximo)'
                    )
                  }
                >
                  HIGH · Pulso limitado
                </button>

                <button
                  type="button"
                  className="pg-low"
                  disabled={!lowAllowed}
                  onClick={() =>
                    executeControl(
                      () => setManualOutput('LOW'),
                      'LOW'
                    )
                  }
                >
                  LOW · Apagar
                </button>

                <button
                  type="button"
                  className="pg-stop"
                  disabled={
                    !websocketConnected ||
                    !status.connected ||
                    !control.ready ||
                    commandBusy
                  }
                  onClick={() =>
                    executeControl(
                      requestStop,
                      'SAFE_OFF (bloqueo hasta reinicio)'
                    )
                  }
                >
                  Solicitar SAFE_OFF
                </button>

              </div>

              <p className="pg-hint">

                Estado reportado:
                {' '}

                {heaterOn === true
                  ? 'GPIO18 HIGH'
                  : heaterOn === false
                    ? 'GPIO18 LOW'
                    : 'Desconocido'
                }.

                {' '}
                Una confirmación serial no verifica
                la corriente del foco.
                Se requiere protección térmica independiente.

              </p>

            </section>

            {/* FOOTER ORIGINAL */}

            <footer className="footer">

              POWERGuard © 2026 · Proyecto PBL

              <span>
                {demoMode
                  ? 'Datos simulados'
                  : 'Supervisión y control térmico · POWERGuard'
                }
              </span>

            </footer>

          </>

        )}

      </main>

    </div>
  )
}

export default App
