import { type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal'

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function EmptyState({ icon, title, description, action, compact = false, className, ...props }: EmptyStateProps) {
  return (
    <div {...props} className={cx('ds-empty-state', compact && 'ds-empty-state--compact', className)}>
      {icon ? <div className="ds-empty-state__icon" aria-hidden="true">{icon}</div> : null}
      <div className="ds-empty-state__copy">
        <h3 className="ds-empty-state__title">{title}</h3>
        {description ? <p className="ds-empty-state__description">{description}</p> : null}
      </div>
      {action ? <div className="ds-empty-state__action">{action}</div> : null}
    </div>
  )
}
