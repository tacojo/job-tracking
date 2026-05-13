import { useState, useEffect } from 'react'
import { api } from '../api'
import ConfirmModal from './ConfirmModal'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'
import { STAGE_ORDER, TERMINUS_STAGES, STAGE_LABELS } from '../constants/stages'

const ACTIVITY_TYPES = [
  { value: '', label: '—' },
  { value: 'phone_call', label: 'Phone call' },
  { value: 'online_meeting', label: 'Online meeting' },
  { value: 'home_test', label: 'Home test' },
  { value: 'pair_programming', label: 'Pair programming' },
  { value: 'onsite_meeting', label: 'Onsite meeting' },
]

const ACTIVITY_LABELS = {
  phone_call: 'phone call',
  online_meeting: 'online meeting',
  home_test: 'home test',
  pair_programming: 'pair programming',
  onsite_meeting: 'onsite meeting',
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'))
const MINUTE_OPTIONS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'))

function sortStagesByLineage(stages) {
  const orderMap = Object.fromEntries(STAGE_ORDER.map((s, i) => [s, i]))
  return [...stages].sort((a, b) => {
    const dateA = new Date(a.scheduled_at || a.created_at)
    const dateB = new Date(b.scheduled_at || b.created_at)
    const dateCmp = dateA - dateB
    if (dateCmp !== 0) return dateCmp
    const idxA = orderMap[a.stage_type] ?? 999
    const idxB = orderMap[b.stage_type] ?? 999
    return idxA - idxB
  })
}

function getNextAllowedStages(stages) {
  const hasTerminus = stages.some((s) => TERMINUS_STAGES.includes(s.stage_type))
  if (hasTerminus) return []

  const types = stages.map((s) => s.stage_type)
  const hasApplied = types.includes('APPLIED')
  const hasRecruiterCall = types.includes('RECRUITER_CALL')
  const nonTerminus = types.filter((t) => !TERMINUS_STAGES.includes(t))

  if (types.length === 0) {
    return ['APPLIED', 'RECRUITER_CALL']
  }

  if (hasApplied && !hasRecruiterCall && !nonTerminus.some((t) => t.startsWith('STAGE_'))) {
    return ['RECRUITER_CALL', 'STAGE_1', 'REJECTED', 'NO_FEEDBACK']
  }

  if (hasRecruiterCall && !hasApplied && !nonTerminus.some((t) => t.startsWith('STAGE_'))) {
    return ['STAGE_1', 'REJECTED', 'NO_FEEDBACK']
  }

  if ((hasApplied || hasRecruiterCall) && !nonTerminus.some((t) => t.startsWith('STAGE_'))) {
    return ['STAGE_1', 'REJECTED', 'NO_FEEDBACK']
  }

  const stageNums = nonTerminus
    .filter((t) => /^STAGE_(\d+)$/.test(t))
    .map((t) => parseInt(t.replace('STAGE_', ''), 10))
  const lastStageNum = stageNums.length ? Math.max(...stageNums) : 0

  if (lastStageNum >= 10) {
    return ['OFFER', 'REJECTED', 'NO_FEEDBACK']
  }
  return [`STAGE_${lastStageNum + 1}`, 'OFFER', 'REJECTED', 'NO_FEEDBACK']
}

function toGoogleCalendarUrl(date, title = 'Interview') {
  if (!date) return null
  const d = new Date(date)
  const start = d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const end = new Date(d.getTime() + 60 * 60 * 1000).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${start}/${end}`
}

/** Stages that support Add to Google Calendar (not Applied, Offer, Rejected). */
function stageAllowsCalendar(stageType) {
  return stageType === 'RECRUITER_CALL' || /^STAGE_\d+$/.test(stageType)
}

function isNumberedStage(stageType) {
  return /^STAGE_\d+$/.test(stageType)
}

/** Format date for type="date" input (YYYY-MM-DD). */
function toDateInputValue(d) {
  if (!d) return ''
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Format time for type="time" input (HH:mm) from Date or ISO string. */
function toTimeInputValue(d) {
  if (!d) return '00:00'
  const dt = new Date(d)
  const h = String(dt.getHours()).padStart(2, '0')
  const min = String(dt.getMinutes()).padStart(2, '0')
  return `${h}:${min}`
}

function roundToMinuteStep(timeValue) {
  if (!timeValue || typeof timeValue !== 'string') return '00:00'
  const [rawHour = '00', rawMinute = '00'] = timeValue.split(':')
  const hour = String(Math.max(0, Math.min(23, Number.parseInt(rawHour, 10) || 0))).padStart(2, '0')
  const minuteNum = Math.max(0, Math.min(59, Number.parseInt(rawMinute, 10) || 0))
  const roundedMinute = Math.min(55, Math.floor(minuteNum / 5) * 5)
  return `${hour}:${String(roundedMinute).padStart(2, '0')}`
}

/** Combine date (YYYY-MM-DD) and time (HH:mm) to ISO string for API. */
function toScheduledAtISO(dateStr, timeStr) {
  if (!dateStr) return null
  const time = (timeStr && timeStr.trim()) || '00:00'
  return `${dateStr}T${time}:00`
}


export default function StageList({ applicationId, onUpdate, expandedId: expandedIdProp, onExpandedChange, recruiterName, recruiterLink }) {
  const [stages, setStages] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [expandedIdInternal, setExpandedIdInternal] = useState(null)
  const expandedId = expandedIdProp ?? expandedIdInternal
  const setExpandedId = (id) => {
    if (onExpandedChange) onExpandedChange(id)
    else setExpandedIdInternal(id)
  }
  const [newStageType, setNewStageType] = useState('APPLIED')
  const [newScheduledDate, setNewScheduledDate] = useState(toDateInputValue(new Date()))
  const [newScheduledTime, setNewScheduledTime] = useState('09:00')
  const [newNotes, setNewNotes] = useState('')
  const [addError, setAddError] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const { settings } = useSettings()
  const mask = settings.maskSensitive

  const sortedStages = sortStagesByLineage(stages)
  const allowedNext = getNextAllowedStages(stages)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.stages.list(applicationId)
      setStages(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [applicationId])

  // When stages load for a given application and no external expandedId is provided,
  // default to the latest stage (by scheduled_at / created_at).
  useEffect(() => {
    if (expandedIdProp != null) {
      // Controlled by parent, don't override.
      return
    }
    if (!stages.length) {
      setExpandedIdInternal(null)
      return
    }
    if (expandedIdInternal != null) {
      return
    }
    const latest = [...stages].sort((a, b) => {
      const aDate = new Date(a.scheduled_at || a.created_at || 0).getTime()
      const bDate = new Date(b.scheduled_at || b.created_at || 0).getTime()
      return aDate - bDate
    })[stages.length - 1]
    setExpandedIdInternal(latest.id)
  }, [stages, expandedIdProp, expandedIdInternal])

  const handleAdd = async (e) => {
    e.preventDefault()
    setAddError(null)
    if (!allowedNext.includes(newStageType)) {
      setAddError('Invalid stage. Add in sequence or choose Offer/Rejected.')
      return
    }
    try {
      const created = await api.stages.create(applicationId, {
        stage_type: newStageType,
        scheduled_at: toScheduledAtISO(newScheduledDate, newScheduledTime),
        notes: newNotes || null,
      })
      setNewStageType(allowedNext[0] || 'APPLIED')
      setNewScheduledDate(toDateInputValue(new Date()))
      setNewScheduledTime('09:00')
      setNewNotes('')
      setAdding(false)
      await load()
      setExpandedId(created.id)
      onUpdate?.()
    } catch (err) {
      setAddError(err.body?.detail || err.message || 'Failed to add stage')
    }
  }

  const handleDeleteClick = (id) => setDeleteId(id)
  const handleDeleteConfirm = async () => {
    if (!deleteId) return
    try {
      await api.stages.delete(deleteId)
      setDeleteId(null)
      setExpandedId(null)
      load()
      onUpdate?.()
    } catch (err) {
      setAddError(err.body?.detail || err.message || 'Failed to delete stage')
      setDeleteId(null)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  const [newScheduledHour = '00', newScheduledMinute = '00'] = roundToMinuteStep(newScheduledTime).split(':')
  const formatDateAndTime = (d) => {
    if (!d) return ''
    const dt = new Date(d)
    const hasTime = dt.getHours() !== 0 || dt.getMinutes() !== 0
    const dateStr = dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    if (!hasTime) return dateStr
    const timeStr = dt.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    return `${dateStr}, ${timeStr}`
  }

  if (loading) return (
    <div className="text-muted d-flex align-items-center gap-2">
      <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
      <span>Loading stages…</span>
    </div>
  )

  return (
    <div>
      {addError && !adding && (
        <div className="alert alert-danger py-2 mb-2 d-flex justify-content-between align-items-center">
          <span>{addError}</span>
          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => setAddError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className="d-flex flex-wrap align-items-center gap-2">
        {sortedStages.map((s, i) => (
          <span key={s.id} className="d-inline-flex align-items-center">
            <button
              type="button"
              className={`btn btn-sm ${expandedId === s.id ? 'btn-forest' : 'btn-outline-forest'}`}
              onClick={() => {
                if (expandedId === s.id) return
                setExpandedId(s.id)
              }}
            >
              {STAGE_LABELS[s.stage_type] || s.stage_type}
              {isNumberedStage(s.stage_type) && s.activity_type && (
                <span className="opacity-75"> — {ACTIVITY_LABELS[s.activity_type] || s.activity_type}</span>
              )}
              <small className="opacity-75 ms-1">({formatDateAndTime(s.scheduled_at)})</small>
            </button>
            {i < sortedStages.length - 1 && <span className="mx-1 text-muted">→</span>}
          </span>
        ))}
        {sortedStages.length > 0 && <span className="mx-1 text-muted">→</span>}
        {!adding ? (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => {
              setAdding(true)
              setAddError(null)
              setNewStageType(allowedNext[0] || 'APPLIED')
              const defaultDate =
                sortedStages.length > 0
                  ? toDateInputValue(sortedStages[sortedStages.length - 1].scheduled_at || sortedStages[sortedStages.length - 1].created_at)
                  : toDateInputValue(new Date())
              setNewScheduledDate(defaultDate)
              setNewScheduledTime('09:00')
            }}
            disabled={allowedNext.length === 0}
          >
            + Add Stage
          </button>
        ) : (
          <form onSubmit={handleAdd} className="d-inline-flex flex-wrap align-items-center gap-2 p-2 bg-light rounded">
            {addError && <div className="w-100 small text-danger">{addError}</div>}
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value={newStageType}
              onChange={(e) => setNewStageType(e.target.value)}
            >
              {allowedNext.map((t) => (
                <option key={t} value={t}>
                  {STAGE_LABELS[t]}
                </option>
              ))}
            </select>
            <div className="d-flex flex-column">
              {/* <label className="form-label small mb-0">Date</label> */}
              <input
                type="date"
                className="form-control form-control-sm"
                value={newScheduledDate}
                onChange={(e) => setNewScheduledDate(e.target.value)}
                min={
                  sortedStages.length > 0
                    ? toDateInputValue(sortedStages[sortedStages.length - 1].scheduled_at || sortedStages[sortedStages.length - 1].created_at)
                    : undefined
                }
                required
              />
            </div>
            <div className="d-flex flex-column">
              {/* <label className="form-label small mb-0">Time</label> */}
              <div className="d-flex align-items-center gap-1">
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={newScheduledHour}
                  onChange={(e) => setNewScheduledTime(`${e.target.value}:${newScheduledMinute}`)}
                >
                  {HOUR_OPTIONS.map((hour) => (
                    <option key={hour} value={hour}>
                      {hour}
                    </option>
                  ))}
                </select>
                <span>:</span>
                <select
                  className="form-select form-select-sm"
                  style={{ width: 'auto' }}
                  value={newScheduledMinute}
                  onChange={(e) => setNewScheduledTime(`${newScheduledHour}:${e.target.value}`)}
                >
                  {MINUTE_OPTIONS.map((minute) => (
                    <option key={minute} value={minute}>
                      {minute}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <input
              type="text"
              className="form-control form-control-sm"
              style={{ width: '120px' }}
              placeholder="Notes"
              value={mask ? maskText(newNotes) : newNotes}
              onChange={(e) => !mask && setNewNotes(e.target.value)}
              readOnly={mask}
            />
            <button type="submit" className="btn btn-sm btn-forest">
              Add
            </button>
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        )}
      </div>

      {expandedId && (
        <StageDetails
          stage={sortedStages.find((s) => s.id === expandedId)}
          allStages={sortedStages}
          onClose={() => setExpandedId(null)}
          onSave={async (data) => {
            await api.stages.update(expandedId, data)
            load()
            onUpdate?.()
          }}
          onDelete={() => handleDeleteClick(expandedId)}
          formatDate={formatDate}
          formatDateAndTime={formatDateAndTime}
          stageLabels={STAGE_LABELS}
          activityTypes={ACTIVITY_TYPES}
          recruiterName={recruiterName}
          recruiterLink={recruiterLink}
        />
      )}

      {sortedStages.length === 0 && !adding && (
        <p className="text-muted mt-2">No stages yet. Click Add Stage to start.</p>
      )}

      <ConfirmModal
        show={!!deleteId}
        title="Delete stage"
        message="Are you sure you want to delete this stage? This cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  )
}

function StageDetails({ stage, allStages, onClose, onSave, onDelete, formatDate, formatDateAndTime, stageLabels, activityTypes, recruiterName, recruiterLink }) {
  if (!stage) return null
  const isRecruiterCall = stage.stage_type === 'RECRUITER_CALL'
  const useRecruiterContact = isRecruiterCall && recruiterName
  const displayContactName = useRecruiterContact ? (stage.contact_name || recruiterName) : (stage.contact_name || '')
  const displayContactLinkedin = useRecruiterContact ? (stage.contact_linkedin || recruiterLink || '') : (stage.contact_linkedin || '')

  const { settings } = useSettings()
  const mask = settings.maskSensitive

  const [notes, setNotes] = useState(stage.notes || '')
  const [scheduledDate, setScheduledDate] = useState(toDateInputValue(stage.scheduled_at))
  const [scheduledTime, setScheduledTime] = useState(toTimeInputValue(stage.scheduled_at))
  const [activityType, setActivityType] = useState(stage.activity_type || '')
  const [contactName, setContactName] = useState(displayContactName)
  const [contactLinkedin, setContactLinkedin] = useState(displayContactLinkedin)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [scheduledHour = '00', scheduledMinute = '00'] = roundToMinuteStep(scheduledTime).split(':')

  useEffect(() => {
    setNotes(stage.notes || '')
    setScheduledDate(toDateInputValue(stage.scheduled_at))
    setScheduledTime(toTimeInputValue(stage.scheduled_at))
    setActivityType(stage.activity_type || '')
    const dn = stage.stage_type === 'RECRUITER_CALL' && recruiterName ? (stage.contact_name || recruiterName) : (stage.contact_name || '')
    const dl = stage.stage_type === 'RECRUITER_CALL' && recruiterName ? (stage.contact_linkedin || recruiterLink || '') : (stage.contact_linkedin || '')
    setContactName(dn)
    setContactLinkedin(dl)
  }, [stage, recruiterName, recruiterLink])

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    const finalContactName = useRecruiterContact ? (recruiterName || contactName) : contactName
    const finalContactLinkedin = useRecruiterContact ? (recruiterLink || contactLinkedin) : contactLinkedin
    try {
      await onSave({
        notes: notes || null,
        scheduled_at: toScheduledAtISO(scheduledDate, scheduledTime) ?? (scheduledDate || null),
        activity_type: isNumberedStage(stage.stage_type) ? (activityType || null) : null,
        contact_name: finalContactName || null,
        contact_linkedin: finalContactLinkedin || null,
      })
    } catch (err) {
      setSaveError(err.body?.detail || err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const dateForCalendar = toScheduledAtISO(scheduledDate, scheduledTime) || scheduledDate || stage.scheduled_at
  const calUrl = stageAllowsCalendar(stage.stage_type) && dateForCalendar
    ? toGoogleCalendarUrl(dateForCalendar, `${stageLabels[stage.stage_type]} - Interview`)
    : null

  return (
    <div className="card mt-3">
      <div className="card-header d-flex justify-content-between align-items-center py-2">
        <strong>{stageLabels[stage.stage_type]} — {(formatDateAndTime || formatDate)(stage.scheduled_at)}</strong>
        <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="card-body">
        <form onSubmit={handleSave}>
          {saveError && <div className="alert alert-danger py-2 mb-2">{saveError}</div>}
          <div className="row g-3 mb-2 align-items-stretch">
            {/* Left column: Date, Time, Activity type, Contact name, LinkedIn */}
            <div className="col-md-6 d-flex flex-column">
              <div className="row g-2 mb-2">
                <div className="col-6">
                  <label className="form-label small mb-0">Date</label>
                  <input
                    type="date"
                    className="form-control form-control-sm"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                    min={
                      (() => {
                        const idx = allStages?.findIndex((s) => s.id === stage.id) ?? -1
                        if (idx > 0) {
                          const prev = allStages[idx - 1]
                          return toDateInputValue(prev.scheduled_at || prev.created_at)
                        }
                        return undefined
                      })()
                    }
                    max={
                      (() => {
                        const idx = allStages?.findIndex((s) => s.id === stage.id) ?? -1
                        if (idx >= 0 && idx < (allStages?.length ?? 0) - 1) {
                          const next = allStages[idx + 1]
                          return toDateInputValue(next.scheduled_at || next.created_at)
                        }
                        return undefined
                      })()
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label small mb-0">Time</label>
                  <div className="d-flex align-items-center gap-1">
                    <select
                      className="form-select form-select-sm"
                      value={scheduledHour}
                      onChange={(e) => setScheduledTime(`${e.target.value}:${scheduledMinute}`)}
                    >
                      {HOUR_OPTIONS.map((hour) => (
                        <option key={hour} value={hour}>
                          {hour}
                        </option>
                      ))}
                    </select>
                    <span>:</span>
                    <select
                      className="form-select form-select-sm"
                      value={scheduledMinute}
                      onChange={(e) => setScheduledTime(`${scheduledHour}:${e.target.value}`)}
                    >
                      {MINUTE_OPTIONS.map((minute) => (
                        <option key={minute} value={minute}>
                          {minute}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              {isNumberedStage(stage.stage_type) && (
                <div className="mb-2">
                  <div className="d-flex align-items-end gap-2">
                    <div className="flex-grow-1">
                      <label className="form-label small mb-0">Activity type</label>
                      <select
                        className="form-select form-select-sm"
                        value={activityType}
                        onChange={(e) => setActivityType(e.target.value)}
                      >
                        {activityTypes.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {calUrl && (
                      <div className="pb-1">
                        <a
                          href={calUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-sm btn-outline-secondary"
                        >
                          Add to Google Calendar
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}
              <div className="mb-2">
                <label className="form-label small mb-0">Contact name</label>
                <input
                  type="text"
                  className={`form-control form-control-sm ${useRecruiterContact || mask ? 'bg-secondary bg-opacity-10' : ''}`}
                  value={mask ? maskText(contactName) : contactName}
                  onChange={(e) => !mask && !useRecruiterContact && setContactName(e.target.value)}
                  readOnly={mask || useRecruiterContact}
                  placeholder="e.g. Mike"
                />
              </div>
              <div className="mb-2">
                <label className="form-label small mb-0">LinkedIn profile</label>
                <div className="input-group input-group-sm">
                  <input
                    type="url"
                    className={`form-control form-control-sm ${useRecruiterContact || mask ? 'bg-secondary bg-opacity-10' : ''}`}
                    value={mask ? maskText(contactLinkedin) : contactLinkedin}
                    onChange={(e) => !mask && !useRecruiterContact && setContactLinkedin(e.target.value)}
                    readOnly={mask || useRecruiterContact}
                    placeholder="https://linkedin.com/in/…"
                  />
                  {contactLinkedin?.trim() && !mask && (
                    <a
                      className="btn btn-outline-secondary"
                      href={contactLinkedin}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="Open LinkedIn profile in new tab"
                    >
                      Open
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: Notes, large textarea */}
            <div className="col-md-6 d-flex flex-column">
              <label className="form-label small mb-0">Notes</label>
              <textarea
                className="form-control form-control-sm flex-grow-1"
                style={{ minHeight: '8rem' }}
                value={mask ? maskText(notes) : notes}
                onChange={(e) => !mask && setNotes(e.target.value)}
                readOnly={mask}
                placeholder="Notes…"
              />
            </div>
          </div>
          <div className="d-flex gap-2">
            <button type="submit" className="btn btn-sm btn-forest" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" className="btn btn-sm btn-outline-danger" onClick={onDelete}>
              Delete
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
