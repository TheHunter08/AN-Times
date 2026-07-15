import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Accesibilidad común para diálogos: foco inicial, Escape, focus trap y
 * devolución del foco al control que abrió el modal.
 */
export function useDialogA11y(visible, onClose) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!visible) return undefined
    const previousFocus = document.activeElement
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const first = dialog?.querySelector(FOCUSABLE)
      ;(first || dialog)?.focus?.()
    })

    const onKeyDown = event => {
      const dialog = dialogRef.current
      if (!dialog) return
      if (event.key === 'Escape') {
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter(el => !el.hidden && el.getAttribute('aria-hidden') !== 'true')
      if (!focusable.length) {
        event.preventDefault()
        dialog.focus()
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

    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      if (previousFocus instanceof HTMLElement) requestAnimationFrame(() => previousFocus.focus())
    }
  }, [visible])

  return dialogRef
}
