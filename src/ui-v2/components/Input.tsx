import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, style, ...rest },
  ref
) {
  return (
    <div style={{ marginBottom: 13 }}>
      {label && (
        <label style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.7px', color: colors.text[500], marginBottom: 6 }}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        {...rest}
        className={`uiv2-input${rest.className ? ` ${rest.className}` : ''}`}
        style={{
          width: '100%',
          padding: '10px 14px',
          fontSize: 13.5,
          color: colors.text[900],
          background: colors.bg[600],
          border: `1px solid ${error ? colors.semantic.red : colors.border.subtle}`,
          borderRadius: radius.sm,
          outline: 'none',
          fontFamily: 'inherit',
          transition: transition(['border-color', 'box-shadow', 'background']),
          ...style,
        }}
      />
      {error && <div style={{ fontSize: 11, color: colors.semantic.red, marginTop: 4, fontWeight: 600 }}>{error}</div>}
      <style>{`.uiv2-input:focus { border-color: ${colors.primary.base} !important; box-shadow: 0 0 0 3px ${colors.primary.dim}; }`}</style>
    </div>
  )
})
