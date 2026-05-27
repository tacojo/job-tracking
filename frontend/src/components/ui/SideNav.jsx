/**
 * Vertical sidebar navigation (GitHub-style): plain links, left accent when active.
 */
function SideNavItem({
  active = false,
  danger = false,
  indent = false,
  className = '',
  children,
  ...props
}) {
  const classes = [
    'app-side-nav__item',
    active ? 'active' : '',
    danger ? 'app-side-nav__item--danger' : '',
    indent ? 'app-side-nav__item--indent' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button type="button" className={classes} {...props}>
      {children}
    </button>
  )
}

function SideNavLabel({ children, className = '' }) {
  return (
    <div className={`app-side-nav__label ${className}`.trim()}>{children}</div>
  )
}

export default function SideNav({ children, className = '', 'aria-label': ariaLabel }) {
  return (
    <nav className={`app-side-nav ${className}`.trim()} aria-label={ariaLabel}>
      {children}
    </nav>
  )
}

SideNav.Item = SideNavItem
SideNav.Label = SideNavLabel
