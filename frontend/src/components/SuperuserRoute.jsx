import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import ProtectedRoute from './ProtectedRoute'

/**
 * Authenticated route limited to SUPERUSER_EMAILS (same as Settings danger zone).
 */
export default function SuperuserRoute({ children }) {
  return (
    <ProtectedRoute>
      <SuperuserGate>{children}</SuperuserGate>
    </ProtectedRoute>
  )
}

function SuperuserGate({ children }) {
  const { user } = useAuth()

  if (user?.is_superuser !== true) {
    return <Navigate to="/applications" replace />
  }

  return children
}
