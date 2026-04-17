import { useState, useEffect } from 'react'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import CompanyPickerModal from './CompanyPickerModal'
import RecruiterPickerModal from './RecruiterPickerModal'

/** Simplified form for creating a new application. */
export default function ApplicationCreateForm({ onSave, onCancel }) {
  const { settings } = useSettings()
  const mask = settings.maskSensitive
  const [companies, setCompanies] = useState([])
  const [recruiters, setRecruiters] = useState([])
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [recruiter, setRecruiter] = useState('')
  const [jobUrl, setJobUrl] = useState('')
  const [source, setSource] = useState('')
  const [showCompanyModal, setShowCompanyModal] = useState(false)
  const [showRecruiterModal, setShowRecruiterModal] = useState(false)

  const loadCompanies = () =>
    api.companies
      .list({ page: 1, page_size: 100 })
      .then((r) => setCompanies(r?.items || []))
      .catch(() => {})
  const loadRecruiters = () =>
    api.recruiters
      .list({ page: 1, page_size: 100 })
      .then((r) => setRecruiters(r?.items || []))
      .catch(() => {})

  useEffect(() => {
    loadCompanies()
    loadRecruiters()
  }, [])

  const companyOptions = [
    ...companies.map((c) => c.name),
    ...(company && company !== '__other__' && !companies.some((c) => c.name === company) ? [company] : []),
  ]
  const recruiterOptions = [
    ...recruiters.map((r) => r.name),
    ...(recruiter && recruiter !== '__other__' && !recruiters.some((r) => r.name === recruiter) ? [recruiter] : []),
  ]

  const handleSubmit = (e) => {
    e.preventDefault()
    if (company === '__other__') {
      setShowCompanyModal(true)
      return
    }
    if (recruiter === '__other__') {
      setShowRecruiterModal(true)
      return
    }
    onSave({
      company,
      role: role.trim(),
      recruiter: recruiter && recruiter !== '__other__' ? recruiter.trim() || null : null,
      job_url: jobUrl.trim() || null,
      source: source.trim() || null,
    })
  }

  const handleCompanySelect = (name) => {
    setCompany(name)
    setCompanies((prev) => (prev.some((c) => c.name === name) ? prev : [...prev, { name }]))
    loadCompanies()
    setShowCompanyModal(false)
  }

  const handleCompanyCancel = () => {
    setCompany('')
    setShowCompanyModal(false)
  }

  const handleRecruiterSelect = (name) => {
    setRecruiter(name)
    setRecruiters((prev) => (prev.some((r) => r.name === name) ? prev : [...prev, { name }]))
    loadRecruiters()
    setShowRecruiterModal(false)
  }

  const handleRecruiterCancel = () => {
    setRecruiter('')
    setShowRecruiterModal(false)
  }

  return (
    <>
    <form onSubmit={handleSubmit}>
      {/* Row 1: Company, Role */}
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="company">
            Company <span className="text-danger">*</span>
          </label>
          <select
            id="company"
            className="form-select"
            value={company}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__other__') {
                setCompany('__other__')
                setShowCompanyModal(true)
              } else {
                setCompany(v)
              }
            }}
            required={company && company !== '__other__'}
          >
            <option value="">Select company…</option>
            {companyOptions.map((name) => (
              <option key={name} value={name}>
                {mask ? maskText(name) : name}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        <div className="col-md-6">
          <label className="form-label" htmlFor="role">
            Role <span className="text-danger">*</span>
          </label>
          <input
            id="role"
            type="text"
            className="form-control"
            value={mask ? maskText(role) : role}
            onChange={(e) => !mask && setRole(e.target.value)}
            readOnly={mask}
            placeholder="e.g. Data Engineer"
            required
          />
        </div>
      </div>
      {/* Row 2: Recruiter */}
      <div className="row g-3 mb-3">
        <div className="col-md-6">
          <label className="form-label" htmlFor="recruiter">
            Recruiter <span className="text-muted">(optional)</span>
          </label>
          <select
            id="recruiter"
            className="form-select"
            value={recruiter}
            onChange={(e) => {
              const v = e.target.value
              if (v === '__other__') {
                setRecruiter('__other__')
                setShowRecruiterModal(true)
              } else {
                setRecruiter(v)
              }
            }}
          >
            <option value="">—</option>
            {recruiterOptions.map((name) => (
              <option key={name} value={name}>
                {mask ? maskText(name) : name}
              </option>
            ))}
            <option value="__other__">Other…</option>
          </select>
        </div>
        {/* Job URL, Source */}
        <div className="col-md-6">
          <label className="form-label" htmlFor="jobUrl">
            Job URL <span className="text-muted">(optional)</span>
          </label>
          <input
            id="jobUrl"
            type="url"
            className="form-control"
            value={jobUrl}
            onChange={(e) => setJobUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        <div className="col-md-6 mt-3 mt-md-0">
          <label className="form-label" htmlFor="source">
            Source <span className="text-muted">(optional)</span>
          </label>
          <input
            id="source"
            type="text"
            className="form-control"
            value={mask ? maskText(source) : source}
            onChange={(e) => !mask && setSource(e.target.value)}
            readOnly={mask}
            placeholder="e.g. LinkedIn, company website"
          />
        </div>
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

    {showCompanyModal && (
      <CompanyPickerModal
        show
        onSelect={handleCompanySelect}
        onCancel={handleCompanyCancel}
      />
    )}
    {showRecruiterModal && (
      <RecruiterPickerModal
        show
        onSelect={handleRecruiterSelect}
        onCancel={handleRecruiterCancel}
      />
    )}
    </>
  )
}
