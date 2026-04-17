import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ApplicationsLookupModal from '../components/ApplicationsLookupModal'
import CompanyPickerModal from '../components/CompanyPickerModal'
import ConfirmModal from '../components/ConfirmModal'
import DisplayText from '../components/DisplayText'
import { useDisplayText } from '../hooks/useDisplayText'
import PageMessage from '../components/PageMessage'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'

const PAGE_SIZE = 10
const SORT_FIELDS = [
  { key: 'name', label: 'Name' },
  { key: 'created_at', label: 'Created' },
]

function formatDateOnly(iso) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return '—'
  }
}

export default function CompaniesPage() {
  const [showPickerModal, setShowPickerModal] = useState(false)
  const [companies, setCompanies] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sortField, setSortField] = useState('name')
  const [sortAsc, setSortAsc] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteBlocked, setDeleteBlocked] = useState(null) // { entity_type, entity_name, message }
  const [showAppsModal, setShowAppsModal] = useState(false)
  const { settings } = useSettings()
  const displayNote = useDisplayText

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.companies.list({
        page,
        page_size: PAGE_SIZE,
        sort: sortField,
        order: sortAsc ? 'asc' : 'desc',
      })
      setCompanies(data.items || [])
      setTotal(data.total ?? 0)
    } catch (e) {
      setError(e.message || 'Failed to load companies')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [page, sortField, sortAsc])

  const handleSort = (field) => {
    if (sortField === field) {
      setSortAsc((a) => !a)
    } else {
      setSortField(field)
      setSortAsc(true)
    }
    setPage(1)
  }
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasPrev = page > 1
  const hasNext = page < totalPages

  const handlePickerSelect = () => {
    setShowPickerModal(false)
    load()
  }

  const handleDeleteClick = (id) => {
    setDeleteId(id)
    setDeleteBlocked(null)
  }
  const handleDeleteConfirm = async () => {
    if (!deleteId) return
    setDeleteBlocked(null)
    try {
      await api.companies.delete(deleteId)
      setDeleteId(null)
      setPage(1)
      load()
    } catch (e) {
      setDeleteId(null)
      const d = e.body?.detail
      if (d && typeof d === 'object' && d.code === 'entity_in_use') {
        setDeleteBlocked({
          entity_type: d.entity_type || 'company',
          entity_name: d.entity_name || '',
          message: d.message || 'Cannot delete. This company is used in applications.',
        })
      } else {
        setError(typeof d === 'string' ? d : (d?.message ?? e.message ?? 'Failed to delete'))
      }
    }
  }

  if (loading && companies.length === 0) return <PageMessage variant="loading">Loading…</PageMessage>
  if (error && companies.length === 0) return <PageMessage variant="danger" title="Error">{error}</PageMessage>

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 className="h4 mb-0">Companies</h1>
        <button className="btn btn-forest" onClick={() => setShowPickerModal(true)}>
          Add Company
        </button>
      </div>

      <>
          {error && <div className="alert alert-danger mb-3">{error}</div>}
          {deleteBlocked && (
            <div className="alert alert-warning mb-3 d-flex justify-content-between align-items-start gap-2">
              <span>{deleteBlocked.message}</span>
              <div className="d-flex gap-1 flex-shrink-0">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  onClick={() => setShowAppsModal(true)}
                >
                  View applications
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => setDeleteBlocked(null)}
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            </div>
          )}
          <div className="table-responsive">
            <table className="table table-sm table-hover">
              <thead>
                <tr>
                  {SORT_FIELDS.map(({ key, label }) => (
                    <th
                      key={key}
                      className={key === 'name' ? '' : key === 'created_at' ? 'text-nowrap' : ''}
                      style={key === 'name' || key === 'created_at' ? { cursor: 'pointer' } : undefined}
                      onClick={key === 'name' || key === 'created_at' ? () => handleSort(key) : undefined}
                    >
                      {label}
                      {(key === 'name' || key === 'created_at') && sortField === key && (
                        <span className="ms-1 opacity-75">{sortAsc ? '↑' : '↓'}</span>
                      )}
                    </th>
                  ))}
                  <th>Link</th>
                  <th>My notes</th>
                  <th className="text-end">Actions</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/companies/${c.id}`} className="text-decoration-none fw-medium">
                        <DisplayText>{c.name}</DisplayText>
                      </Link>
                    </td>
                    <td className="text-nowrap">{formatDateOnly(c.created_at)}</td>
                    <td>
                      {c.link ? (
                        settings.maskSensitive ? (
                          <span className="text-muted text-truncate d-inline-block" style={{ maxWidth: 200 }}>
                            {(() => {
                              const s = maskText(c.link)
                              return s.length > 40 ? s.slice(0, 40) + '…' : s
                            })()}
                          </span>
                        ) : (
                          <a href={c.link} target="_blank" rel="noopener noreferrer" className="text-truncate d-inline-block" style={{ maxWidth: 200 }}>
                            {c.link.length > 40 ? c.link.slice(0, 40) + '…' : c.link}
                          </a>
                        )
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {c.notes_log?.length
                        ? (() => {
                            const latest = [...(c.notes_log || [])].sort(
                              (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
                            )[0]
                            if (!latest) return '—'
                            const masked = displayNote(latest.text || '')
                            return masked.length > 50 ? masked.slice(0, 50) + '…' : masked
                          })()
                        : '—'}
                    </td>
                    <td className="text-end">
                      <Link to={`/companies/${c.id}`} className="btn btn-sm btn-outline-primary me-1">
                        Edit
                      </Link>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteClick(c.id)}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mt-2">
              <p className="text-muted small mb-0">
                {total} compan{total === 1 ? 'y' : 'ies'}
                {total > PAGE_SIZE && ` · page ${page} of ${totalPages}`}
              </p>
              {totalPages > 1 && (
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={!hasPrev}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    disabled={!hasNext}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
          {companies.length === 0 && !loading && (
            <p className="text-muted mb-0">No companies yet. Add one to use in applications.</p>
          )}
      </>
      <CompanyPickerModal
        show={showPickerModal}
        onSelect={handlePickerSelect}
        onCancel={() => setShowPickerModal(false)}
        addOnly
      />
      <ConfirmModal
        show={!!deleteId}
        title="Delete company"
        message="Are you sure you want to delete this company? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
      <ApplicationsLookupModal
        show={showAppsModal}
        onClose={() => setShowAppsModal(false)}
        filterType="company"
        filterValue={deleteBlocked?.entity_name}
        title={`Applications using "${deleteBlocked?.entity_name || ''}"`}
      />
    </div>
  )
}
