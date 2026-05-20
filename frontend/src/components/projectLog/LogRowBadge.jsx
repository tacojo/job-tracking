const STATUS_BADGE = {
  done: 'success',
  planned: 'primary',
  'in-progress': 'warning',
  deferred: 'secondary',
  rejected: 'danger',
  superseded: 'dark',
  accepted: 'success',
  proposed: 'info',
  deprecated: 'secondary',
  feature: 'info',
  bugfix: 'danger',
  debug: 'warning',
  enhancement: 'primary',
  docs: 'secondary',
  refactor: 'secondary',
}

export default function LogRowBadge({ text, variant, className = '' }) {
  const v = variant || STATUS_BADGE[text] || 'secondary'
  return <span className={`badge text-bg-${v} fw-normal ${className}`.trim()}>{text}</span>
}

export function statusVariant(status) {
  return STATUS_BADGE[status] || 'secondary'
}
