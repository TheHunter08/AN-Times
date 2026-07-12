import type { ReactNode } from 'react'
import { useEffect, useId, useRef } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
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
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    const previousFocus = document.activeElement as HTMLElement | null
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => panelRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(el => !el.hasAttribute('disabled'))
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="uiv2-modal-overlay"
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
        ref={panelRef}
        className="uiv2-modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Ventana'}
        tabIndex={-1}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(480px, 92vw)',
          maxHeight: '86dvh',
          overflowY: 'auto',
          background: colors.bg[600],
          border: `1px solid ${colors.border.default}`,
          borderRadius: radius.xl,
          boxShadow: shadows.xl,
          padding: 24,
        }}
      >
        {title && <h2 id={titleId} style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, color: colors.text[900] }}>{title}</h2>}
        {children}
        {footer && <div className="uiv2-modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>{footer}</div>}
      </div>
      <style>{`
        @keyframes uiv2FadeIn { from { opacity: 0 } to { opacity: 1 } }
        @media(max-width:700px){
          .uiv2-modal-overlay{align-items:flex-end !important}
          .uiv2-modal-panel{width:100% !important;max-height:90dvh !important;padding:22px 16px max(22px,env(safe-area-inset-bottom)) !important;border-radius:${radius.xl} ${radius.xl} 0 0 !important}
          .uiv2-modal-footer{display:grid !important;grid-template-columns:repeat(2,minmax(0,1fr))}
          .uiv2-modal-footer>button{min-height:48px}
        }
      `}</style>
    </div>
  )
}
