import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import { cx } from './internal'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

export interface OverlayShellProps {
  open: boolean
  onClose: () => void
  title: ReactNode
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  closeLabel?: string
  closeOnBackdrop?: boolean
  size?: ModalSize
  className?: string
  initialFocusRef?: RefObject<HTMLElement>
}

interface DialogSurfaceProps extends OverlayShellProps {
  kind: 'modal' | 'sheet'
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5 5 10 10M15 5 5 15" />
    </svg>
  )
}

function DialogSurface({
  kind,
  open,
  onClose,
  title,
  description,
  children,
  footer,
  closeLabel = 'Cerrar',
  closeOnBackdrop = true,
  size = 'md',
  className,
  initialFocusRef,
}: DialogSurfaceProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = `ds-dialog-title-${useId().replace(/:/g, '')}`
  const descriptionId = `ds-dialog-description-${useId().replace(/:/g, '')}`

  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const frame = window.requestAnimationFrame(() => {
      const focusTarget = initialFocusRef?.current ?? panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR) ?? panelRef.current
      focusTarget?.focus()
    })

    const handleDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('keydown', handleDocumentKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus()
    }
  }, [initialFocusRef, onClose, open])

  if (!open || typeof document === 'undefined') return null

  const trapFocus = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab' || !panelRef.current) return
    const focusable = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true',
    )
    if (!focusable.length) {
      event.preventDefault()
      panelRef.current.focus()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  return createPortal(
    <div
      className={cx(`ds-${kind}`, className)}
      role="presentation"
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        className={cx(`ds-${kind}__panel`, `ds-${kind}__panel--${size}`)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={trapFocus}
      >
        {kind === 'sheet' ? <span className="ds-sheet__handle" aria-hidden="true" /> : null}
        <header className={cx(`ds-${kind}__header`)}>
          <div className={cx(`ds-${kind}__heading`)}>
            <h2 id={titleId} className={cx(`ds-${kind}__title`)}>{title}</h2>
            {description ? <p id={descriptionId} className={cx(`ds-${kind}__description`)}>{description}</p> : null}
          </div>
          <button type="button" className="ds-icon-button ds-icon-button--ghost ds-icon-button--md" aria-label={closeLabel} onClick={onClose}>
            <span className="ds-icon-button__icon" aria-hidden="true"><CloseGlyph /></span>
          </button>
        </header>
        <div className={cx(`ds-${kind}__body`)}>{children}</div>
        {footer ? <footer className={cx(`ds-${kind}__footer`)}>{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  )
}

export type ModalProps = Omit<OverlayShellProps, never>

export function Modal(props: ModalProps) {
  return <DialogSurface {...props} kind="modal" />
}

export type BottomSheetProps = Omit<OverlayShellProps, 'size'> & { size?: Exclude<ModalSize, 'xl'> }

export function BottomSheet(props: BottomSheetProps) {
  return <DialogSurface {...props} kind="sheet" />
}
