import { useSettings } from '../contexts/SettingsContext'
import { maskText } from '../utils/maskText'

/** Returns text masked when privacy/demo mode is on, otherwise original. */
export function useDisplayText(text) {
  const { settings } = useSettings()
  const value = text ?? ''
  if (!settings.maskSensitive || !value) return value
  return maskText(String(value))
}
