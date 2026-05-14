import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useTheme } from '../../contexts/ThemeContext'
import { faMoon, faSun } from './icons'

const variantClass = {
  navbar: 'btn btn-outline-light btn-sm btn-theme-toggle',
  login: 'btn btn-outline-secondary btn-sm btn-theme-toggle',
}

/**
 * Theme toggle using Font Awesome (accessible label on the button).
 */
export default function ThemeToggleButton({ variant = 'navbar', className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const btnClass = `${variantClass[variant] || variantClass.navbar} ${className}`.trim()

  return (
    <button
      type="button"
      className={btnClass}
      onClick={toggleTheme}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'Light mode' : 'Dark mode'}
    >
      <FontAwesomeIcon icon={isDark ? faSun : faMoon} className="theme-toggle-icon" aria-hidden />
    </button>
  )
}
