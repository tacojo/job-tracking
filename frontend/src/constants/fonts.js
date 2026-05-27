/** App shell default — matches index.css body stack (Inter + OS UI fallbacks). */
export const APP_DEFAULT_FONT =
  "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

/** Documentation-oriented typefaces; web fonts loaded in index.html. */
export const FONT_OPTIONS = [
  {
    name: 'System default',
    value: APP_DEFAULT_FONT,
    description:
      'Inter with your OS UI font as fallback — Segoe UI on Windows, San Francisco on Mac, Roboto on Android.',
  },
  {
    name: 'Sans serif',
    value: 'sans-serif',
    description: 'Generic sans-serif — the browser picks its default (often Arial or Helvetica).',
  },
  {
    name: 'Serif',
    value: 'serif',
    description: 'Generic serif — the browser picks its default (often Times New Roman).',
  },
  {
    name: 'Inter',
    value: "'Inter', sans-serif",
    description: 'Neutral UI sans used by many product docs and dashboards.',
  },
  {
    name: 'Open Sans',
    value: "'Open Sans', sans-serif",
    description: 'Humanist sans common in wikis, help centres, and Google-style docs.',
  },
  {
    name: 'Source Sans 3',
    value: "'Source Sans 3', sans-serif",
    description: 'Adobe’s open-source sans, widely used in technical documentation.',
  },
  {
    name: 'Georgia',
    value: 'Georgia, "Times New Roman", serif',
    description: 'Screen-tuned serif for long-form reading.',
  },
  {
    name: 'Monospace',
    value: 'ui-monospace, SFMono-Regular, "SF Mono", Consolas, "Liberation Mono", monospace',
    description: 'Fixed-width stack for code snippets and reference tables.',
  },
]
