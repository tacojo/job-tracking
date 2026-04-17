import { useState, useEffect } from 'react'
import { api } from '../api'
import SearchableSelect from './SearchableSelect'

/** Modal to pick an existing company or add a new one. On save: calls onSelect with the chosen company name.
 * addOnly: when true (e.g. from /companies), show only the add-new form, no existing picker. */
export default function CompanyPickerModal({ show, onSelect, onCancel, addOnly = false }) {
  const [companies, setCompanies] = useState([])
  const [selected, setSelected] = useState('')
  const [addName, setAddName] = useState('')
  const [addLink, setAddLink] = useState('')
  const [addNote, setAddNote] = useState('')
  const [error, setError] = useState(null)

  useEffect(() => {
    if (show) {
      api.companies
        .list({ page: 1, page_size: 100 })
        .then((r) => setCompanies(r?.items || []))
        .catch(() => setCompanies([]))
      setSelected('')
      setAddName('')
      setAddLink('')
      setAddNote('')
      setError(null)
    }
  }, [show])

  const options = [...companies.map((c) => c.name)].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    if (addName.trim()) {
      try {
        const created = await api.companies.create({
          name: addName.trim(),
          link: addLink.trim() || null,
          initial_note: addNote.trim() || null,
        })
        onSelect(created.name)
      } catch (err) {
        const msg = err.body?.detail ?? err.message ?? 'Failed to add company'
        const display = Array.isArray(msg) && msg[0]?.msg ? msg[0].msg : (typeof msg === 'string' ? msg : String(msg))
        setError(display)
      }
    } else if (!addOnly && selected) {
      onSelect(selected)
    } else {
      setError(addOnly ? 'Enter a company name.' : 'Select a company from the list or add a new one.')
    }
  }

  if (!show) return null

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{addOnly ? 'Add company' : 'Choose or add company'}</h5>
            <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" />
          </div>
          <form onSubmit={handleSave}>
            <div className="modal-body">
              {error && <div className="alert alert-danger">{error}</div>}
              {!addOnly && (
                <>
                  <div className="mb-3">
                    <label className="form-label">Select existing company</label>
                    <SearchableSelect
                      id="company-picker-select"
                      options={options}
                      value={selected}
                      onChange={setSelected}
                      placeholder="Select company…"
                      emptyOption="—"
                    />
                  </div>
                  <hr className="my-3" />
                  <div className="mb-2">
                    <label className="form-label">Or add new company</label>
                  </div>
                </>
              )}
              {addOnly && (
                <div className="mb-2">
                  <label className="form-label">Add new company</label>
                </div>
              )}
              <div className="row g-2 mb-2">
                <div className="col-md-6">
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Name (e.g. Acme Corp)"
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <input
                    type="url"
                    className="form-control"
                    placeholder="Link (optional)"
                    value={addLink}
                    onChange={(e) => setAddLink(e.target.value)}
                  />
                </div>
              </div>
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Note (optional)"
                  value={addNote}
                  onChange={(e) => setAddNote(e.target.value)}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-forest">
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
