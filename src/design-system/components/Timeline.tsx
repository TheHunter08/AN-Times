import { type HTMLAttributes, type ReactNode } from 'react'
import type { SemanticTone } from './MetricCard'
import { cx } from './internal'

export interface TimelineItemData {
  id: string
  title: ReactNode
  time?: ReactNode
  description?: ReactNode
  meta?: ReactNode
  icon?: ReactNode
  tone?: SemanticTone
}

export interface TimelineItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'>, Omit<TimelineItemData, 'id'> {}

export function TimelineItem({
  title,
  time,
  description,
  meta,
  icon,
  tone = 'neutral',
  className,
  ...props
}: TimelineItemProps) {
  return (
    <li {...props} className={cx('ds-timeline__item', `ds-tone--${tone}`, className)}>
      <div className="ds-timeline__rail" aria-hidden="true">
        <span className="ds-timeline__node">{icon}</span>
      </div>
      <div className="ds-timeline__content">
        <div className="ds-timeline__topline">
          <strong className="ds-timeline__title">{title}</strong>
          {time ? <time className="ds-timeline__time ds-tabular-numbers">{time}</time> : null}
        </div>
        {description ? <div className="ds-timeline__description">{description}</div> : null}
        {meta ? <div className="ds-timeline__meta">{meta}</div> : null}
      </div>
    </li>
  )
}

export interface TimelineProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  items?: readonly TimelineItemData[]
  children?: ReactNode
  ariaLabel?: string
  emptyText?: string
}

export function Timeline({ items, children, ariaLabel = 'Cronología', emptyText = 'No hay actividad registrada', className, ...props }: TimelineProps) {
  const hasItems = Boolean(items?.length)
  if (!hasItems && !children) return <p className="ds-timeline__empty">{emptyText}</p>

  return (
    <ol {...props} className={cx('ds-timeline', className)} aria-label={ariaLabel}>
      {items?.map(({ id, ...item }) => <TimelineItem key={id} {...item} />)}
      {children}
    </ol>
  )
}
