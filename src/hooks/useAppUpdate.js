import { useCallback, useRef, useState } from 'react'
import { useAppStore } from '../store/appStore.js'

// Comprueba si hay una versión nueva del service worker y la instala.
// Extraído de ModalConfiguracion.jsx para poder usarse también en Perfil.
export function useAppUpdate(toast) {
  const [updateCheck, setUpdateCheck] = useState('idle') // idle | checking | up-to-date | applying | error
  const updateBusyRef = useRef(false)

  const checkForUpdate = useCallback(async () => {
    if (updateBusyRef.current || !('serviceWorker' in navigator)) return
    updateBusyRef.current = true
    setUpdateCheck('checking')
    try {
      const reg = await navigator.serviceWorker.getRegistration()
      if (!reg) { setUpdateCheck('error'); toast('No se pudo comprobar actualizaciones', 4000, 'err'); return }
      await reg.update().catch(() => {})
      let waitingSW = reg.waiting
      if (!waitingSW && reg.installing) {
        const sw = reg.installing
        await new Promise(resolve => {
          const done = () => { sw.removeEventListener('statechange', onChange); resolve() }
          const onChange = () => { if (sw.state === 'installed' || sw.state === 'redundant') done() }
          sw.addEventListener('statechange', onChange)
          setTimeout(done, 8000)
        })
        waitingSW = reg.waiting
      } else if (!waitingSW) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        waitingSW = reg.waiting
      }
      if (!waitingSW) {
        setUpdateCheck('up-to-date')
        toast('Ya tienes la última versión instalada', 3000, 'ok')
        return
      }
      if (useAppStore.getState().offlinePending) {
        setUpdateCheck('idle')
        toast('Hay una actualización lista. Se instalará sola en cuanto termine de sincronizar tus datos pendientes.', 5500, 'warn')
        return
      }
      setUpdateCheck('applying')
      toast('Instalando nueva versión…', 2500, 'ok')
      waitingSW.postMessage({ type: 'SKIP_WAITING' })
      let reloaded = false
      const reloadOnce = () => { if (!reloaded) { reloaded = true; window.location.reload() } }
      navigator.serviceWorker.addEventListener('controllerchange', reloadOnce, { once: true })
      setTimeout(reloadOnce, 2500)
    } catch {
      setUpdateCheck('error')
      toast('No se pudo comprobar actualizaciones', 4000, 'err')
    } finally {
      updateBusyRef.current = false
    }
  }, [toast])

  return { updateCheck, checkForUpdate }
}
