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
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [uploadingCl, setUploadingCl] = useState(false)
  const [previewCv, setPreviewCv] = useState(null)
  const [previewCl, setPreviewCl] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [deleteClId, setDeleteClId] = useState(null)
  const [expandedProjects, setExpandedProjects] = useState(new Set())
  const [showProjectModal, setShowProjectModal] = useState(false)
  const [editingProject, setEditingProject] = useState(null)
  const [projectForm, setProjectForm] = useState({ title: '', description: '' })
  const [deleteProjectId, setDeleteProjectId] = useState(null)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const [cvData, clData, projectData] = await Promise.all([
        api.cvVersions.list(),
        api.coverLetters.list(),
        api.projects.list(),
      ])
      setCvs(cvData)
      setCoverLetters(clData)
      setProjects(projectData)
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

  const toggleProject = (projectId) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) {
        next.delete(projectId)
      } else {
        next.add(projectId)
      }
      return next
    })
  }

  const handleAddProject = () => {
    setEditingProject(null)
    setProjectForm({ title: '', description: '' })
    setShowProjectModal(true)
  }

  const handleEditProject = (project, e) => {
    e.stopPropagation()
    setEditingProject(project)
    setProjectForm({ title: project.title, description: project.description })
    setShowProjectModal(true)
  }

  const handleDeleteProjectClick = (projectId, e) => {
    e.stopPropagation()
    setDeleteProjectId(projectId)
  }

  const handleSaveProject = async () => {
    if (!projectForm.title.trim() || !projectForm.description.trim()) {
      setError('Title and description are required')
      return
    }

    try {
      if (editingProject) {
        await api.projects.update(editingProject.id, projectForm)
      } else {
        await api.projects.create(projectForm)
      }
      load()
      setShowProjectModal(false)
      setProjectForm({ title: '', description: '' })
      setEditingProject(null)
    } catch (e) {
      setError(e.body?.detail || e.message)
    }
  }

  const handleDeleteProjectConfirm = async () => {
    if (!deleteProjectId) return
    try {
      await api.projects.delete(deleteProjectId)
      load()
      if (expandedProjects.has(deleteProjectId)) {
        setExpandedProjects((prev) => {
          const next = new Set(prev)
          next.delete(deleteProjectId)
          return next
        })
      }
      setDeleteProjectId(null)
    } catch (e) {
      setError(e.message)
      setDeleteProjectId(null)
    }
  }

  return (
    <div className="cvs-page">
      {error && (
        <div className="alert alert-danger mb-3" role="alert">
          {error}
        </div>
      )}

      <section className="cvs-page-section" aria-labelledby="cvs-section-title">
        <div className="cvs-page-section-header">
          <h1 id="cvs-section-title" className="h4">
            My CVs
          </h1>
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
                        className="btn btn-sm btn-forest"
                        type="button"
                        onClick={() => setPreviewCv(cv)}
                      >
                        Preview
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        type="button"
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
          <p className="text-muted mb-0">No CVs yet. Upload one to get started.</p>
        )}

        {previewCv && (
          <div className="mt-4">
            <CVPreview cv={previewCv} onClose={() => setPreviewCv(null)} />
          </div>
        )}
      </section>

      <section className="cvs-page-section" aria-labelledby="cover-letters-section-title">
        <div className="cvs-page-section-header">
          <h2 id="cover-letters-section-title" className="h5 mb-0">
            Cover letters
          </h2>
          <label className="btn btn-forest mb-0">
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

        <p className="text-muted small mb-3">Upload PDF or DOCX to store and preview your cover letters.</p>

        {!loading && (
          <div className="row g-3">
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
                        className="btn btn-sm btn-forest"
                        type="button"
                        onClick={() => setPreviewCl(cl)}
                      >
                        Preview
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        type="button"
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
          <p className="text-muted mb-0">No cover letters yet. Upload one to get started.</p>
        )}

        {previewCl && (
          <div className="mt-4">
            <CoverLetterPreview coverLetter={previewCl} onClose={() => setPreviewCl(null)} />
          </div>
        )}
      </section>

      <section className="cvs-page-section" aria-labelledby="projects-section-title">
        <div className="cvs-page-section-header">
          <h2 id="projects-section-title" className="h5 mb-0">
            Projects
          </h2>
          <button className="btn btn-forest mb-0" type="button" onClick={handleAddProject}>
            Add Project
          </button>
        </div>

        <p className="text-muted small mb-3">Key projects I&apos;ve worked on throughout my career.</p>

        {!loading && projects.length === 0 && (
          <p className="text-muted mb-0">No projects yet. Add one to get started.</p>
        )}

        <div className="row g-3 mb-0">
          {projects.map((project) => (
          <div key={project.id} className="col-12">
            <div className="card">
              <div
                className="card-header bg-white d-flex justify-content-between align-items-center"
                style={{ cursor: 'pointer' }}
                onClick={() => toggleProject(project.id)}
              >
                <h6 className="mb-0 me-2">{project.title}</h6>
                <span className="text-muted d-inline-flex align-items-center flex-shrink-0" aria-hidden>
                  {expandedProjects.has(project.id) ? (
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                      <path
                        fillRule="evenodd"
                        d="M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z"
                      />
                    </svg>
                  ) : (
                    <svg width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                      <path
                        fillRule="evenodd"
                        d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"
                      />
                    </svg>
                  )}
                </span>
              </div>
              {expandedProjects.has(project.id) && (
                <div className="card-body">
                  <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
                    {project.description}
                  </p>
                  <div className="d-flex justify-content-end gap-2 mt-3 pt-3 border-top">
                    <button
                      type="button"
                      className="btn btn-sm btn-forest"
                      onClick={(e) => handleEditProject(project, e)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-danger"
                      onClick={(e) => handleDeleteProjectClick(project.id, e)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      </section>

      <section className="cvs-page-section" aria-labelledby="cv-profile-heading">
        <CVProfileSection cvs={cvs} />
      </section>

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
      <ConfirmModal
        show={!!deleteProjectId}
        title="Delete project"
        message="Are you sure you want to delete this project? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteProjectConfirm}
        onCancel={() => setDeleteProjectId(null)}
      />

      {showProjectModal && (
        <div className="modal show d-block" tabIndex="-1" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-lg">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{editingProject ? 'Edit Project' : 'Add Project'}</h5>
                <button
                  type="button"
                  className="btn-close"
                  onClick={() => setShowProjectModal(false)}
                />
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Title</label>
                  <input
                    type="text"
                    className="form-control"
                    value={projectForm.title}
                    onChange={(e) => setProjectForm({ ...projectForm, title: e.target.value })}
                    placeholder="e.g., AI Agent Infrastructure on GCP"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows="6"
                    value={projectForm.description}
                    onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                    placeholder="Describe the project in detail..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowProjectModal(false)}
                >
                  Cancel
                </button>
                <button type="button" className="btn btn-forest" onClick={handleSaveProject}>
                  {editingProject ? 'Update' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
