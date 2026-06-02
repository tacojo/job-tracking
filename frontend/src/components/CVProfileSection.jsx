import { useState, useEffect } from 'react'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'

export default function CVProfileSection({ cvs, onParsed }) {
  const [profile, setProfile] = useState({ full_name: '', tagline: '', summary: '' })
  const [experiences, setExperiences] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [parsing, setParsing] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [pdfTemplates, setPdfTemplates] = useState(['default'])
  const [selectedPdfTemplate, setSelectedPdfTemplate] = useState('default')
  const [editingId, setEditingId] = useState(null)
  const [editProfile, setEditProfile] = useState(false)
  const [deleteId, setDeleteId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [profData, expData] = await Promise.all([
        api.cvProfile.getProfile(),
        api.cvProfile.listExperiences(),
      ])
      setProfile(profData)
      setExperiences(expData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    api.cvProfile.listTemplates('pdf').then((r) => {
      const templates = r.templates || ['default']
      setPdfTemplates(templates)
      setSelectedPdfTemplate((prev) => (templates.includes(prev) ? prev : templates[0]))
    }).catch(() => {})
  }, [])

  const handleParse = async (cvId) => {
    setParsing(true)
    setError(null)
    try {
      await api.cvProfile.parseFromCv(cvId)
      await load()
      onParsed?.()
    } catch (e) {
      setError(e.body?.detail || e.message)
    } finally {
      setParsing(false)
    }
  }

  const handleExport = async (format, template) => {
    setExporting(format)
    setError(null)
    try {
      const res = await api.cvProfile.export(format, format === 'pdf' ? (template || selectedPdfTemplate) : 'default')
      if (res.status === 401) {
        localStorage.removeItem('auth_token')
        sessionStorage.removeItem('csrf_token')
        window.location.href = '/login'
        return
      }
      if (!res.ok) {
        const text = await res.text()
        throw new Error(text || 'Export failed')
      }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `cv.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (e) {
      setError(e.message)
    } finally {
      setExporting(null)
    }
  }

  const handleSaveProfile = async () => {
    try {
      await api.cvProfile.updateProfile(profile)
      setEditProfile(false)
    } catch (e) {
      setError(e.message)
    }
  }

  const handleSaveExperience = async (id, data) => {
    try {
      await api.cvProfile.updateExperience(id, data)
      setEditingId(null)
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleAddExperience = async () => {
    try {
      await api.cvProfile.createExperience({
        employer: '',
        role: '',
        start_date: '',
        end_date: '',
        location: '',
        skills: [],
        details: [],
      })
      load()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleDeleteExperience = async () => {
    if (!deleteId) return
    try {
      await api.cvProfile.deleteExperience(deleteId)
      setDeleteId(null)
      load()
    } catch (e) {
      setError(e.message)
      setDeleteId(null)
    }
  }

  const docxCvs = cvs?.filter((c) => c.file_type === 'docx') || []

  return (
    <div className="cv-profile-section">
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 flex-lg-nowrap cvs-page-section-header">
        <h2 id="cv-profile-heading" className="h5 mb-0 me-2">
          CV Profile (source of truth)
        </h2>
        <div className="d-flex gap-2 flex-wrap justify-content-end flex-grow-1">
          {docxCvs.length > 0 && (
            <div className="d-flex gap-1">
              <select
                className="form-select form-select-sm"
                style={{ width: 'auto' }}
                id="parse-cv-select"
                disabled={parsing}
              >
                <option value="">Select CV to parse…</option>
                {docxCvs.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-sm btn-forest"
                type="button"
                onClick={() => {
                  const sel = document.getElementById('parse-cv-select')
                  const v = sel?.value
                  if (v) handleParse(parseInt(v, 10))
                }}
                disabled={parsing}
              >
                {parsing ? 'Parsing…' : 'Parse'}
              </button>
            </div>
          )}
          <button
            className="btn btn-sm btn-forest"
            type="button"
            onClick={() => handleExport('docx')}
            disabled={!!exporting}
          >
            {exporting === 'docx' ? '…' : 'Export DOCX'}
          </button>
          <div className="d-flex gap-1 align-items-center">
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={selectedPdfTemplate}
              onChange={(e) => setSelectedPdfTemplate(e.target.value)}
            >
              {pdfTemplates.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <button
              className="btn btn-sm btn-forest"
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? '…' : 'Export PDF'}
            </button>
          </div>
          <button
            className="btn btn-sm btn-forest"
            type="button"
            onClick={async () => {
              try {
                const data = await api.cvProfile.exportJson()
                await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
                setError(null)
                alert('JSON copied to clipboard. Use it for tacojo.github.io or other consumers.')
              } catch (e) {
                setError(e.message)
              }
            }}
          >
            Copy JSON
          </button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger mb-3" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <>
          {/* Profile summary */}
          <div className="card mb-3">
            <div className="card-body">
              <div className="d-flex justify-content-between align-items-start">
                <div>
                  {editProfile ? (
                    <div className="mb-2">
                      <input
                        className="form-control form-control-sm mb-1"
                        placeholder="Full name"
                        value={profile.full_name}
                        onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))}
                      />
                      <input
                        className="form-control form-control-sm mb-1"
                        placeholder="Tagline (e.g. data engineer)"
                        value={profile.tagline}
                        onChange={(e) => setProfile((p) => ({ ...p, tagline: e.target.value }))}
                      />
                      <textarea
                        className="form-control form-control-sm"
                        placeholder="Summary"
                        rows={3}
                        value={profile.summary}
                        onChange={(e) => setProfile((p) => ({ ...p, summary: e.target.value }))}
                      />
                      <button className="btn btn-sm btn-forest mt-1 me-1" type="button" onClick={handleSaveProfile}>
                        Save
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary mt-1"
                        onClick={() => setEditProfile(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <>
                      <h6 className="mb-1">{profile.full_name || 'Your name'}</h6>
                      <p className="text-muted small mb-1">{profile.tagline || 'Tagline'}</p>
                      <p className="small mb-0">{profile.summary || 'Add a profile summary.'}</p>
                      <button className="btn btn-sm btn-link p-0 mt-1" onClick={() => setEditProfile(true)}>
                        Edit profile
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Experience table */}
          <div className="d-flex justify-content-between align-items-center mb-2">
            <h6 className="mb-0">Experience (chronological)</h6>
            <button className="btn btn-sm btn-forest" type="button" onClick={handleAddExperience}>
              + Add role
            </button>
          </div>

          <div className="table-responsive">
            <table className="table table-sm table-bordered">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Employer</th>
                  <th>Dates</th>
                  <th>Location</th>
                  <th>Skills</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {experiences.map((exp) => (
                  <tr key={exp.id}>
                    {editingId === exp.id ? (
                      <ExperienceEditRow
                        exp={exp}
                        onSave={(data) => handleSaveExperience(exp.id, data)}
                        onCancel={() => setEditingId(null)}
                      />
                    ) : (
                      <>
                        <td>{exp.role}</td>
                        <td>{exp.employer}</td>
                        <td>{exp.start_date} – {exp.end_date}</td>
                        <td>{exp.location}</td>
                        <td>{(exp.skills || []).join(', ')}</td>
                        <td>
                          <button
                            className="btn btn-sm btn-link p-0"
                            onClick={() => setEditingId(exp.id)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn btn-sm btn-link p-0 text-danger"
                            onClick={() => setDeleteId(exp.id)}
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

          {experiences.length === 0 && (
            <p className="text-muted small">
              No experience yet. Parse from an uploaded DOCX CV above, or add roles manually.
            </p>
          )}
        </>
      )}

      <ConfirmModal
        show={!!deleteId}
        title="Delete experience"
        message="Are you sure you want to delete this role?"
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteExperience}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

function ExperienceEditRow({ exp, onSave, onCancel }) {
  const [data, setData] = useState({
    role: exp.role,
    employer: exp.employer,
    employer_link: exp.employer_link,
    start_date: exp.start_date,
    end_date: exp.end_date,
    location: exp.location,
    employment_type: exp.employment_type,
    level: exp.level,
    skills: (exp.skills || []).join(', '),
    details: (exp.details || []).join('\n'),
  })

  const toMonthInputValue = (value) => {
    if (!value) return ''
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return ''
    const m = String(d.getMonth() + 1).padStart(2, '0')
    return `${d.getFullYear()}-${m}`
  }

  const fromMonthInputValue = (value) => {
    if (!value) return ''
    const [y, m] = value.split('-')
    if (!y || !m) return ''
    const d = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
    if (Number.isNaN(d.getTime())) return ''
    return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' }).format(d)
  }

  const handleSave = () => {
    onSave({
      ...data,
      skills: data.skills ? data.skills.split(',').map((s) => s.trim()).filter(Boolean) : [],
      details: data.details ? data.details.split('\n').map((s) => s.trim()).filter(Boolean) : [],
    })
  }

  return (
    <td colSpan={6} className="p-2">
      <div className="row g-2">
        <div className="col-md-6">
          <input
            className="form-control form-control-sm"
            placeholder="Role"
            value={data.role}
            onChange={(e) => setData((d) => ({ ...d, role: e.target.value }))}
          />
        </div>
        <div className="col-md-6">
          <input
            className="form-control form-control-sm"
            placeholder="Employer"
            value={data.employer}
            onChange={(e) => setData((d) => ({ ...d, employer: e.target.value }))}
          />
        </div>
        <div className="col-md-4">
          <input
            type="month"
            className="form-control form-control-sm"
            value={toMonthInputValue(data.start_date)}
            onChange={(e) =>
              setData((d) => ({ ...d, start_date: fromMonthInputValue(e.target.value) }))
            }
          />
        </div>
        <div className="col-md-4">
          <input
            type="month"
            className="form-control form-control-sm"
            value={toMonthInputValue(data.end_date)}
            onChange={(e) =>
              setData((d) => ({ ...d, end_date: fromMonthInputValue(e.target.value) }))
            }
          />
        </div>
        <div className="col-md-4">
          <input
            className="form-control form-control-sm"
            placeholder="Location"
            value={data.location}
            onChange={(e) => setData((d) => ({ ...d, location: e.target.value }))}
          />
        </div>
        <div className="col-12">
          <input
            className="form-control form-control-sm"
            placeholder="Skills (comma-separated)"
            value={data.skills}
            onChange={(e) => setData((d) => ({ ...d, skills: e.target.value }))}
          />
        </div>
        <div className="col-12">
          <textarea
            className="form-control form-control-sm"
            placeholder="Details (one per line)"
            rows={3}
            value={data.details}
            onChange={(e) => setData((d) => ({ ...d, details: e.target.value }))}
          />
        </div>
        <div className="col-12">
          <button className="btn btn-sm btn-forest me-1" type="button" onClick={handleSave}>
            Save
          </button>
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </td>
  )
}
