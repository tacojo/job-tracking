import { useEffect, useState } from 'react'

/** Modal: user must type an exact phrase to confirm (e.g. BigQuery-style). */
export default function TypedConfirmModal({
  show,
  title,
  children,
  confirmPhrase,
  confirmLabel = 'Confirm',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}) {
  const [value, setValue] = useState('')

  useEffect(() => {
    if (show) setValue('')
  }, [show])

  if (!show) return null

  const trimmed = value.trim()
  const matches = trimmed === confirmPhrase

  return (
    <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex={-1}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">{title}</h5>
            <button type="button" className="btn-close" onClick={onCancel} aria-label="Close" disabled={busy} />
          </div>
          <div className="modal-body">
            {children}
            <label className="form-label mt-3 mb-1" htmlFor="typed-confirm-input">
              Type <code className="user-select-all">{confirmPhrase}</code> to confirm:
            </label>
            <input
              id="typed-confirm-input"
              type="text"
              className="form-control font-monospace"
              autoComplete="off"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={busy}
              autoFocus
            />
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button
              type="button"
              className={`btn btn-${variant}`}
              disabled={!matches || busy}
              onClick={onConfirm}
            >
              {busy ? 'Working…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
