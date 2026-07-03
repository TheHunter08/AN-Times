import type { ReactNode } from 'react'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { shadows } from '../design-system/shadows.js'
import { duration, easing } from '../design-system/animations.js'

export interface ModalProps {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
}

export function Modal({ open, onClose, title, children, footer }: ModalProps) {
  if (!open) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        animation: `uiv2FadeIn ${duration.base} ${easing.standard}`,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)',
          maxHeight: '86vh',
          overflowY: 'auto',
          background: colors.bg[600],
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.xl,
          boxShadow: shadows.xl,
          padding: 24,
        }}
      >
        {title && <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: colors.text[900] }}>{title}</h2>}
        {children}
        {footer && <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>{footer}</div>}
      </div>
      <style>{`@keyframes uiv2FadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
    </div>
  )
}
