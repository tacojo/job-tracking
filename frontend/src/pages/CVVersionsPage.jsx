import { useState, useEffect } from 'react'
import { api } from '../api'
import ConfirmModal from '../components/ConfirmModal'
import CoverLetterPreview from '../components/CoverLetterPreview'
import CVPreview from '../components/CVPreview'
import CVProfileSection from '../components/CVProfileSection'
import PageMessage from '../components/PageMessage'
import { useSettings } from '../contexts/SettingsContext'

export default function CVVersionsPage() {
  const { settings, setSettings } = useSettings()
  const [cvs, setCvs] = useState([])
  const [coverLetters, setCoverLetters] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingCl, setUploadingCl] = useState(false)
  const [previewCv, setPreviewCv] = useState(null)
  const [previewCl, setPreviewCl] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteClId, setDeleteClId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [cvData, clData] = await Promise.all([
        api.cvVersions.list(),
        api.coverLetters.list(),
      ])
      setCvs(cvData)
      setCoverLetters(clData)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase().slice(-4)
    if (ext !== '.pdf' && ext !== 'docx') {
      setError('Only PDF and DOCX files are allowed.')
      return
    }
    setUploading(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.cvVersions.upload(formData)
      load()
      e.target.value = ''
    } catch (err) {
      setError(err.body?.detail || err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleUploadCoverLetter = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.toLowerCase().slice(-4)
    if (ext !== '.pdf' && ext !== 'docx') {
      setError('Only PDF and DOCX files are allowed.')
      return
    }
    setUploadingCl(true)
    setError(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      await api.coverLetters.upload(formData)
      load()
      e.target.value = ''
    } catch (err) {
      setError(err.body?.detail || err.message)
    } finally {
      setUploadingCl(false)
    }
  }

  const handleDeleteClick = (id) => setDeleteId(id)
  const handleDeleteClClick = (id) => setDeleteClId(id)
  const handleDeleteConfirm = async () => {
    if (!deleteId) return
    try {
      await api.cvVersions.delete(deleteId)
      load()
      if (previewCv?.id === deleteId) setPreviewCv(null)
      setDeleteId(null)
    } catch (e) {
      setError(e.message)
      setDeleteId(null)
    }
  }
  const handleDeleteClConfirm = async () => {
    if (!deleteClId) return
    try {
      await api.coverLetters.delete(deleteClId)
      load()
      if (previewCl?.id === deleteClId) setPreviewCl(null)
      setDeleteClId(null)
    } catch (e) {
      setError(e.message)
      setDeleteClId(null)
    }
  }

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  return (
    <div>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h1 className="h4 mb-0">My CVs</h1>
        <label className="btn btn-forest mb-0">
          {uploading ? 'Uploading…' : 'Upload CV'}
          <input
            type="file"
            accept=".pdf,.docx"
            className="d-none"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
      </div>

      {error && (
        <div className="alert alert-danger mb-3" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <PageMessage variant="loading">Loading…</PageMessage>
      ) : (
        <div className="row g-3">
          {cvs.map((cv) => (
            <div key={cv.id} className="col-md-6 col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="card-title mb-1">{cv.name}</h6>
                      <p className="card-text text-muted small mb-0">
                        {cv.file_type.toUpperCase()} · {formatDate(cv.created_at)}
                      </p>
                    </div>
                    <div className="form-check ms-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`default-cv-${cv.id}`}
                        checked={settings.defaultCvId === cv.id}
                        onChange={() =>
                          setSettings({
                            defaultCvId: settings.defaultCvId === cv.id ? null : cv.id,
                          })
                        }
                      />
                      <label className="form-check-label small" htmlFor={`default-cv-${cv.id}`}>
                        Default
                      </label>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => setPreviewCv(cv)}
                    >
                      Preview
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDeleteClick(cv.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {cvs.length === 0 && !loading && (
        <p className="text-muted">No CVs yet. Upload one to get started.</p>
      )}

      {previewCv && (
        <div className="mt-4">
          <CVPreview cv={previewCv} onClose={() => setPreviewCv(null)} />
        </div>
      )}

      <hr className="my-4" />

      <CVProfileSection cvs={cvs} />

      <hr className="my-4" />

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
        <h2 className="h5 mb-0">Cover letters</h2>
        <label className="btn btn-outline-primary mb-0">
          {uploadingCl ? 'Uploading…' : 'Upload cover letter'}
          <input
            type="file"
            accept=".pdf,.docx"
            className="d-none"
            onChange={handleUploadCoverLetter}
            disabled={uploadingCl}
          />
        </label>
      </div>

      <p className="text-muted small">Upload PDF or DOCX to store and preview your cover letters.</p>

      {!loading && (
        <div className="row g-3 mb-4">
          {coverLetters.map((cl) => (
            <div key={cl.id} className="col-md-6 col-lg-4">
              <div className="card h-100">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-start mb-2">
                    <div>
                      <h6 className="card-title mb-1">{cl.name}</h6>
                      <p className="card-text text-muted small mb-0">
                        {cl.file_type?.toUpperCase() ?? 'FILE'} · {formatDate(cl.created_at)}
                      </p>
                    </div>
                    <div className="form-check ms-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id={`default-cl-${cl.id}`}
                        checked={settings.defaultCoverLetterId === cl.id}
                        onChange={() =>
                          setSettings({
                            defaultCoverLetterId:
                              settings.defaultCoverLetterId === cl.id ? null : cl.id,
                          })
                        }
                      />
                      <label className="form-check-label small" htmlFor={`default-cl-${cl.id}`}>
                        Default
                      </label>
                    </div>
                  </div>
                  <div className="d-flex gap-2">
                    <button
                      className="btn btn-sm btn-outline-primary"
                      onClick={() => setPreviewCl(cl)}
                    >
                      Preview
                    </button>
                    <button
                      className="btn btn-sm btn-outline-danger"
                      onClick={() => handleDeleteClClick(cl.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {coverLetters.length === 0 && !loading && (
        <p className="text-muted">No cover letters yet. Upload one to get started.</p>
      )}

      {previewCl && (
        <div className="mt-4">
          <CoverLetterPreview coverLetter={previewCl} onClose={() => setPreviewCl(null)} />
        </div>
      )}

      <ConfirmModal
        show={!!deleteId}
        title="Delete CV"
        message="Are you sure you want to delete this CV? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
      <ConfirmModal
        show={!!deleteClId}
        title="Delete cover letter"
        message="Are you sure you want to delete this cover letter? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteClConfirm}
        onCancel={() => setDeleteClId(null)}
      />
    </div>
  )
}
