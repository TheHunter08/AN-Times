import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode, CSSProperties } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  fullWidth?: boolean
  icon?: ReactNode
}

const sizeStyles: Record<Size, { padding: string; fontSize: string }> = {
  sm: { padding: '7px 14px', fontSize: '12.5px' },
  md: { padding: '10px 18px', fontSize: '13.5px' },
  lg: { padding: '13px 24px', fontSize: '14.5px' },
}

// Botón primario sólido con una sombra de color suave y difuminada — audaz
// por el color a máxima confianza, no por un borde de cómic o una sombra 3D.
const variantStyles: Record<Variant, CSSProperties> = {
  primary:   { background: colors.primary.base, color: colors.ink.onDark, border: 'none', boxShadow: '0 8px 20px -8px rgba(59,91,255,.6)' },
  secondary: { background: 'rgba(255,255,255,.06)', color: colors.text[700], border: `1px solid ${colors.border.default}` },
  ghost:     { background: 'transparent', color: colors.text[500], border: `1px solid ${colors.border.subtle}` },
  danger:    { background: 'rgba(239,68,68,.12)', color: colors.semantic.red, border: '1px solid rgba(239,68,68,.2)' },
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', fullWidth = false, icon, children, style, className, ...rest },
  ref
) {
  const v = variantStyles[variant]
  const s = sizeStyles[size]
  return (
    <button
      ref={ref}
      {...rest}
      className={`uiv2-btn uiv2-btn-${variant}${className ? ` ${className}` : ''}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        width: fullWidth ? '100%' : undefined,
        padding: s.padding,
        fontSize: s.fontSize,
        fontWeight: 700,
        borderRadius: radius.md,
        cursor: 'pointer',
        fontFamily: 'inherit',
        letterSpacing: '-.01em',
        transition: transition(['transform', 'box-shadow', 'filter']),
        ...v,
        ...style,
      }}
    >
      {icon}
      {children}
      <style>{`
        .uiv2-btn:active { transform: scale(.97); }
        .uiv2-btn-primary:hover { filter: brightness(1.1); }
        .uiv2-btn-secondary:hover { background: rgba(255,255,255,.1) !important; }
        .uiv2-btn-ghost:hover { background: rgba(255,255,255,.05) !important; color: ${colors.text[900]} !important; }
      `}</style>
    </button>
  )
})
