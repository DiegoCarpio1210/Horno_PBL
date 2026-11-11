
import {
  useEffect,
  useMemo,
  useState
} from 'react'

import {
  Activity,
  CalendarDays,
  Database,
  Download,
  RefreshCw,
  Search,
  Thermometer,
  AlertTriangle
} from 'lucide-react'

import './HistoryPage.css'

const API_URL = 'http://127.0.0.1:8000'

interface Measurement {
  id: number
  timestamp: string
  temperature: number | null
  sensor_ok: boolean
  setpoint: number | null
  heater_on: boolean | null
  mode: string | null
  pid_percent?: number | null
  command_on?: boolean | null
  alarm?: boolean | null
  fault?: string | null
  temperature_filtered?: number | null
}

interface HistoryResponse {
  count: number
  measurements: Measurement[]
}

type SensorFilter =
  'all' | 'valid' | 'invalid'


function formatDate(
  iso: string
): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return iso
  }

  return date.toLocaleString(
    'es-SV',
    {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }
  )
}


function formatTemperature(
  value: number | null
): string {

  if (
    value === null ||
    !Number.isFinite(value)
  ) {
    return '--'
  }

  return `${value.toFixed(2)} °C`
}


function toUtcFilter(
  value: string,
  includeMinuteEnd = false
): string | null {

  if (!value) return null

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return null
  }

  if (includeMinuteEnd) {
    date.setSeconds(59, 999)
  }

  const second =
    date.toISOString().slice(0, 19)

  return (
    `${second}.` +
    `${includeMinuteEnd
      ? '999999'
      : '000000'
    }+00:00`
  )
}


// ==========================================
// GRÁFICA TEMPERATURA Y SETPOINT
// ==========================================

function HistoryChart({
  records
}: {
  records: Measurement[]
}) {

  const valid = records.filter(item =>
    item.sensor_ok &&
    typeof item.temperature === 'number' &&
    Number.isFinite(item.temperature) &&
    !Number.isNaN(
      Date.parse(item.timestamp)
    )
  )

  if (valid.length === 0) {
    return (
      <div className="history-empty">
        No hay temperaturas válidas para graficar.
      </div>
    )
  }

  const width = 800
  const height = 270

  const margin = {
    left: 51,
    right: 18,
    top: 18,
    bottom: 37
  }

  const plotWidth =
    width - margin.left - margin.right

  const plotHeight =
    height - margin.top - margin.bottom

  const ordered = [...valid].sort(
    (a, b) =>
      Date.parse(a.timestamp) -
      Date.parse(b.timestamp)
  )

  const allTemps = ordered.flatMap(
    item =>
      item.setpoint === null
        ? [item.temperature as number]
        : [
            item.temperature as number,
            item.setpoint
          ]
  )

  const minTemp = Math.floor(
    (
      Math.min(...allTemps) - 3
    ) / 5
  ) * 5

  const maxTemp = Math.ceil(
    (
      Math.max(...allTemps) + 3
    ) / 5
  ) * 5

  const minTime =
    Date.parse(
      ordered[0].timestamp
    )

  const maxTime =
    Date.parse(
      ordered[ordered.length - 1].timestamp
    )

  const x = (time: number) =>
    margin.left +
    (
      minTime === maxTime
        ? plotWidth / 2
        : (
            (time - minTime) /
            (maxTime - minTime)
          ) * plotWidth
    )

  const y = (temperature: number) =>
    margin.top +
    (
      (maxTemp - temperature) /
      (maxTemp - minTemp)
    ) * plotHeight

  const temperaturePath = ordered
    .map((item, index) =>
      `${
        index === 0 ? 'M' : 'L'
      } ${
        x(Date.parse(item.timestamp))
      } ${
        y(item.temperature as number)
      }`
    )
    .join(' ')

  // Setpoint histórico variable.
  // Los valores nulos crean interrupciones.

  let previousSetpointExists = false

  const setpointPath = ordered
    .map(item => {
      if (item.setpoint === null) {
        previousSetpointExists = false
        return ''
      }

      const command =
        previousSetpointExists
          ? 'L'
          : 'M'

      previousSetpointExists = true

      return `${
        command
      } ${
        x(Date.parse(item.timestamp))
      } ${
        y(item.setpoint)
      }`
    })
    .filter(Boolean)
    .join(' ')

  const ticks = Array.from(
    { length: 5 },
    (_, index) =>
      minTemp +
      (
        (maxTemp - minTemp) *
        index
      ) / 4
  )

  const last =
    ordered[ordered.length - 1]

  return (
    <div className="history-chart-container">

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="history-chart-svg"
        role="img"
        aria-label="Gráfica histórica de temperatura y setpoint"
      >

        {ticks.map(tick => (
          <g key={tick}>

            <line
              x1={margin.left}
              y1={y(tick)}
              x2={width - margin.right}
              y2={y(tick)}
              stroke="#2D3B50"
              strokeDasharray="4 5"
            />

            <text
              x={margin.left - 9}
              y={y(tick) + 4}
              textAnchor="end"
              fill="#94A3B8"
              fontSize="12"
            >
              {tick.toFixed(0)}°
            </text>

          </g>
        ))}

        {setpointPath && (
          <path
            d={setpointPath}
            fill="none"
            stroke="#60A5FA"
            strokeWidth="2"
            strokeDasharray="7 5"
          />
        )}

        <path
          d={temperaturePath}
          fill="none"
          stroke="#FB923C"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          cx={
            x(
              Date.parse(last.timestamp)
            )
          }
          cy={
            y(
              last.temperature as number
            )
          }
          r="4.5"
          fill="#FB923C"
          stroke="#fff"
          strokeWidth="1.5"
        />

        <text
          x={margin.left}
          y={height - 7}
          fill="#94A3B8"
          fontSize="11"
        >
          {formatDate(ordered[0].timestamp)}
        </text>

        <text
          x={width - margin.right}
          y={height - 7}
          fill="#94A3B8"
          fontSize="11"
          textAnchor="end"
        >
          {formatDate(last.timestamp)}
        </text>

      </svg>

    </div>
  )
}


