import { useState, useEffect } from 'react'
import { api } from '../api'

export default function SwotAnalysis({ appId }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [swotData, setSwotData] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [savedAnalysis, setSavedAnalysis] = useState(null)
  const [checkedForSaved, setCheckedForSaved] = useState(false)

  // Load saved analysis on mount (404 is normal if none exists yet)
  useEffect(() => {
    const loadSavedAnalysis = async () => {
      try {
        const data = await api.applications.prospect.getSavedSwotAnalysis(appId)
        setSavedAnalysis(data)
        setSwotData(data)
      } catch (e) {
        // 404 = no saved analysis yet (this is expected, not an error)
        if (e.status !== 404) {
          console.warn('Unexpected error loading saved SWOT analysis:', e)
        }
        setSavedAnalysis(null)
      } finally {
        setCheckedForSaved(true)
      }
    }
    loadSavedAnalysis()
  }, [appId])

  const loadSwotAnalysis = async () => {
    setLoading(true)
    setError(null)
    setSaveSuccess(false)
    try {
      const data = await api.applications.prospect.swotAnalysis(appId)
      setSwotData(data)
    } catch (e) {
      const errorMsg = e.body?.detail || e.message || 'Failed to generate SWOT analysis'
      setError(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  const saveSwotAnalysis = async () => {
    if (!swotData) return
    
    setSaving(true)
    setSaveSuccess(false)
    const isUpdating = savedAnalysis !== null
    
    try {
      const { strengths, weaknesses, opportunities, threats } = swotData
      const saved = await api.applications.prospect.saveSwotAnalysis(appId, {
        strengths,
        weaknesses,
        opportunities,
        threats,
      })
      setSavedAnalysis(saved)
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (e) {
      const errorMsg = e.body?.detail || e.message || 'Failed to save SWOT analysis'
      alert(`Error: ${errorMsg}`)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-5">
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
        <p className="mt-3 text-muted">Generating SWOT analysis...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="alert alert-warning" role="alert">
        <h5 className="alert-heading">SWOT Analysis Not Available</h5>
        <p>{error}</p>
        <hr />
        <button
          className="btn btn-sm btn-outline-primary"
          onClick={loadSwotAnalysis}
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!swotData) {
    return (
      <div className="text-center py-5">
        <h5 className="mb-3">SWOT Analysis</h5>
        <p className="text-muted mb-4">
          Generate a comprehensive SWOT analysis comparing your CV and portfolio projects against the job
          specification.
        </p>
        <button
          className="btn btn-primary btn-lg"
          onClick={loadSwotAnalysis}
        >
          Generate SWOT Analysis
        </button>
        <div className="mt-4">
          <small className="text-muted">
            <strong>Note:</strong> This uses your CV profile, project write-ups from My CVs → Projects, and the
            job description.
            {!checkedForSaved && <span> Checking for previously saved analysis...</span>}
          </small>
        </div>
      </div>
    )
  }

  const renderSection = (title, items, colorClass, icon) => {
    // Special handling for weaknesses with search terms
    if (title === 'Weaknesses' && items && items.length > 0) {
      return (
        <div className="col-md-6 mb-4">
          <div className={`card h-100 border-${colorClass}`}>
            <div className={`card-header bg-${colorClass} text-white`}>
              <h5 className="mb-0">
                <span className="me-2">{icon}</span>
                {title}
              </h5>
            </div>
            <div className="card-body">
              {items.map((item, idx) => {
                const weaknessText = typeof item === 'string' ? item : item.text
                const searchTerms = typeof item === 'object' && item.search_terms ? item.search_terms : []
                
                return (
                  <div key={idx} className={`mb-3 ${idx < items.length - 1 ? 'pb-3 border-bottom' : ''}`}>
                    <p className="mb-2">{weaknessText}</p>
                    {searchTerms.length > 0 && (
                      <div className="d-flex flex-wrap gap-1 align-items-center">
                        <small className="text-muted me-1">Learn more:</small>
                        {searchTerms.map((term, termIdx) => (
                          <a
                            key={termIdx}
                            href={`https://www.google.com/search?q=${encodeURIComponent(term)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="badge bg-light text-dark text-decoration-none border"
                            style={{ fontSize: '0.75rem', fontWeight: 'normal', padding: '0.35rem 0.5rem' }}
                          >
                            🔍 {term}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )
    }
    
    // Standard rendering for other sections
    return (
      <div className="col-md-6 mb-4">
        <div className={`card h-100 border-${colorClass}`}>
          <div className={`card-header bg-${colorClass} text-white`}>
            <h5 className="mb-0">
              <span className="me-2">{icon}</span>
              {title}
            </h5>
          </div>
          <div className="card-body">
            {items && items.length > 0 ? (
              <ul className="mb-0">
                {items.map((item, idx) => (
                  <li key={idx} className="mb-2">
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted mb-0">No items identified</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-3">
        <div>
          <h5 className="mb-1">SWOT Analysis</h5>
          <p className="text-muted small mb-0">
            Comparing your CV, portfolio projects, and the job specification
            {savedAnalysis && (
              <span className="badge bg-success ms-2">
                Saved {new Date(savedAnalysis.updated_at).toLocaleDateString()}
              </span>
            )}
          </p>
        </div>
        <div className="d-flex gap-2">
          <button
            className="btn btn-sm btn-success"
            onClick={saveSwotAnalysis}
            disabled={saving || !swotData}
            title={savedAnalysis ? "Update saved analysis" : "Save this analysis"}
          >
            {saving ? '💾 Saving...' : (savedAnalysis ? '💾 Update' : '💾 Preserve')}
          </button>
          <button
            className="btn btn-sm btn-outline-secondary"
            onClick={loadSwotAnalysis}
            title="Regenerate analysis"
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {saveSuccess && (
        <div className="alert alert-success alert-dismissible fade show" role="alert">
          {savedAnalysis ? 'SWOT analysis updated successfully!' : 'SWOT analysis saved successfully!'}
          <button
            type="button"
            className="btn-close"
            onClick={() => setSaveSuccess(false)}
            aria-label="Close"
          />
        </div>
      )}

      <div className="row">
        {renderSection('Strengths', swotData.strengths, 'success', '💪')}
        {renderSection('Weaknesses', swotData.weaknesses, 'danger', '⚠️')}
        {renderSection('Opportunities', swotData.opportunities, 'info', '🌟')}
        {renderSection('Threats', swotData.threats, 'warning', '⚡')}
      </div>

      <div className="alert alert-light border mt-3" role="alert">
        <small className="text-muted">
          <strong>Note:</strong> This analysis is generated by AI and should be used as a guide. 
          Review and verify the insights based on your knowledge of the role and your experience.
          Click the search term badges under weaknesses to find relevant articles and advice on Google.
          {savedAnalysis && (
            <> Clicking "Update" will replace your previously saved analysis with the current one.</>
          )}
          {(swotData.model ||
            swotData.input_tokens != null ||
            swotData.output_tokens != null) && (
            <>
              {' '}
              <span className="d-block mt-2">
                Model: {swotData.model ?? '—'}. Input tokens:{' '}
                {swotData.input_tokens != null ? swotData.input_tokens : '—'}. Output tokens:{' '}
                {swotData.output_tokens != null ? swotData.output_tokens : '—'}
                {swotData.input_tokens != null &&
                  swotData.output_tokens != null &&
                  '. These totals include every completion call used for this run (including any repair step).'}
              </span>
            </>
          )}
        </small>
      </div>
    </div>
  )
}
