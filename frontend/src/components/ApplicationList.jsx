import { useState, useEffect } from 'react'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'
import DisplayText from './DisplayText'
import ApplicationForm from './ApplicationForm'
import PageMessage from './PageMessage'
import StageList from './StageList'

export default function ApplicationList() {
  const [applications, setApplications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [deleteUuid, setDeleteUuid] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.applications.list()
      setApplications(data)
    } catch (e) {
      setError(e.message || 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleCreate = async (data) => {
    await api.applications.create(data)
    setEditingId(null)
    load()
  }

  const handleUpdate = async (uuid, data) => {
    await api.applications.update(uuid, data)
    setEditingId(null)
    load()
  }

  const handleDeleteClick = (uuid) => setDeleteUuid(uuid)
  const handleDeleteConfirm = async () => {
    if (!deleteUuid) return
    await api.applications.delete(deleteUuid)
    setDeleteUuid(null)
    setExpandedId(null)
    load()
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }

  const isFutureLatestStage = (app) => {
    if (!app.latest_stage_at) return false
    const latest = new Date(app.latest_stage_at).getTime()
    const now = Date.now()
    return latest > now
  }

  if (loading) return <PageMessage variant="loading">Loading…</PageMessage>
  if (error) return <PageMessage variant="danger" title="Error">{error}</PageMessage>

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h1>Applications</h1>
        {!editingId && (
          <button
            className="btn btn-forest"
            onClick={() => setEditingId('new')}
          >
            Add Application
          </button>
        )}
      </div>

      {editingId === 'new' && (
        <div className="card mb-4">
          <div className="card-body">
            <ApplicationForm
              onSave={handleCreate}
              onCancel={() => setEditingId(null)}
            />
          </div>
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-hover">
          <thead>
            <tr>
              <th>Company</th>
              <th>Role</th>
              <th>Updated</th>
              <th className="text-end">Actions</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((app) => (
              <tr
                key={app.id}
                className={isFutureLatestStage(app) ? 'table-success' : undefined}
              >
                {editingId === app.id ? (
                  <td colSpan={4} className="p-0">
                    <div className="p-3 bg-light">
                      <ApplicationForm
                        initial={app}
                        onSave={(data) => handleUpdate(app.uuid, data)}
                        onCancel={() => setEditingId(null)}
                      />
                    </div>
                  </td>
                ) : (
                  <>
                    <td><DisplayText>{app.company}</DisplayText></td>
                    <td><DisplayText>{app.role}</DisplayText></td>
                    <td>{formatDate(app.updated_at)}</td>
                    <td className="text-end">
                      <button
                        className="btn btn-sm btn-outline-primary me-1"
                        onClick={() => setEditingId(app.id)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-sm btn-outline-secondary me-1"
                        onClick={() =>
                          setExpandedId(expandedId === app.id ? null : app.id)
                        }
                      >
                        {expandedId === app.id ? 'Hide' : 'Stages'}
                      </button>
                      <button
                        className="btn btn-sm btn-outline-danger"
                        onClick={() => handleDeleteClick(app.uuid)}
                      >
                        Delete
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {applications.length === 0 && !editingId && (
        <p className="text-muted">No applications yet. Add one to get started.</p>
      )}

      <ConfirmModal
        show={!!deleteUuid}
        title="Delete application"
        message="Are you sure you want to delete this application? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteUuid(null)}
      />
      {expandedId && (
        <div className="card mt-2 mb-4">
          <div className="card-header">
            <strong>
              Stages —{' '}
              <DisplayText>{applications.find((a) => a.id === expandedId)?.company}</DisplayText>{' '}
              (<DisplayText>{applications.find((a) => a.id === expandedId)?.role}</DisplayText>)
            </strong>
          </div>
          <div className="card-body">
            <StageList applicationId={expandedId} onUpdate={load} />
          </div>
        </div>
      )}
    </div>
  )
}
