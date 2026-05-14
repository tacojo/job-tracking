import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { PageHeader } from '../components/ui'
import { useSettings } from '../contexts/SettingsContext'

export default function ProspectPage() {
  const { settings } = useSettings()
  const [jobSpec, setJobSpec] = useState('')
  const [cvId, setCvId] = useState('')
  const [coverLetterId, setCoverLetterId] = useState('')
  const [cvs, setCvs] = useState([])
  const [coverLetters, setCoverLetters] = useState([])
  const [loading, setLoading] = useState(false)
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [selectedQuestionId, setSelectedQuestionId] = useState(null)
  const [answersByQuestionId, setAnswersByQuestionId] = useState({})
  const [answerLoadingId, setAnswerLoadingId] = useState(null)
  const [answerError, setAnswerError] = useState(null)
  const [answerValidationMessage, setAnswerValidationMessage] = useState(null)
  const [questionDropdownOpen, setQuestionDropdownOpen] = useState(false)
  const [questionSearch, setQuestionSearch] = useState('')
  const dropdownRef = useRef(null)

  const filteredQuestions = useMemo(() => {
    if (!questionSearch.trim()) return questions
    const lower = questionSearch.trim().toLowerCase()
    return questions.filter((q) => q.question_text.toLowerCase().includes(lower))
  }, [questions, questionSearch])

  useEffect(() => {
    let cancelled = false
    setLoadingOptions(true)
    Promise.all([api.cvVersions.list(), api.coverLetters.list()])
      .then(([cvList, clList]) => {
        if (!cancelled) {
          const cvListNorm = cvList || []
          const clListNorm = clList || []
          setCvs(cvListNorm)
          setCoverLetters(clListNorm)
          setCvId((prev) => {
            const defaultId = settings.defaultCvId
            if (defaultId != null && cvListNorm.some((c) => c.id === defaultId)) return String(defaultId)
            return prev || ''
          })
          setCoverLetterId((prev) => {
            const defaultId = settings.defaultCoverLetterId
            if (defaultId != null && clListNorm.some((c) => c.id === defaultId)) return String(defaultId)
            return prev || ''
          })
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => { cancelled = true }
  }, [settings.defaultCvId, settings.defaultCoverLetterId])

  useEffect(() => {
    let cancelled = false
    setQuestionsLoading(true)
    api.prospect.questions()
      .then((list) => {
        if (!cancelled) {
          setQuestions(list || [])
          if (list?.length && selectedQuestionId == null) setSelectedQuestionId(list[0].id)
        }
      })
      .catch(() => {
        if (!cancelled) setQuestions([])
      })
      .finally(() => {
        if (!cancelled) setQuestionsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const onMouseDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setQuestionDropdownOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  useEffect(() => {
    setAnswerValidationMessage(null)
  }, [jobSpec, cvId, coverLetterId])

  const handleGenerateAnswer = async (questionId) => {
    const jobSpecTrim = jobSpec.trim()
    const hasCv = !!cvId
    const hasCoverLetter = !!coverLetterId

    const missing = []
    if (!jobSpecTrim) missing.push('Job spec (paste the job description above)')
    if (!hasCv && !hasCoverLetter) missing.push('A CV or cover letter (select one in the form above so the answer is based on your experience)')

    if (missing.length > 0) {
      setAnswerValidationMessage(
        'To generate an answer tailored to the role and your experience, please provide: ' +
        missing.join('; ') + '.'
      )
      setAnswerError(null)
      return
    }

    setAnswerValidationMessage(null)
    setAnswerError(null)
    setAnswerLoadingId(questionId)
    setSelectedQuestionId(questionId)
    try {
      const data = await api.prospect.answer({
        question_id: questionId,
        company: '',
        job_spec: jobSpecTrim,
        cv_id: cvId ? Number(cvId) : null,
        cover_letter_id: coverLetterId ? Number(coverLetterId) : null,
      })
      setAnswersByQuestionId((prev) => ({ ...prev, [questionId]: data.answer ?? '' }))
    } catch (err) {
      const msg = err.body?.detail ?? err.message ?? 'Request failed'
      setAnswerError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setAnswerLoadingId(null)
    }
  }

  const handleAnswerChange = (questionId, value) => {
    setAnswersByQuestionId((prev) => ({ ...prev, [questionId]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError(null)
    setResult(null)
    const jobSpecTrim = jobSpec.trim()
    if (!jobSpecTrim) {
      setError('Job spec is required.')
      return
    }
    const payload = {
      company: '',
      job_spec: jobSpecTrim,
      cv_id: cvId ? Number(cvId) : null,
      cover_letter_id: coverLetterId ? Number(coverLetterId) : null,
    }
    if (!payload.cv_id && !payload.cover_letter_id) {
      setError('Select at least one CV or cover letter to tailor.')
      return
    }
    setLoading(true)
    try {
      const data = await api.prospect.tailor(payload)
      setResult(data)
    } catch (err) {
      const msg = err.body?.detail ?? err.message ?? 'Request failed'
      setError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {}, () => {})
  }

  return (
    <div>
      <PageHeader
        title="Prospect a job"
        subtitle="Paste the job spec, then use AI to tailor your CV and/or cover letter to the role — without exaggerating. The AI will infer the company name from the job spec and use a placeholder if it cannot."
      />

      <form onSubmit={handleSubmit} className="card mb-4">
        <div className="card-body">
          <div className="row g-3 mb-4">
            <div className="col-md-6">
              <label className="form-label" htmlFor="cvId">CV to tailor (Select None if you don't need to tailor your CV)</label>
              <select
                id="cvId"
                className="form-select"
                value={cvId}
                onChange={(e) => setCvId(e.target.value)}
                disabled={loadingOptions}
              >
                <option value="">— None —</option>
                {cvs.map((cv) => (
                  <option key={cv.id} value={cv.id}>
                    {cv.name} · {cv.file_type?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label" htmlFor="coverLetterId">Cover letter to tailor (Select None if you don't need to tailor your cover letter)</label>
              <select
                id="coverLetterId"
                className="form-select"
                value={coverLetterId}
                onChange={(e) => setCoverLetterId(e.target.value)}
                disabled={loadingOptions}
              >
                <option value="">— None —</option>
                {coverLetters.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name} · {cl.file_type?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mb-3">
            <label className="form-label" htmlFor="jobSpec">Job spec</label>
            <textarea
              id="jobSpec"
              className="form-control"
              rows={6}
              value={jobSpec}
              onChange={(e) => setJobSpec(e.target.value)}
              placeholder="Paste the job description or key requirements…"
              required
            />
          </div>
          {error && (
            <div className="alert alert-danger py-2 mb-3" role="alert">
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-forest"
            disabled={loading || loadingOptions}
          >
            {loading ? 'Tailoring…' : 'Tailor my CV & cover letter'}
          </button>
        </div>
      </form>

      {result && (result.tailored_cv || result.tailored_cover_letter) && (
        <div className="card">
          <div className="card-header">
            <strong>Tailored result</strong>
          </div>
          <div className="card-body">
            {result.tailored_cv && (
              <div className="mb-4">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">Tailored CV</h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => copyToClipboard(result.tailored_cv)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-light border rounded p-3 small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto' }}>
                  {result.tailored_cv}
                </pre>
              </div>
            )}
            {result.tailored_cover_letter && (
              <div>
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <h6 className="mb-0">Tailored cover letter</h6>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => copyToClipboard(result.tailored_cover_letter)}
                  >
                    Copy
                  </button>
                </div>
                <pre className="bg-light border rounded p-3 small mb-0" style={{ whiteSpace: 'pre-wrap', maxHeight: '40vh', overflow: 'auto' }}>
                  {result.tailored_cover_letter}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {cvs.length === 0 && coverLetters.length === 0 && !loadingOptions && (
        <p className="text-muted">
          Upload a CV or cover letter on the <Link to="/cvs">My CVs</Link> page first, then come back here to tailor them.
        </p>
      )}

      <hr className="my-4" />

      <h2 className="h5 mb-3">Interview & application questions</h2>
      <p className="text-muted mb-3">
        Select a question and click &quot;Answer&quot; to generate a reply in British English, simple and natural tone. The answer uses the job spec and your CV or cover letter from above — please fill those in first. The AI will infer the company name from the job spec, or use a placeholder like [[COMPANY_NAME]] for you to replace. You can edit the answer below.
      </p>

      {answerValidationMessage && (
        <div className="alert alert-info alert-dismissible fade show mb-3" role="alert">
          <strong>Almost there —</strong> {answerValidationMessage}
          <button
            type="button"
            className="btn-close"
            aria-label="Close"
            onClick={() => setAnswerValidationMessage(null)}
          />
        </div>
      )}

      {questionsLoading ? (
        <p className="text-muted">Loading questions…</p>
      ) : questions.length > 0 ? (
        <>
          <div className="mb-3" ref={dropdownRef}>
            <label className="form-label">Question</label>
            <div className="d-flex gap-2 align-items-start">
              <div className="position-relative flex-grow-1">
                <button
                  type="button"
                  className="form-select form-control text-start d-flex align-items-center"
                  onClick={() => setQuestionDropdownOpen((o) => !o)}
                  aria-expanded={questionDropdownOpen}
                  aria-haspopup="listbox"
                >
                  <span className="text-truncate">
                    {selectedQuestionId != null
                      ? (questions.find((q) => q.id === selectedQuestionId)?.question_text ?? 'Select…')
                      : 'Select a question…'}
                  </span>
                </button>
                {questionDropdownOpen && (
                  <div
                    className="position-absolute top-100 start-0 end-0 mt-1 border bg-white rounded shadow-lg z-3"
                    style={{ maxHeight: '280px' }}
                  >
                    <div className="p-2 border-bottom">
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        placeholder="Search questions…"
                        value={questionSearch}
                        onChange={(e) => setQuestionSearch(e.target.value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        autoFocus
                      />
                    </div>
                    <ul
                      className="list-group list-group-flush overflow-auto mb-0"
                      role="listbox"
                      style={{ maxHeight: '240px' }}
                    >
                      {filteredQuestions.length === 0 ? (
                        <li className="list-group-item text-muted small">No questions match your search.</li>
                      ) : (
                        filteredQuestions.map((q) => (
                          <li
                            key={q.id}
                            role="option"
                            aria-selected={selectedQuestionId === q.id}
                            className={`list-group-item list-group-item-action ${selectedQuestionId === q.id ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedQuestionId(q.id)
                              setQuestionDropdownOpen(false)
                              setQuestionSearch('')
                            }}
                          >
                            {q.question_text}
                          </li>
                        ))
                      )}
                    </ul>
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-primary flex-shrink-0"
                disabled={answerLoadingId != null || selectedQuestionId == null}
                onClick={() => selectedQuestionId != null && handleGenerateAnswer(selectedQuestionId)}
              >
                {answerLoadingId === selectedQuestionId ? 'Generating…' : 'Answer'}
              </button>
            </div>
          </div>

          {selectedQuestionId != null && (
            <div className="card">
              <div className="card-header">
                <strong>
                  {questions.find((q) => q.id === selectedQuestionId)?.question_text ?? 'Answer'}
                </strong>
              </div>
              <div className="card-body">
                {answerError && (
                  <div className="alert alert-danger py-2 mb-3" role="alert">
                    {answerError}
                  </div>
                )}
                <label className="form-label text-muted small">AI answer (editable)</label>
                <textarea
                  className="form-control"
                  rows={8}
                  value={answersByQuestionId[selectedQuestionId] ?? ''}
                  onChange={(e) => handleAnswerChange(selectedQuestionId, e.target.value)}
                  placeholder="Select a question above and click Answer to generate a reply, then edit here if needed."
                />
              </div>
            </div>
          )}
        </>
      ) : (
        <p className="text-muted">No questions available. Add prospect_questions in the database.</p>
      )}
    </div>
  )
}
