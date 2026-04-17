import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Sankey,
  Layer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { api } from '../api'
import DisplayText from '../components/DisplayText'
import PageMessage from '../components/PageMessage'

const STAGE_LABELS = {
  APPLIED: 'Applied',
  RECRUITER_CALL: 'Recruiter Call',
  ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`STAGE_${i + 1}`, `Stage ${i + 1}`])),
  OFFER: 'Offer',
  REJECTED: 'Rejected',
  NO_FEEDBACK: 'No Feedback',
}

const STAGE_ORDER = ['APPLIED', 'RECRUITER_CALL', ...Array.from({ length: 5 }, (_, i) => `STAGE_${i + 1}`), 'OFFER', 'REJECTED', 'NO_FEEDBACK']
const TERMINUS_STAGES = new Set(['OFFER', 'REJECTED', 'NO_FEEDBACK'])

const DAY_MS = 24 * 60 * 60 * 1000

function toDayIndex(ms) {
  return Math.floor(ms / DAY_MS)
}

function buildLengthPivot(timeline) {
  const columnsSet = new Set()
  const todayDay = toDayIndex(Date.now())
  const rows = (timeline || []).map((app) => {
    const daysByStage = {}
    let total = 0
    const stages = app.stages || []
    const dateForUrl = app.app_updated_at || (stages.length ? stages[stages.length - 1]?.end : null)
    for (let j = 0; j < stages.length; j++) {
      const stage = stages[j]
      const startMs = new Date(stage.start).getTime()
      const startDay = toDayIndex(startMs)
      const isLastStage = !stages[j + 1]
      const isTerminus = TERMINUS_STAGES.has(stage.stage_type)
      const endDay = stages[j + 1]
        ? toDayIndex(new Date(stages[j + 1].start).getTime())
        : isLastStage && isTerminus
          ? startDay
          : todayDay
      const days = Math.max(endDay - startDay, 1)
      daysByStage[stage.stage_type] = (daysByStage[stage.stage_type] || 0) + days
      total += days
      columnsSet.add(stage.stage_type)
    }
    return {
      key: app.app_id ?? `${app.company}-${app.role}-${dateForUrl}`,
      company: app.company,
      role: app.role,
      app_updated_at: dateForUrl,
      app_uuid: app.app_uuid,
      daysByStage,
      total,
    }
  })
  const columns = STAGE_ORDER.filter((c) => columnsSet.has(c))
  return { rows: rows.sort((a, b) => b.total - a.total), columns }
}

function SankeyNode({ x, y, width, height, payload }) {
  const fill = payload?.color || '#228b22'
  const name = payload?.name || ''
  const textX = x + width + 8
  const textY = y + height / 2
  return (
    <Layer>
      <rect x={x} y={y} width={width} height={height} fill={fill} stroke="#111827" strokeWidth={0.5} rx={2} />
      <text x={textX} y={textY} dy={4} fontSize={12} fill="#111827">
        {name}
      </text>
    </Layer>
  )
}