// ==========================================
// GRÁFICA HISTÓRICA DE DEMANDA PID
// ==========================================

function PIDChart({
  records
}: {
  records: Measurement[]
}) {

  const rows = records
    .filter(
      item =>
        typeof item.pid_percent === 'number' &&
        Number.isFinite(item.pid_percent) &&
        Number.isFinite(
          Date.parse(item.timestamp)
        )
    )
    .sort(
      (a, b) =>
        Date.parse(a.timestamp) -
        Date.parse(b.timestamp)
    )

  if (rows.length === 0) {
    return (
      <div className="history-empty">
        Aún no hay demanda PID registrada.
      </div>
    )
  }

  const w = 800
  const h = 220
  const l = 50
  const r = 18
  const t = 20
  const b = 32

  const t0 =
    Date.parse(rows[0].timestamp)

  const t1 =
    Date.parse(
      rows[rows.length - 1].timestamp
    )

  const x = (time: number) =>
    l +
    (
      t1 === t0
        ? (w - l - r) / 2
        : (
            (time - t0) /
            (t1 - t0)
          ) * (w - l - r)
    )

  const y = (value: number) =>
    t +
    (100 - value) /
    100 *
    (h - t - b)

  const path = rows
    .map(
      (item, index) =>
        `${
          index === 0 ? 'M' : 'L'
        } ${
          x(Date.parse(item.timestamp))
        } ${
          y(item.pid_percent!)
        }`
    )
    .join(' ')

  return (
    <div className="history-chart-container">

      <svg
        className="history-chart-svg"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Demanda PID histórica"
      >

        {[0, 25, 50, 75, 100].map(
          value => (
            <g key={value}>

              <line
                x1={l}
                x2={w - r}
                y1={y(value)}
                y2={y(value)}
                stroke="#2d3b50"
                strokeDasharray="4 5"
              />

              <text
                x={l - 8}
                y={y(value) + 4}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="11"
              >
                {value}%
              </text>

            </g>
          )
        )}

        <path
          d={path}
          stroke="#34d399"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />

        <text
          x={l}
          y={h - 6}
          fill="#94a3b8"
          fontSize="11"
        >
          {formatDate(rows[0].timestamp)}
        </text>

        <text
          x={w - r}
          y={h - 6}
          fill="#94a3b8"
          textAnchor="end"
          fontSize="11"
        >
          {formatDate(
            rows[rows.length - 1].timestamp
          )}
        </text>

      </svg>

    </div>
  )
}


