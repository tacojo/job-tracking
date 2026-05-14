import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowDown, faArrowUp } from './icons'

/** Active sort direction indicator for table headers */
export default function SortIndicator({ active, ascending }) {
  if (!active) return null
  return (
    <FontAwesomeIcon
      icon={ascending ? faArrowUp : faArrowDown}
      className="sort-indicator ms-1 text-body-secondary align-middle"
      aria-hidden
    />
  )
}
