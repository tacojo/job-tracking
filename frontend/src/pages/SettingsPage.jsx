import { useQueryClient } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import ConfirmModal from '../components/ConfirmModal'

const AI_PROMPT_LABELS = {
  tailor_cv: 'Tailor CV (system prompt)',
  tailor_cover_letter: 'Tailor cover letter (system prompt)',
  prospect_answer: 'Prospect answer (interview-style answers, system prompt)',
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
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  const [aiModel, setAiModel] = useState('')
  const [aiPrompts, setAiPrompts] = useState({ tailor_cv: '', tailor_cover_letter: '', prospect_answer: '' })
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
          setAiPrompts(data.prompts ?? { tailor_cv: '', tailor_cover_letter: '', prospect_answer: '' })
        }
      })
      .catch(() => {
        if (!cancelled) setAiPrompts({ tailor_cv: '', tailor_cover_letter: '', prospect_answer: '' })
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

  const handleReset = async () => {
    setShowResetConfirm(false)
    setResetting(true)
    try {
      await api.reset.all()
      queryClient.invalidateQueries()
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
      <h1 className="mb-4">Settings</h1>

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
            <label className="form-label">Accent color</label>
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

          <div className="mt-4 pt-3 border-top">
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

      <div className="card mb-4">
        <div className="card-header">
          <strong>Data</strong>
        </div>
        <div className="card-body">
          <p className="text-muted mb-3">
            Reset all your data: applications, companies, recruiters, roles, notes, and uploaded files (CVs, documents).
            Your account and settings remain. The app will look like first-time use.
          </p>
          <button
            type="button"
            className="btn btn-outline-danger"
            disabled={resetting}
            onClick={() => setShowResetConfirm(true)}
          >
            {resetting ? 'Resetting…' : 'Reset all data'}
          </button>
        </div>
      </div>

      <ConfirmModal
        show={showResetConfirm}
        title="Reset all data"
        message="This will permanently delete all applications, companies, recruiters, roles, notes, and uploaded files. Your account and settings will remain. Continue?"
        confirmLabel="Reset all"
        variant="danger"
        onConfirm={handleReset}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  )
}
