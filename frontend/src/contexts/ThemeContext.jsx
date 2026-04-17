import { createContext, useContext, useEffect, useState } from 'react'

const ThemeContext = createContext(null)

const STORAGE_KEY = 'job_tracker_theme'

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || 'light'
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-bs-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
    const meta = document.getElementById('theme-color-meta')
    if (meta) {
      if (theme === 'dark') {
        meta.setAttribute('content', '#212529')
      } else {
        try {
          const s = localStorage.getItem('job_tracker_settings')
          const accent = s ? JSON.parse(s).accentColor : null
          meta.setAttribute('content', accent || '#228b22')
        } catch {
          meta.setAttribute('content', '#228b22')
        }
      }
    }
  }, [theme])

  const toggleTheme = () => {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
