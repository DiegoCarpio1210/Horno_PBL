
import { useEffect, useState } from 'react'
import {
  Activity, CalendarDays, Download,
  RefreshCw, Database, Search,
  Thermometer, AlertTriangle
} from 'lucide-react'
import './HistoryPage.css'

// Servidor FastAPI que ya tenemos funcionando
const API_URL = 'http://127.0.0.1:8000'

interface Measurement {
  id: number
  timestamp: string
  temperature: number | null
  sensor_ok: boolean
  setpoint: number | null
  heater_on: boolean | null
  mode: string | null
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('es-SV', {
    dateStyle: 'short',
    timeStyle: 'medium'
  })
}

function formatTemperature(value: number | null) {
  return value === null ? '--' : `${value.toFixed(2)} °C`
}

// Gráfica SVG basada en las fechas y temperaturas reales
function HistoryChart({
  records
}: {
  records: Measurement[]
}) {
  const valid = records.filter(
    item =>
      item.sensor_ok &&
      item.temperature !== null &&
      Number.isFinite(item.temperature) &&
      Number.isFinite(Date.parse(item.timestamp))
  )

  if (valid.length === 0) {
    return (
      <div className="history-empty">
        No hay mediciones válidas para graficar.
      </div>
    )
  }

  const width = 800
  const height = 270
  const margin = { left: 50, right: 18, top: 20, bottom: 35 }

  const temperatures = valid.map(item => item.temperature!)
  const setpoints = valid
    .filter(item => item.setpoint !== null)
    .map(item => item.setpoint!)

  const allValues = [...temperatures, ...setpoints]

  const minTemp = Math.floor((Math.min(...allValues) - 3) / 5) * 5
  const maxTemp = Math.ceil((Math.max(...allValues) + 3) / 5) * 5

  const minTime = Date.parse(valid[0].timestamp)
  const maxTime = Date.parse(valid[valid.length - 1].timestamp)

  const plotWidth = width - margin.left - margin.right
  const plotHeight = height - margin.top - margin.bottom

  const x = (time: number) =>
    margin.left +
    (maxTime === minTime
      ? 0.5
      : (time - minTime) / (maxTime - minTime)) *
    plotWidth

  const y = (temperature: number) =>
    margin.top +
    (maxTemp - temperature) / (maxTemp - minTemp) *
    plotHeight

  const points = valid.map(item => ({
    x: x(Date.parse(item.timestamp)),
    y: y(item.temperature!)
  }))

  const path = points.map(
    (point, i) =>
      `${i === 0 ? 'M' : 'L'} ${point.x} ${point.y}`
  ).join(' ')

  const ticks = Array.from(
    { length: 5 },
    (_, i) => minTemp + (maxTemp - minTemp) * i / 4
  )

  // Dibujar la referencia cuando existe setpoint real
  const reference = valid.find(
    item => item.setpoint !== null
  )?.setpoint

  return (
    <div className="history-chart-container">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="history-chart-svg"
        role="img"
        aria-label="Gráfica histórica de temperatura"
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
              x={margin.left - 10}
              y={y(tick) + 4}
              textAnchor="end"
              fill="#94A3B8"
              fontSize="12"
            >
              {tick.toFixed(0)}°
            </text>
          </g>
        ))}

        {reference !== undefined && reference !== null && (
          <line
            x1={margin.left}
            y1={y(reference)}
            x2={width - margin.right}
            y2={y(reference)}
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
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r="5"
          fill="#FB923C"
          stroke="white"
          strokeWidth="1.5"
        />

        <text
          x={margin.left}
          y={height - 8}
          fill="#94A3B8"
          fontSize="11"
        >
          {formatDate(valid[0].timestamp)}
        </text>

        <text
          x={width - margin.right}
          y={height - 8}
          textAnchor="end"
          fill="#94A3B8"
          fontSize="11"
        >
          {formatDate(valid[valid.length - 1].timestamp)}
        </text>
      </svg>
    </div>
  )
}

