import {
  FONT_SIZE_SCALE_MAX,
  FONT_SIZE_SCALE_MIN,
} from '../../constants/appearance'

function stepLabel(step) {
  if (step === 0) return '0'
  return step > 0 ? `+${step}` : String(step)
}

const SCALE_STEPS = Array.from(
  { length: FONT_SIZE_SCALE_MAX - FONT_SIZE_SCALE_MIN + 1 },
  (_, i) => FONT_SIZE_SCALE_MIN + i,
)

export default function FontSizeScaleControl({ value, onChange, className = '' }) {
  return (
    <div
      className={`font-size-scale ${className}`.trim()}
      role="group"
      aria-label="Text size"
    >
      {SCALE_STEPS.map((step) => (
        <button
          key={step}
          type="button"
          className={`font-size-scale__step${value === step ? ' active' : ''}`}
          aria-pressed={value === step}
          aria-label={step === 0 ? 'Default text size' : `Text size ${stepLabel(step)}`}
          onClick={() => onChange(step)}
        >
          {stepLabel(step)}
        </button>
      ))}
    </div>
  )
}
