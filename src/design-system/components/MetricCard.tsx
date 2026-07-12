import { type ReactNode } from 'react'
import { Card, type CardProps } from './Card'
import { cx } from './internal'

export type SemanticTone = 'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

export interface MetricTrend {
  direction?: 'up' | 'down' | 'flat'
  label: string
}

export interface MetricCardProps extends Omit<CardProps, 'children'> {
  label: string
  value: ReactNode
  icon?: ReactNode
  supportingText?: ReactNode
  trend?: MetricTrend
  tone?: SemanticTone
}

function TrendGlyph({ direction }: { direction: NonNullable<MetricTrend['direction']> }) {
  if (direction === 'flat') {
    return <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" /></svg>
  }
  const transform = direction === 'down' ? 'rotate(90 8 8)' : undefined
  return <svg viewBox="0 0 16 16" aria-hidden="true" style={{ transform }}><path d="m4 10 6-6m0 0H5m5 0v5" /></svg>
}

export function MetricCard({
  label,
  value,
  icon,
  supportingText,
  trend,
  tone = 'neutral',
  className,
  ...props
}: MetricCardProps) {
  return (
    <Card {...props} className={cx('ds-metric-card', `ds-tone--${tone}`, className)}>
      <div className="ds-metric-card__topline">
        {icon ? <span className="ds-metric-card__icon" aria-hidden="true">{icon}</span> : null}
        <span className="ds-metric-card__label">{label}</span>
      </div>
      <div className="ds-metric-card__value ds-tabular-numbers">{value}</div>
      {trend || supportingText ? (
        <div className="ds-metric-card__support">
          {trend ? (
            <span className={cx('ds-metric-card__trend', `ds-metric-card__trend--${trend.direction ?? 'flat'}`)}>
              <TrendGlyph direction={trend.direction ?? 'flat'} />
              {trend.label}
            </span>
          ) : null}
          {supportingText ? <span className="ds-metric-card__supporting-text">{supportingText}</span> : null}
        </div>
      ) : null}
    </Card>
  )
}
