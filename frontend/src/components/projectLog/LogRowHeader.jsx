import LogRowBadge from './LogRowBadge'

/**
 * Grid-aligned row: status | id | title | labels | date (columns match filter bar + list header).
 */
export default function LogRowHeader({ status, statusVariant = 'secondary', id, title, labels, date }) {
  return (
    <div className="project-log-row">
      <div className="project-log-row__status">
        {status ? (
          <LogRowBadge text={status} variant={statusVariant} className="project-log-row__status-badge" />
        ) : null}
      </div>
      <div className="project-log-row__id fw-semibold text-nowrap">{id}</div>
      <div className="project-log-row__title text-body-secondary text-truncate" title={title}>
        {title}
      </div>
      <div className="project-log-row__labels">
        {labels?.map((l) => (
          <LogRowBadge key={l} text={l} />
        ))}
      </div>
      <div className="project-log-row__date small text-body-secondary text-nowrap">{date || ''}</div>
    </div>
  )
}
