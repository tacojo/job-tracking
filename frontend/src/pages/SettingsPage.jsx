import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../contexts/AuthContext'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import TypedConfirmModal from '../components/TypedConfirmModal'
import { PageHeader, SideNav, FontSizeScaleControl } from '../components/ui'
import { FONT_OPTIONS } from '../constants/fonts'

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

const SETTINGS_TABS_BASE = [
  { id: 'ai', label: 'AI settings' },
  { id: 'appearance', label: 'Appearance' },
  { id: 'job', label: 'Job settings' },
]

const DANGER_TAB = { id: 'danger', label: 'Danger zone', danger: true }

export default function SettingsPage() {
  const { user, loading: authLoading } = useAuth()
  const isSuperuser = !authLoading && user?.is_superuser === true
  const settingsTabs = useMemo(
    () => (isSuperuser ? [...SETTINGS_TABS_BASE, DANGER_TAB] : SETTINGS_TABS_BASE),
    [isSuperuser],
  )
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
  const [openaiKeyConfigured, setOpenaiKeyConfigured] = useState(false)
  const [openaiKeyMasked, setOpenaiKeyMasked] = useState('')
  const [openaiKeyInput, setOpenaiKeyInput] = useState('')
  const [showClearOpenaiKeyModal, setShowClearOpenaiKeyModal] = useState(false)
  const [clearingOpenaiKey, setClearingOpenaiKey] = useState(false)
  const [savingOpenaiKey, setSavingOpenaiKey] = useState(false)
  const [openaiKeySaveMessage, setOpenaiKeySaveMessage] = useState(null)
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
  const [activeTab, setActiveTab] = useState('ai')
  const selectedFontOption = FONT_OPTIONS.find((f) => f.value === settings.fontFamily)

  useEffect(() => {
    let cancelled = false
    setAiLoading(true)
    api.settings.ai.get()
      .then((data) => {
        if (!cancelled && data) {
          setAiModel(data.model ?? '')
          setOpenaiKeyConfigured(Boolean(data.openai_api_key_configured))
          setOpenaiKeyMasked(data.openai_api_key_masked ?? '')
          setOpenaiKeyInput('')
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
        setAiSaveMessage('Prompts saved.')
      })
      .catch((err) => setAiSaveMessage(err.message || 'Save failed'))
      .finally(() => setAiSaving(false))
  }

  const handleSaveOpenaiKey = () => {
    const key = openaiKeyInput.trim()
    if (!key) return
    setOpenaiKeySaveMessage(null)
    setSavingOpenaiKey(true)
    api.settings.ai.update({ openai_api_key: key })
      .then((data) => {
        setOpenaiKeyConfigured(Boolean(data.openai_api_key_configured))
        setOpenaiKeyMasked(data.openai_api_key_masked ?? '')
        setOpenaiKeyInput('')
        setOpenaiKeySaveMessage('API key saved.')
      })
      .catch((err) => setOpenaiKeySaveMessage(err.message || 'Save failed'))
      .finally(() => setSavingOpenaiKey(false))
  }

  const handleClearOpenaiKey = async () => {
    setClearingOpenaiKey(true)
    setOpenaiKeySaveMessage(null)
    try {
      const data = await api.settings.ai.update({ clear_openai_api_key: true })
      setOpenaiKeyConfigured(Boolean(data.openai_api_key_configured))
      setOpenaiKeyMasked(data.openai_api_key_masked ?? '')
      setOpenaiKeyInput('')
      setShowClearOpenaiKeyModal(false)
      setOpenaiKeySaveMessage('API key removed from this app.')
    } catch (err) {
      alert(err.message || 'Failed to remove API key')
    } finally {
      setClearingOpenaiKey(false)
    }
  }

  useEffect(() => {
    if (!isSuperuser && activeTab === 'danger') setActiveTab('ai')
  }, [isSuperuser, activeTab])

  useEffect(() => {
    if (!isSuperuser) return
    api.reset
      .softDeletedCount()
      .then((r) => setSoftDeletedCount(typeof r?.count === 'number' ? r.count : 0))
      .catch(() => setSoftDeletedCount(null))
  }, [isSuperuser])

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

      <div className="app-split-panel mb-4">
        <aside className="app-split-panel__nav">
          <SideNav aria-label="Settings sections">
            {settingsTabs.map(({ id, label, danger }) => (
              <SideNav.Item
                key={id}
                active={activeTab === id}
                danger={danger}
                onClick={() => setActiveTab(id)}
              >
                {label}
              </SideNav.Item>
            ))}
          </SideNav>
        </aside>
        <div className="app-split-panel__content">
              {activeTab === 'ai' && (
                <>
                  <div className="setting-block">
                    <div className="setting-block__title">Model</div>
                    <p className="setting-block__hint mb-2">Read-only — configured on the server.</p>
                    <input
                      type="text"
                      className="form-control bg-light"
                      value={aiLoading ? '…' : aiModel}
                      readOnly
                      disabled
                      aria-label="AI model"
                    />
                  </div>
                  <div className="setting-block">
                    <div className="setting-block__title" id="openai-api-key-label">
                      OpenAI API key
                    </div>
                    <p className="setting-block__hint">
                      Encrypted on the server and used only for your AI features.{' '}
                      <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                        Create a key on OpenAI
                      </a>
                      . Use a separate test key; revoke on OpenAI when done.
                    </p>
                    {openaiKeyConfigured && (
                      <p className="small text-muted mb-2">
                        Configured: <code className="user-select-all">{openaiKeyMasked || '••••'}</code>
                      </p>
                    )}
                    <div className="d-flex gap-2 align-items-center flex-wrap">
                      <input
                        id="openai-api-key"
                        type="password"
                        className="form-control font-monospace small flex-grow-1"
                        style={{ minWidth: '12rem', maxWidth: '28rem' }}
                        autoComplete="off"
                        aria-labelledby="openai-api-key-label"
                        placeholder={
                          openaiKeyConfigured
                            ? 'Enter a new key to replace the saved one'
                            : 'sk-...'
                        }
                        value={openaiKeyInput}
                        onChange={(e) => {
                          setOpenaiKeyInput(e.target.value)
                          setOpenaiKeySaveMessage(null)
                        }}
                        disabled={aiLoading || savingOpenaiKey || clearingOpenaiKey}
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm text-nowrap flex-shrink-0"
                        disabled={
                          aiLoading
                          || savingOpenaiKey
                          || clearingOpenaiKey
                          || !openaiKeyInput.trim()
                        }
                        onClick={handleSaveOpenaiKey}
                      >
                        {savingOpenaiKey ? 'Saving…' : 'Save key'}
                      </button>
                      {openaiKeyConfigured && (
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm text-nowrap flex-shrink-0"
                          disabled={aiLoading || clearingOpenaiKey || savingOpenaiKey}
                          onClick={() => setShowClearOpenaiKeyModal(true)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                    {openaiKeySaveMessage && (
                      <p className="small text-muted mb-0 mt-2">{openaiKeySaveMessage}</p>
                    )}
                  </div>
                  {!aiLoading && (
                    <div className="setting-block">
                      <div className="setting-block__title">System prompts</div>
                      <p className="setting-block__hint">Custom instructions sent to the model for each feature.</p>
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
                          className="btn btn-primary btn-sm"
                          disabled={aiSaving}
                          onClick={handleSaveAiPrompts}
                        >
                          {aiSaving ? 'Saving…' : 'Save prompts'}
                        </button>
                        {aiSaveMessage && (
                          <span className="small text-muted">{aiSaveMessage}</span>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeTab === 'appearance' && (
                <>
                  <div className="setting-block">
                    <div className="setting-block__title">Developer / demo mode</div>
                    <p className="setting-block__hint">Hide real names when sharing screenshots.</p>
                    <div className="form-check">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        id="maskSensitive"
                        checked={settings.maskSensitive}
                        onChange={(e) => setSettings({ maskSensitive: e.target.checked })}
                      />
                      <label className="form-check-label" htmlFor="maskSensitive">
                        Mask sensitive data (company names, recruiters, etc.)
                      </label>
                    </div>
                    {settings.maskSensitive && (
                      <p className="small text-muted mt-2 mb-0">
                        Example: &quot;John Doe&quot; → &quot;{maskText('John Doe')}&quot;
                      </p>
                    )}
                  </div>

                  <div className="setting-block">
                    <div className="setting-block__title">Accent colour</div>
                    <p className="setting-block__hint">Used for the header and primary actions.</p>
                    <div className="color-swatch-row mb-2">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c.value}
                          type="button"
                          className={`color-swatch${settings.accentColor === c.value ? ' active' : ''}`}
                          style={{ backgroundColor: c.value }}
                          onClick={() => setSettings({ accentColor: c.value })}
                          title={c.name}
                          aria-label={c.name}
                        />
                      ))}
                    </div>
                    <div className="d-flex align-items-center gap-2">
                      <input
                        type="color"
                        className="form-control form-control-color"
                        value={settings.accentColor}
                        onChange={(e) => setSettings({ accentColor: e.target.value })}
                        style={{ width: '2rem', height: '2rem', padding: '0.125rem' }}
                        aria-label="Custom accent colour"
                      />
                      <span className="small text-muted">{settings.accentColor}</span>
                    </div>
                  </div>

                  <div className="setting-block">
                    <div className="setting-block__title">Font &amp; text size</div>
                    <p className="setting-block__hint mb-2">
                      Typeface and UI text scale (−2 smallest … +2 largest).
                    </p>
                    <div className="d-flex flex-wrap align-items-stretch gap-2 gap-md-3">
                      <select
                        id="settings-font"
                        className="form-select settings-font-row__select"
                        value={settings.fontFamily}
                        onChange={(e) => setSettings({ fontFamily: e.target.value })}
                        aria-label="Font family"
                      >
                        {FONT_OPTIONS.map((f) => (
                          <option key={f.value} value={f.value}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                      <FontSizeScaleControl
                        value={settings.fontSizeScale}
                        onChange={(fontSizeScale) => setSettings({ fontSizeScale })}
                        className="flex-shrink-0"
                      />
                    </div>
                    {selectedFontOption?.description && (
                      <p className="small text-muted mb-0 mt-2">
                        {selectedFontOption.description}
                      </p>
                    )}
                  </div>
                </>
              )}

              {activeTab === 'job' && (
                <>
                  <div className="setting-block">
                    <label className="setting-block__title" htmlFor="preferred-job-titles">
                      Preferred job titles
                    </label>
                    <p className="setting-block__hint">Comma-separated.</p>
                    <input
                      id="preferred-job-titles"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Data Engineer, Analytics Engineer, ML Engineer"
                      value={tagsToStr(settings.preferredJobTitles)}
                      onChange={(e) => setSettings({ preferredJobTitles: parseTags(e.target.value) })}
                    />
                  </div>

                  <div className="setting-block">
                    <label className="setting-block__title" htmlFor="skills-stack">
                      Skills stack
                    </label>
                    <p className="setting-block__hint">Comma-separated.</p>
                    <input
                      id="skills-stack"
                      type="text"
                      className="form-control"
                      placeholder="e.g. dbt, BigQuery, Airflow, Python, Snowflake"
                      value={tagsToStr(settings.skillsStack)}
                      onChange={(e) => setSettings({ skillsStack: parseTags(e.target.value) })}
                    />
                  </div>

                  <div className="setting-block">
                    <label className="setting-block__title" htmlFor="location-preference">
                      Location / remote preference
                    </label>
                    <input
                      id="location-preference"
                      type="text"
                      className="form-control"
                      placeholder="e.g. Remote, Hybrid, London, Berlin"
                      value={settings.locationPreference || ''}
                      onChange={(e) => setSettings({ locationPreference: e.target.value })}
                    />
                  </div>

                  <div className="setting-block">
                    <div className="setting-block__title">Salary range (annual)</div>
                    <p className="setting-block__hint">Optional. Used for reference when evaluating roles.</p>
                    <div className="row g-2" style={{ maxWidth: '20rem' }}>
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
                      <div className="col-auto align-self-center text-muted">–</div>
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
                  </div>
                </>
              )}

              {isSuperuser && activeTab === 'danger' && (
                <>
                  <div className="setting-block">
                    <div className="setting-block__title text-danger">Purge soft-deleted applications</div>
                    <p className="setting-block__hint">
                      Permanently removes hidden applications and their attachments. Active applications are not affected.
                    </p>
                    {softDeletedCount != null && (
                      <p className="small text-body-secondary mb-2">
                        Pending purge: <strong>{softDeletedCount}</strong>
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
                      className="btn btn-outline-danger btn-sm"
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

                  <div className="setting-block">
                    <div className="setting-block__title text-danger">Delete learning centre only</div>
                    <p className="setting-block__hint">
                      Removes flashcards, notes, tags, and review history. Applications and AI settings are kept.
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={clearingLearning}
                      onClick={() => setShowClearLearningModal(true)}
                    >
                      {clearingLearning ? 'Clearing…' : 'Delete all learning data'}
                    </button>
                  </div>

                  <div className="setting-block">
                    <div className="setting-block__title text-danger">Reset all data</div>
                    <p className="setting-block__hint">
                      Wipes all tracked data for this account. A SQLite backup is created first when possible.
                    </p>
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={resetting}
                      onClick={() => setShowResetModal(true)}
                    >
                      {resetting ? 'Resetting…' : 'Reset all data'}
                    </button>
                  </div>
                </>
              )}
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

      {showClearOpenaiKeyModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">Clear saved OpenAI key?</h5>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  disabled={clearingOpenaiKey}
                  onClick={() => !clearingOpenaiKey && setShowClearOpenaiKeyModal(false)}
                />
              </div>
              <div className="modal-body">
                <p className="small text-body-secondary mb-2">
                  This removes the encrypted key from this app. AI features will stop working until you save a new key.
                </p>
                <p className="small text-body-secondary mb-0">
                  It does <strong>not</strong> revoke the key on OpenAI — do that separately at{' '}
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    platform.openai.com/api-keys
                  </a>
                  {' '}if you no longer need it.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  disabled={clearingOpenaiKey}
                  onClick={() => setShowClearOpenaiKeyModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={clearingOpenaiKey}
                  onClick={handleClearOpenaiKey}
                >
                  {clearingOpenaiKey ? 'Removing…' : 'Clear saved key'}
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
