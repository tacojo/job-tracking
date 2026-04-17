/** Max asterisks per word so length does not identify the original (e.g. long company names). */
const MAX_MASK_ASTERISKS = 3

/**
 * Mask sensitive text for demo/privacy mode.
 * Shows the first letter of each word plus up to MAX_MASK_ASTERISKS asterisks.
 *
 * Examples:
 * "John Doe"        -> "J*** D***"
 * "United Worldwide" -> "U*** W***"
 */
export function maskText(text) {
  if (!text || typeof text !== 'string') return text
  return text
    .trim()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return ''
      const visible = 1
      const hidden = Math.min(Math.max(0, word.length - visible), MAX_MASK_ASTERISKS)
      return word.slice(0, visible) + '*'.repeat(hidden)
    })
    .join(' ')
}
