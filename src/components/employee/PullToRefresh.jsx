import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'

// iOS PWA: NUNCA aplicar transform al contenedor con overflow:auto — rompe
// -webkit-overflow-scrolling de forma permanente. El scroll vive en .emp-tab
// limpio; el contenido se desplaza con transform en un wrapper INTERIOR,
// manipulado vía .style directo (sin React rerender) para no invalidar el layer.
export function PullToRefresh({ children }) {
  const fetchDB = useAppStore(s => s.fetchDB)
  const scrollRef = useRef(null)
  const innerRef = useRef(null)
  const indicatorRef = useRef(null)
  const arrowRef = useRef(null)
  const labelRef = useRef(null)
  const [refreshing, setRefreshing] = useState(false)
  const ptr = useRef({ startY: 0, active: false, dist: 0, refreshing: false })

  useEffect(() => {
    const el = scrollRef.current
    const inner = innerRef.current
    const indicator = indicatorRef.current
    if (!el || !inner) return

    // Guardia: si algún estado quedó colgado de una sesión anterior, lo reseteamos al montar.
    // iOS bug: transform en hijo de overflow-scroll rompe -webkit-overflow-scrolling.
    // Usamos marginTop en su lugar — no afecta al compositing layer del scroll container.
    inner.style.transition = 'none'
    inner.style.marginTop = ''
    if (indicator) indicator.style.opacity = '0'

    const setOffset = (px, animate) => {
      inner.style.transition = animate ? 'margin-top .3s cubic-bezier(.25,.46,.45,.94)' : 'none'
      inner.style.marginTop = px > 0 ? `${px}px` : ''
      if (indicator) indicator.style.opacity = px > 0 ? '1' : '0'
    }

    // Forzar reset si una transición se quedó a medias (p.ej. reload tras SW update)
    const forceReset = () => {
      ptr.current.active = false
      ptr.current.dist = 0
      ptr.current.refreshing = false
      inner.style.transition = 'none'
      inner.style.marginTop = ''
      if (indicator) indicator.style.opacity = '0'
      // Forzar re-evaluación del scroll en iOS (wake up scroll container)
      try { el.scrollTop = el.scrollTop } catch {}
    }

    const setHint = (d) => {
      if (arrowRef.current) arrowRef.current.style.transform = d > 48 ? 'rotate(180deg)' : 'rotate(0deg)'
      if (labelRef.current) labelRef.current.textContent = d > 48 ? 'Suelta para actualizar' : 'Bajar para actualizar'
    }

    const onStart = e => {
      if (ptr.current.refreshing) return
      if (el.scrollTop <= 0) {
        ptr.current.startY = e.touches[0].clientY
        ptr.current.active = true
        ptr.current.dist = 0
      }
    }

    const onMove = e => {
      if (!ptr.current.active || ptr.current.refreshing) return
      const d = e.touches[0].clientY - ptr.current.startY
      if (d > 0) {
        const offset = Math.min(d * 0.45, 80)
        ptr.current.dist = offset
        setOffset(offset, false)
        setHint(offset)
      } else {
        ptr.current.active = false
        ptr.current.dist = 0
        setOffset(0, true)
      }
    }

    const onEnd = async () => {
      const wasActive = ptr.current.active
      const triggered = wasActive && ptr.current.dist > 48 && !ptr.current.refreshing
      ptr.current.active = false
      ptr.current.dist = 0
      if (triggered) {
        ptr.current.refreshing = true
        setRefreshing(true)
        setOffset(50, true)
        try { await fetchDB() } finally {
          ptr.current.refreshing = false
          setRefreshing(false)
          setOffset(0, true)
          // iOS: forzar re-evaluación del scroll tras la animación de retorno
          setTimeout(() => { try { el.scrollTop = el.scrollTop } catch {} }, 350)
        }
      } else {
        setOffset(0, true)
      }
    }

    const onCancel = () => {
      ptr.current.active = false
      ptr.current.dist = 0
      if (!ptr.current.refreshing) setOffset(0, true)
    }

    // Safety nets globales: si vuelvo a la pestaña, o el SW se activa y la app
    // se queda con la transform a medias, forzamos reset.
    const onVisibility = () => { if (document.visibilityState === 'visible') forceReset() }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', forceReset)

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: true })
    el.addEventListener('touchend', onEnd, { passive: true })
    el.addEventListener('touchcancel', onCancel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onCancel)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', forceReset)
      forceReset()
    }
  }, [fetchDB])

  return (
    <div ref={scrollRef} className="emp-tab active">
      <div ref={indicatorRef} style={{
        position:'absolute', top:0, left:0, right:0, height:50, zIndex:1,
        display:'flex', alignItems:'center', justifyContent:'center', gap:7,
        color:'var(--text3)', fontSize:11, fontWeight:600, pointerEvents:'none',
        opacity:0, transition:'opacity .2s'
      }}>
        {refreshing ? (
          <>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation:'ptr-spin .7s linear infinite', flexShrink:0 }}>
              <polyline points="23 4 23 10 17 10"/>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
            </svg>
            Actualizando…
          </>
        ) : (
          <>
            <svg ref={arrowRef} viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition:'transform .25s', flexShrink:0 }}>
              <line x1="12" y1="5" x2="12" y2="19"/>
              <polyline points="19 12 12 19 5 12"/>
            </svg>
            <span ref={labelRef}>Bajar para actualizar</span>
          </>
        )}
      </div>
      <div ref={innerRef}>
        {children}
      </div>
    </div>
  )
}
