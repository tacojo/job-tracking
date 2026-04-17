/**
 * Mask sensitive text for demo/privacy mode.
 * Now shows only the **first letter** of each word.
 *
 * Examples:
 * "John Doe"   -> "J*** D**"
 * "Acme Corp"  -> "A*** C***"
 */
export function maskText(text) {
  if (!text || typeof text !== 'string') return text
  return text
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return ''
      const visible = 1
      return word.slice(0, visible) + '*'.repeat(Math.max(0, word.length - visible))
    })
    .join(' ')
}
