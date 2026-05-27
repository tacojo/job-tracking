export const FONT_SIZE_SCALE_MIN = -2
export const FONT_SIZE_SCALE_MAX = 2
export const FONT_SIZE_BASE_REM = 0.875
export const FONT_SIZE_SCALE_STEP_REM = 0.0625

export function normalizeFontSizeScale(value) {
  const n = typeof value === 'number' ? value : parseInt(value, 10)
  if (Number.isNaN(n)) return 0
  return Math.min(FONT_SIZE_SCALE_MAX, Math.max(FONT_SIZE_SCALE_MIN, Math.round(n)))
}

export function formatFontSizeScale(scale) {
  if (scale === 0) return 'Default (0)'
  return scale > 0 ? `+${scale}` : String(scale)
}

/** Sets --app-body-size and related tokens from scale −2…+2. */
export function applyFontSizeScaleCss(root, scale) {
  const bodyRem = FONT_SIZE_BASE_REM + scale * FONT_SIZE_SCALE_STEP_REM
  const btnRem = Math.max(0.75, bodyRem - 0.0625)
  const inputHeightRem = bodyRem + 0.625
  root.style.setProperty('--app-body-size', `${bodyRem}rem`)
  root.style.setProperty('--app-btn-font-size', `${btnRem}rem`)
  root.style.setProperty('--app-input-height', `${inputHeightRem}rem`)
}
