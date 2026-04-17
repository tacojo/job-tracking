import { useEffect, useState } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useTheme } from '../contexts/ThemeContext'
import { api } from '../api'

export default function LoginPage() {
  const { login } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [devAvailable, setDevAvailable] = useState(false)
  const [devError, setDevError] = useState(null)

  useEffect(() => {
    api.auth.devAvailable().then((r) => setDevAvailable(r.available)).catch(() => {})
  }, [])

  const handleDevLogin = async () => {
    setDevError(null)
    try {
      const { auth_token } = await api.auth.devLogin()
      localStorage.setItem('auth_token', auth_token)
      window.location.href = '/applications'
    } catch (e) {
      setDevError('Dev login not available. Set BYPASS_AUTH=true in the backend.')
    }
  }

  return (
    <div className="d-flex align-items-center justify-content-center min-vh-100 position-relative">
      <button
        className="btn btn-outline-secondary btn-sm position-absolute top-0 end-0 m-3"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
      >
        {theme === 'dark' ? '☀' : '☽'}
      </button>
      <div className="card shadow-sm w-100 mx-2" style={{ maxWidth: '22rem' }}>
        <div className="card-body text-center p-5">
          <h2 className="card-title mb-4">Job Tracker</h2>
          <p className="text-muted mb-4">
            Sign in with your Google account to manage your job applications.
          </p>
          <button
            className="btn btn-forest btn-lg w-100 d-flex align-items-center justify-content-center gap-2"
            onClick={login}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
          {devError && (
            <div className="alert alert-danger py-2 mb-3" role="alert">
              {devError}
            </div>
          )}
          {devAvailable && (
            <button
              className="btn btn-outline-secondary btn-sm w-100 mt-3"
              onClick={handleDevLogin}
            >
              Dev login (skip Google)
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
