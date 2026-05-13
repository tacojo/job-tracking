/**
 * Stage type definitions and constants
 * 
 * This is the SINGLE SOURCE OF TRUTH for all stage definitions.
 * When adding a new stage, just add it here with all its properties,
 * and all other constants will be automatically derived.
 */

/**
 * Generate a color gradient between two RGB colors
 * @param {Object} startRgb - Starting RGB color {r, g, b}
 * @param {Object} endRgb - Ending RGB color {r, g, b}
 * @param {number} steps - Number of colors to generate
 * @returns {string[]} Array of hex color strings
 */
function generateGradient(startRgb, endRgb, steps) {
  const colors = []
  for (let i = 0; i < steps; i++) {
    const ratio = i / (steps - 1)
    const r = Math.round(startRgb.r + (endRgb.r - startRgb.r) * ratio)
    const g = Math.round(startRgb.g + (endRgb.g - startRgb.g) * ratio)
    const b = Math.round(startRgb.b + (endRgb.b - startRgb.b) * ratio)
    const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
    colors.push(hex)
  }
  return colors
}

// Generate blue gradient from light to dark (for STAGE_1 through STAGE_5)
const STAGE_BLUE_GRADIENT = generateGradient(
  { r: 231, g: 241, b: 255 }, // Light blue
  { r: 13, g: 110, b: 253 },  // Bootstrap primary blue
  5
)

/**
 * Master stage definitions with all properties
 */
const STAGE_DEFINITIONS = [
  { value: 'APPLIED', label: 'Applied', order: 1, color: '#dee2e6', isTerminus: false, isInactive: false },
  { value: 'RECRUITER_CALL', label: 'Recruiter Call', order: 2, color: '#fff3cd', isTerminus: false, isInactive: false },
  { value: 'STAGE_1', label: 'Stage 1', order: 3, color: STAGE_BLUE_GRADIENT[0], isTerminus: false, isInactive: false },
  { value: 'STAGE_2', label: 'Stage 2', order: 4, color: STAGE_BLUE_GRADIENT[1], isTerminus: false, isInactive: false },
  { value: 'STAGE_3', label: 'Stage 3', order: 5, color: STAGE_BLUE_GRADIENT[2], isTerminus: false, isInactive: false },
  { value: 'STAGE_4', label: 'Stage 4', order: 6, color: STAGE_BLUE_GRADIENT[3], isTerminus: false, isInactive: false },
  { value: 'STAGE_5', label: 'Stage 5', order: 7, color: STAGE_BLUE_GRADIENT[4], isTerminus: false, isInactive: false },
  { value: 'OFFER', label: 'Offer', order: 8, color: '#198754', isTerminus: true, isInactive: false },
  { value: 'REJECTED', label: 'Rejected', order: 9, color: '#dc3545', isTerminus: true, isInactive: true },
  { value: 'NO_FEEDBACK', label: 'No Feedback', order: 10, color: '#6c757d', isTerminus: true, isInactive: true },
]

/**
 * Stage types for dropdowns (includes "All stages" option)
 */
export const STAGE_TYPES = [
  { value: '', label: 'All stages' },
  ...STAGE_DEFINITIONS,
]

/**
 * Mapping of stage values to display labels
 */
export const STAGE_LABELS = Object.fromEntries(
  STAGE_DEFINITIONS.map((s) => [s.value, s.label])
)

/**
 * Ordered list of stage values (for sequencing/progression)
 */
export const STAGE_ORDER = STAGE_DEFINITIONS
  .sort((a, b) => a.order - b.order)
  .map((s) => s.value)

/**
 * Stages that represent the end of an application process
 */
export const TERMINUS_STAGES = STAGE_DEFINITIONS
  .filter((s) => s.isTerminus)
  .map((s) => s.value)

/**
 * Stages that indicate the application is no longer active (unsuccessful outcomes)
 */
export const INACTIVE_STAGES = STAGE_DEFINITIONS
  .filter((s) => s.isInactive)
  .map((s) => s.value)

/**
 * Stage colors for visualization
 */
export const STAGE_COLORS = Object.fromEntries(
  STAGE_DEFINITIONS.map((s) => [s.value, s.color])
)

/**
 * Activity type definitions
 */
export const ACTIVITY_LABELS = {
  call: 'call',
  hometest: 'home test',
  pair_programming: 'pair programming',
}
