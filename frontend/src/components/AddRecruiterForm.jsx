import { useState } from 'react'
import { api } from '../api'

/** Form for adding a recruiter. Same as Recruiters page add form. */
export default function AddRecruiterForm({ onSuccess, onCancel }) {
  const [name, setName] = useState('')
  const [link, setLink] = useState('')
  const [latestNote, setLatestNote] = useState('')
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setError(null)
    try {
      const created = await api.recruiters.create({
        name: name.trim(),
        link: link.trim() || null,
        initial_note: latestNote.trim() || null,
      })
      onSuccess?.(created)
    } catch (e) {
      const msg = e.body?.detail ?? e.message ?? 'Failed to add recruiter'
      const display = Array.isArray(msg) && msg[0]?.msg ? msg[0].msg : (typeof msg === 'string' ? msg : String(msg))
      setError(display)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="row g-2 mb-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="recruiterName">
            Name
          </label>
          <input
            id="recruiterName"
            type="text"
            className="form-control"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Jane Smith"
            required
          />
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="recruiterLink">
            Link
          </label>
          <input
            id="recruiterLink"
            type="url"
            className="form-control"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="e.g. https://linkedin.com/in/..."
          />
        </div>
      </div>
      <div className="mb-3">
        <label className="form-label" htmlFor="recruiterLatestNote">
          Latest note
        </label>
        <input
          id="recruiterLatestNote"
          type="text"
          className="form-control"
          value={latestNote}
          onChange={(e) => setLatestNote(e.target.value)}
          placeholder="Add a note (optional)…"
        />
      </div>
      <div className="mb-3">
        <label className="form-label">My notes</label>
        <p className="text-muted small mb-0">
          No notes yet. Add a note above and save to start the log.
        </p>
      </div>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-forest">
          Save
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  )
}