export default function AnalyticsPage() {
  const [filters, setFilters] = useState({
    date_from: '',
    date_to: '',
    group_by: 'day',
  })

  const filterParams = {
    ...(filters.date_from ? { date_from: filters.date_from } : {}),
    ...(filters.date_to ? { date_to: filters.date_to } : {}),
    ...(filters.group_by ? { group_by: filters.group_by } : {}),
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics', filterParams],
    queryFn: () => api.analytics.get(filterParams),
  })

  const updateFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
  }

  if (isLoading) return <PageMessage variant="loading">Loading analytics…</PageMessage>
  if (error) return <PageMessage variant="danger" title="Error">{error.message || 'Failed to load analytics'}</PageMessage>
  if (!data) return null

  const {
    total_applications,
    active_by_stage,
    by_role,
    timeline,
    applications_over_time,
    pipeline_sankey,
    conversion_rate,
    rejection_rate,
    offers,
    rejected,
    no_feedback,
  } = data

  const lengthPivot = buildLengthPivot(timeline)
  return (
    <div>
      <h1 className="mb-4">Analytics</h1>

      {/* Filters */}
      <div className="card mb-4">
        <div className="card-header">
          <strong>Filters</strong>
        </div>
        <div className="card-body">
          <div className="row g-2">
            <div className="col-md-3">
              <label className="form-label small mb-0">From</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.date_from}
                onChange={(e) => updateFilter('date_from', e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-0">To</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={filters.date_to}
                onChange={(e) => updateFilter('date_to', e.target.value)}
              />
            </div>
            <div className="col-md-3">
              <label className="form-label small mb-0">Group by</label>
              <select
                className="form-select form-select-sm"
                value={filters.group_by}
                onChange={(e) => updateFilter('group_by', e.target.value)}
              >
                <option value="day">Day</option>
                <option value="week">Week</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Applications over time */}
      <div className="row">
        <div className="col-lg-8 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <strong>Applications over time</strong>
            </div>
            <div className="card-body">
              {!applications_over_time?.length ? (
                <p className="text-muted mb-0">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={applications_over_time} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d6efd" stopOpacity={0.8} />
                        <stop offset="95%" stopColor="#0d6efd" stopOpacity={0.1} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="period" />
                    <YAxis />
                    <Tooltip />
                    <Area type="monotone" dataKey="count" stroke="#0d6efd" fillOpacity={1} fill="url(#colorCount)" name="Applications" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-4 mb-4">
          <div className="row g-3">
            <div className="col-6">
              <div className="card h-100">
                <div className="card-body">
                  <p className="text-muted small mb-1">Total applications</p>
                  <p className="h2 mb-0">{total_applications}</p>
                </div>
              </div>
            </div>
            <div className="col-6">
              <div className="card h-100 border-success">
                <div className="card-body">
                  <p className="text-muted small mb-1">Conversion rate</p>
                  <p className="h2 mb-0 text-success">{conversion_rate ?? 0}%</p>
                  <small className="text-muted">{offers ?? 0} offers</small>
                </div>
              </div>
            </div>
            <div className="col-6">
              <div className="card h-100 border-danger">
                <div className="card-body">
                  <p className="text-muted small mb-1">Rejection rate</p>
                  <p className="h2 mb-0 text-danger">{rejection_rate ?? 0}%</p>
                  <small className="text-muted">{rejected ?? 0} rejected</small>
                </div>
              </div>
            </div>
            <div className="col-6">
              <div className="card h-100">
                <div className="card-body">
                  <p className="text-muted small mb-1">No feedback</p>
                  <p className="h2 mb-0">{no_feedback ?? 0}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pipeline Sankey */}
      <div className="row">
        <div className="col-12 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <strong>Pipeline (Sankey)</strong>
              <span className="text-muted small ms-2">All applications (including Offer/Rejected/No feedback)</span>
            </div>
            <div className="card-body">
              {!pipeline_sankey?.nodes?.length || !pipeline_sankey?.links?.length ? (
                <p className="text-muted mb-0">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={420}>
                  <Sankey
                    data={pipeline_sankey}
                    nodePadding={18}
                    margin={{ top: 10, right: 120, left: 10, bottom: 10 }}
                    link={{ stroke: '#9ca3af', strokeOpacity: 0.35 }}
                    node={<SankeyNode />}
                  >
                    <Tooltip />
                  </Sankey>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active by stage (legacy) */}
      <div className="row">
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <strong>Active by stage</strong>
              <span className="text-muted small ms-2">(not Offer/Rejected)</span>
            </div>
            <div className="card-body">
              {Object.keys(active_by_stage || {}).length === 0 ? (
                <p className="text-muted mb-0">No active applications.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={Object.entries(active_by_stage).map(([k, v]) => ({ label: STAGE_LABELS[k] ?? k, count: v }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#228b22" name="Active" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
        <div className="col-lg-6 mb-4">
          <div className="card h-100">
            <div className="card-header">
              <strong>Applications by role (title)</strong>
            </div>
            <div className="card-body">
              {Object.keys(by_role || {}).length === 0 ? (
                <p className="text-muted mb-0">No data.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={Object.entries(by_role).map(([k, v]) => ({ label: k, count: v }))}
                    margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0d6efd" name="Applications" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Application lengths table */}
      <div className="row">
        <div className="col-12 mb-4">
          <div className="card">
            <div className="card-header">
              <strong>Application lengths (days)</strong>
              <span className="text-muted small ms-2">Days in each stage</span>
            </div>
            <div className="card-body p-0">
              {lengthPivot.rows.length === 0 ? (
                <p className="text-muted mb-0 p-3">No data.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm table-hover mb-0">
                    <thead>
                      <tr>
                        <th className="text-nowrap">Application</th>
                        {lengthPivot.columns.map((col) => (
                          <th key={col} className="text-center">
                            {STAGE_LABELS[col] || col}
                          </th>
                        ))}
                        <th className="text-center fw-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lengthPivot.rows.map((row) => (
                        <tr key={row.key}>
                          <td>
                            <Link
                              to={`/applications/${row.app_uuid}`}
                              className="text-decoration-none"
                            >
                              <DisplayText>{row.company}</DisplayText> — <DisplayText>{row.role}</DisplayText>
                            </Link>
                          </td>
                          {lengthPivot.columns.map((col) => (
                            <td key={col} className="text-center">
                              {row.daysByStage[col] ?? '—'}
                            </td>
                          ))}
                          <td className="text-center fw-bold">{row.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
