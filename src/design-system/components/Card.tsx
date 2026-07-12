import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cx } from './internal'

export type CardPadding = 'none' | 'sm' | 'md' | 'lg'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: CardPadding
  interactive?: boolean
  selected?: boolean
  children: ReactNode
}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
  { padding = 'md', interactive = false, selected = false, className, children, ...props },
  ref,
) {
  return (
    <div
      {...props}
      ref={ref}
      data-selected={selected || undefined}
      className={cx('ds-card', `ds-card--padding-${padding}`, interactive && 'ds-card--interactive', className)}
    >
      {children}
    </div>
  )
})
