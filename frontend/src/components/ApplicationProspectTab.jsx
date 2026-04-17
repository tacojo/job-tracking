import { useState, useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import SimpleDiffView from './SimpleDiffView'

export default function ApplicationProspectTab({
  appId,
  appUuid,
  jdText,
  jobUrl,
  documents = [],
  onDocumentsRefresh,
}) {
  const initialHasJobDescription =
    (jdText && (jdText || '').trim()) ||
    (documents && documents.some((d) => d.doc_type === 'jd'))
  const [hasJobDescription, setHasJobDescription] = useState(Boolean(initialHasJobDescription))
  const { settings } = useSettings()
  const [loadingOptions, setLoadingOptions] = useState(true)
  const [tailorResult, setTailorResult] = useState(null)
  const [tailorLoading, setTailorLoading] = useState(false)
  const [tailorError, setTailorError] = useState(null)
  const [templates, setTemplates] = useState(['default', 'modern', 'minimal'])
  const [cvTemplate, setCvTemplate] = useState('default')
  const [saveDocxLoading, setSaveDocxLoading] = useState(false)
  const [saveDocxError, setSaveDocxError] = useState(null)
  const [showJobSpecModal, setShowJobSpecModal] = useState(false)
  const [jobSpecText, setJobSpecText] = useState('')
  const [jobSpecSaving, setJobSpecSaving] = useState(false)
  const [jobSpecError, setJobSpecError] = useState(null)

  const [answers, setAnswers] = useState([])
  const [answersLoading, setAnswersLoading] = useState(true)
  const [answersSaving, setAnswersSaving] = useState(false)
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(true)
  const [questionDropdownOpen, setQuestionDropdownOpen] = useState(false)
  const [questionSearch, setQuestionSearch] = useState('')
  const [selectedQuestionId, setSelectedQuestionId] = useState(null)
  const [answerLoadingId, setAnswerLoadingId] = useState(null)
  const [answerError, setAnswerError] = useState(null)
  const dropdownRef = useRef(null)

  const filteredQuestions = useMemo(() => {
    if (!questionSearch.trim()) return questions
    const lower = questionSearch.trim().toLowerCase()
    return questions.filter((q) => q.question_text.toLowerCase().includes(lower))
  }, [questions, questionSearch])

  const tailoredDocs = useMemo(
    () =>
      documents.filter(
        (d) => d.doc_type === 'tailored_cv' || d.doc_type === 'tailored_cover_letter'
      ),
    [documents]
  )

  useEffect(() => {
    const has =
      (jdText && (jdText || '').trim()) ||
      (documents && documents.some((d) => d.doc_type === 'jd'))
    setHasJobDescription(Boolean(has))
  }, [jdText, documents])

  useEffect(() => {
    if (!appId) return
    let cancelled = false
    setLoadingOptions(true)
    api.applications.prospect.getTemplates(appId)
      .then((tRes) => {
        if (!cancelled && tRes?.templates?.length) setTemplates(tRes.templates)
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingOptions(false)
      })
    return () => { cancelled = true }
  }, [appId])

  useEffect(() => {
    let cancelled = false
    setAnswersLoading(true)
    api.applications.prospect.getAnswers(appId)
      .then((list) => {
        if (!cancelled) setAnswers(list || [])
      })
      .catch(() => {
        if (!cancelled) setAnswers([])
      })
      .finally(() => {
        if (!cancelled) setAnswersLoading(false)
      })
    return () => { cancelled = true }
  }, [appId])

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
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setQuestionDropdownOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  const handleTailor = async () => {
    setTailorError(null)
    setTailorResult(null)
    if (!hasJobDescription) {
      if (jobUrl && jobUrl.trim()) {
        // Open job URL so user can copy the spec, then show modal to paste and save it
        try {
          window.open(jobUrl, '_blank', 'noopener,noreferrer')
        } catch {
          // ignore
        }
        setJobSpecText('')
        setJobSpecError(null)
        setShowJobSpecModal(true)
        return
      }
      setTailorError('Add a job description: paste text in Application Details or upload a JD document.')
      return
    }
    setTailorLoading(true)
    try {
      const data = await api.applications.prospect.tailor(appId, {
        cover_letter_id:
          settings.defaultCoverLetterId != null ? Number(settings.defaultCoverLetterId) : null,
      })
      setTailorResult(data)
    } catch (err) {
      const msg = err.body?.detail ?? err.message ?? 'Request failed'
      setTailorError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setTailorLoading(false)
    }
  }

  const handleSaveDocx = async () => {
    if (!tailorResult?.tailored_cv && !tailorResult?.tailored_cover_letter) {
      setSaveDocxError('Tailor first, then save as DOCX when happy with the content.')
      return
    }
    setSaveDocxError(null)
    setSaveDocxLoading(true)
    try {
      await api.applications.prospect.saveDocx(appId, {
        tailored_cv: tailorResult.tailored_cv || null,
        tailored_cover_letter: tailorResult.tailored_cover_letter || null,
        cv_template: cvTemplate,
      })
      onDocumentsRefresh?.()
    } catch (err) {
      setSaveDocxError(err.message ?? 'Save failed')
    } finally {
      setSaveDocxLoading(false)
    }
  }

  const copyToClipboard = (text) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {}, () => {})
  }

  const handleAnswerChange = (index, field, value) => {
    setAnswers((prev) => {
      const next = [...prev]
      if (!next[index]) next[index] = { id: null, question: '', answer: '' }
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const handleAddRow = () => {
    setAnswers((prev) => [...prev, { id: null, question: '', answer: '' }])
  }

  const handleAddFromQuestion = (question) => {
    if (!question?.question_text) return
    setAnswers((prev) => [...prev, { id: null, question: question.question_text, answer: '' }])
    setQuestionDropdownOpen(false)
  }

  const getQuestionIdForRow = (row) => {
    const q = questions.find((qu) => qu.question_text === (row?.question || '').trim())
    return q?.id ?? null
  }

  const handleGenerateAnswer = async (index) => {
    const row = answers[index]
    const questionId = getQuestionIdForRow(row)
    const jobSpec = (jdText || '').trim()
    if (!jobSpec) {
      setAnswerError('Paste the job description text in Application Details to generate answers (Generate needs the text; Tailor can use an uploaded JD document).')
      return
    }
    if (!questionId) {
      setAnswerError('Use "Add from template" to add a predefined question, then click Generate.')
      return
    }
    setAnswerError(null)
    setAnswerLoadingId(index)
    try {
      const data = await api.prospect.answer({
        question_id: questionId,
        company: '',
        job_spec: jobSpec,
        cv_id: null,
        cover_letter_id:
          settings.defaultCoverLetterId != null ? Number(settings.defaultCoverLetterId) : null,
      })
      handleAnswerChange(index, 'answer', data.answer ?? '')
    } catch (err) {
      const msg = err.body?.detail ?? err.message ?? 'Request failed'
      setAnswerError(Array.isArray(msg) ? msg.join(', ') : msg)
    } finally {
      setAnswerLoadingId(null)
    }
  }

  const handleSaveAnswers = async () => {
    const items = answers.map((a) => ({
      question: (a.question || '').trim() || '(Question)',
      answer: (a.answer || '').trim() || '',
    }))
    setAnswersSaving(true)
    try {
      const list = await api.applications.prospect.saveAnswers(appId, items)
      setAnswers(list || [])
    } catch (err) {
      setAnswerError(err.message ?? 'Save failed')
    } finally {
      setAnswersSaving(false)
    }
  }

  const handleRemoveRow = (index) => {
    setAnswers((prev) => prev.filter((_, i) => i !== index))
  }

  const getDocFileUrl = (docUuid, download = false) => {
    return `/api/applications/${appUuid}/documents/${docUuid}/file${download ? '?download=true' : ''}`
  }

  return (
    <div className="application-prospect-tab">
      <p className="text-muted small mb-3">
        CV content comes from <Link to="/cvs">My CVs / CV profile</Link> (cv_experiences). Job spec from Application Details or an uploaded JD document. If you set a default cover letter in My CVs, it will be used automatically here — change it there to use a different one. Tailor to reword and adapt to the job (no faking), review changes below, then save as DOCX when happy.
      </p>

      <div className="mb-4">
        <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
          <button
            type="button"
            className="btn btn-forest"
            disabled={tailorLoading || loadingOptions}
            onClick={handleTailor}
          >
            {tailorLoading ? 'Tailoring…' : 'Tailor'}
          </button>
          <span className="text-muted small">
            Uses your CV profile & experiences and the default cover letter (set in My CVs). Change the default there to use a different cover letter.
          </span>
        </div>
        {tailorError && (
          <div className="alert alert-danger py-2 mt-2 mb-3" role="alert">
            {tailorError}
          </div>
        )}

        {tailorResult && (tailorResult.original_cv != null || tailorResult.tailored_cv || tailorResult.tailored_cover_letter) && (
          <>
            {tailorResult.original_cv != null && tailorResult.tailored_cv && (
              <div className="mb-3">
                <SimpleDiffView
                  original={tailorResult.original_cv}
                  tailored={tailorResult.tailored_cv}
                />
                <div className="mt-2 d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => copyToClipboard(tailorResult.tailored_cv)}
                  >
                    Copy tailored CV
                  </button>
                </div>
              </div>
            )}
            {tailorResult.tailored_cover_letter && (
              <div className="mb-3">
                <div className="d-flex justify-content-between align-items-center mb-1">
                  <strong className="small">Tailored cover letter</strong>
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-secondary"
                    onClick={() => copyToClipboard(tailorResult.tailored_cover_letter)}
                  >
                    Copy
                  </button>
                </div>
                <pre
                  className="bg-light border rounded p-2 small mb-0"
                  style={{ whiteSpace: 'pre-wrap', maxHeight: '15vh', overflow: 'auto' }}
                >
                  {tailorResult.tailored_cover_letter}
                </pre>
              </div>
            )}

            <div className="border rounded p-3 bg-light mb-3">
              <strong className="small d-block mb-2">Save as DOCX</strong>
              <p className="text-muted small mb-2">
                When happy with the wording, pick a template and save. DOCX will include your name and tagline; you can preview and download below.
              </p>
              <div className="d-flex flex-wrap gap-2 align-items-center">
                <label className="small mb-0">Template</label>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={cvTemplate}
                  onChange={(e) => setCvTemplate(e.target.value)}
                >
                  {templates.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={saveDocxLoading || (!tailorResult?.tailored_cv && !tailorResult?.tailored_cover_letter)}
                  onClick={handleSaveDocx}
                >
                  {saveDocxLoading ? 'Saving…' : 'Save as DOCX'}
                </button>
              </div>
              {saveDocxError && (
                <div className="alert alert-danger py-2 mt-2 mb-0 small" role="alert">
                  {saveDocxError}
                </div>
              )}
            </div>
          </>
        )}

        {tailoredDocs.length > 0 && (
          <div className="small">
            <strong>Saved DOCX</strong>
            <ul className="list-unstyled mb-0 mt-1">
              {tailoredDocs.map((d) => (
                <li key={d.uuid} className="mb-1">
                  <a
                    href={getDocFileUrl(d.uuid, false)}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Preview (opens in new tab)"
                  >
                    Preview
                  </a>
                  {' · '}
                  <a
                    href={getDocFileUrl(d.uuid, true)}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={d.filename}
                  >
                    Download
                  </a>
                  {' '}
                  {d.doc_type === 'tailored_cv' ? '(CV)' : '(cover letter)'} — {d.filename}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {showJobSpecModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add job spec</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => {
                    if (!jobSpecSaving) setShowJobSpecModal(false)
                  }}
                />
              </div>
              <div className="modal-body">
                <p className="text-muted small">
                  The job posting (opened in a new tab) is not stored automatically. Paste the relevant job description
                  text here so it can be used for tailoring and previewed as a Job description attachment.
                </p>
                <textarea
                  className="form-control"
                  rows={10}
                  value={jobSpecText}
                  onChange={(e) => setJobSpecText(e.target.value)}
                  placeholder="Paste the job spec from the job post…"
                  disabled={jobSpecSaving}
                />
                {jobSpecError && (
                  <div className="alert alert-danger py-2 mt-2 mb-0 small" role="alert">
                    {jobSpecError}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => !jobSpecSaving && setShowJobSpecModal(false)}
                  disabled={jobSpecSaving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={jobSpecSaving}
                  onClick={async () => {
                    setJobSpecError(null)
                    const text = (jobSpecText || '').trim()
                    if (!text) {
                      setJobSpecError('Paste the job spec text first.')
                      return
                    }
                    setJobSpecSaving(true)
                    try {
                      await api.applications.prospect.setJobSpec(appId, { text })
                      setHasJobDescription(true)
                      setShowJobSpecModal(false)
                      setJobSpecText('')
                      onDocumentsRefresh?.()
                    } catch (err) {
                      const msg = err.body?.detail ?? err.message ?? 'Save failed'
                      setJobSpecError(Array.isArray(msg) ? msg.join(', ') : msg)
                    } finally {
                      setJobSpecSaving(false)
                    }
                  }}
                >
                  {jobSpecSaving ? 'Saving…' : 'Save job spec'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <hr className="my-4" />

      <h3 className="h6 mb-2">Interview & application questions</h3>
      <p className="text-muted small mb-3">
        Add rows with questions and answers. Use &quot;Add from template&quot; and &quot;Generate&quot; for AI answers, or type your own. Then Save.
      </p>

      {answerError && (
        <div className="alert alert-danger py-2 mb-2" role="alert">
          {answerError}
        </div>
      )}

      <div className="mb-2 d-flex flex-wrap gap-2 align-items-center">
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={handleAddRow}>
          + Add row
        </button>
        {questions.length > 0 && (
          <div className="d-flex align-items-center gap-2" ref={dropdownRef}>
            <div className="position-relative">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary dropdown-toggle"
                onClick={() => setQuestionDropdownOpen((o) => !o)}
                aria-expanded={questionDropdownOpen}
              >
                Add from template
              </button>
              {questionDropdownOpen && (
                <div
                  className="position-absolute start-0 mt-1 border bg-white rounded shadow-lg z-3 p-2"
                  style={{ minWidth: '220px', maxHeight: '200px', overflow: 'auto' }}
                >
                  <input
                    type="text"
                    className="form-control form-control-sm mb-2"
                    placeholder="Search…"
                    value={questionSearch}
                    onChange={(e) => setQuestionSearch(e.target.value)}
                  />
                  {filteredQuestions.map((q) => (
                    <div
                      key={q.id}
                      className="list-group-item list-group-item-action small py-1 cursor-pointer"
                      onClick={() => handleAddFromQuestion(q)}
                    >
                      {q.question_text}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          className="btn btn-sm btn-primary"
          disabled={answersSaving || answers.length === 0}
          onClick={handleSaveAnswers}
        >
          {answersSaving ? 'Saving…' : 'Save answers'}
        </button>
      </div>

      {answersLoading ? (
        <p className="text-muted small">Loading…</p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm table-bordered">
            <thead>
              <tr>
                <th style={{ width: '35%' }}>Question</th>
                <th style={{ width: '60%' }}>Answer</th>
                <th style={{ width: '5%' }} />
              </tr>
            </thead>
            <tbody>
              {answers.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-muted small">
                    No questions yet. Add a row or use a template.
                  </td>
                </tr>
              ) : (
                answers.map((row, index) => (
                  <tr key={row.id ?? `new-${index}`}>
                    <td>
                      <input
                        type="text"
                        className="form-control form-control-sm"
                        value={row.question ?? ''}
                        onChange={(e) => handleAnswerChange(index, 'question', e.target.value)}
                        placeholder="Question"
                      />
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <textarea
                          className="form-control form-control-sm flex-grow-1"
                          rows={2}
                          value={row.answer ?? ''}
                          onChange={(e) => handleAnswerChange(index, 'answer', e.target.value)}
                          placeholder="Answer"
                        />
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary flex-shrink-0"
                          title="Generate answer with AI (row must match a template question)"
                          disabled={answerLoadingId !== null || !(jdText || '').trim() || !getQuestionIdForRow(row)}
                          onClick={() => handleGenerateAnswer(index)}
                        >
                          {answerLoadingId === index ? '…' : 'Generate'}
                        </button>
                      </div>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        aria-label="Remove row"
                        onClick={() => handleRemoveRow(index)}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
