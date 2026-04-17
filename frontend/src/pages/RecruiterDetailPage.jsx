import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { api } from '../api'
import ApplicationsLookupModal from '../components/ApplicationsLookupModal'
import ConfirmModal from '../components/ConfirmModal'
import DisplayText from '../components/DisplayText'
import PageMessage from '../components/PageMessage'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'

function formatNoteDate(ts) {
  if (!ts) return ''
  try {
    const d = new Date(ts)
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return ts
  }
}

export default function RecruiterDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { settings } = useSettings()
  const [recruiter, setRecruiter] = useState(null)
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [latestNote, setLatestNote] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteBlocked, setDeleteBlocked] = useState(null)
  const [showAppsModal, setShowAppsModal] = useState(false)

  const load = async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.recruiters.get(Number(id))
      setRecruiter(data)
      const apps = await api.applications.list({ recruiter: data.name })
      setApplications(apps)
    } catch (e) {
      setError(e.message || 'Failed to load recruiter')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [id])

  const handleAddNote = async (e) => {
    e.preventDefault()
    if (!latestNote.trim()) return
    try {
      const updated = await api.recruiters.addNote(recruiter.id, latestNote.trim())
      setRecruiter(updated)
      setLatestNote('')
    } catch (e) {
      setError(e.message || 'Failed to add note')
    }
  }

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true)
    setDeleteBlocked(null)
  }
  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false)
    setDeleteBlocked(null)
    try {
      await api.recruiters.delete(recruiter.id)
      navigate('/recruiters')
    } catch (e) {
      const d = e.body?.detail
      if (d && typeof d === 'object' && d.code === 'entity_in_use') {
        setDeleteBlocked({
          entity_type: d.entity_type || 'recruiter',
          entity_name: d.entity_name || recruiter.name,
          message: d.message || 'Cannot delete. This recruiter is used in applications.',
        })
      } else {
        setError(typeof d === 'string' ? d : (d?.message ?? e.message ?? 'Failed to delete'))
      }
    }
  }

  if (loading) return <PageMessage variant="loading">Loading…</PageMessage>
  if (error && !recruiter) return <PageMessage variant="danger" title="Error">{error}</PageMessage>
  if (!recruiter) return null

  const notesLog = recruiter.notes_log || []
  const sortedNotes = [...notesLog].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const STAGE_LABELS = {
    APPLIED: 'Applied',
    RECRUITER_CALL: 'Recruiter call',
    ...Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`STAGE_${i + 1}`, `Stage ${i + 1}`])),
    OFFER: 'Offer',
    REJECTED: 'Rejected',
    NO_FEEDBACK: 'No feedback',
  }
  const sortedApplications = [...applications].sort((a, b) => {
    const aDate = a.latest_stage_at ? new Date(a.latest_stage_at) : new Date(a.updated_at || 0)
    const bDate = b.latest_stage_at ? new Date(b.latest_stage_at) : new Date(b.updated_at || 0)
    return bDate - aDate
  })

  return (
    <div>
      <nav aria-label="breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <Link to="/recruiters">Recruiters</Link>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            <DisplayText>{recruiter.name}</DisplayText>
          </li>
        </ol>
      </nav>

      <div className="d-flex justify-content-between align-items-start mb-4">
        <div>
          <h1><DisplayText>{recruiter.name}</DisplayText></h1>
          {recruiter.link &&
            (settings.maskSensitive ? (
              <div className="text-break text-muted">{maskText(recruiter.link)}</div>
            ) : (
              <a href={recruiter.link} target="_blank" rel="noopener noreferrer" className="text-break">
                {recruiter.link}
              </a>
            ))}
        </div>
        <button className="btn btn-outline-danger" onClick={handleDeleteClick}>
          Delete
        </button>
      </div>

      {deleteBlocked && (
        <div className="alert alert-warning mb-4 d-flex justify-content-between align-items-start gap-2">
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
      <div className="card mb-4">
        <div className="card-body">
          <h6 className="card-title">Latest note</h6>
          <form onSubmit={handleAddNote} className="mb-3">
            <div className="input-group">
              <input
                type="text"
                className="form-control"
                placeholder="Add a new note…"
                value={latestNote}
                onChange={(e) => setLatestNote(e.target.value)}
              />
              <button type="submit" className="btn btn-forest" disabled={!latestNote.trim()}>
                Add
              </button>
            </div>
          </form>
          <h6 className="card-title mt-3">My notes</h6>
          {sortedNotes.length === 0 ? (
            <p className="text-muted mb-0">No notes yet.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {sortedNotes.map((entry, i) => (
                <li key={i} className="mb-2 pb-2 border-bottom">
                  <span className="text-muted small">{formatNoteDate(entry.timestamp)}</span>
                  <p className="mb-0">
                    <DisplayText>{entry.text}</DisplayText>
                  </p>
                </li>
              ))}
            </ul>
          )}
          <h6 className="card-title mt-3">Applications</h6>
          {sortedApplications.length === 0 ? (
            <p className="text-muted mb-0">No applications for this recruiter.</p>
          ) : (
            <ul className="list-unstyled mb-0">
              {sortedApplications.map((app) => (
                <li key={app.id} className="mb-2">
                  <Link
                    to={`/applications/${app.uuid}`}
                    className="text-decoration-none"
                  >
                    <DisplayText>{app.company}</DisplayText> — <DisplayText>{app.role}</DisplayText>
                    {app.latest_stage_type && (
                      <span className="text-muted ms-1">
                        — {STAGE_LABELS[app.latest_stage_type] ?? app.latest_stage_type}
                      </span>
                    )}
                    <span className="text-muted small ms-1">
                      — {formatDate(app.latest_stage_at || app.updated_at)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete recruiter"
        message="Are you sure you want to delete this recruiter? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
      <ApplicationsLookupModal
        show={showAppsModal}
        onClose={() => setShowAppsModal(false)}
        filterType="recruiter"
        filterValue={deleteBlocked?.entity_name}
        title={`Applications using recruiter "${deleteBlocked?.entity_name || ''}"`}
      />
    </div>
  )
}
