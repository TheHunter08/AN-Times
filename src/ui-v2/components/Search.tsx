import type { InputHTMLAttributes } from 'react'
import { useState } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { shadows } from '../design-system/shadows.js'
import { transition } from '../design-system/animations.js'
import { IconSearch } from './Icons.js'

export function Search(props: InputHTMLAttributes<HTMLInputElement>) {
  const [focused, setFocused] = useState(false)
  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 320 }}>
      <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], pointerEvents: 'none', display: 'flex' }}>
        <IconSearch width={14} height={14} />
      </span>
      <input
        {...props}
        onFocus={e => { setFocused(true); props.onFocus?.(e) }}
        onBlur={e => { setFocused(false); props.onBlur?.(e) }}
        style={{
          width: '100%',
          padding: '9px 12px 9px 34px',
          fontSize: 13,
          color: colors.text[900],
          background: colors.bg[600],
          border: `1px solid ${focused ? colors.primary.base : colors.border.subtle}`,
          borderRadius: radius.pill,
          outline: 'none',
          fontFamily: 'inherit',
          boxShadow: focused ? `0 0 0 3px ${colors.primary.dim}, ${shadows.sm}` : shadows.sm,
          transition: transition(['border-color', 'box-shadow']),
        }}
      />
    </div>
  )
}
