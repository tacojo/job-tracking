import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [navOpen, setNavOpen] = useState(false)

  return (
    <>
      <nav className="navbar navbar-expand-lg navbar-dark bg-forest">
        <div className="container-fluid container-lg">
          <Link className="navbar-brand" to="/applications">
            📋 Job Tracker
          </Link>
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
            <div className="navbar-nav ms-auto align-items-lg-center flex-wrap gap-1 gap-lg-0">
              <Link className="nav-link" to="/analytics" onClick={() => setNavOpen(false)}>
                Analytics
              </Link>
              <span className="navbar-text text-white-50 mx-1 d-none d-lg-inline">|</span>
              <Link className="nav-link" to="/applications" onClick={() => setNavOpen(false)}>
                Applications
              </Link>
              <span className="navbar-text text-white-50 mx-1 d-none d-lg-inline">|</span>
              <Link className="nav-link" to="/recruiters" onClick={() => setNavOpen(false)}>
                Recruiters
              </Link>
              <Link className="nav-link" to="/companies" onClick={() => setNavOpen(false)}>
                Companies
              </Link>
              <span className="navbar-text text-white-50 mx-1 d-none d-lg-inline">|</span>
              <Link className="nav-link" to="/cvs" onClick={() => setNavOpen(false)}>
                My CVs
              </Link>
              <span className="navbar-text text-white-50 mx-1 d-none d-lg-inline">|</span>
              <Link className="nav-link" to="/prospect" onClick={() => setNavOpen(false)}>
                Prospect
              </Link>
              <span className="navbar-text text-white-50 mx-1 d-none d-lg-inline">|</span>
              <Link className="nav-link" to="/settings" onClick={() => setNavOpen(false)}>
                Settings
              </Link>
              <span className="navbar-text text-white-50 mx-2 small text-truncate" style={{ maxWidth: 150 }}>
                {user?.email}
              </span>
              <button
                className="btn btn-outline-light btn-sm me-1"
                onClick={toggleTheme}
                aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
                title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
              >
                {theme === 'dark' ? '☀' : '☽'}
              </button>
              <button
                className="btn btn-outline-light btn-sm"
                onClick={logout}
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      </nav>
      <main className="container-fluid container-lg py-3 py-md-4 px-2 px-md-3">{children}</main>
    </>
  )
}