export default function HistoryPage() {
  const [records, setRecords] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [limit, setLimit] = useState(300)

  const [search, setSearch] = useState('')
  const [sensorFilter, setSensorFilter] = useState('all')

  // Convertir las fechas de Windows al formato UTC usado en SQLite
  function buildParams(exportMode = false) {
    const params = new URLSearchParams()

    params.set('limit', String(exportMode ? 100000 : limit))

    if (startDate) {
      params.set('start', new Date(startDate).toISOString())
    }

    if (endDate) {
      params.set('end', new Date(endDate).toISOString())
    }

    return params
  }

  async function loadHistory() {
    setLoading(true)
    setError(null)

    try {
      const params = buildParams()
      const response = await fetch(
        `${API_URL}/api/history?${params.toString()}`
      )

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status}`)
      }

      const data = await response.json()
      setRecords(data.measurements)

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No se pudo cargar el historial'
      )
    } finally {
      setLoading(false)
    }
  }

  // Obtener registros al abrir la página
  useEffect(() => {
    let active = true

    async function initialLoad() {
      try {
        const response = await fetch(
          `${API_URL}/api/history?limit=300`
        )

        if (!response.ok) {
          throw new Error(`Error HTTP ${response.status}`)
        }

        const data = await response.json()

        if (active) {
          setRecords(data.measurements)
        }
      } catch {
        if (active) {
          setError('No se pudo conectar con FastAPI.')
        }
      }
    }

    initialLoad()

    return () => {
      active = false
    }
  }, [])

  // Filtros de tabla sobre los registros cargados
  const filteredRecords = records.filter(item => {
    const matchesSensor =
      sensorFilter === 'all' ||
      (sensorFilter === 'valid' && item.sensor_ok) ||
      (sensorFilter === 'invalid' && !item.sensor_ok)

    const text =
      `${item.timestamp} ${item.temperature ?? ''}`

    return matchesSensor &&
      text.toLowerCase().includes(search.toLowerCase())
  })

  const validTemperatures = filteredRecords
    .filter(item =>
      item.sensor_ok &&
      item.temperature !== null &&
      Number.isFinite(item.temperature)
    )
    .map(item => item.temperature as number)

  const average = validTemperatures.length
    ? validTemperatures.reduce((a, b) => a + b, 0) /
      validTemperatures.length
    : null

  const maximum = validTemperatures.length
    ? Math.max(...validTemperatures)
    : null

  const minimum = validTemperatures.length
    ? Math.min(...validTemperatures)
    : null

  function downloadCSV() {
    const params = buildParams(true)
    window.location.assign(
      `${API_URL}/api/export?${params.toString()}`
    )
  }

  return (
    <div className="history-page">
      <div className="history-page-header">
        <div>
          <div className="eyebrow">ANÁLISIS DE DATOS</div>
          <h1>Historial térmico</h1>
          <p>
            Consulta y analiza las mediciones registradas
            por POWERGuard.
          </p>
        </div>

        <button
          className="history-button primary"
          onClick={downloadCSV}
          type="button"
        >
          <Download size={17} />
          Exportar CSV
        </button>
      </div>

      <section className="history-filters">
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
              onChange={e => setStartDate(e.target.value)}
            />
          </label>

          <label>
            Hasta
            <input
              type="datetime-local"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
            />
          </label>

          <label>
            Cantidad máxima
            <select
              value={limit}
              onChange={e => setLimit(Number(e.target.value))}
            >
              <option value={100}>100 registros</option>
              <option value={300}>300 registros</option>
              <option value={1000}>1,000 registros</option>
              <option value={5000}>5,000 registros</option>
              <option value={10000}>10,000 registros</option>
            </select>
          </label>

          <button
            type="button"
            className="history-button primary"
            onClick={loadHistory}
            disabled={loading ||
              Boolean(startDate && endDate &&
                new Date(startDate) > new Date(endDate))}
          >
            <RefreshCw size={16} />
            {loading ? 'Cargando...' : 'Consultar'}
          </button>
        </div>
      </section>

      {error && (
        <div className="history-error">
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      <section className="history-stats">
        <div className="history-stat">
          <Thermometer size={19} />
          <small>TEMPERATURA PROMEDIO</small>
          <strong>{formatTemperature(average)}</strong>
        </div>

        <div className="history-stat">
          <Activity size={19} />
          <small>TEMPERATURA MÁXIMA</small>
          <strong>{formatTemperature(maximum)}</strong>
        </div>

        <div className="history-stat">
          <Thermometer size={19} />
          <small>TEMPERATURA MÍNIMA</small>
          <strong>{formatTemperature(minimum)}</strong>
        </div>

        <div className="history-stat">
          <Database size={19} />
          <small>REGISTROS MOSTRADOS</small>
          <strong>{filteredRecords.length}</strong>
        </div>
      </section>

      <section className="history-panel">
        <div className="history-panel-heading">
          <div>
            <h2>Evolución de temperatura</h2>
            <p>Registros de medición ordenados cronológicamente</p>
          </div>
          <span className="history-legend">
            <i /> Temperatura real
          </span>
        </div>

        <HistoryChart records={filteredRecords} />
      </section>

      <section className="history-panel">
        <div className="history-panel-heading">
          <div>
            <h2>Registro de mediciones</h2>
            <p>Datos recibidos y guardados por FastAPI</p>
          </div>
        </div>

        <div className="history-table-controls">
          <div className="history-search">
            <Search size={17} />
            <input
              type="search"
              placeholder="Buscar fecha o temperatura..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <select
            value={sensorFilter}
            onChange={e => setSensorFilter(e.target.value)}
          >
            <option value="all">Todos los registros</option>
            <option value="valid">Lecturas válidas</option>
            <option value="invalid">Fallos del sensor</option>
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
                <th>Calefactor</th>
                <th>Sensor</th>
              </tr>
            </thead>
            <tbody>
              {[...filteredRecords].reverse().map(item => (
                <tr key={item.id}>
                  <td>#{item.id}</td>
                  <td>{formatDate(item.timestamp)}</td>
                  <td>{formatTemperature(item.temperature)}</td>
                  <td>{formatTemperature(item.setpoint)}</td>
                  <td>
                    {item.heater_on === null
                      ? 'No disponible'
                      : item.heater_on ? 'Encendido' : 'Apagado'}
                  </td>
                  <td>
                    <span className={
                      item.sensor_ok
                        ? 'sensor-valid'
                        : 'sensor-invalid'
                    }>
                      {item.sensor_ok ? 'Válido' : 'Error'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredRecords.length === 0 && (
            <div className="history-empty">
              No se encontraron registros.
            </div>
          )}
        </div>
      </section>

      <div className="history-footer">
        Los cálculos se realizan sobre los registros mostrados.
        Los datos se actualizan al pulsar Consultar.
      </div>
    </div>
  )
}
