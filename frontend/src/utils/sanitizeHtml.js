const ALLOWED_TAGS = new Set([
  'b',
  'blockquote',
  'br',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'i',
  'li',
  'ol',
  'p',
  'pre',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
])

const DROP_WITH_CONTENT = new Set([
  'iframe',
  'math',
  'object',
  'script',
  'style',
  'svg',
])

/**
 * Keep DOCX previews readable while stripping active content and attributes.
 * Mammoth output is still treated as untrusted because users can upload files.
 */
export function sanitizePreviewHtml(html) {
  const doc = new DOMParser().parseFromString(html || '', 'text/html')
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT)
  const nodes = []

  while (walker.nextNode()) nodes.push(walker.currentNode)

  for (const node of nodes.reverse()) {
    const tag = node.tagName.toLowerCase()

    if (DROP_WITH_CONTENT.has(tag)) {
      node.remove()
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) {
      node.replaceWith(...Array.from(node.childNodes))
      continue
    }

    for (const attr of Array.from(node.attributes)) {
      node.removeAttribute(attr.name)
    }
  }

  return doc.body.innerHTML
}
