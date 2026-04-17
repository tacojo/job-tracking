import { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'

/** Inline preview for documents (PDF, DOCX). Same approach as CVPreview on /cvs. */
export default function DocumentPreview({ doc, getBlob, onClose }) {
  const { settings } = useSettings()
  const mask = settings.maskSensitive
  const displayFilename = mask && doc?.doc_type !== 'cv' ? maskText(doc?.filename || '') : (doc?.filename || '')
  const [content, setContent] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  const format = (doc?.format || '').toLowerCase()

  useEffect(() => {
    let objectUrl = null

    const load = async () => {
      try {
        const blob = await getBlob()
        if (!blob) throw new Error('Failed to load file')

        if (format === 'pdf') {
          objectUrl = URL.createObjectURL(blob)
          setContent({ type: 'pdf', url: objectUrl })
        } else if (format === 'docx' || format === 'doc') {
          const arrayBuffer = await blob.arrayBuffer()
          const result = await mammoth.convertToHtml({ arrayBuffer })
          setContent({ type: 'html', html: result.value })
        } else if (format === 'txt') {
          const text = await blob.text()
          setContent({ type: 'text', text })
        } else {
          setContent({ type: 'unsupported' })
        }
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }

    load()
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [doc?.uuid, format])

  if (loading) return (
    <div className="text-center py-5">
      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
      <span className="text-muted">Loading preview…</span>
    </div>
  )
  if (error) return (
    <div className="alert alert-danger mb-0" role="alert">
      {error}
    </div>
  )
  if (content?.type === 'unsupported') return (
    <div className="alert alert-warning mb-0" role="alert">
      Preview not available for this format. Use Download instead.
    </div>
  )

  return (
    <div className="cv-preview-modal">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="mb-0">{displayFilename}</h5>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="cv-preview-content border rounded overflow-auto bg-white" style={{ minHeight: '60vh', maxHeight: '70vh' }}>
        {content?.type === 'pdf' && (
          <iframe
            src={content.url}
            title={displayFilename}
            className="w-100 h-100"
            style={{ minHeight: '60vh' }}
          />
        )}
        {content?.type === 'html' && (
          <div
            className="p-4"
            style={{ fontFamily: 'Georgia, serif', fontSize: '1rem' }}
            dangerouslySetInnerHTML={{ __html: content.html }}
          />
        )}
        {content?.type === 'text' && (
          <pre className="p-4 mb-0" style={{ whiteSpace: 'pre-wrap', fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif' }}>
            {content.text}
          </pre>
        )}
      </div>
    </div>
  )
}
