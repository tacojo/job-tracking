import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import ApplicationCreateForm from '../components/ApplicationCreateForm'
import DisplayText from '../components/DisplayText'
import ErrorBoundary from '../components/ErrorBoundary'
import PageMessage from '../components/PageMessage'
import RoadmapChart from '../components/RoadmapChart'
import { CalendarLinkButton, PageHeader, SectionCard, SortIndicator } from '../components/ui'
import { STAGE_TYPES, STAGE_LABELS, ACTIVITY_LABELS, INACTIVE_STAGES } from '../constants/stages'

const TABLE_PAGE_SIZE = 10
const STAGE_FILTER_MODES = {
  latest: 'latest',
  ever: 'ever',
}

export default function ApplicationsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const showAddForm = searchParams.get('add') === '1'
  const setShowAddForm = (show) => {
    if (show) {
      setSearchParams({ add: '1' })
    } else {
      setSearchParams({})
    }
  }

  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filters, setFilters] = useState({
    company: '',
    role: '',
    recruiter: '',
    stage: '',
    stageMode: STAGE_FILTER_MODES.latest,
  })
  const [sortField, setSortField] = useState('latest_stage_at')
  const [sortAsc, setSortAsc] = useState(false)
  const [tablePage, setTablePage] = useState(1)
  const [showInactive, setShowInactive] = useState(false)

  const load = async (filterOverride) => {
    const f = filterOverride !== undefined ? filterOverride : filters
    setLoading(true)
    setError(null)
    setTablePage(1)
    try {
      const activeFilters = {}
      if (f.company) activeFilters.company = f.company
      if (f.role) activeFilters.role = f.role
      if (f.recruiter) activeFilters.recruiter = f.recruiter
      if (f.stage) activeFilters.stage = f.stage
      if (f.stage) activeFilters.stage_mode = f.stageMode
      const data = await api.applications.list(activeFilters)
      setApplications(data)
    } catch (e) {
      setError(e.message || 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, []) // Initial load only; Apply button triggers filter

  const handleCreate = async (data) => {
    const created = await api.applications.create(data)
    setShowAddForm(false)
    load()
    navigate(`/applications/${created.uuid}`)
  }

  const handleSort = (field) => {
    setSortField(field)
    setSortAsc((prev) => (sortField === field ? !prev : true))
    setTablePage(1)
  }

  const isActiveApplication = (app) => {
    return !app.latest_stage_type || !INACTIVE_STAGES.includes(app.latest_stage_type)
  }

  const filteredApps = showInactive ? applications : applications.filter(isActiveApplication)

  const sortedApps = [...filteredApps].sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]
    if (sortField === 'latest_stage_type') {
      aVal = a.latest_stage_type || ''
      bVal = b.latest_stage_type || ''
    }
    if (sortField === 'updated_at' || sortField === 'latest_stage_at') {
      aVal = aVal ? new Date(aVal).getTime() : 0
      bVal = bVal ? new Date(bVal).getTime() : 0
    }
    if (sortField === 'recruiter') {
      aVal = aVal || ''
      bVal = bVal || ''
    }
    if (aVal < bVal) return sortAsc ? -1 : 1
    if (aVal > bVal) return sortAsc ? 1 : -1
    return 0
  })

  const totalTablePages = Math.max(1, Math.ceil(sortedApps.length / TABLE_PAGE_SIZE))
  const paginatedApps = sortedApps.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE
  )
  const hasPrevPage = tablePage > 1
  const hasNextPage = tablePage < totalTablePages

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
  const formatDateAndTime = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
    const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!hasTime) return dateStr
    const timeStr = dt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${dateStr}, ${timeStr}`
  }

  const getDetailPath = (app) => `/applications/${app.uuid}`

  const isFutureLatestStage = (app) => {
    if (!app.latest_stage_at) return false
    return new Date(app.latest_stage_at).getTime() > Date.now()
  }

  const ApplicationsTableRow = ({ app }) => {
    const isActive = isActiveApplication(app)
    const isFuture = isFutureLatestStage(app)
    const rowClasses = [
      isActive ? 'table-success' : '',
      isFuture ? 'fw-bold' : ''
    ].filter(Boolean).join(' ')
    
    const companyLinkClasses = isFuture 
      ? 'text-decoration-none fw-bold' 
      : 'text-decoration-none fw-medium'
    
    return (
      <tr className={rowClasses || undefined}>
        <td>
          <Link to={getDetailPath(app)} className={companyLinkClasses}>
            <DisplayText>{app.company}</DisplayText>
          </Link>
        </td>
        <td>
          <Link to={getDetailPath(app)} className="text-decoration-none">
            <DisplayText>{app.role}</DisplayText>
          </Link>
        </td>
        <td>{app.recruiter ? <DisplayText>{app.recruiter}</DisplayText> : '—'}</td>
        <td>
            {app.latest_stage_type ? (
              <span title={app.latest_stage_at ? formatDateAndTime(app.latest_stage_at) : ''}>
                {STAGE_LABELS[app.latest_stage_type] || app.latest_stage_type}
                {app.latest_stage_activity_type &&
                  /^STAGE_\d+$/.test(app.latest_stage_type) && (
                    <span className="text-muted">
                      {' — '}
                      {ACTIVITY_LABELS[app.latest_stage_activity_type] ||
                        app.latest_stage_activity_type}
                    </span>
                  )}
                {app.latest_stage_at && (
                  <span className="text-muted small ms-1">
                    ({formatDateAndTime(app.latest_stage_at)})
                  </span>
                )}
              </span>
            ) : (
              '—'
            )}
        </td>
        <td>{formatDate(app.updated_at)}</td>
      </tr>
    )
  }

  if (loading && applications.length === 0) return <PageMessage variant="loading">Loading…</PageMessage>
  if (error) return <PageMessage variant="danger" title="Error">{error}</PageMessage>

  return (
    <div>
      <PageHeader
        title={showAddForm ? 'Add Application' : 'Applications'}
        actions={
          showAddForm ? (
            <button className="btn btn-outline-secondary" onClick={() => setShowAddForm(false)} type="button">
              Cancel
            </button>
          ) : (
            <>
              <CalendarLinkButton />
              <button
                type="button"
                className="btn btn-forest"
                onClick={() => setShowAddForm(true)}
              >
                Add Application
              </button>
            </>
          )
        }
      />

      {showAddForm ? (
        <SectionCard title="New application">
          <ApplicationCreateForm onSave={handleCreate} onCancel={() => setShowAddForm(false)} />
        </SectionCard>
      ) : (
        <>
      <SectionCard
        title={
          <>
            <span className="me-2">Roadmap (Gantt)</span>
            <span className="text-body-secondary small fw-normal">Active applications — stages over time</span>
          </>
        }
      >
        <ErrorBoundary>
          <RoadmapChart />
        </ErrorBoundary>
      </SectionCard>
      <SectionCard
        title="Filter"
        headerAside={
          <div className="d-flex align-items-center flex-wrap gap-3">
            <div className="d-flex align-items-center gap-2">
              <span className="small text-body-secondary">Is latest status?</span>
              <div className="form-check form-check-inline mb-0">
                <input
                  className="form-check-input"
                  type="radio"
                  name="stageFilterMode"
                  id="stageFilterLatestYes"
                  checked={filters.stageMode === STAGE_FILTER_MODES.latest}
                  onChange={() => setFilters((f) => ({ ...f, stageMode: STAGE_FILTER_MODES.latest }))}
                />
                <label className="form-check-label small" htmlFor="stageFilterLatestYes">Yes</label>
              </div>
              <div className="form-check form-check-inline mb-0">
                <input
                  className="form-check-input"
                  type="radio"
                  name="stageFilterMode"
                  id="stageFilterLatestNo"
                  checked={filters.stageMode === STAGE_FILTER_MODES.ever}
                  onChange={() => setFilters((f) => ({ ...f, stageMode: STAGE_FILTER_MODES.ever }))}
                />
                <label className="form-check-label small" htmlFor="stageFilterLatestNo">No</label>
              </div>
            </div>
            <div className="d-flex align-items-center gap-2">
              <span className="small text-body-secondary">Include inactive:</span>
              <div className="form-check form-switch mb-0">
                <input
                  className="form-check-input"
                  type="checkbox"
                  id="showInactiveToggle"
                  checked={showInactive}
                  onChange={(e) => {
                    setShowInactive(e.target.checked)
                    setTablePage(1)
                  }}
                />
                <label className="form-check-label small" htmlFor="showInactiveToggle">
                  {showInactive ? 'Yes' : 'No'}
                </label>
              </div>
            </div>
          </div>
        }
      >
          <div className="row g-2 align-items-end">
            <div className="col-6 col-md-3">
              <label className="form-label small mb-0">Company</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g. Acme"
                value={filters.company}
                onChange={(e) => setFilters((f) => ({ ...f, company: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-0">Role</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g. Engineer"
                value={filters.role}
                onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-0">Recruiter</label>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="e.g. Jane"
                value={filters.recruiter}
                onChange={(e) => setFilters((f) => ({ ...f, recruiter: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-0">
                {filters.stageMode === STAGE_FILTER_MODES.ever ? 'Ever in stage' : 'Latest Stage'}
              </label>
              <select
                className="form-select form-select-sm"
                value={filters.stage}
                onChange={(e) => {
                  const next = { ...filters, stage: e.target.value }
                  setFilters(next)
                  load(next)
                }}
              >
                {STAGE_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-1">
              <button className="btn btn-forest btn-sm w-100" onClick={load}>
                Apply
              </button>
            </div>
          </div>
          {(filters.company || filters.role || filters.recruiter || filters.stage) && (
            <button
              className="btn btn-link btn-sm mt-2 p-0 text-muted"
              onClick={() => {
                const resetFilters = {
                  company: '',
                  role: '',
                  recruiter: '',
                  stage: '',
                  stageMode: STAGE_FILTER_MODES.latest,
                }
                setFilters(resetFilters)
                load(resetFilters)
              }}
            >
              Clear filters
            </button>
          )}
      </SectionCard>

      <SectionCard title="Applications" bodyClassName="p-0">
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0">
          <thead>
            <tr>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('company')}
                className="user-select-none"
              >
                Company <SortIndicator active={sortField === 'company'} ascending={sortAsc} />
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('role')}
                className="user-select-none"
              >
                Role <SortIndicator active={sortField === 'role'} ascending={sortAsc} />
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('recruiter')}
                className="user-select-none"
              >
                Recruiter <SortIndicator active={sortField === 'recruiter'} ascending={sortAsc} />
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('latest_stage_at')}
                className="user-select-none"
              >
                Latest <SortIndicator active={sortField === 'latest_stage_at'} ascending={sortAsc} />
              </th>
              <th
                style={{ cursor: 'pointer' }}
                onClick={() => handleSort('updated_at')}
                className="user-select-none"
              >
                Updated <SortIndicator active={sortField === 'updated_at'} ascending={sortAsc} />
              </th>
            </tr>
          </thead>
          <tbody>
            {paginatedApps.map((app) => (
              <ApplicationsTableRow key={app.id} app={app} />
            ))}
          </tbody>
        </table>
      </div>

      {filteredApps.length > 0 && (
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 px-3 py-2 border-top">
          <p className="text-body-secondary small mb-0">
            {filteredApps.length} application{filteredApps.length === 1 ? '' : 's'}
            {!showInactive && applications.length > filteredApps.length && 
              ` (${applications.length - filteredApps.length} inactive hidden)`}
            {filteredApps.length > TABLE_PAGE_SIZE && ` · page ${tablePage} of ${totalTablePages}`}
          </p>
          {totalTablePages > 1 && (
            <div className="btn-group btn-group-sm">
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={!hasPrevPage}
                onClick={() => setTablePage((p) => p - 1)}
              >
                Previous
              </button>
              <button
                type="button"
                className="btn btn-outline-secondary"
                disabled={!hasNextPage}
                onClick={() => setTablePage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      {filteredApps.length === 0 && applications.length === 0 && (
        <p className="text-body-secondary mb-0 px-3 py-4">No applications yet. Add one to get started.</p>
      )}
      
      {filteredApps.length === 0 && applications.length > 0 && (
        <p className="text-body-secondary mb-0 px-3 py-4 border-top">
          No active applications. Toggle &quot;Include inactive&quot; to see rejected/no feedback applications.
        </p>
      )}
      </SectionCard>
        </>
      )}
    </div>
  )
}
