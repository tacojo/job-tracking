import { useEffect, useState } from 'react'
import mammoth from 'mammoth'
import { api } from '../api'
import { sanitizePreviewHtml } from '../utils/sanitizeHtml'

export default function CVPreview({ cv, onClose }) {
  const [content, setContent] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let objectUrl = null

    const load = async () => {
      try {
        const res = await api.cvVersions.getFile(cv.id)
        if (!res.ok) throw new Error('Failed to load file')
        const blob = await res.blob()

        if (cv.file_type === 'pdf') {
          objectUrl = URL.createObjectURL(blob)
          setContent({ type: 'pdf', url: objectUrl })
        } else if (cv.file_type === 'docx') {
          const arrayBuffer = await blob.arrayBuffer()
          const result = await mammoth.convertToHtml({ arrayBuffer })
          setContent({ type: 'html', html: sanitizePreviewHtml(result.value) })
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
  }, [cv.id, cv.file_type])

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
      Preview not available for this format.
    </div>
  )

  return (
    <div className="cv-preview-modal">
      <div className="d-flex justify-content-between align-items-center mb-2">
        <h5 className="mb-0">{cv.name}</h5>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="cv-preview-content border rounded overflow-auto bg-white" style={{ minHeight: '60vh', maxHeight: '70vh' }}>
        {content?.type === 'pdf' && (
          <iframe
            src={content.url}
            title={cv.name}
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
      </div>
    </div>
  )
}
