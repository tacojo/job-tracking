/**
 * Standard page title row: title, optional subtitle, optional actions (buttons, links).
 */
export default function PageHeader({
  title,
  titleAs: TitleTag = 'h1',
  subtitle,
  actions,
  className = '',
}) {
  return (
    <header className={`page-header d-flex flex-wrap justify-content-between align-items-start gap-3 mb-4 ${className}`.trim()}>
      <div className="min-w-0 flex-grow-1">
        <TitleTag className="page-header__title h4 mb-0 text-body">{title}</TitleTag>
        {subtitle ? (
          <p className="page-header__subtitle text-body-secondary small mb-0 mt-1">{subtitle}</p>
        ) : null}
      </div>
      {actions != null && actions !== false ? (
        <div className="page-header__actions d-flex align-items-center flex-wrap gap-2 flex-shrink-0">
          {actions}
        </div>
      ) : null}
    </header>
  )
}
