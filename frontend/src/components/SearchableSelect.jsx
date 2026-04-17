import { useState, useRef, useEffect } from 'react'

/**
 * Searchable dropdown with case-insensitive filtering.
 * Options are sorted case-insensitively.
 */
export default function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Select…',
  required = false,
  hasOther = false,
  onOtherSelect,
  emptyOption = null,
  mask = false,
  maskText = (x) => x,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  const sorted = [...options].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { sensitivity: 'base' })
  )
  const filtered = search.trim()
    ? sorted.filter((o) =>
        String(o).toLowerCase().includes(search.trim().toLowerCase())
      )
    : sorted

  const displayValue =
    value === '__other__' ? 'Other…' : value ? (mask ? maskText(value) : value) : ''

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (v) => {
    if (v === '__other__') {
      onChange('__other__')
      onOtherSelect?.()
      setOpen(false)
    } else {
      onChange(v)
      setSearch('')
      setOpen(false)
    }
  }

  const handleInputChange = (e) => {
    if (mask) return
    setSearch(e.target.value)
    setOpen(true)
  }

  const handleInputFocus = () => {
    if (mask) return
    setSearch(value && value !== '__other__' ? value : '')
    setOpen(true)
  }

  const handleInputKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
    if (e.key === 'Enter' && filtered.length === 1 && !hasOther) {
      e.preventDefault()
      handleSelect(filtered[0])
    }
  }

  return (
    <div ref={containerRef} className="position-relative">
      <input
        id={id}
        type="text"
        className="form-control"
        value={open ? search : displayValue}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleInputKeyDown}
        placeholder={placeholder}
        required={required && !value}
        autoComplete="off"
        readOnly={mask}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-controls={open ? `${id}-listbox` : undefined}
      />
      {open && (
        <ul
          id={`${id}-listbox`}
          className="list-group position-absolute top-100 start-0 end-0 mt-1 shadow-sm"
          style={{ maxHeight: '200px', overflowY: 'auto', zIndex: 1050 }}
          role="listbox"
        >
          {emptyOption !== null && (
            <li
              role="option"
              className="list-group-item list-group-item-action"
              onClick={() => handleSelect('')}
            >
              {emptyOption}
            </li>
          )}
          {filtered.map((opt) => (
            <li
              key={opt}
              role="option"
              aria-selected={opt === value}
              className={`list-group-item list-group-item-action ${opt === value ? 'active' : ''}`}
              onClick={() => handleSelect(opt)}
            >
              {mask ? maskText(opt) : opt}
            </li>
          ))}
          {hasOther && (
            <li
              role="option"
              className="list-group-item list-group-item-action"
              onClick={() => handleSelect('__other__')}
            >
              Other…
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
