import type { ReactNode } from 'react'
import { IconFolder } from './Icons.js'

export interface ProductStateProps {
  title: string
  description?: string
  icon?: ReactNode
  actionLabel?: string
  onAction?: () => void
  compact?: boolean
}

export function ProductState({ title, description, icon, actionLabel, onAction, compact = false }: ProductStateProps) {
  return (
    <section className={`ti-product-state${compact ? ' ti-product-state--compact' : ''}`} role="status" aria-live="polite">
      <div className="ti-product-state__content">
        <span className="ti-product-state__icon" aria-hidden="true">{icon ?? <IconFolder />}</span>
        <h3>{title}</h3>
        {description && <p>{description}</p>}
        {actionLabel && onAction && <button type="button" onClick={onAction}>{actionLabel}</button>}
      </div>
    </section>
  )
}
