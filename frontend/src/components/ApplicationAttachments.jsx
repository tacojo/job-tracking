import { useState, useCallback, useEffect } from 'react'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import DocumentPreview from './DocumentPreview'

const DOC_TYPE_LABELS = {
  cv: 'CV',
  cover_letter: 'Cover letter',
  jd: 'Job description',
  test: 'Take-home test',
  other: 'Other',
  tailored_cv: 'Tailored CV',
  tailored_cover_letter: 'Tailored cover letter',
}

function formatDate(d) {
  return d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function ApplicationAttachments({
  appId,
  documents = [],
  onRefresh,
  jobUrl: jobUrlProp,
  onJobUrlSave,
}) {
  const { settings } = useSettings()
  const mask = settings.maskSensitive
  const showJobUrl = jobUrlProp !== undefined && typeof onJobUrlSave === 'function'
  const [jobUrlDraft, setJobUrlDraft] = useState(jobUrlProp ?? '')
  const [jobUrlSaving, setJobUrlSaving] = useState(false)

  useEffect(() => {
    setJobUrlDraft(jobUrlProp ?? '')
  }, [jobUrlProp])

  const [uploading, setUploading] = useState(null)
  const [replacing, setReplacing] = useState(null)
  const [error, setError] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)

  const handleUpload = async (docType, e) => {
    const file = e?.target?.files?.[0]
    if (!file) return
    setError(null)
    setUploading(docType)
    try {
      await api.applications.documents.upload(appId, docType, file)
      onRefresh?.()
    } catch (err) {
      setError(err.message || 'Upload failed')
    } finally {
      setUploading(null)
      e.target.value = ''
    }
  }

  const handleReplace = async (docUuid, docType, e) => {
    const file = e?.target?.files?.[0]
    if (!file) return
    setError(null)
    setReplacing(docUuid)
    try {
      await api.applications.documents.replace(appId, docUuid, file)
      onRefresh?.()
    } catch (err) {
      setError(err.message || 'Replace failed')
    } finally {
      setReplacing(null)
      e.target.value = ''
    }
  }

  const handleDelete = async (docUuid) => {
    if (!confirm('Delete this document?')) return
    setError(null)
    try {
      await api.applications.documents.delete(appId, docUuid)
      onRefresh?.()
    } catch (err) {
      setError(err.message || 'Delete failed')
    }
  }

  const getPreviewBlob = useCallback(
    () => api.applications.documents.getFile(appId, previewDoc?.uuid, false),
    [appId, previewDoc?.uuid]
  )

  const handleDownload = async (docUuid, filename) => {
    setError(null)
    try {
      const blob = await api.applications.documents.getFile(appId, docUuid, true)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || 'download'
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message || 'Download failed')
    }
  }

  // Group by doc_type, then by version
  const byType = {}
  for (const d of documents) {
    if (!byType[d.doc_type]) byType[d.doc_type] = []
    byType[d.doc_type].push(d)
  }
  for (const arr of Object.values(byType)) {
    arr.sort((a, b) => b.version - a.version)
  }

  const handleSaveJobUrl = async () => {
    if (!showJobUrl) return
    setJobUrlSaving(true)
    try {
      await onJobUrlSave((jobUrlDraft || '').trim() || null)
    } finally {
      setJobUrlSaving(false)
    }
  }

  return (
    <div>
      {showJobUrl && (
        <div className="mb-4 pb-3 border-bottom">
          <label className="form-label" htmlFor="attachments-job-url">
            Job URL (optional)
          </label>
          <div className="input-group">
            <input
              id="attachments-job-url"
              type={mask ? 'text' : 'url'}
              className="form-control"
              value={mask ? maskText(jobUrlDraft) : jobUrlDraft}
              onChange={(e) => !mask && setJobUrlDraft(e.target.value)}
              readOnly={mask}
              placeholder="https://..."
            />
            {jobUrlDraft?.trim() && !mask && (
              <a
                className="btn btn-outline-secondary"
                href={jobUrlDraft}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open job URL in new tab"
              >
                Open
              </a>
            )}
            {!mask && (
              <button
                type="button"
                className="btn btn-forest"
                disabled={jobUrlSaving || (jobUrlDraft || '').trim() === (jobUrlProp || '').trim()}
                onClick={handleSaveJobUrl}
              >
                {jobUrlSaving ? 'Saving…' : 'Save URL'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="d-flex justify-content-between align-items-center mb-2">
        <strong>Attachments</strong>
        <div className="btn-group btn-group-sm">
          {['cv', 'cover_letter', 'jd', 'test'].map((docType) => (
            <label key={docType} className="btn btn-outline-primary mb-0">
              {uploading === docType ? 'Uploading…' : `Upload ${DOC_TYPE_LABELS[docType]}`}
              <input
                type="file"
                className="d-none"
                accept=".pdf,.docx,.doc,.txt,.zip"
                onChange={(e) => handleUpload(docType, e)}
                disabled={!!uploading}
              />
            </label>
          ))}
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2">{error}</div>
      )}

      {documents.length === 0 ? (
        <p className="text-muted small mb-0">No attachments yet. Upload a CV, cover letter, JD, or test.</p>
      ) : (
        <ul className="list-group list-group-flush">
          {Object.entries(byType).map(([docType, docs]) => (
            <li key={docType} className="list-group-item px-0">
              <span className="fw-semibold small text-muted">{DOC_TYPE_LABELS[docType] ?? docType}</span>
              <ul className="list-unstyled mb-0 mt-1">
                {docs.map((doc) => {
                  const showFilename = mask && doc.doc_type !== 'cv' ? maskText(doc.filename || '') : (doc.filename || '')
                  return (
                  <li key={doc.uuid} className="d-flex align-items-center gap-2 py-1">
                    <span className="small">
                      {showFilename}
                      {doc.version > 1 && <span className="text-muted"> v{doc.version}</span>}
                      {doc.created_at && (
                        <span className="text-muted ms-1"> ({formatDate(doc.created_at)})</span>
                      )}
                    </span>
                    <div className="btn-group btn-group-sm ms-auto">
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => setPreviewDoc(doc)}
                      >
                        Preview
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary btn-sm"
                        onClick={() => handleDownload(doc.uuid, doc.filename)}
                      >
                        Download
                      </button>
                      <label className="btn btn-outline-secondary btn-sm mb-0">
                        {replacing === doc.uuid ? 'Replace…' : 'Replace'}
                        <input
                          type="file"
                          className="d-none"
                          accept=".pdf,.docx,.doc,.txt,.zip"
                          onChange={(e) => handleReplace(doc.uuid, docType, e)}
                          disabled={!!replacing}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn btn-outline-danger btn-sm"
                        onClick={() => handleDelete(doc.uuid)}
                      >
                        Delete
                      </button>
                    </div>
                  </li>
                )})}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {previewDoc && (
        <div className="mt-4">
          <DocumentPreview
            doc={previewDoc}
            getBlob={getPreviewBlob}
            onClose={() => setPreviewDoc(null)}
          />
        </div>
      )}
    </div>
  )
}
