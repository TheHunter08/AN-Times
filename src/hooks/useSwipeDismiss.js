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
    active.current = false
    pointerId.current = null
    setDragging(false)
    setDragY(0)
    if (d > 82 || (d > 34 && velocity > .55)) {
      try { navigator.vibrate?.(8) } catch {}
      onClose()
    }
  }, [onClose])

  return {
    dragHandlers: {
      onPointerDown, onPointerMove, onPointerUp: onPointerEnd, onPointerCancel: onPointerEnd,
      style: { touchAction: 'none' },
    },
    modalStyle: {
      transform: dragY ? `translateY(${dragY}px)` : undefined,
      transition: dragging ? 'none' : 'transform .3s cubic-bezier(.25,.46,.45,.94)',
      opacity: dragY ? Math.max(0.5, 1 - dragY / 400) : 1,
    },
  }
}
