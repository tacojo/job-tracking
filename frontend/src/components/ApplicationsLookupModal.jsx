import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import DisplayText from './DisplayText'

/**
 * Modal showing applications filtered by company or recruiter.
 * Used when delete is blocked because entity is in use.
 */
export default function ApplicationsLookupModal({ show, onClose, filterType, filterValue, title }) {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!show || !filterValue) return
    setLoading(true)
    const filters = filterType === 'company' ? { company: filterValue } : { recruiter: filterValue }
    api.applications
      .list(filters)
      .then(setApplications)
      .catch(() => setApplications([]))
      .finally(() => setLoading(false))
  }, [show, filterType, filterValue])

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const filtered = search.trim()
    ? applications.filter(
        (a) =>
          (a.company || '').toLowerCase().includes(search.toLowerCase()) ||
          (a.role || '').toLowerCase().includes(search.toLowerCase()) ||
          (a.recruiter || '').toLowerCase().includes(search.toLowerCase())
      )
    : applications

  if (!show) return null

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered modal-lg">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title || `Applications using this ${filterType}`}</h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <p className="text-muted small mb-3">
              Edit an application to change its {filterType} before deleting.
            </p>
            <input
              type="text"
              className="form-control mb-3"
              placeholder="Search by company, role, or recruiter…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loading ? (
              <div className="text-muted text-center py-4">
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                Loading…
              </div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover table-sm mb-0">
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Role</th>
                      <th>Recruiter</th>
                      <th>Updated</th>
                      <th className="text-end">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((app) => (
                      <tr key={app.id}>
                        <td><DisplayText>{app.company}</DisplayText></td>
                        <td><DisplayText>{app.role}</DisplayText></td>
                        <td>{app.recruiter ? <DisplayText>{app.recruiter}</DisplayText> : '—'}</td>
                        <td>{formatDate(app.updated_at)}</td>
                        <td className="text-end">
                          <Link
                            to={`/applications/${app.uuid}`}
                            className="btn btn-sm btn-outline-primary"
                            onClick={onClose}
                          >
                            Edit
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!loading && filtered.length === 0 && (
              <p className="text-muted text-center py-3 mb-0">No applications found.</p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
