import type { InputHTMLAttributes } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'

export function Search(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], fontSize: 13, pointerEvents: 'none' }}>⌕</span>
      <input
        {...props}
        style={{
          width: '100%',
          padding: '9px 12px 9px 34px',
          fontSize: 13,
          color: colors.text[900],
          background: colors.bg[600],
          border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.pill,
          outline: 'none',
          fontFamily: 'inherit',
        }}
      />
    </div>
  )
}
