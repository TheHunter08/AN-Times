// Detecta si el punto de inicio del gesto está dentro de un elemento que
// puede hacer scroll horizontal (tabla, carrusel, lista con overflow-x).
// En ese caso NO debemos secuestrar el swipe para cambiar de pantalla:
// el usuario está desplazándose lateralmente DENTRO del componente.
export function startedInHorizontalScroller(target, boundary) {
  let el = target
  while (el && el !== boundary && el !== document.body) {
    if (el.nodeType === 1) {
      if (el.dataset?.gestureScope === 'local' || el.dataset?.gestureLock === 'true') return true
      const canScrollX = el.scrollWidth - el.clientWidth > 4
      if (canScrollX) {
        const ox = getComputedStyle(el).overflowX
        if (ox === 'auto' || ox === 'scroll') return true
      }
    }
    el = el.parentElement
  }
  return false
}

// Los controles y componentes con gesto propio conservan el comportamiento
// táctil del sistema y no activan la navegación global por una deriva del dedo.
export function shouldIgnoreAppGesture(target, boundary) {
  if (!(target instanceof Element)) return false
  // Botones y cards siguen formando parte de la superficie de navegación. En
  // móvil ocupan casi toda Jornada/Vacaciones y bloquearlos hacía que el swipe
  // solo funcionase al empezar en unos pocos huecos vacíos. Los controles de
  // edición y los gestos complejos se excluyen explícitamente.
  if (target.closest('input, textarea, select, option, [contenteditable="true"], [role="slider"], [data-gesture-lock="true"]')) return true
  return startedInHorizontalScroller(target, boundary)
}
