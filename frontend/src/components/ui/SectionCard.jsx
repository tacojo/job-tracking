/**
 * Consistent card shell: optional default header (title + aside) or custom header (e.g. tabs).
 */
export default function SectionCard({
  title,
  headerAside,
  header,
  children,
  className = '',
  bodyClassName = '',
}) {
  const showDefaultHeader = header == null && title != null

  return (
    <section className={`section-card card mb-4 ${className}`.trim()}>
      {header != null ? <div className="card-header">{header}</div> : null}
      {showDefaultHeader ? (
        <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
          <div className="section-card__title fw-semibold mb-0 text-body">{title}</div>
          {headerAside}
        </div>
      ) : null}
      <div className={`card-body ${bodyClassName}`.trim()}>{children}</div>
    </section>
  )
}
