// Scroll manual por hilo principal para rueda de mouse y touch.
//
// Incidente (2026-07-25): en varios equipos Windows del usuario, Chrome
// recibe los eventos wheel (verificado con un contador en pantalla: los
// eventos llegan con deltaY ±100) pero NUNCA traduce ese gesto en scroll
// real — scrollTop se queda a 0 — mientras que el teclado (PageDown/flechas)
// y `el.scrollTop += n` por JS funcionan siempre. Esa firma señala al scroll
// compositado (rueda/touch se resuelven en el hilo compositor/GPU de Chrome;
// teclado y JS en el hilo principal): cuando el compositor no coopera con
// este layout, la única ruta fiable es hacer el scroll nosotros mismos en el
// hilo principal.
//
// Diseño:
// - Un único listener global de `wheel` (no pasivo) replica el algoritmo de
//   encadenado del navegador: busca el ancestro desplazable más cercano al
//   target que aún pueda moverse en la dirección del gesto, lo desplaza a
//   mano y hace preventDefault. En máquinas sanas esto SUSTITUYE al scroll
//   nativo (preventDefault evita el doble desplazamiento) con el mismo
//   resultado; en las máquinas afectadas, es el único scroll que ocurre.
// - Touch: mismo mecanismo vía `touchmove`, limitado a viewports de
//   escritorio (>=1024px). En móvil/tablet el scroll táctil nativo funciona
//   bien (iOS/Android) y con inercia — no se debe secuestrar.
// - Ctrl+rueda (zoom del navegador), targets dentro de inputs, canvas
//   (firmas) y elementos con touch-action:none (gestos propios) se dejan
//   pasar sin tocar.

const SCROLLABLE = /(auto|scroll|overlay)/

// getStyle inyectable para poder testear el encadenado sin layout real
// (jsdom no calcula scrollHeight/clientHeight).
export function findScrollTarget(start, dx, dy, getStyle = el => getComputedStyle(el)) {
  let el = start
  while (el && el.nodeType === 1 && el !== document.documentElement) {
    const cs = getStyle(el)
    if (dy !== 0 && SCROLLABLE.test(cs.overflowY) && el.scrollHeight - el.clientHeight > 1) {
      const atTop = el.scrollTop <= 0
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1
      if ((dy < 0 && !atTop) || (dy > 0 && !atBottom)) return { el, axis: 'y' }
    }
    if (dx !== 0 && SCROLLABLE.test(cs.overflowX) && el.scrollWidth - el.clientWidth > 1) {
      const atLeft = el.scrollLeft <= 0
      const atRight = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1
      if ((dx < 0 && !atLeft) || (dx > 0 && !atRight)) return { el, axis: 'x' }
    }
    el = el.parentElement
  }
  return null
}

function normalizedDeltas(e) {
  let dx = e.deltaX
  let dy = e.deltaY
  if (e.deltaMode === 1) { dx *= 33; dy *= 33 } // líneas → px aprox.
  else if (e.deltaMode === 2) { dx *= window.innerHeight; dy *= window.innerHeight } // páginas
  return { dx, dy }
}

function shouldIgnoreTarget(target) {
  if (!(target instanceof Element)) return true
  // Inputs con rueda propia (number), áreas de firma, y componentes con
  // gesto propio declarado conservan su comportamiento intacto.
  if (target.closest('input, textarea, select, canvas, [data-gesture-lock="true"]')) return true
  try { if (getComputedStyle(target).touchAction === 'none') return true } catch {}
  return false
}

function onWheel(e) {
  if (e.ctrlKey || e.defaultPrevented || !e.cancelable) return
  if (shouldIgnoreTarget(e.target)) return
  const { dx, dy } = normalizedDeltas(e)
  if (!dx && !dy) return
  const hit = findScrollTarget(e.target, dx, dy)
  if (!hit) return
  e.preventDefault()
  if (hit.axis === 'y') hit.el.scrollTop += dy
  else hit.el.scrollLeft += dx || dy
}

// ── Touch en escritorio ──────────────────────────────────────────────────────
let touchState = null

function onTouchStart(e) {
  if (window.innerWidth < 1024 || e.touches.length !== 1) { touchState = null; return }
  if (shouldIgnoreTarget(e.target)) { touchState = null; return }
  touchState = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target }
}

function onTouchMove(e) {
  if (!touchState || !e.cancelable || e.touches.length !== 1) return
  const dx = touchState.x - e.touches[0].clientX
  const dy = touchState.y - e.touches[0].clientY
  const hit = findScrollTarget(touchState.target, dx, dy)
  if (!hit) return
  e.preventDefault()
  if (hit.axis === 'y') hit.el.scrollTop += dy
  else hit.el.scrollLeft += dx
  touchState.x = e.touches[0].clientX
  touchState.y = e.touches[0].clientY
}

function onTouchEnd() { touchState = null }

let installed = false
export function installScrollFallback() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // Fase de CAPTURA sobre window: es lo primero que ve el evento en todo el
  // árbol — ningún stopPropagation() intermedio (propio o de terceros) puede
  // impedir que el fallback actúe, cosa que sí podía pasar escuchando en
  // burbuja sobre document.
  window.addEventListener('wheel', onWheel, { passive: false, capture: true })
  window.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
  window.addEventListener('touchmove', onTouchMove, { passive: false, capture: true })
  window.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })
  window.addEventListener('touchcancel', onTouchEnd, { passive: true, capture: true })
}
