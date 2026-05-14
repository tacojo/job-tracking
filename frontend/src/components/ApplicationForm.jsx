import { useRef, useState, useEffect } from 'react'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import CompanyPickerModal from './CompanyPickerModal'
import RecruiterPickerModal from './RecruiterPickerModal'
import SearchableSelect from './SearchableSelect'

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

export function NotesSection({ notesLog, onAddNote, mask, maskText }) {
  const [latestNote, setLatestNote] = useState('')
  const sortedNotes = [...(notesLog || [])].sort(
    (a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)
  )

  const handleAddClick = async () => {
    const text = latestNote.trim()
    if (!text) return
    try {
      await onAddNote(text)
      setLatestNote('')
    } catch {
      // Error shown by parent (noteError)
    }
  }

  return (
    <div className="mb-3">
      <h6 className="card-title">Latest note</h6>
      <div className="input-group mb-3">
        <input
          type="text"
          className="form-control"
          placeholder="Add a new note…"
          value={mask ? maskText(latestNote) : latestNote}
          onChange={(e) => !mask && setLatestNote(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddClick())}
          readOnly={mask}
        />
        <button type="button" className="btn btn-forest" disabled={!latestNote.trim()} onClick={handleAddClick}>
          Add
        </button>
      </div>
      <h6 className="card-title mt-3">My notes</h6>
      {sortedNotes.length === 0 ? (
        <p className="text-muted mb-0">No notes yet.</p>
      ) : (
        <ul className="list-unstyled mb-0">
          {sortedNotes.map((entry, i) => (
            <li key={i} className="mb-2 pb-2 border-bottom">
              <span className="text-muted small">{formatNoteDate(entry.timestamp)}</span>
              <p className="mb-0">{mask ? maskText(entry.text || '') : (entry.text || '')}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function ApplicationForm({ initial, onSave, onCancel, notesLog = [], onAddNote }) {
  const { settings } = useSettings()
  const mask = settings.maskSensitive
  const [companies, setCompanies] = useState([])
  const [recruiters, setRecruiters] = useState([])
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [recruiter, setRecruiter] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [otherModal, setOtherModal] = useState(null) // 'company' | 'recruiter'
  const pickerSelectionRef = useRef(null)
  const initialIdRef = useRef(initial?.uuid)

  const loadCompanies = () =>
    api.companies
      .list({ page: 1, page_size: 100 })
      .then((r) => setCompanies(r.items || []))
      .catch(() => {})
  const loadRecruiters = () =>
    api.recruiters
      .list({ page: 1, page_size: 100 })
      .then((r) => setRecruiters(r.items || []))
      .catch(() => {})

  useEffect(() => {
    loadCompanies()
    loadRecruiters()
  }, [])

  useEffect(() => {
    if (initial?.uuid !== initialIdRef.current) {
      initialIdRef.current = initial?.uuid
      pickerSelectionRef.current = null
    }
    if (pickerSelectionRef.current) {
      const { field, name } = pickerSelectionRef.current
      if (field === 'company') setCompany(name)
      else setRecruiter(name)
      return
    }
    if (initial) {
      initialIdRef.current = initial.uuid
      const c = initial.company || ''
      const r = initial.recruiter || ''
      const cInList = companies.some((x) => x.name === c)
      const rInList = recruiters.some((x) => x.name === r)
      setCompany(cInList ? c : (c ? '__other__' : ''))
      setRecruiter(rInList ? r : (r ? '__other__' : ''))
      setRole(initial.role || '')
      setContactNotes(initial.contact_notes || '')
      setJobUrl(initial.job_url || '')
    }
  }, [initial, companies, recruiters])

  const companyOptions = [
    ...companies.map((c) => c.name),
    ...(initial?.company && !companies.some((c) => c.name === initial.company) ? [initial.company] : []),
    ...(company && company !== '__other__' && !companies.some((c) => c.name === company) ? [company] : []),
  ]
  const recruiterOptions = [
    ...recruiters.map((r) => r.name),
    ...(initial?.recruiter && !recruiters.some((r) => r.name === initial.recruiter) ? [initial.recruiter] : []),
    ...(recruiter && recruiter !== '__other__' && !recruiters.some((r) => r.name === recruiter) ? [recruiter] : []),
  ]
  const companyOptionsUnique = [...new Set(companyOptions)]
  const recruiterOptionsUnique = [...new Set(recruiterOptions)]
  const handleSubmit = (e) => {
    e.preventDefault()
    if (company === '__other__') {
      handleOtherSelect('company')
      return
    }
    const companyValue = company
    const recruiterValue = recruiter === '__other__' ? null : recruiter
    onSave({
      company: companyValue,
      role,
      recruiter: recruiterValue || null,
      contact_notes: contactNotes || null,
      job_url: jobUrl.trim() || null,
    })
  }

  const handleOtherSelect = (field) => {
    setOtherModal(field)
  }

  const handlePickerSelect = (field, name) => {
    pickerSelectionRef.current = { field, name }
    if (field === 'company') {
      setCompany(name)
      setCompanies((prev) => (prev.some((c) => c.name === name) ? prev : [...prev, { name }]))
      loadCompanies()
    } else {
      setRecruiter(name)
      setRecruiters((prev) => (prev.some((r) => r.name === name) ? prev : [...prev, { name }]))
      loadRecruiters()
    }
    setOtherModal(null)
  }

  const handleOtherCancel = () => {
    if (otherModal === 'company') setCompany('')
    else setRecruiter('')
    setOtherModal(null)
  }

  const showTwoColumnLayout = onAddNote != null

  return (
    <>
    <form onSubmit={handleSubmit}>
      <div className="row g-3">
        {/* Left half: Company, Role, Recruiter, Job URL */}
        <div className={showTwoColumnLayout ? 'col-md-6' : 'col-12'}>
          <div className="mb-2">
            <label className="form-label" htmlFor="company">
              Company
            </label>
            <SearchableSelect
              id="company"
              options={companyOptionsUnique}
              value={company}
              onChange={setCompany}
              placeholder="Select company…"
              required
              hasOther
              onOtherSelect={() => handleOtherSelect('company')}
              emptyOption="Select company…"
              mask={mask}
              maskText={maskText}
            />
          </div>
          <div className="mb-2">
            <label className="form-label" htmlFor="role">
              Role
            </label>
            <input
              id="role"
              type="text"
              className="form-control"
              value={mask ? maskText(role) : role}
              onChange={(e) => !mask && setRole(e.target.value)}
              readOnly={mask}
              required
            />
          </div>
          <div className="mb-2">
            <label className="form-label" htmlFor="recruiter">
              Recruiter (optional)
            </label>
            <SearchableSelect
              id="recruiter"
              options={recruiterOptionsUnique}
              value={recruiter}
              onChange={setRecruiter}
              placeholder="—"
              hasOther
              onOtherSelect={() => handleOtherSelect('recruiter')}
              emptyOption="—"
              mask={mask}
              maskText={maskText}
            />
          </div>
          <div className="mb-2">
            <label className="form-label" htmlFor="jobUrl">
              Job URL (optional)
            </label>
            <div className="input-group">
              <input
                id="jobUrl"
                type={mask ? 'text' : 'url'}
                className="form-control"
                value={mask ? maskText(jobUrl) : jobUrl}
                onChange={(e) => !mask && setJobUrl(e.target.value)}
                readOnly={mask}
                placeholder="https://..."
              />
              {jobUrl?.trim() && !mask && (
                <a
                  className="btn btn-outline-secondary"
                  href={jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open job URL in new tab"
                >
                  Open
                </a>
              )}
            </div>
          </div>
        </div>
        {/* Right half: Notes (when onAddNote provided) */}
        {showTwoColumnLayout && (
          <div className="col-md-6">
            <NotesSection notesLog={notesLog} onAddNote={onAddNote} mask={mask} maskText={maskText} />
          </div>
        )}
      </div>
      <div className="d-flex gap-2 mt-2">
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
    {otherModal === 'company' && (
      <CompanyPickerModal
        show
        onSelect={(name) => handlePickerSelect('company', name)}
        onCancel={handleOtherCancel}
      />
    )}
    {otherModal === 'recruiter' && (
      <RecruiterPickerModal
        show
        onSelect={(name) => handlePickerSelect('recruiter', name)}
        onCancel={handleOtherCancel}
      />
    )}
    </>
  )
}
