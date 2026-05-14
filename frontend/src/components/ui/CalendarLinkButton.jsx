import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays } from './icons'

export default function CalendarLinkButton({
  className = '',
  label = 'Calendar',
  href = 'https://calendar.google.com',
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-outline-secondary btn-sm d-inline-flex align-items-center gap-2 ${className}`.trim()}
      title="Open Google Calendar in a new tab"
    >
      <FontAwesomeIcon icon={faCalendarDays} className="fa-fw" aria-hidden />
      <span>{label}</span>
    </a>
  )
}
