import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { shadows } from '../design-system/shadows.js'

type Tone = 'ok' | 'err' | 'warn' | 'info'

export interface ToastProps {
  message: string
  tone?: Tone
}

const toneColor: Record<Tone, string> = {
  ok: colors.semantic.green,
  err: colors.semantic.red,
  warn: colors.semantic.orange,
  info: colors.primary.light,
}

export function Toast({ message, tone = 'info' }: ToastProps) {
  return (
    <div
      role="status"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 16px',
        borderRadius: radius.md,
        background: colors.bg[600],
        border: `1px solid ${colors.border.default}`,
        boxShadow: shadows.lg,
        fontSize: 13,
        fontWeight: 600,
        color: colors.text[900],
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: toneColor[tone], flexShrink: 0 }} />
      {message}
    </div>
  )
}
