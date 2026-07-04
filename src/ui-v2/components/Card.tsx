import type { HTMLAttributes, ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { spacing } from '../design-system/spacing.js'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  action?: ReactNode
  padding?: keyof typeof spacing
}

// Fondo sólido, borde casi imperceptible, sin degradado ni sombra teatral —
// la superficie se distingue del fondo por un tono, no por decoración.
export function Card({ title, action, padding = 6, children, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      style={{
        background: colors.bg[600],
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg,
        padding: spacing[padding],
        ...style,
      }}
    >
      {(title || action) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing[4] }}>
          {title && <h3 style={{ fontSize: 13, fontWeight: 600, color: colors.text[700], letterSpacing: '-.01em' }}>{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  )
}
