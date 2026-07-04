import type { HTMLAttributes } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'

type Tone = 'green' | 'orange' | 'red' | 'purple' | 'gray'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone
}

const toneStyles: Record<Tone, { background: string; color: string }> = {
  green:  { background: 'rgba(16,185,129,.12)', color: colors.semantic.green },
  orange: { background: 'rgba(245,158,11,.12)', color: colors.semantic.orange },
  red:    { background: 'rgba(239,68,68,.12)',  color: colors.semantic.red },
  purple: { background: colors.accent.dim,       color: colors.accent.base },
  gray:   { background: 'rgba(96,116,138,.12)', color: colors.text[500] },
}

export function Badge({ tone = 'gray', children, style, ...rest }: BadgeProps) {
  const t = toneStyles[tone]
  return (
    <span
      {...rest}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '3px 10px',
        borderRadius: radius.pill,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '.02em',
        whiteSpace: 'nowrap',
        ...t,
        ...style,
      }}
    >
      {children}
    </span>
  )
}
