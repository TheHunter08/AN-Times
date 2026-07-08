import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'

export function OfflineBanner() {
  const syncStatus     = useAppStore(s => s.syncStatus)
  const offlinePending = useAppStore(s => s.offlinePending)
  const fetchDB        = useAppStore(s => s.fetchDB)
  const [realOffline, setRealOffline] = useState(() => !navigator.onLine)
  const [retrying, setRetrying] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  // Rastrea si hubo al menos un momento offline en esta sesión para
  // que el flash "Sincronizado ✓" solo aparezca al reconectar, no al cargar
  const wasOfflineRef = useRef(!navigator.onLine)

  useEffect(() => {
    const on  = () => setRealOffline(false)
    const off = () => setRealOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  // "Sin red real": navigator.onLine puede ser true aunque no haya internet
  // (WiFi sin datos, señal débil). En ese caso saveDB pone syncStatus:'error'
  // + offlinePending:true. Lo tratamos igual que offline real.
  const isEffectivelyOffline = realOffline || syncStatus === 'offline' || (offlinePending && syncStatus === 'error')

  // Marca que estuvimos offline para mostrar el flash "Sincronizado ✓" al reconectar
  useEffect(() => {
    if (isEffectivelyOffline) wasOfflineRef.current = true
  }, [isEffectivelyOffline])

  // Flash "Sincronizado ✓" solo al volver de offline
  useEffect(() => {
    if (syncStatus !== 'synced' || !wasOfflineRef.current) return
    wasOfflineRef.current = false
    setJustSynced(true)
    const t = setTimeout(() => setJustSynced(false), 3000)
    return () => clearTimeout(t)
  }, [syncStatus])

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { await fetchDB() } catch {}
    setRetrying(false)
  }

  // Modo Oficina: sin red (real o efectiva) con datos pendientes
  if (isEffectivelyOffline) {
    return (
      <div className="offline-v3 offline-v3--office">
        <span style={{ fontSize:16 }}>📡</span>
        <div className="offline-v3-text">
          <div style={{ fontWeight:700 }}>Modo Oficina activo</div>
          <div className="offline-v3-sub">Fichajes guardados · Sincronizará al conectar</div>
        </div>
      </div>
    )
  }

  if (justSynced) {
    return (
      <div className="offline-v3 offline-v3--ok">
        <span style={{ fontSize:15 }}>✅</span>
        <div className="offline-v3-text">
          <div style={{ fontWeight:700 }}>Sincronizado</div>
          <div className="offline-v3-sub">Todos los fichajes subidos al servidor</div>
        </div>
      </div>
    )
  }

  // offlinePending con syncStatus distinto de 'error' → reintentando activamente
  if (offlinePending) {
    return (
      <div className="offline-v3 offline-v3--pending">
        <span style={{ fontSize:15, animation:'spin 1.2s linear infinite', display:'inline-block' }}>⟳</span>
        <div className="offline-v3-text">
          <div style={{ fontWeight:700 }}>Sincronizando…</div>
          <div className="offline-v3-sub">Subiendo fichajes pendientes</div>
        </div>
      </div>
    )
  }

  if (syncStatus === 'error') {
    return (
      <div className="offline-v3">
        <div className="offline-v3-dot" />
        <div className="offline-v3-text">
          <div>Error de conexión</div>
          <div className="offline-v3-sub">Datos guardados localmente</div>
        </div>
        <button className="offline-v3-retry" onClick={handleRetry} disabled={retrying}>
          {retrying ? '…' : 'Reintentar'}
        </button>
      </div>
    )
  }

  return null
}
