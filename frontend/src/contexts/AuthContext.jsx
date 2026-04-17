import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = async () => {
    // Check for token in URL (OAuth callback)
    const params = new URLSearchParams(window.location.search)
    const tokenFromUrl = params.get('auth_token')
    if (tokenFromUrl) {
      localStorage.setItem('auth_token', tokenFromUrl)
      window.history.replaceState({}, '', window.location.pathname)
    }

    const token = localStorage.getItem('auth_token')
    if (!token) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      const me = await api.auth.me()
      setUser(me)
    } catch {
      localStorage.removeItem('auth_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const login = () => {
    window.location.href = '/api/v1/auth/google'
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // Ignore
    }
    localStorage.removeItem('auth_token')
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
