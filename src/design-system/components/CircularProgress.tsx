import { type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'
import type { SemanticTone } from './MetricCard'
import { cx, percentage } from './internal'

export interface CircularProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  value: number
  max?: number
  size?: number
  strokeWidth?: number
  label?: ReactNode
  valueLabel?: ReactNode
  ariaLabel?: string
  tone?: SemanticTone
  children?: ReactNode
}

export function CircularProgress({
  value,
  max = 100,
  size = 120,
  strokeWidth = 8,
  label,
  valueLabel,
  ariaLabel = 'Progreso',
  tone = 'brand',
  children,
  className,
  style,
  ...props
}: CircularProgressProps) {
  const percent = percentage(value, max)
  const radius = 50 - strokeWidth / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - percent / 100)
  const wrapperStyle = { '--ds-circular-size': `${size}px`, ...style } as CSSProperties

  return (
    <div
      {...props}
      className={cx('ds-circular-progress', `ds-tone--${tone}`, className)}
      style={wrapperStyle}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max > 0 ? max : 100}
      aria-valuenow={Math.min(Math.max(value, 0), max > 0 ? max : 100)}
      aria-valuetext={typeof valueLabel === 'string' ? valueLabel : `${Math.round(percent)}%`}
    >
      <svg className="ds-circular-progress__svg" viewBox="0 0 100 100" aria-hidden="true">
        <circle className="ds-circular-progress__track" cx="50" cy="50" r={radius} strokeWidth={strokeWidth} />
        <circle
          className="ds-circular-progress__value"
          cx="50"
          cy="50"
          r={radius}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ds-circular-progress__content">
        {valueLabel !== undefined ? <strong className="ds-circular-progress__number ds-tabular-numbers">{valueLabel}</strong> : null}
        {label ? <span className="ds-circular-progress__label">{label}</span> : null}
        {children}
      </div>
    </div>
  )
}
