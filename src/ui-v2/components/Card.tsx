import type { HTMLAttributes, ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { shadows } from '../design-system/shadows.js'
import { spacing } from '../design-system/spacing.js'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  action?: ReactNode
  padding?: keyof typeof spacing
}

export function Card({ title, action, padding = 6, children, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      style={{
        background: `linear-gradient(160deg, ${colors.bg[500]} 0%, ${colors.bg[600]} 60%)`,
        border: `1px solid ${colors.border.subtle}`,
        borderTop: `1px solid ${colors.border.default}`,
        borderRadius: radius['2xl'],
        padding: spacing[padding],
        boxShadow: `${shadows.md}, inset 0 1px 0 rgba(255,255,255,.03)`,
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
          {title && <h3 style={{ fontSize: 14, fontWeight: 700, color: colors.text[700], letterSpacing: '-.02em' }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
