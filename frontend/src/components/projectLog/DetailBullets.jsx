/** Format YYYY-MM or YYYY-MM-DD for display. */
export function formatLogDate(value) {
  if (!value) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  if (/^\d{4}-\d{2}$/.test(value)) {
    const [y, m] = value.split('-').map(Number)
    return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
  }
  return value
}

/**
 * Renders ticket achieved / activity details as a bullet list.
 * Accepts a string (one bullet), string[] (multiple), or empty.
 */
export default function DetailBullets({ value, emptyMessage = 'Not yet achieved.' }) {
  const items = Array.isArray(value) ? value.filter(Boolean) : value ? [value] : []

  if (items.length === 0) {
    return <p className="mb-0 text-body-secondary fst-italic">{emptyMessage}</p>
  }

  if (items.length === 1) {
    return <p className="mb-0">{items[0]}</p>
  }

  return (
    <ul className="mb-0 ps-3 project-log-bullets">
      {items.map((line, index) => (
        <li key={index} className="mb-1">
          {line}
        </li>
      ))}
    </ul>
  )
}
