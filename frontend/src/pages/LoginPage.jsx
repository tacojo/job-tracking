import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useAuth } from '../contexts/AuthContext'
import { api } from '../api'
import { ThemeToggleButton } from '../components/ui'
import { faGoogle } from '../components/ui/icons'

export default function LoginPage() {
  const { login } = useAuth()
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
      <ThemeToggleButton variant="login" className="position-absolute top-0 end-0 m-3" />
      <div className="card shadow-sm w-100 mx-2" style={{ maxWidth: '22rem' }}>
        <div className="card-body text-center p-5">
          <h2 className="card-title mb-4">Job Tracker</h2>
          <p className="text-muted mb-4">
            Sign in with your Google account to manage your job applications.
          </p>
          <button
            type="button"
            className="btn btn-forest btn-lg w-100 d-flex align-items-center justify-content-center gap-2"
            onClick={login}
          >
            <FontAwesomeIcon icon={faGoogle} aria-hidden />
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
