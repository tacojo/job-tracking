import { createContext, useContext, useEffect, useState } from 'react'
import { APP_DEFAULT_FONT } from '../constants/fonts'
import {
  applyFontSizeScaleCss,
  normalizeFontSizeScale,
} from '../constants/appearance'

const SettingsContext = createContext(null)

const STORAGE_KEY = 'job_tracker_settings'

const DEFAULT_ACCENT = '#228b22'
const DEFAULT_FONT = APP_DEFAULT_FONT

const DEFAULTS = {
  accentColor: '#228b22',
  fontFamily: APP_DEFAULT_FONT,
  fontSizeScale: 0,
  maskSensitive: false,
  preferredJobTitles: [],
  skillsStack: [],
  locationPreference: '',
  salaryRange: { min: null, max: null },
  defaultCvId: null,
  defaultCoverLetterId: null,
}

function _darken(hex, pct) {
  const num = parseInt(hex.slice(1), 16)
  const r = Math.max(0, ((num >> 16) & 0xff) * (1 - pct))
  const g = Math.max(0, ((num >> 8) & 0xff) * (1 - pct))
  const b = Math.max(0, (num & 0xff) * (1 - pct))
  return `#${Math.round(r).toString(16).padStart(2, '0')}${Math.round(g).toString(16).padStart(2, '0')}${Math.round(b).toString(16).padStart(2, '0')}`
}

function normalizeFontFamily(value) {
  if (!value || value === 'system-ui') return DEFAULT_FONT
  if (value === '"SF Mono", Monaco, monospace') {
    return 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace'
  }
  if (value === 'Georgia, serif') return 'Georgia, "Times New Roman", serif'
  return value
}

function loadSettings() {
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s) {
      const parsed = JSON.parse(s)
      return {
        ...DEFAULTS,
        accentColor: parsed.accentColor || DEFAULT_ACCENT,
        fontFamily: normalizeFontFamily(parsed.fontFamily),
        fontSizeScale: normalizeFontSizeScale(parsed.fontSizeScale),
        maskSensitive: !!parsed.maskSensitive,
        preferredJobTitles: Array.isArray(parsed.preferredJobTitles) ? parsed.preferredJobTitles : [],
        skillsStack: Array.isArray(parsed.skillsStack) ? parsed.skillsStack : [],
        locationPreference: typeof parsed.locationPreference === 'string' ? parsed.locationPreference : '',
        salaryRange: {
          min: typeof parsed.salaryRange?.min === 'number' ? parsed.salaryRange.min : null,
          max: typeof parsed.salaryRange?.max === 'number' ? parsed.salaryRange.max : null,
        },
        defaultCvId: typeof parsed.defaultCvId === 'number' ? parsed.defaultCvId : null,
        defaultCoverLetterId: typeof parsed.defaultCoverLetterId === 'number' ? parsed.defaultCoverLetterId : null,
      }
    }
  } catch {}
  return { ...DEFAULTS }
}

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState(loadSettings)

  useEffect(() => {
    const root = document.documentElement
    root.style.setProperty('--bs-accent', settings.accentColor)
    root.style.setProperty('--bs-accent-hover', _darken(settings.accentColor, 0.1))
    root.style.setProperty('--bs-accent-active', _darken(settings.accentColor, 0.2))
    root.style.setProperty('--bs-font', settings.fontFamily)
    document.body.style.fontFamily = settings.fontFamily
    applyFontSizeScaleCss(root, settings.fontSizeScale)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    const meta = document.getElementById('theme-color-meta')
    if (meta) meta.setAttribute('content', settings.accentColor)
  }, [settings])

  const setSettings = (updates) => {
    setSettingsState((prev) => ({ ...prev, ...updates }))
  }

  return (
    <SettingsContext.Provider value={{ settings, setSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used within SettingsProvider')
  return ctx
}
