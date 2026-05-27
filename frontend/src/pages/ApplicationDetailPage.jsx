import { useEffect, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { api } from '../api'
import ApplicationAttachments from '../components/ApplicationAttachments'
import { NotesSection } from '../components/ApplicationForm'
import ApplicationProspectTab from '../components/ApplicationProspectTab'
import ConfirmModal from '../components/ConfirmModal'
import PageMessage from '../components/PageMessage'
import StageList from '../components/StageList'
import SwotAnalysis from '../components/SwotAnalysis'
import { CalendarLinkButton, SectionCard } from '../components/ui'
import { faChevronLeft, faChevronRight } from '../components/ui/icons'
import { useDisplayText } from '../hooks/useDisplayText'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'

export default function ApplicationDetailPage() {
  const { id: appId } = useParams()
  const navigate = useNavigate()
  const [app, setApp] = useState(null)
  const [appsList, setAppsList] = useState([])
  const [documents, setDocuments] = useState([])
  const [recruiterLink, setRecruiterLink] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [stageExpandedId, setStageExpandedId] = useState(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [mainTab, setMainTab] = useState('prospect') // 'prospect' | 'swot' | 'stages' | 'notes'
  const [showJobSpecModal, setShowJobSpecModal] = useState(false)
  const [jobSpecText, setJobSpecText] = useState('')
  const [jobSpecSaving, setJobSpecSaving] = useState(false)
  const [jobSpecError, setJobSpecError] = useState(null)
  const [hasStages, setHasStages] = useState(false)

  const load = async () => {
    if (!appId) return
    setLoading(true)
    setError(null)
    try {
      const [data, docs, list] = await Promise.all([
        api.applications.get(appId),
        api.applications.documents.list(appId),
        api.applications.list(),
      ])
      setApp(data)
      setDocuments(docs)
      setAppsList(list)
      
      // Check if there are stages (use numeric ID from app data)
      try {
        const stages = await api.stages.list(data.id)
        setHasStages(stages && stages.length > 0)
      } catch {
        setHasStages(false)
      }
      if (data.recruiter) {
        try {
          const res = await api.recruiters.list({ page: 1, page_size: 100 })
          const recruiters = res?.items || []
          const match = recruiters.find((r) => r.name === data.recruiter)
          setRecruiterLink(match?.link || null)
        } catch {
          setRecruiterLink(null)
        }
      } else {
        setRecruiterLink(null)
      }
    } catch (e) {
      setError(e.message || 'Failed to load application')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [appId])

  useEffect(() => {
    // Reset stage expansion when navigating to a different application;
    // StageList will auto-expand the latest stage for that application.
    setStageExpandedId(null)
  }, [app?.id])

  useEffect(() => {
    if (hasStages) {
      setMainTab('stages')
    } else {
      setMainTab('prospect')
    }
  }, [app?.id, hasStages])

  /** Refetch only the current application (e.g. after stage edit). No loading state, no full reload. */
  const refetchApplication = async () => {
    if (!appId) return
    try {
      const data = await api.applications.get(appId)
      setApp(data)
    } catch {
      // ignore; keep current app state
    }
  }

  const handleDeleteClick = () => setShowDeleteConfirm(true)
  const handleDeleteConfirm = async () => {
    setShowDeleteConfirm(false)
    await api.applications.delete(app.uuid)
    navigate('/applications')
  }

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : ''

  const displayCompany = useDisplayText(app?.company)
  const displayRole = useDisplayText(app?.role)
  const displayRecruiter = useDisplayText(app?.recruiter)
  const { settings } = useSettings()

  if (loading) return <PageMessage variant="loading">Loading…</PageMessage>
  if (error) return <PageMessage variant="danger" title="Error">{error}</PageMessage>
  if (!app) return null

  const appsByScheduledAt = [...appsList].sort((a, b) => {
    const aT = a.latest_stage_at ? new Date(a.latest_stage_at).getTime() : (a.updated_at ? new Date(a.updated_at).getTime() : 0)
    const bT = b.latest_stage_at ? new Date(b.latest_stage_at).getTime() : (b.updated_at ? new Date(b.updated_at).getTime() : 0)
    return bT - aT
  })
  const currentIndex = appsByScheduledAt.findIndex((a) => a.uuid === app.uuid)
  const prevApp = currentIndex > 0 ? appsByScheduledAt[currentIndex - 1] : null
  const nextApp = currentIndex >= 0 && currentIndex < appsByScheduledAt.length - 1 ? appsByScheduledAt[currentIndex + 1] : null

  return (
    <div>
      <div className="mb-2">
        <nav aria-label="breadcrumb" className="min-w-0">
          <ol className="breadcrumb mb-0 fs-5">
            <li className="breadcrumb-item">
              <Link to="/applications" className="text-decoration-none">
                Applications
              </Link>
            </li>
            <li className="breadcrumb-item active" aria-current="page">
              <Link
                to={app.company_id ? `/companies/${app.company_id}` : '#'}
                className="text-decoration-none text-body fw-semibold"
              >
                {displayCompany}
              </Link>
              <span className="text-body-secondary fw-normal"> — {displayRole}</span>
            </li>
          </ol>
        </nav>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        {app.recruiter ? (
          <span className="text-body-secondary small">Recruiter: {displayRecruiter}</span>
        ) : null}
        <span className="text-body-secondary small">Updated: {formatDate(app.updated_at)}</span>
        <CalendarLinkButton className="ms-auto" />
      </div>

      {(prevApp || nextApp) && (
        <div className="d-flex justify-content-between align-items-center mb-4">
          {prevApp ? (
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
              style={{ minWidth: '6rem' }}
              onClick={() => navigate(`/applications/${prevApp.uuid}`)}
              title={`Previous: ${prevApp.company} — ${prevApp.role}`}
            >
              <FontAwesomeIcon icon={faChevronLeft} aria-hidden />
              Prev
            </button>
          ) : (
            <span />
          )}
          {nextApp ? (
            <button
              type="button"
              className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
              style={{ minWidth: '6rem' }}
              onClick={() => navigate(`/applications/${nextApp.uuid}`)}
              title={`Next: ${nextApp.company} — ${nextApp.role}`}
            >
              Next
              <FontAwesomeIcon icon={faChevronRight} aria-hidden />
            </button>
          ) : (
            <span />
          )}
        </div>
      )}

      <SectionCard
        header={
          <ul className="nav nav-tabs card-header-tabs mb-0">
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${mainTab === 'prospect' ? 'active' : ''}`}
                onClick={() => setMainTab('prospect')}
              >
                Prospect
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${mainTab === 'swot' ? 'active' : ''}`}
                onClick={() => setMainTab('swot')}
              >
                SWOT Analysis
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${mainTab === 'stages' ? 'active' : ''}`}
                onClick={() => setMainTab('stages')}
              >
                Stages
              </button>
            </li>
            <li className="nav-item">
              <button
                type="button"
                className={`nav-link ${mainTab === 'notes' ? 'active' : ''}`}
                onClick={() => setMainTab('notes')}
              >
                Notes
              </button>
            </li>
          </ul>
        }
      >
        {mainTab === 'prospect' ? (
          <ApplicationProspectTab
            appId={app.uuid}
            appUuid={app.uuid}
            jdText={app.jd_text}
            jobUrl={app.job_url}
            documents={documents}
            onDocumentsRefresh={() => api.applications.documents.list(appId).then(setDocuments)}
          />
        ) : mainTab === 'swot' ? (
          <SwotAnalysis appId={app.uuid} />
        ) : mainTab === 'stages' ? (
          <StageList
            applicationId={app.id}
            onUpdate={refetchApplication}
            expandedId={stageExpandedId}
            onExpandedChange={setStageExpandedId}
            recruiterName={app.recruiter}
            recruiterLink={recruiterLink}
          />
        ) : (
          <NotesSection
            notesLog={app.notes_log || []}
            onAddNote={async (text) => {
              const updated = await api.applications.addNote(app.uuid, text)
              setApp(updated)
            }}
            mask={settings.maskSensitive}
            maskText={maskText}
          />
        )}
      </SectionCard>

      <SectionCard
        title="Application attachments"
        headerAside={
          <button
            type="button"
            className="btn btn-sm btn-outline-primary"
            onClick={() => {
              setJobSpecText(app.jd_text || '')
              setJobSpecError(null)
              setShowJobSpecModal(true)
            }}
          >
            Add job description
          </button>
        }
      >
        <ApplicationAttachments
          appId={app.uuid}
          documents={documents}
          jobUrl={app.job_url}
          onJobUrlSave={async (url) => {
            const updated = await api.applications.update(app.uuid, { job_url: url })
            setApp(updated)
          }}
          onRefresh={() => api.applications.documents.list(appId).then(setDocuments)}
        />
      </SectionCard>

      <div className="danger-panel">
        <div className="d-flex flex-column flex-md-row align-items-md-center justify-content-between gap-3">
          <div>
            <div className="danger-panel__title mb-1">Delete application</div>
            <p className="text-body-secondary small mb-0">
              Permanently delete this application and its related data. You cannot undo this action.
            </p>
          </div>
          <button type="button" className="btn btn-outline-danger btn-sm flex-shrink-0" onClick={handleDeleteClick}>
            Delete application
          </button>
        </div>
      </div>

      {showJobSpecModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Add job description</h5>
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
                  Paste the job description text here. It will be saved to this application and also created as a
                  Job description attachment so you can preview it later.
                </p>
                <textarea
                  className="form-control"
                  rows={10}
                  value={jobSpecText}
                  onChange={(e) => setJobSpecText(e.target.value)}
                  placeholder="Paste the job description…"
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
                    const text = (jobSpecText || '').trim()
                    if (!text) {
                      setJobSpecError('Paste the job description text first.')
                      return
                    }
                    setJobSpecError(null)
                    setJobSpecSaving(true)
                    try {
                      await api.applications.prospect.setJobSpec(app.uuid, { text })
                      setShowJobSpecModal(false)
                      setJobSpecText('')
                      await Promise.all([
                        api.applications.get(appId).then(setApp),
                        api.applications.documents.list(appId).then(setDocuments),
                      ])
                    } catch (err) {
                      const msg = err.body?.detail ?? err.message ?? 'Save failed'
                      setJobSpecError(Array.isArray(msg) ? msg.join(', ') : msg)
                    } finally {
                      setJobSpecSaving(false)
                    }
                  }}
                >
                  {jobSpecSaving ? 'Saving…' : 'Save job description'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        show={showDeleteConfirm}
        title="Delete application"
        message="Are you sure you want to delete this application? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setShowDeleteConfirm(false)}
      />
    </div>
  )
}
