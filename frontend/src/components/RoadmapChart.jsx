import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from 'recharts'
import { api } from '../api'
import DisplayText from './DisplayText'
import { useDisplayText } from '../hooks/useDisplayText'

const DAYS_BEFORE = 10
const DAYS_AFTER = 20
const TERMINUS_STAGES = new Set(['OFFER', 'REJECTED', 'NO_FEEDBACK'])

function getStageColor(stageType) {
  if (stageType === 'OFFER') return '#198754'
  if (stageType === 'REJECTED') return '#dc3545'
  if (stageType === 'NO_FEEDBACK') return '#6c757d'
  if (stageType === 'APPLIED') return '#dee2e6'
  if (stageType === 'RECRUITER_CALL') return '#fff3cd'
  if (/^STAGE_\d+$/.test(stageType)) {
    const num = parseInt(stageType.replace('STAGE_', ''), 10)
    const idx = Math.min(num - 1, 4)
    const blues = ['#e7f1ff', '#b8d4ff', '#7ab8ff', '#3d8bfd', '#0d6efd']
    return blues[idx]
  }
  return '#6c757d'
}

function formatXAxis(ms) {
  const d = new Date(ms)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function RoadmapChartInner({ timeline }) {
  const navigate = useNavigate()
  const { chartData, segments, domain, domainMin, todayMs } = useMemo(() => {
    const now = new Date()
    const todayAbsMs = now.getTime()

    let domainMin = Number.POSITIVE_INFINITY
    let domainMax = Number.NEGATIVE_INFINITY
    const segList = []

    const maxStages = Math.max(...timeline.map((a) => (a.stages || []).length), 1)
    const data = timeline.map((app, appIdx) => {
      const stages = app.stages || []
      const displayName = `${app.company} — ${app.role}`
      const row = {
        name: displayName,
        yAxisKey: `${app.app_uuid}`, // unique key so Recharts renders each label (avoids deduplication)
        app_uuid: app.app_uuid,
        appIdx,
      }
      let firstStart = null
      for (let j = 0; j < maxStages; j++) {
        const key = `seg${j}`
        if (j >= stages.length) {
          row[key] = 0
          continue
        }
        const stage = stages[j]
        const startMs = new Date(stage.start).getTime()
        const nextStage = stages[j + 1]
        const isLast = !nextStage
        const isTerminus = TERMINUS_STAGES.has(stage.stage_type)
        let endMs
        if (nextStage) {
          endMs = new Date(nextStage.start).getTime()
        } else if (isLast && isTerminus) {
          endMs = startMs
        } else if (isLast && startMs > todayAbsMs) {
          endMs = startMs + 86400000
        } else {
          endMs = todayAbsMs
        }
        domainMin = Math.min(domainMin, startMs)
        domainMax = Math.max(domainMax, endMs)
        const duration = Math.max(endMs - startMs, 0)
        if (firstStart === null) firstStart = startMs
        row[key] = duration
        row[`_color_${key}`] = getStageColor(stage.stage_type)
        row[`_start_${key}`] = startMs
        row[`_label_${key}`] = stage.stage_label
        if (!segList[j]) segList[j] = { key }
      }
      row._firstStart = firstStart
      return row
    })

    // Fallback when no valid stages
    if (!isFinite(domainMin) || !isFinite(domainMax)) {
      const padMs = 86400000 * DAYS_BEFORE
      domainMin = todayAbsMs - padMs
      domainMax = todayAbsMs + 86400000 * DAYS_AFTER
    }

    const pad = (domainMax - domainMin) * 0.02 || 86400000
    const span = domainMax - domainMin + pad

    // Compute offsets now that domainMin is known
    const chartData = data.map((row) => {
      const firstStart = row._firstStart ?? domainMin
      return {
        ...row,
        offset: firstStart - domainMin,
      }
    })

    return {
      chartData,
      segments: segList,
      domain: [0, span],
      domainMin,
      todayMs: todayAbsMs - domainMin,
    }
  }, [timeline])

  const CustomTooltip = ({ active, payload, coordinate, plotWidth, domainMax, plotLeft }) => {
    if (!active || !payload?.length) return null
    const row = payload[0]?.payload
    if (!row?.name) return null
    let activeSeg = null
    const pixelX = coordinate?.x
    if (pixelX != null && plotWidth > 0 && domainMax > 0) {
      const dataX = ((pixelX - plotLeft) / plotWidth) * domainMax
      let cumulative = row.offset ?? 0
      for (const p of payload) {
        if (p.dataKey === 'offset') continue
        const segEnd = cumulative + (p.value || 0)
        if (dataX >= cumulative && dataX <= segEnd && (p.value || 0) > 0) {
          activeSeg = p
          break
        }
        cumulative = segEnd
      }
    }
    if (!activeSeg) {
      activeSeg = payload.find((p) => p.dataKey !== 'offset' && p.value > 0)
    }
    const label = activeSeg ? row[`_label_${activeSeg.dataKey}`] : null
    const start = activeSeg ? row[`_start_${activeSeg.dataKey}`] : null
    const end = start && activeSeg ? start + activeSeg.value : null
    return (
      <div className="bg-body border shadow-sm rounded px-2 py-1 small">
        <div className="text-muted mb-1">
          <DisplayText>{row.name}</DisplayText>
        </div>
        {label && (
          <strong>
            <DisplayText>{label}</DisplayText>
          </strong>
        )}
        {start && (
          <div className="text-muted">
            {formatXAxis(start)}
            {end && end !== start && ` — ${formatXAxis(end)}`}
          </div>
        )}
      </div>
    )
  }

  const CustomYAxisTick = ({ x, y, payload, chartData: cd }) => {
    const row = (cd || chartData)[payload?.index ?? 0]
    const rawLabel = row?.name ?? payload?.value ?? ''
    const displayStr = useDisplayText(rawLabel)
    const displayLabel = splitByChar(displayStr, '—')
    const handleClick = () => row && navigate(`/applications/${row.app_uuid}`)

    return (
      <g transform={`translate(${x},${y})`} style={{ cursor: row ? 'pointer' : 'default' }} onClick={handleClick}>
        <text x={0} y={0} dy={4} textAnchor="end" fill={row ? 'var(--bs-link-color)' : 'currentColor'} fontSize={12}>
          {displayLabel.map((item, i) => (
            <tspan key={i} x="0" dy={i === 0 ? 0 : '1.2em'}>
              {item}
            </tspan>
          ))}
        </text>
      </g>
    )
  }

  const containerRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width ?? 0
      setChartWidth(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const margin = { top: 8, right: 24, left: 8, bottom: 8 }
  const yAxisWidth = 200
  const plotLeft = margin.left + yAxisWidth
  const plotWidth = chartWidth > 0 ? chartWidth - plotLeft - margin.right : 0

  return (
    <div ref={containerRef} style={{ width: '100%', height: Math.max(120, timeline.length * 44) }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          layout="vertical"
          margin={margin}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="var(--bs-border-color)" />
          <XAxis
            type="number"
            domain={domain}
            tickFormatter={(v) => formatXAxis(v + domainMin)}
            tick={{ fontSize: 11 }}
            tickCount={8}
          />
          <YAxis
            type="category"
            dataKey="yAxisKey"
            width={200}
            interval={0}
            tick={(props) => <CustomYAxisTick {...props} chartData={chartData} />}
          />
          <Tooltip
            content={(props) => (
              <CustomTooltip
                {...props}
                plotWidth={plotWidth}
                domainMax={domain[1]}
                plotLeft={plotLeft}
              />
            )}
          />
          {todayMs >= 0 && todayMs <= domain[1] && (
            <ReferenceLine x={todayMs} stroke="var(--bs-primary)" strokeDasharray="4 2" strokeOpacity={0.7} />
          )}
          <Bar dataKey="offset" stackId="a" fill="transparent" barSize={28} />
          {segments.map((seg) => (
            <Bar key={seg.key} dataKey={seg.key} stackId="a" barSize={28}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry[`_color_${seg.key}`] || 'transparent'} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

export function parseString(value, length) {
  let str = value
  const arr = [] 
  while (str.length > 0) {
    const tmpStr = str.slice(0, length)
    const sliced = str.slice(length)
    arr.push(tmpStr)
    if (sliced.length < length) {
      arr.push(sliced)
      str = ""
    } else {
      str = sliced
    }
  }
  return arr.filter(Boolean)
}

export function splitByChar(value, separator) {
  if (typeof value !== "string") return []
  return value
    .split(separator)
    .map(part => part.trim())
    .filter(Boolean)
}

export default function RoadmapChart() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.analytics
      .getRoadmap()
      .then((d) => setData(d))
      .catch(() => setData({ timeline: [] }))
      .finally(() => setLoading(false))
  }, [])

  const timeline = data?.timeline ?? []

  if (loading) return <div className="text-muted small">Loading roadmap…</div>
  if (timeline.length === 0) return <p className="text-muted small mb-0">No active applications to display.</p>

  return <RoadmapChartInner timeline={timeline} />
}
