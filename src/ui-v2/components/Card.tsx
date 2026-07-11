import type { HTMLAttributes, ReactNode } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { spacing } from '../design-system/spacing.js'
import { shadows } from '../design-system/shadows.js'

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  action?: ReactNode
  padding?: keyof typeof spacing
}

// La superficie se distingue del fondo por elevación real (sombra +
// tono más claro), no solo por un borde de 1px — así una tarjeta se lee
// como "por encima" de la página en vez de solo "delimitada".
export function Card({ title, action, padding = 6, children, style, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      style={{
        background: colors.bg[600],
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg,
        padding: spacing[padding],
        boxShadow: shadows.sm,
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
