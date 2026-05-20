/** Numeric suffix from JAT-146 / ADR-14 / LOG-3 (not lexicographic string compare). */
export function parseIdNumber(id, prefix) {
  const s = String(id).trim()
  const prefixed = s.match(new RegExp(`^${prefix}-(\\d+)$`, 'i'))
  if (prefixed) return Number(prefixed[1])
  const tail = s.match(/-(\d+)$/)
  return tail ? Number(tail[1]) : 0
}

/** Supports YYYY-MM or YYYY-MM-DD. */
export function parsePartialDate(dateStr) {
  if (!dateStr) return 0
  const [y, m = 1, d = 1] = String(dateStr).split('-').map((n) => Number(n))
  return (y || 0) * 10000 + (m || 1) * 100 + (d || 1)
}

/** Newest id first (JAT-146, ADR-14, LOG-11, …). */
export const DEFAULT_SORT = { field: 'id', dir: 'desc' }

/** Click same column toggles asc/desc; other column sorts desc first. */
export function toggleSortColumn(sort, field) {
  if (sort.field === field) {
    return { field, dir: sort.dir === 'desc' ? 'asc' : 'desc' }
  }
  return { field, dir: 'desc' }
}

export function sortItems(items, sort, { prefix, getUpdated }) {
  const desc = sort.dir === 'desc'
  const byId = sort.field === 'id'

  return [...items].sort((a, b) => {
    const numA = byId ? parseIdNumber(a.id, prefix) : parsePartialDate(getUpdated(a))
    const numB = byId ? parseIdNumber(b.id, prefix) : parsePartialDate(getUpdated(b))
    let cmp = numA - numB
    if (desc) cmp = -cmp
    if (cmp !== 0) return cmp

    const tieA = byId ? parsePartialDate(getUpdated(a)) : parseIdNumber(a.id, prefix)
    const tieB = byId ? parsePartialDate(getUpdated(b)) : parseIdNumber(b.id, prefix)
    let tie = tieA - tieB
    if (desc) tie = -tie
    return tie
  })
}
