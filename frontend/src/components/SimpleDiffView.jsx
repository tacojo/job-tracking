/**
 * Simple line-based diff view: side-by-side Original | Tailored with git-style unified diff option.
 */
import { useState } from 'react'

function computeLineDiff(original, tailored) {
  const a = (original || '').split('\n')
  const b = (tailored || '').split('\n')
  const result = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: 'same', old: a[i], new: b[j] })
      i++
      j++
    } else if (j < b.length && (i >= a.length || !a.slice(i).includes(b[j]))) {
      result.push({ type: 'add', old: null, new: b[j] })
      j++
    } else if (i < a.length && (j >= b.length || !b.slice(j).includes(a[i]))) {
      result.push({ type: 'remove', old: a[i], new: null })
      i++
    } else {
      result.push({ type: 'remove', old: a[i], new: null })
      i++
    }
  }
  return result
}

export default function SimpleDiffView({ original = '', tailored = '', className = '' }) {
  const [mode, setMode] = useState('sideBySide') // 'sideBySide' | 'unified'
  const diff = computeLineDiff(original, tailored)

  return (
    <div className={className}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <strong className="small">Changes (CV)</strong>
        <div className="btn-group btn-group-sm">
          <button
            type="button"
            className={`btn btn-outline-secondary ${mode === 'sideBySide' ? 'active' : ''}`}
            onClick={() => setMode('sideBySide')}
          >
            Side by side
          </button>
          <button
            type="button"
            className={`btn btn-outline-secondary ${mode === 'unified' ? 'active' : ''}`}
            onClick={() => setMode('unified')}
          >
            Unified
          </button>
        </div>
      </div>
      <div
        className="border rounded bg-light small"
        style={{ maxHeight: '40vh', overflow: 'auto', fontFamily: 'monospace' }}
      >
        {mode === 'sideBySide' ? (
          <div className="row g-0">
            <div className="col-6 border-end">
              <div className="p-2 bg-white text-muted">
                <strong>Original</strong>
              </div>
              <pre className="p-2 mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {original || '(empty)'}
              </pre>
            </div>
            <div className="col-6">
              <div className="p-2 bg-white text-muted">
                <strong>Tailored</strong>
              </div>
              <pre className="p-2 mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {tailored || '(empty)'}
              </pre>
            </div>
          </div>
        ) : (
          <pre className="p-2 mb-0 small" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {diff.map((line, idx) => {
              if (line.type === 'same') {
                return <span key={idx}> {line.old}\n</span>
              }
              if (line.type === 'remove') {
                return (
                  <span key={idx} className="text-danger bg-danger bg-opacity-10 d-block">
                    -{line.old}
                  </span>
                )
              }
              if (line.type === 'add') {
                return (
                  <span key={idx} className="text-success bg-success bg-opacity-10 d-block">
                    +{line.new}
                  </span>
                )
              }
              return null
            })}
          </pre>
        )}
      </div>
    </div>
  )
}
