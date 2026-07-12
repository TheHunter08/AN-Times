import { type HTMLAttributes, type ReactNode } from 'react'
import type { SemanticTone } from './MetricCard'
import { cx, percentage } from './internal'

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number
  max?: number
  label?: ReactNode
  valueLabel?: string
  showValue?: boolean
  size?: 'sm' | 'md' | 'lg'
  tone?: SemanticTone
}

export function Progress({
  value,
  max = 100,
  label,
  valueLabel,
  showValue = false,
  size = 'md',
  tone = 'brand',
  className,
  ...props
}: ProgressProps) {
  const percent = percentage(value, max)
  const readableValue = valueLabel ?? `${Math.round(percent)}%`

  return (
    <div {...props} className={cx('ds-progress', `ds-progress--${size}`, `ds-tone--${tone}`, className)}>
      {label || showValue ? (
        <div className="ds-progress__header">
          {label ? <span className="ds-progress__label">{label}</span> : <span />}
          {showValue ? <span className="ds-progress__value ds-tabular-numbers">{readableValue}</span> : null}
        </div>
      ) : null}
      <div
        className="ds-progress__track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={max > 0 ? max : 100}
        aria-valuenow={Math.min(Math.max(value, 0), max > 0 ? max : 100)}
        aria-valuetext={readableValue}
      >
        <span className="ds-progress__fill" style={{ transform: `scaleX(${percent / 100})` }} />
      </div>
    </div>
  )
}
