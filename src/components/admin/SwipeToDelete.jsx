import { useState, useRef } from 'react'

// Deslizar hacia la izquierda revela "Eliminar" (gesto nativo tipo Mail de iOS).
// Los botones explícitos existentes se mantienen intactos — esto es un atajo
// adicional, no un reemplazo, así que no rompe nada para quien no lo use.
export function SwipeToDelete({ children, onDelete }) {
  const [swipeX, setSwipeX] = useState(0)
  const [dragging, setDragging] = useState(false)
  const startX = useRef(0)
  const startY = useRef(0)
  const active = useRef(false)
  // Hasta que el gesto no demuestre ser claramente horizontal, no tocamos
  // swipeX — así un scroll vertical con algo de deriva lateral (lo normal en
  // iOS) no desplaza la fila a medias y la deja en un estado raro.
  const axisLocked = useRef(null) // null=indeciso | 'x' | 'y'

  const onTouchStart = (e) => {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    active.current = true
    axisLocked.current = null
    setDragging(true)
  }
  const onTouchMove = (e) => {
    if (!active.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (axisLocked.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return // deadzone: aún no está claro qué quiere el usuario
      axisLocked.current = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
    }
    if (axisLocked.current !== 'x') return // gesto vertical: se lo dejamos al scroll nativo, no tocamos swipeX
    if (dx < 0) setSwipeX(Math.max(dx, -96))
  }
  const onTouchEnd = () => {
    if (!active.current) return
    active.current = false
    setDragging(false)
    if (axisLocked.current === 'x' && swipeX < -72) { try { navigator.vibrate?.(10) } catch {}; onDelete() }
    setSwipeX(0)
  }

  return (
    <div style={{ position:'relative', borderRadius:'var(--r)', overflow:'hidden' }}>
      <div style={{
        position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-end',
        paddingRight:24, background:'var(--danger)', opacity: swipeX < -20 ? Math.min(1, -swipeX / 96) : 0,
        transition: dragging ? 'none' : 'opacity .2s', pointerEvents:'none',
      }}>
        <span style={{ color:'#fff', fontWeight:700, fontSize:13 }}>🗑️ Eliminar</span>
      </div>
      <div
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={{
          transform:`translateX(${swipeX}px)`, transition: dragging ? 'none' : 'transform .25s cubic-bezier(.16,1,.3,1)',
          touchAction:'pan-y', // el navegador solo gestiona scroll vertical — el swipe horizontal es nuestro y no dispara "volver atrás"
        }}
      >
        {children}
      </div>
    </div>
  )
}
