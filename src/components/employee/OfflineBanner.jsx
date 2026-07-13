import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { uploadPendingIfAny } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const BASE = {
  position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
  display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px',
  fontSize: 13, backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
  boxShadow: '0 2px 20px rgba(0,0,0,.3)',
}

const IcoOffline = () => (
  <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'rgba(251,146,60,.18)', border: '1px solid rgba(251,146,60,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fb923c" strokeWidth="2" strokeLinecap="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55M5 6.58A11 11 0 0 0 3.8 8m3.6-4.43A11 11 0 0 1 12 3c5.5 0 10 3.86 10 8.64 0 1.26-.28 2.46-.78 3.54M8.85 15.1A3 3 0 0 0 12 18a3 3 0 0 0 2.96-2.54"/>
    </svg>
  </div>
)

const IcoSynced = () => (
  <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'rgba(16,185,129,.18)', border: '1px solid rgba(16,185,129,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  </div>
)

const IcoSpinner = () => (
  <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'rgba(139,92,246,.18)', border: '1px solid rgba(139,92,246,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'spin 1s linear infinite' }}>
      <path d="M21 12a9 9 0 1 1-6.22-8.56"/>
    </svg>
  </div>
)

const IcoError = () => (
  <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'rgba(239,68,68,.18)', border: '1px solid rgba(239,68,68,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  </div>
)

const ActionBtn = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} style={{
    background: 'rgba(255,255,255,.1)', border: '1px solid rgba(255,255,255,.18)',
    borderRadius: radius.md, padding: '5px 13px', fontSize: 11, fontWeight: 700,
    color: '#fff', cursor: disabled ? 'default' : 'pointer', fontFamily: 'inherit',
    flexShrink: 0, opacity: disabled ? .6 : 1,
  }}>
    {children}
  </button>
)

export function OfflineBanner() {
  const syncStatus     = useAppStore(s => s.syncStatus)
  const offlinePending = useAppStore(s => s.offlinePending)
  const fetchDB        = useAppStore(s => s.fetchDB)
  const [realOffline, setRealOffline] = useState(() => !navigator.onLine)
  const [retrying, setRetrying] = useState(false)
  const [justSynced, setJustSynced] = useState(false)
  const wasOfflineRef = useRef(!navigator.onLine)

  useEffect(() => {
    const on  = () => setRealOffline(false)
    const off = () => setRealOffline(true)
    window.addEventListener('online',  on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  const isEffectivelyOffline = realOffline || syncStatus === 'offline' || (offlinePending && syncStatus === 'error')

  useEffect(() => {
    if (isEffectivelyOffline) wasOfflineRef.current = true
  }, [isEffectivelyOffline])

  useEffect(() => {
    if (syncStatus !== 'synced' || !wasOfflineRef.current) return
    wasOfflineRef.current = false
    setJustSynced(true)
    const t = setTimeout(() => setJustSynced(false), 3500)
    return () => clearTimeout(t)
  }, [syncStatus])

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try {
      const result = await uploadPendingIfAny()
      if (result?.ok && !result.pending) await fetchDB()
    } finally { setRetrying(false) }
  }

  const handleUpload = async () => {
    if (retrying) return
    setRetrying(true)
    try { await uploadPendingIfAny() } finally { setRetrying(false) }
  }

  if (isEffectivelyOffline) return (
    <div style={{ ...BASE, background: 'rgba(30,20,10,.88)', borderBottom: '1px solid rgba(251,146,60,.25)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <IcoOffline />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#fb923c', fontSize: 13 }}>Sin cobertura</div>
        <div style={{ fontSize: 11, color: 'rgba(251,146,60,.7)', marginTop: 1 }}>
          {offlinePending ? 'Cambios guardados · Se sincronizarán al conectar' : 'Trabajando sin conexión'}
        </div>
      </div>
      {offlinePending && <ActionBtn onClick={handleUpload} disabled={retrying}>{retrying ? 'Subiendo…' : 'Subir'}</ActionBtn>}
    </div>
  )

  if (justSynced) return (
    <div style={{ ...BASE, background: 'rgba(5,25,15,.88)', borderBottom: '1px solid rgba(16,185,129,.25)' }}>
      <IcoSynced />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#10b981', fontSize: 13 }}>Sincronizado</div>
        <div style={{ fontSize: 11, color: 'rgba(16,185,129,.7)', marginTop: 1 }}>Todos los datos actualizados en tiempo real</div>
      </div>
    </div>
  )

  if (offlinePending) return (
    <div style={{ ...BASE, background: 'rgba(15,10,30,.88)', borderBottom: '1px solid rgba(139,92,246,.25)' }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <IcoSpinner />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, color: '#a78bfa', fontSize: 13 }}>Sincronizando…</div>
        <div style={{ fontSize: 11, color: 'rgba(167,139,250,.7)', marginTop: 1 }}>Subiendo cambios pendientes al servidor</div>
      </div>
    </div>
  )

  if (syncStatus === 'error') return (
    <div style={{ ...BASE, background: 'rgba(25,5,5,.88)', borderBottom: '1px solid rgba(239,68,68,.22)' }}>
      <IcoError />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#f87171', fontWeight: 700, fontSize: 13 }}>Error de conexión</div>
        <div style={{ fontSize: 11, color: 'rgba(248,113,113,.6)', marginTop: 1 }}>Datos guardados localmente</div>
      </div>
      <ActionBtn onClick={handleRetry} disabled={retrying}>{retrying ? 'Reintentando…' : 'Reintentar'}</ActionBtn>
    </div>
  )

  return null
}
