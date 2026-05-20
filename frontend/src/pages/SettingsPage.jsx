import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import TypedConfirmModal from '../components/TypedConfirmModal'
import { PageHeader } from '../components/ui'

const CONFIRM_PURGE_PHRASE = 'PURGE DELETED APPLICATIONS'
const CONFIRM_CLEAR_LEARNING_PHRASE = 'CLEAR ALL LEARNING DATA'
const CONFIRM_RESET_PHRASE = 'DELETE ALL MY DATA'

const AI_PROMPT_LABELS = {
  tailor_cv: 'Tailor CV (system prompt)',
  tailor_cover_letter: 'Tailor cover letter (system prompt)',
  prospect_answer: 'Prospect answer (interview-style answers, system prompt)',
  learning_ask: 'Learning — Ask AI (tutor, system prompt)',
  learning_generate_flashcards:
    'Learning — Generate flashcards (JSON instruction, system prompt)',
  learning_refresh_flashcard:
    'Learning — Refresh one flashcard (JSON instruction, system prompt)',
  learning_refresh_note:
    'Learning — Refresh one note (JSON instruction, system prompt)',
  learning_extract_concepts:
    'Learning — Extract concepts & links (JSON instruction, system prompt)',
}

function parseTags(str) {
  if (!str || typeof str !== 'string') return []
  return str
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

function tagsToStr(arr) {
  return Array.isArray(arr) ? arr.join(', ') : ''
}

const PRESET_COLORS = [
  { name: 'Forest green', value: '#228b22' },
  { name: 'Blue', value: '#0d6efd' },
  { name: 'Teal', value: '#20c997' },
  { name: 'Purple', value: '#6f42c1' },
  { name: 'Orange', value: '#fd7e14' },
]

const FONT_OPTIONS = [
  { name: 'System default', value: 'system-ui' },
  { name: 'Inter', value: '"Inter", sans-serif' },
  { name: 'Georgia', value: 'Georgia, serif' },
  { name: 'Monospace', value: '"SF Mono", Monaco, monospace' },
]

export default function SettingsPage() {
  const { settings, setSettings } = useSettings()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showPurgeModal, setShowPurgeModal] = useState(false)
  const [showClearLearningModal, setShowClearLearningModal] = useState(false)
  const [showResetModal, setShowResetModal] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [clearingLearning, setClearingLearning] = useState(false)
  const [purging, setPurging] = useState(false)
  const [softDeletedCount, setSoftDeletedCount] = useState(null)
  const [showSoftDeletedListModal, setShowSoftDeletedListModal] = useState(false)
  const [softDeletedItems, setSoftDeletedItems] = useState([])
  const [softDeletedListLoading, setSoftDeletedListLoading] = useState(false)

  const [aiModel, setAiModel] = useState('')
  const [aiPrompts, setAiPrompts] = useState({
    tailor_cv: '',
    tailor_cover_letter: '',
    prospect_answer: '',
    learning_ask: '',
    learning_generate_flashcards: '',
    learning_refresh_flashcard: '',
    learning_refresh_note: '',
    learning_extract_concepts: '',
  })
  const [aiLoading, setAiLoading] = useState(true)
  const [aiSaving, setAiSaving] = useState(false)
  const [aiSaveMessage, setAiSaveMessage] = useState(null)

  useEffect(() => {
    let cancelled = false
    setAiLoading(true)
    api.settings.ai.get()
      .then((data) => {
        if (!cancelled && data) {
          setAiModel(data.model ?? '')
          setAiPrompts(data.prompts ?? {
            tailor_cv: '',
            tailor_cover_letter: '',
            prospect_answer: '',
            learning_ask: '',
            learning_generate_flashcards: '',
            learning_refresh_flashcard: '',
            learning_refresh_note: '',
            learning_extract_concepts: '',
          })
        }
      })
      .catch(() => {
        if (!cancelled) setAiPrompts({
          tailor_cv: '',
          tailor_cover_letter: '',
          prospect_answer: '',
          learning_ask: '',
          learning_generate_flashcards: '',
          learning_refresh_flashcard: '',
          learning_refresh_note: '',
          learning_extract_concepts: '',
        })
      })
      .finally(() => {
        if (!cancelled) setAiLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const handleSaveAiPrompts = () => {
    setAiSaveMessage(null)
    setAiSaving(true)
    api.settings.ai.update({ prompts: aiPrompts })
      .then((data) => {
        if (data?.prompts) setAiPrompts(data.prompts)
        setAiSaveMessage('Saved.')
      })
      .catch((err) => setAiSaveMessage(err.message || 'Save failed'))
      .finally(() => setAiSaving(false))
  }

  useEffect(() => {
    api.reset
      .softDeletedCount()
      .then((r) => setSoftDeletedCount(typeof r?.count === 'number' ? r.count : 0))
      .catch(() => setSoftDeletedCount(null))
  }, [])

  const loadSoftDeletedList = () => {
    setSoftDeletedListLoading(true)
    api.reset
      .softDeletedList()
      .then((r) => setSoftDeletedItems(Array.isArray(r?.items) ? r.items : []))
      .catch(() => setSoftDeletedItems([]))
      .finally(() => setSoftDeletedListLoading(false))
  }

  const openSoftDeletedListModal = () => {
    setShowSoftDeletedListModal(true)
    loadSoftDeletedList()
  }

  const formatDeletedAt = (iso) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    } catch {
      return iso
    }
  }

  const handlePurgeSoftDeleted = async () => {
    setPurging(true)
    try {
      const res = await api.reset.purgeSoftDeleted()
      setShowPurgeModal(false)
      const n = res?.purged_count ?? 0
      alert(n === 0 ? 'No soft-deleted applications to remove.' : `Permanently removed ${n} application(s).`)
      const c = await api.reset.softDeletedCount().catch(() => null)
      setSoftDeletedCount(typeof c?.count === 'number' ? c.count : 0)
      setShowSoftDeletedListModal(false)
      setSoftDeletedItems([])
    } catch (err) {
      console.error('Purge failed:', err)
      alert(err.message || 'Purge failed')
    } finally {
      setPurging(false)
    }
  }

  const handleClearLearning = async () => {
    setClearingLearning(true)
    try {
      const res = await api.reset.clearLearning()
      setShowClearLearningModal(false)
      queryClient.invalidateQueries()
      alert(res?.message || 'Learning centre data was deleted.')
    } catch (err) {
      console.error('Clear learning failed:', err)
      alert(err.message || 'Clear learning failed')
    } finally {
      setClearingLearning(false)
    }
  }

  const handleReset = async () => {
    setResetting(true)
    try {
      const res = await api.reset.all()
      setShowResetModal(false)
      queryClient.invalidateQueries()
      let msg = res?.message || 'Reset complete.'
      if (res?.backup?.absolute_path) {
        msg += `\n\nA copy of your SQLite database was saved before wiping data:\n${res.backup.absolute_path}\n\n(Also relative to the server process: ${res.backup.path})`
      } else {
        msg += '\n\nNo local SQLite backup was created (database may not be file-based SQLite, or the DB file was not found).'
      }
      alert(msg)
      navigate('/')
    } catch (err) {
      console.error('Reset failed:', err)
      alert(err.message || 'Reset failed')
    } finally {
      setResetting(false)
    }
  }

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="card mb-4">
        <div className="card-header">
          <strong>AI settings</strong>
        </div>
        <div className="card-body">
          <div className="mb-3">
            <label className="form-label text-muted small">Model (read-only)</label>
            <input
              type="text"
              className="form-control bg-light"
              value={aiLoading ? '…' : aiModel}
              readOnly
              disabled
              aria-label="AI model"
            />
          </div>
          {!aiLoading && (
            <>
              {Object.entries(AI_PROMPT_LABELS).map(([key, label]) => (
                <div key={key} className="mb-3">
                  <label className="form-label">{label}</label>
                  <textarea
                    className="form-control font-monospace small"
                    rows={3}
                    value={aiPrompts[key] ?? ''}
                    onChange={(e) => setAiPrompts((p) => ({ ...p, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className="d-flex align-items-center gap-2">
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={aiSaving}
                  onClick={handleSaveAiPrompts}
                >
                  {aiSaving ? 'Saving…' : 'Save'}
                </button>
                {aiSaveMessage && (
                  <span className="small text-muted">{aiSaveMessage}</span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="row g-4 mb-4">
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header">
              <strong>Appearance</strong>
            </div>
            <div className="card-body">
          <div className="mb-4">
            <label className="form-label">Developer / demo mode</label>
            <div className="form-check">
              <input
                type="checkbox"
                className="form-check-input"
                id="maskSensitive"
                checked={settings.maskSensitive}
                onChange={(e) => setSettings({ maskSensitive: e.target.checked })}
              />
              <label className="form-check-label" htmlFor="maskSensitive">
                Mask sensitive data (company names, recruiters, etc.) for sharing screenshots with hiring managers
              </label>
            </div>
            {settings.maskSensitive && (
              <p className="small text-muted mt-1 mb-0">
                Example: &quot;John Doe&quot; → &quot;{maskText('John Doe')}&quot;
              </p>
            )}
          </div>

          <div className="mb-4">
            <label className="form-label">Accent colour</label>
            <div className="d-flex flex-wrap gap-2 align-items-center mb-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className="btn btn-sm"
                  style={{
                    backgroundColor: c.value,
                    color: '#fff',
                    border: settings.accentColor === c.value ? '3px solid #333' : '1px solid #dee2e6',
                  }}
                  onClick={() => setSettings({ accentColor: c.value })}
                  title={c.name}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <div className="d-flex align-items-center gap-2">
              <input
                type="color"
                className="form-control form-control-color"
                value={settings.accentColor}
                onChange={(e) => setSettings({ accentColor: e.target.value })}
                style={{ width: 48, height: 38 }}
              />
              <span className="small text-muted">{settings.accentColor}</span>
            </div>
          </div>

          <div>
            <label className="form-label">Font</label>
            <select
              className="form-select"
              value={settings.fontFamily}
              onChange={(e) => setSettings({ fontFamily: e.target.value })}
            >
              {FONT_OPTIONS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
            </div>
          </div>
        </div>
        <div className="col-lg-6">
          <div className="card h-100">
            <div className="card-header">
              <strong>Job preferences</strong>
            </div>
            <div className="card-body">
          <div className="mb-4">
            <label className="form-label">Preferred job titles</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Data Engineer, Analytics Engineer, ML Engineer"
              value={tagsToStr(settings.preferredJobTitles)}
              onChange={(e) => setSettings({ preferredJobTitles: parseTags(e.target.value) })}
            />
            <small className="text-muted">Comma-separated</small>
          </div>

          <div className="mb-4">
            <label className="form-label">Skills stack</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. dbt, BigQuery, Airflow, Python, Snowflake"
              value={tagsToStr(settings.skillsStack)}
              onChange={(e) => setSettings({ skillsStack: parseTags(e.target.value) })}
            />
            <small className="text-muted">Comma-separated</small>
          </div>

          <div className="mb-4">
            <label className="form-label">Location / remote preference</label>
            <input
              type="text"
              className="form-control"
              placeholder="e.g. Remote, Hybrid, London, Berlin"
              value={settings.locationPreference || ''}
              onChange={(e) => setSettings({ locationPreference: e.target.value })}
            />
          </div>

          <div>
            <label className="form-label">Salary range (annual)</label>
            <div className="row g-2">
              <div className="col">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Min"
                  min={0}
                  step={1000}
                  value={settings.salaryRange?.min ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setSettings({
                      salaryRange: {
                        ...(settings.salaryRange || {}),
                        min: v === '' ? null : parseInt(v, 10),
                      },
                    })
                  }}
                />
              </div>
              <div className="col-auto align-self-center">–</div>
              <div className="col">
                <input
                  type="number"
                  className="form-control"
                  placeholder="Max"
                  min={0}
                  step={1000}
                  value={settings.salaryRange?.max ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setSettings({
                      salaryRange: {
                        ...(settings.salaryRange || {}),
                        max: v === '' ? null : parseInt(v, 10),
                      },
                    })
                  }}
                />
              </div>
            </div>
            <small className="text-muted">Optional. Used for reference when evaluating roles.</small>
          </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card border-danger mb-4">
        <div className="card-header bg-danger bg-opacity-10 border-danger py-2">
          <strong className="text-danger">Danger zone</strong>
        </div>
        <div className="card-body">
          <div className="border-bottom pb-4 mb-4">
            <h6 className="text-danger">Purge soft-deleted applications</h6>
            <p className="text-body-secondary small mb-2">
              When you delete an application, it is hidden but kept in the database. Purging permanently removes those
              records and their attachment folders. Active applications are not affected.
            </p>
            {softDeletedCount != null && (
              <p className="small text-body-secondary mb-2">
                Soft-deleted applications pending purge: <strong>{softDeletedCount}</strong>
                {softDeletedCount > 0 ? (
                  <>
                    {' '}
                    <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={openSoftDeletedListModal}>
                      View list
                    </button>
                  </>
                ) : null}
              </p>
            )}
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={purging || !(softDeletedCount > 0)}
              onClick={() => setShowPurgeModal(true)}
            >
              Purge soft-deleted applications
            </button>
            {softDeletedCount == null && (
              <span className="small text-body-secondary ms-2">Loading count…</span>
            )}
            {softDeletedCount === 0 && (
              <span className="small text-body-secondary ms-2">Nothing to purge.</span>
            )}
          </div>

          <div className="border-bottom pb-4 mb-4">
            <h6 className="text-danger">Delete learning centre only</h6>
            <p className="text-body-secondary small mb-2">
              Permanently removes every flashcard, note, tag, AI link between cards, and review history for this account.
              Database tables used only for learning are named with the <code className="user-select-all">learning_</code>{' '}
              prefix (e.g. <code className="user-select-all">learning_items</code>,{' '}
              <code className="user-select-all">learning_tags</code>). Your applications, companies, CVs, and AI prompt
              settings are not affected.
            </p>
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={clearingLearning}
              onClick={() => setShowClearLearningModal(true)}
            >
              {clearingLearning ? 'Clearing…' : 'Delete all learning data'}
            </button>
          </div>

          <div>
            <h6 className="text-danger">Reset all data</h6>
            <p className="text-body-secondary small mb-2">
              Wipes <strong>all</strong> of your tracked data for this account: applications (including hidden
              soft-deleted ones), companies, recruiters, roles, stages, notes, CV/cover versions, CV profile &amp;
              experience, portfolio projects, and uploaded files. Your login and server AI prompt settings are kept.
            </p>
            <p className="text-body-secondary small mb-2">
              If the app uses a file-based SQLite database, the server creates a timestamped backup under{' '}
              <code className="user-select-all">storage/backups/</code> before wiping. You will be shown the full path
              after confirmation.
            </p>
            <button
              type="button"
              className="btn btn-outline-danger"
              disabled={resetting}
              onClick={() => setShowResetModal(true)}
            >
              {resetting ? 'Resetting…' : 'Reset all data'}
            </button>
          </div>
        </div>
      </div>

      {showSoftDeletedListModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Soft-deleted applications</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setShowSoftDeletedListModal(false)}
                />
              </div>
              <div className="modal-body">
                {softDeletedListLoading ? (
                  <p className="text-body-secondary small mb-0">Loading…</p>
                ) : softDeletedItems.length === 0 ? (
                  <p className="text-body-secondary small mb-0">None pending.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm table-striped mb-0">
                      <thead>
                        <tr>
                          <th>Company</th>
                          <th>Role</th>
                          <th className="text-nowrap">Deleted</th>
                          <th className="d-none d-md-table-cell">UUID</th>
                        </tr>
                      </thead>
                      <tbody>
                        {softDeletedItems.map((row) => (
                          <tr key={row.uuid}>
                            <td>{row.company}</td>
                            <td>{row.role}</td>
                            <td className="text-nowrap small">{formatDeletedAt(row.deleted_at)}</td>
                            <td className="d-none d-md-table-cell small font-monospace text-break">{row.uuid}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={() => setShowSoftDeletedListModal(false)}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="btn btn-outline-primary"
                  disabled={softDeletedListLoading}
                  onClick={loadSoftDeletedList}
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <TypedConfirmModal
        show={showPurgeModal}
        title="Purge soft-deleted applications"
        confirmPhrase={CONFIRM_PURGE_PHRASE}
        confirmLabel="Purge permanently"
        busy={purging}
        onCancel={() => !purging && setShowPurgeModal(false)}
        onConfirm={handlePurgeSoftDeleted}
      >
        <p className="small text-body-secondary mb-0">
          This permanently deletes application rows that were previously soft-deleted, including related database records
          (via cascade) and files under each application&apos;s storage folder. This cannot be undone.
        </p>
      </TypedConfirmModal>

      <TypedConfirmModal
        show={showClearLearningModal}
        title="Delete all learning data"
        confirmPhrase={CONFIRM_CLEAR_LEARNING_PHRASE}
        confirmLabel="Delete learning data"
        busy={clearingLearning}
        onCancel={() => !clearingLearning && setShowClearLearningModal(false)}
        onConfirm={handleClearLearning}
      >
        <p className="small text-body-secondary mb-0">
          This only clears the Learning Centre. Type the confirmation phrase exactly (case-sensitive, including spaces).
        </p>
      </TypedConfirmModal>

      <TypedConfirmModal
        show={showResetModal}
        title="Reset all data"
        confirmPhrase={CONFIRM_RESET_PHRASE}
        confirmLabel="Reset everything"
        busy={resetting}
        onCancel={() => !resetting && setShowResetModal(false)}
        onConfirm={handleReset}
      >
        <p className="small text-body-secondary mb-0">
          The server will attempt to back up your SQLite database file first, then delete your data as described above.
          You must type the confirmation phrase exactly (case-sensitive).
        </p>
      </TypedConfirmModal>
    </div>
  )
}
