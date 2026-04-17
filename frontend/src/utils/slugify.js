/** Create URL-safe slug from text. */
export function slugify(text) {
  if (!text) return ''
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Format date for URL (YYYY-MM-DD). */
export function formatDateForUrl(d) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}
