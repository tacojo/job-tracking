/** Centered page message (error, loading, etc.) using Bootstrap card layout. */
export default function PageMessage({ variant = 'danger', title, children, className = '' }) {
  const isLoading = variant === 'loading'
  return (
    <div className={`d-flex align-items-center justify-content-center py-5 ${className}`} style={{ minHeight: '40vh' }}>
      <div className="card shadow-sm w-100 mx-2" style={{ maxWidth: '28rem' }}>
        <div className="card-body text-center p-4">
          {title && !isLoading && <h5 className="card-title mb-3">{title}</h5>}
          {isLoading ? (
            <div className="text-muted d-flex align-items-center justify-content-center gap-2">
              <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
              <span>{children}</span>
            </div>
          ) : (
            <div className={`alert alert-${variant} mb-0`}>{children}</div>
          )}
        </div>
      </div>
    </div>
  )
}
