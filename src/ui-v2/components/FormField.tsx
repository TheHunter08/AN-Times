// Campo de formulario reutilizable (label + input) y banner de error — evita
// reconstruir los mismos objetos de estilo inline en cada página/modal
// (Login, ModalCorreccion, TabPerfil…) que ya usan el design-system v2.
import type { InputHTMLAttributes, ReactNode } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'

const labelStyle: React.CSSProperties = {
  fontSize: 10.5, fontWeight: 700, color: colors.text[500],
  textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box', minHeight: 42, padding: '0 12px',
  borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
  background: colors.bg[600], color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none',
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label style={labelStyle}>{children}</label>
}

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: ReactNode
}

export function TextField({ label, style, ...inputProps }: TextFieldProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <FieldLabel>{label}</FieldLabel>
      <input {...inputProps} style={{ ...inputStyle, ...style }} />
    </div>
  )
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  if (!children) return null
  return (
    <div role="alert" aria-live="assertive" style={{
      padding: '9px 12px', borderRadius: radius.sm,
      background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.28)',
      color: '#F87171', fontSize: 12, textAlign: 'center',
    }}>
      {children}
    </div>
  )
}
