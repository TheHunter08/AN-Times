import { useRef, useCallback } from 'react'

// Hook reutilizable: canvas de firma
export function useSignatureCanvas() {
  const canvasRef  = useRef(null)
  const drawingRef = useRef(false)
  const lastPtRef  = useRef(null)

  const getPos = useCallback((e, canvas) => {
    const rect = canvas.getBoundingClientRect()
    const src  = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * (canvas.width / rect.width), y: (src.clientY - rect.top) * (canvas.height / rect.height) }
  }, [])

  const handlers = {
    onMouseDown:  useCallback(e => { e.preventDefault(); const c = canvasRef.current; if (!c) return; lastPtRef.current = getPos(e, c); drawingRef.current = true }, [getPos]),
    onMouseMove:  useCallback(e => {
      if (!drawingRef.current) return; e.preventDefault()
      const c = canvasRef.current; if (!c) return
      const ctx = c.getContext('2d'); const pt = getPos(e, c)
      ctx.beginPath(); ctx.moveTo(lastPtRef.current.x, lastPtRef.current.y); ctx.lineTo(pt.x, pt.y)
      ctx.strokeStyle = '#c7d2fe'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke()
      lastPtRef.current = pt
    }, [getPos]),
    onMouseUp:    useCallback(() => { drawingRef.current = false; lastPtRef.current = null }, []),
    onMouseLeave: useCallback(() => { drawingRef.current = false; lastPtRef.current = null }, []),
    onTouchStart: null, onTouchMove: null, onTouchEnd: null,
  }
  handlers.onTouchStart = handlers.onMouseDown
  handlers.onTouchMove  = handlers.onMouseMove
  handlers.onTouchEnd   = handlers.onMouseUp

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-700').trim() || '#0D1218'
    ctx.fillRect(0, 0, c.width, c.height)
  }, [])

  const initCanvas = useCallback(() => clearCanvas(), [clearCanvas])

  const getSignatureData = useCallback(() => {
    const c = canvasRef.current; if (!c) return null
    const pixels = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    if (!Array.from(pixels).some((v, i) => i % 4 !== 3 && v > 30)) return null
    const small = document.createElement('canvas'); small.width = 320; small.height = 120
    const ctx2 = small.getContext('2d')
    ctx2.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg-700').trim() || '#0D1218'; ctx2.fillRect(0, 0, 320, 120)
    ctx2.drawImage(c, 0, 0, 320, 120)
    return small.toDataURL('image/jpeg', 0.7)
  }, [])

  return { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData }
}
