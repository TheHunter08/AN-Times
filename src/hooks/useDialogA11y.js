import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

// Solo el diálogo abierto más recientemente debe responder a Escape o atrapar
// el foco. Esto evita cerrar dos capas a la vez cuando un modal abre otro.
const dialogStack = []

function getFocusable(dialog) {
  return [...dialog.querySelectorAll(FOCUSABLE)].filter(el => {
    if (el.hidden || el.getAttribute('aria-hidden') === 'true') return false
    return !el.closest('[hidden], [aria-hidden="true"]')
  })
}

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
    const stackEntry = { dialogRef }
    dialogStack.push(stackEntry)
    const previousFocus = document.activeElement
    const frame = requestAnimationFrame(() => {
      const dialog = dialogRef.current
      const first = dialog?.querySelector(FOCUSABLE)
      ;(first || dialog)?.focus?.()
    })

    const onKeyDown = event => {
      const dialog = dialogRef.current
      if (!dialog || dialogStack.at(-1) !== stackEntry || event.isComposing) return
      if (event.key === 'Escape') {
        if (event.defaultPrevented) return
        event.preventDefault()
        closeRef.current?.()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = getFocusable(dialog)
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

    const onFocusIn = event => {
      const dialog = dialogRef.current
      if (!dialog || dialogStack.at(-1) !== stackEntry || dialog.contains(event.target)) return
      const first = getFocusable(dialog)[0]
      ;(first || dialog).focus?.()
    }

    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('focusin', onFocusIn)
      const stackIndex = dialogStack.indexOf(stackEntry)
      if (stackIndex >= 0) dialogStack.splice(stackIndex, 1)
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        requestAnimationFrame(() => previousFocus.focus())
      }
    }
  }, [visible])

  return dialogRef
}
