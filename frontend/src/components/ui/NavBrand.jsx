import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faClipboardList } from './icons'

export default function NavBrand({ to = '/applications' }) {
  return (
    <Link className="navbar-brand d-inline-flex align-items-center gap-2" to={to}>
      <FontAwesomeIcon icon={faClipboardList} className="opacity-90" aria-hidden />
      <span>Job Tracker</span>
    </Link>
  )
}
