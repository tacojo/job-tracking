import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../contexts/AuthContext'
import { faRightFromBracket } from './ui/icons'
import { NavBrand, ThemeToggleButton } from './ui'

const NAV_LINKS = [
  { to: '/analytics', label: 'Analytics' },
  { to: '/applications', label: 'Applications' },
  { to: '/recruiters', label: 'Recruiters' },
  { to: '/companies', label: 'Companies' },
  { to: '/cvs', label: 'My CVs' },
  { to: '/prospect', label: 'Prospect' },
  { to: '/project-log', label: 'Project log' },
  { to: '/learning', label: 'Learning' },
  { to: '/settings', label: 'Settings' },
]

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const [navOpen, setNavOpen] = useState(false)

  const closeNav = () => setNavOpen(false)

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-forest app-navbar">
        <div className="container-fluid container-lg">
          <NavBrand />
          <button
            className="navbar-toggler"
            type="button"
            onClick={() => setNavOpen(!navOpen)}
            aria-expanded={navOpen}
            aria-label="Toggle navigation"
          >
            <span className="navbar-toggler-icon" />
          </button>
          <div className={`collapse navbar-collapse ${navOpen ? 'show' : ''}`}>
            <div className="navbar-nav ms-auto align-items-lg-center gap-lg-0">
              {NAV_LINKS.map(({ to, label }) => (
                <Link key={to} className="nav-link" to={to} onClick={closeNav}>
                  {label}
                </Link>
              ))}
            </div>
            <div className="navbar-account-bar">
              <span className="navbar-account-bar__email text-truncate" title={user?.email}>
                {user?.email}
              </span>
              <div className="navbar-account-bar__actions">
                <ThemeToggleButton variant="navbar" />
                <button
                  type="button"
                  className="btn btn-outline-light btn-sm btn-sign-out d-inline-flex align-items-center gap-2"
                  onClick={logout}
                  aria-label="Sign out"
                >
                  <span className="d-none d-sm-inline">Sign out</span>
                  <FontAwesomeIcon icon={faRightFromBracket} className="fa-fw" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>
      <main className="app-main container-fluid container-lg py-3 py-md-4 px-2 px-md-3">{children}</main>
    </>
  )
}
