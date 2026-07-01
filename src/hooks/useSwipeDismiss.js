import { useRef, useState, useCallback } from 'react'

// Arrastrar el tirador (.modal-drag) hacia abajo para cerrar el modal — el
// gesto nativo de las bottom sheets de iOS. El tirador ya existía como barra
// decorativa en todos los modales pero no hacía nada; esto lo conecta.
export function useSwipeDismiss(onClose) {
  const [dragY, setDragY] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startY = useRef(0)
  const active = useRef(false)

  const onTouchStart = useCallback((e) => {
    startY.current = e.touches[0].clientY
    active.current = true
    setDragging(true)
  }, [])

  const onTouchMove = useCallback((e) => {
    if (!active.current) return
    const d = e.touches[0].clientY - startY.current
    if (d > 0) setDragY(d)
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!active.current) return
    active.current = false
    setDragging(false)
    setDragY(d => {
      if (d > 90) { try { navigator.vibrate?.(10) } catch {} ; onClose() }
      return 0
    })
  }, [onClose])

  return {
    dragHandlers: { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel: onTouchEnd },
    modalStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform .3s cubic-bezier(.25,.46,.45,.94)',
      opacity: dragY ? Math.max(0.5, 1 - dragY / 400) : 1,
    },
  }
}
