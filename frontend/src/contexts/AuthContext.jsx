import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  const checkAuth = async () => {
    try {
      const me = await api.auth.me()
      if (me.csrf_token) {
        sessionStorage.setItem('csrf_token', me.csrf_token)
      } else {
        sessionStorage.removeItem('csrf_token')
      }
      setUser(me)
    } catch {
      localStorage.removeItem('auth_token')
      sessionStorage.removeItem('csrf_token')
      setUser(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    checkAuth()
  }, [])

  const login = () => {
    const base = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
    window.location.href = `${base}/api/v1/auth/google`
  }

  const logout = async () => {
    try {
      await api.auth.logout()
    } catch {
      // Ignore
    }
    localStorage.removeItem('auth_token')
    sessionStorage.removeItem('csrf_token')
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
