import { useEffect, useRef } from 'react'

// Integra el botón de atrás del navegador (hardware + swipe iOS/Android) con
// el sistema de modales de la app. Cuando el modal está visible, push a history;
// al pulsar atrás el popstate cierra el modal. Si el modal se cierra
// programáticamente (× o acción), se hace history.back() para limpiar la pila.
export function useModalBack(visible, onClose) {
  const pushed    = useRef(false)
  const closeRef  = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!visible) {
      // Modal cerrado desde dentro (×, confirmar, etc.): limpiar la entrada
      // que habíamos metido en la pila de historial.
      if (pushed.current) {
        pushed.current = false
        window.history.back()
      }
      return
    }

    // Modal abierto: añadir una entrada al historial para que el gesto/botón
    // de volver atrás lo detecte como "hay algo que cerrar".
    window.history.pushState({ timesModal: true }, '')
    pushed.current = true

    const onPop = () => {
      if (!pushed.current) return
      pushed.current = false
      closeRef.current()
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [visible])
}
