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

// Diagnóstico temporal (quitar cuando se confirme la causa): registra en
// consola cada decisión del fallback, sin ningún elemento visible en
// pantalla — activar pegando `localStorage.setItem('an_times_scroll_debug','1')`
// en la consola del navegador y recargando.
function debugLog(msg, data) {
  try {
    if (localStorage.getItem('an_times_scroll_debug') !== '1') return
    // Un objeto como segundo argumento de console.log a veces se captura como
    // "Object" sin desplegar (herramientas de lectura remota de consola) —
    // se serializa aquí mismo para que el texto sea legible siempre.
    console.log('[scrollFallback]', msg, data !== undefined ? JSON.stringify(data) : '')
  } catch {}
}

function onWheel(e) {
  debugLog('wheel', {
    target: e.target?.tagName + '.' + (e.target?.className || ''),
    deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode,
    cancelable: e.cancelable, defaultPrevented: e.defaultPrevented,
    ctrlKey: e.ctrlKey, isTrusted: e.isTrusted,
  })
  if (e.ctrlKey || e.defaultPrevented || !e.cancelable) { debugLog('  -> ignorado (ctrl/defaultPrevented/no cancelable)'); return }
  if (shouldIgnoreTarget(e.target)) { debugLog('  -> ignorado (shouldIgnoreTarget)'); return }
  const { dx, dy } = normalizedDeltas(e)
  if (!dx && !dy) { debugLog('  -> ignorado (delta 0 tras normalizar)'); return }
  const hit = findScrollTarget(e.target, dx, dy)
  if (!hit) { debugLog('  -> sin objetivo de scroll (findScrollTarget null)', { dx, dy }); return }
  e.preventDefault()
  const before = hit.el.scrollTop
  if (hit.axis === 'y') hit.el.scrollTop += dy
  else hit.el.scrollLeft += dx || dy
  debugLog('  -> aplicado', { axis: hit.axis, el: hit.el.tagName + '.' + hit.el.className, before, after: hit.el.scrollTop })
}

// ── Touch en escritorio ──────────────────────────────────────────────────────
let touchState = null

function onTouchStart(e) {
  debugLog('touchstart', { innerWidth: window.innerWidth, touches: e.touches.length, target: e.target?.tagName + '.' + (e.target?.className || '') })
  if (window.innerWidth < 1024 || e.touches.length !== 1) { debugLog('  -> ignorado (viewport <1024 o multitouch)'); touchState = null; return }
  if (shouldIgnoreTarget(e.target)) { debugLog('  -> ignorado (shouldIgnoreTarget)'); touchState = null; return }
  touchState = { x: e.touches[0].clientX, y: e.touches[0].clientY, target: e.target }
}

function onTouchMove(e) {
  if (!touchState) { debugLog('touchmove -> ignorado (sin touchState — el touchstart no lo activó)'); return }
  if (!e.cancelable) { debugLog('touchmove -> ignorado (no cancelable)'); return }
  if (e.touches.length !== 1) { debugLog('touchmove -> ignorado (multitouch)', { touches: e.touches.length }); return }
  const dx = touchState.x - e.touches[0].clientX
  const dy = touchState.y - e.touches[0].clientY
  const hit = findScrollTarget(touchState.target, dx, dy)
  if (!hit) { debugLog('touchmove -> sin objetivo de scroll', { dx, dy }); return }
  e.preventDefault()
  const before = hit.el.scrollTop
  if (hit.axis === 'y') hit.el.scrollTop += dy
  else hit.el.scrollLeft += dx
  debugLog('touchmove -> aplicado', { axis: hit.axis, dx, dy, before, after: hit.el.scrollTop })
  touchState.x = e.touches[0].clientX
  touchState.y = e.touches[0].clientY
}

function onTouchEnd() { debugLog('touchend'); touchState = null }

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