// ==========================================
// PÁGINA HISTORIAL
// ==========================================

export default function HistoryPage() {

  const [
    records,
    setRecords
  ] = useState<Measurement[]>([])

  const [
    loading,
    setLoading
  ] = useState(false)

  const [
    error,
    setError
  ] = useState<string | null>(null)

  const [
    startDate,
    setStartDate
  ] = useState('')

  const [
    endDate,
    setEndDate
  ] = useState('')

  const [
    limit,
    setLimit
  ] = useState(300)

  const [
    search,
    setSearch
  ] = useState('')

  const [
    sensorFilter,
    setSensorFilter
  ] = useState<SensorFilter>('all')

  const invalidDateRange = Boolean(
    startDate &&
    endDate &&
    new Date(startDate) > new Date(endDate)
  )

  function buildParams(
    exportMode = false
  ): URLSearchParams {

    const params =
      new URLSearchParams()

    params.set(
      'limit',
      String(
        exportMode
          ? 100000
          : limit
      )
    )

    const start =
      toUtcFilter(startDate)

    const end =
      toUtcFilter(
        endDate,
        true
      )

    if (start) {
      params.set(
        'start',
        start
      )
    }

    if (end) {
      params.set(
        'end',
        end
      )
    }

    return params
  }

  async function loadHistory(): Promise<void> {

    if (invalidDateRange) {
      setError(
        'La fecha inicial no puede ser posterior a la final.'
      )
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_URL}/api/history?${
          buildParams()
        }`
      )

      if (!response.ok) {
        throw new Error(
          `FastAPI respondió HTTP ${
            response.status
          }`
        )
      }

      const data =
        await response.json() as HistoryResponse

      if (!Array.isArray(data.measurements)) {
        throw new Error(
          'Respuesta de historial inválida.'
        )
      }

      setRecords(
        data.measurements
      )

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el historial.'
      )

    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const controller =
      new AbortController()

    fetch(
      `${API_URL}/api/history?limit=300`,
      {
        signal: controller.signal
      }
    )
      .then(response => {
        if (!response.ok) {
          throw new Error(
            `HTTP ${response.status}`
          )
        }

        return response.json() as Promise<HistoryResponse>
      })
      .then(data => {
        if (
          Array.isArray(data.measurements)
        ) {
          setRecords(
            data.measurements
          )
        }
      })
      .catch(err => {
        if (
          err instanceof Error &&
          err.name === 'AbortError'
        ) {
          return
        }

        setError(
          'No se pudo cargar el historial. Comprueba FastAPI.'
        )
      })

    return () => {
      controller.abort()
    }
  }, [])

  const filteredRecords = useMemo(() => {

    const term =
      search.trim().toLowerCase()

    return records.filter(item => {

      const matchesSensor =
        sensorFilter === 'all' ||
        (
          sensorFilter === 'valid' &&
          item.sensor_ok
        ) ||
        (
          sensorFilter === 'invalid' &&
          !item.sensor_ok
        )

      const text =
        `${
          item.id
        } ${
          formatDate(item.timestamp)
        } ${
          item.timestamp
        } ${
          item.temperature ?? ''
        }`

      return (
        matchesSensor &&
        text.toLowerCase().includes(term)
      )
    })

  }, [
    records,
    search,
    sensorFilter
  ])

  const pidRecords = filteredRecords.filter(
    item =>
      item.pid_percent !== null &&
      item.pid_percent !== undefined &&
      Number.isFinite(
        item.pid_percent
      )
  )

  const alarmCount =
    filteredRecords.filter(
      item => item.alarm === true
    ).length

  const pidAverage =
    pidRecords.length
      ? pidRecords.reduce(
          (sum, item) =>
            sum + (
              item.pid_percent ?? 0
            ),
          0
        ) / pidRecords.length
      : null

  const stats = useMemo(() => {

    const temperatures = filteredRecords
      .filter(
        item =>
          item.sensor_ok &&
          typeof item.temperature === 'number' &&
          Number.isFinite(
            item.temperature
          )
      )
      .map(
        item =>
          item.temperature as number
      )

    if (temperatures.length === 0) {
      return {
        average: null,
        maximum: null,
        minimum: null
      }
    }

    return {
      average:
        temperatures.reduce(
          (a, b) => a + b,
          0
        ) / temperatures.length,

      maximum:
        Math.max(...temperatures),

      minimum:
        Math.min(...temperatures)
    }

  }, [filteredRecords])

  function downloadCSV() {

    if (invalidDateRange) {
      setError(
        'Corrige el intervalo de fechas.'
      )
      return
    }

    window.location.assign(
      `${API_URL}/api/export?${
        buildParams(true)
      }`
    )
  }

  return (
    <div className="history-page">

      <header className="history-page-header">

        <div>

          <div className="eyebrow">
            ANÁLISIS DE DATOS
          </div>

          <h1>
            Historial térmico
          </h1>

          <p>
            Consulta las mediciones del MAX6675
            almacenadas en POWERGuard.
          </p>

        </div>

        <button
          type="button"
          className="history-button primary"
          onClick={downloadCSV}
        >
          <Download size={17} />
          Exportar CSV
        </button>

      </header>

      {/* FILTROS ORIGINALES */}

      <section
        className="history-filters"
        aria-label="Filtros de consulta"
      >

        <div className="history-filter-title">
          <CalendarDays size={18} />
          Filtrar mediciones
        </div>

        <div className="history-filter-grid">

          <label>
            Desde

            <input
              type="datetime-local"
              value={startDate}
              onChange={event =>
                setStartDate(
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Hasta

            <input
              type="datetime-local"
              value={endDate}
              onChange={event =>
                setEndDate(
                  event.target.value
                )
              }
            />
          </label>

          <label>
            Cantidad máxima

            <select
              value={limit}
              onChange={event =>
                setLimit(
                  Number(event.target.value)
                )
              }
            >
              <option value={100}>
                100 registros
              </option>

              <option value={300}>
                300 registros
              </option>

              <option value={1000}>
                1,000 registros
              </option>

              <option value={5000}>
                5,000 registros
              </option>

              <option value={10000}>
                10,000 registros
              </option>
            </select>

          </label>

          <button
            type="button"
            className="history-button primary"
            disabled={
              loading ||
              invalidDateRange
            }
            onClick={loadHistory}
          >
            <RefreshCw size={16} />
            {loading
              ? 'Cargando...'
              : 'Consultar'
            }
          </button>

        </div>

        {invalidDateRange && (
          <p className="history-warning">
            La fecha Desde no puede
            ser posterior a Hasta.
          </p>
        )}

      </section>

      {error && (
        <div
          className="history-error"
          role="alert"
        >
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* ESTADÍSTICAS ORIGINALES */}

      <section
        className="history-stats"
        aria-label="Estadísticas térmicas"
      >

        <div className="history-stat">
          <Thermometer size={19} />
          <small>
            TEMPERATURA PROMEDIO
          </small>
          <strong>
            {formatTemperature(
              stats.average
            )}
          </strong>
        </div>

        <div className="history-stat">
          <Activity size={19} />
          <small>
            TEMPERATURA MÁXIMA
          </small>
          <strong>
            {formatTemperature(
              stats.maximum
            )}
          </strong>
        </div>

        <div className="history-stat">
          <Thermometer size={19} />
          <small>
            TEMPERATURA MÍNIMA
          </small>
          <strong>
            {formatTemperature(
              stats.minimum
            )}
          </strong>
        </div>

        <div className="history-stat">
          <Database size={19} />
          <small>
            REGISTROS MOSTRADOS
          </small>
          <strong>
            {filteredRecords.length}
          </strong>
        </div>

      </section>

      {/* NUEVO: RESUMEN PID */}

      <section
        className="history-pid-summary"
        aria-label="Resumen PID"
      >

        <div>
          <small>
            DEMANDA PID PROMEDIO
          </small>
          <strong>
            {pidAverage === null
              ? '--'
              : `${
                  pidAverage.toFixed(1)
                } %`
            }
          </strong>
        </div>

        <div>
          <small>
            ALARMAS REPORTADAS
          </small>
          <strong>
            {alarmCount}
          </strong>
        </div>

        <div>
          <small>
            MUESTRAS CON PID
          </small>
          <strong>
            {pidRecords.length}
          </strong>
        </div>

      </section>

      {/* GRÁFICA TEMPERATURA */}

      <section className="history-panel">

        <div className="history-panel-heading">

          <div>
            <h2>
              Evolución de temperatura
            </h2>

            <p>
              Temperatura frente a fecha
              y hora reales.
            </p>
          </div>

          <div className="history-legends">

            <span className="history-legend">
              <i className="legend-temperature" />
              Temperatura real
            </span>

            {filteredRecords.some(
              item => item.setpoint !== null
            ) && (
              <span className="history-legend">
                <i className="legend-setpoint" />
                Setpoint
              </span>
            )}

          </div>

        </div>

        <HistoryChart
          records={filteredRecords}
        />

      </section>

      {/* NUEVO: GRÁFICA PID */}

      <section className="history-panel">

        <div className="history-panel-heading">

          <div>
            <h2>
              Demanda del controlador PID
            </h2>

            <p>
              Potencia porcentual solicitada
              por el ESP32.
            </p>
          </div>

        </div>

        <PIDChart
          records={filteredRecords}
        />

      </section>

      {/* TABLA ORIGINAL AMPLIADA */}

      <section className="history-panel">

        <div className="history-panel-heading">

          <div>
            <h2>
              Registro de mediciones
            </h2>

            <p>
              Datos almacenados por
              FastAPI y SQLite.
            </p>
          </div>

        </div>

        <div className="history-table-controls">

          <div className="history-search">

            <Search size={17} />

            <input
              type="search"
              placeholder="Buscar fecha, ID o temperatura..."
              value={search}
              onChange={event =>
                setSearch(
                  event.target.value
                )
              }
            />

          </div>

          <select
            aria-label="Filtrar por estado del sensor"
            value={sensorFilter}
            onChange={event =>
              setSensorFilter(
                event.target.value as SensorFilter
              )
            }
          >
            <option value="all">
              Todos los registros
            </option>

            <option value="valid">
              Lecturas válidas
            </option>

            <option value="invalid">
              Fallos del sensor
            </option>
          </select>

        </div>

        <div className="history-table-scroll">

          <table className="history-table">

            <thead>
              <tr>
                <th>ID</th>
                <th>Fecha y hora</th>
                <th>Temperatura</th>
                <th>Setpoint</th>
                <th>PID</th>
                <th>Orden</th>
                <th>GPIO18</th>
                <th>Modo</th>
                <th>Alarma</th>
                <th>Sensor</th>
              </tr>
            </thead>

            <tbody>

              {[
                ...filteredRecords
              ].reverse().map(item => (

                <tr key={item.id}>

                  <td>
                    #{item.id}
                  </td>

                  <td>
                    {formatDate(
                      item.timestamp
                    )}
                  </td>

                  <td>
                    {formatTemperature(
                      item.temperature
                    )}
                  </td>

                  <td>
                    {formatTemperature(
                      item.setpoint
                    )}
                  </td>

                  <td>
                    {item.pid_percent == null
                      ? '--'
                      : `${
                          item.pid_percent.toFixed(1)
                        } %`
                    }
                  </td>

                  <td>
                    {item.command_on == null
                      ? '--'
                      : item.command_on
                        ? 'ON'
                        : 'OFF'
                    }
                  </td>

                  <td>
                    {item.heater_on === null
                      ? '--'
                      : item.heater_on
                        ? 'HIGH'
                        : 'LOW'
                    }
                  </td>

                  <td>
                    {item.mode ?? '--'}
                  </td>

                  <td>
                    {item.alarm === true
                      ? (
                          item.fault ??
                          'ALARMA'
                        )
                      : item.alarm === false
                        ? 'Sin alarma'
                        : '--'
                    }
                  </td>

                  <td>
                    <span
                      className={
                        item.sensor_ok
                          ? 'sensor-valid'
                          : 'sensor-invalid'
                      }
                    >
                      {item.sensor_ok
                        ? 'Válido'
                        : 'Error'
                      }
                    </span>
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

          {filteredRecords.length === 0 && (
            <div className="history-empty">
              No se encontraron registros
              con estos filtros.
            </div>
          )}

        </div>

      </section>

      <p className="history-footer">
        Los cálculos se basan en los
        registros mostrados.
        Pulsa Consultar para actualizar.
        La exportación aplica filtros de fecha,
        pero no la búsqueda local de texto.
      </p>

    </div>
  )
}
