import { type HTMLAttributes, type ReactNode } from 'react'
import type { SemanticTone } from './MetricCard'
import { cx } from './internal'

export interface StatusBadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: SemanticTone
  icon?: ReactNode
  showDot?: boolean
  children: ReactNode
}

export function StatusBadge({ tone = 'neutral', icon, showDot = !icon, className, children, ...props }: StatusBadgeProps) {
  return (
    <span {...props} className={cx('ds-status-badge', `ds-tone--${tone}`, className)}>
      {icon ? <span className="ds-status-badge__icon" aria-hidden="true">{icon}</span> : showDot ? <span className="ds-status-badge__dot" aria-hidden="true" /> : null}
      <span>{children}</span>
    </span>
  )
}
