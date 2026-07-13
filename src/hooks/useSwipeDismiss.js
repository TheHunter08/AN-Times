import { useRef, useState, useCallback } from 'react'

// Arrastrar el tirador (.modal-drag) hacia abajo para cerrar el modal — el
// gesto nativo de las bottom sheets de iOS. El tirador ya existía como barra
// decorativa en todos los modales pero no hacía nada; esto lo conecta.
export function useSwipeDismiss(onClose) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const active = useRef(false)
  const pointerId = useRef(null)
  const startedAt = useRef(0)

  const onPointerDown = useCallback((e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    pointerId.current = e.pointerId
    startY.current = e.clientY
    startedAt.current = performance.now()
    active.current = true
    setDragging(true)
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e) => {
    if (!active.current || pointerId.current !== e.pointerId) return
    const d = Math.max(0, e.clientY - startY.current)
    setDragY(d > 160 ? 160 + (d - 160) * .22 : d)
  }, [])

  const onPointerEnd = useCallback((e) => {
    if (!active.current || pointerId.current !== e.pointerId) return
    const d = Math.max(0, e.clientY - startY.current)
    const velocity = d / Math.max(1, performance.now() - startedAt.current)
    try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    active.current = false
    pointerId.current = null
    setDragging(false)
    setDragY(0)
    if (d > 82 || (d > 34 && velocity > .55)) {
      try { navigator.vibrate?.(8) } catch {}
      onClose()
    }
  }, [onClose])

  const onPointerCancel = useCallback((e) => {
    try { if (e.currentTarget.hasPointerCapture?.(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    active.current = false
    pointerId.current = null
    setDragging(false)
    setDragY(0)
  }, [])

  return {
    dragHandlers: {
      onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel, onLostPointerCapture: onPointerCancel,
      style: { touchAction: 'none' },
    },
    modalStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform .3s cubic-bezier(.25,.46,.45,.94)',
      opacity: dragY ? Math.max(0.5, 1 - dragY / 400) : 1,
    },
  }
}
