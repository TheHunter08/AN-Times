import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { uploadPendingIfAny } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors.js'
import { radius } from '../../ui-v2/design-system/radius.js'

const BASE = { position:'fixed', top:0, left:0, right:0, zIndex:200, display:'flex', alignItems:'center', gap:10, padding:'9px 16px', fontSize:13, backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)' }
const retryBtn = { background:'rgba(255,255,255,.12)', border:'1px solid rgba(255,255,255,.2)', borderRadius:radius.md, padding:'4px 12px', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', fontFamily:'inherit', flexShrink:0 }

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
    const t = setTimeout(() => setJustSynced(false), 3000)
    return () => clearTimeout(t)
  }, [syncStatus])

  const handleRetry = async () => {
    if (retrying) return
    setRetrying(true)
    try { uploadPendingIfAny(); await fetchDB() } catch {}
    setRetrying(false)
  }

  const handleUpload = () => {
    if (retrying) return
    setRetrying(true)
    uploadPendingIfAny()
    setTimeout(() => setRetrying(false), 4000)
  }

  if (isEffectivelyOffline) return (
    <div style={{ ...BASE, background:`${colors.semantic.orange}18`, borderBottom:`1px solid ${colors.semantic.orange}30` }}>
      <span style={{ fontSize:16 }}>📡</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, color:colors.semantic.orange }}>Modo sin cobertura</div>
        <div style={{ fontSize:11, color:`${colors.semantic.orange}cc` }}>Fichajes guardados · Sincronizará al conectar</div>
      </div>
      {offlinePending && (
        <button style={retryBtn} onClick={handleUpload} disabled={retrying}>{retrying ? '…' : 'Subir'}</button>
      )}
    </div>
  )

  if (justSynced) return (
    <div style={{ ...BASE, background:`${colors.semantic.green}15`, borderBottom:`1px solid ${colors.semantic.green}25` }}>
      <span style={{ fontSize:15 }}>✅</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, color:colors.semantic.green }}>Sincronizado</div>
        <div style={{ fontSize:11, color:`${colors.semantic.green}cc` }}>Todos los fichajes subidos al servidor</div>
      </div>
    </div>
  )

  if (offlinePending) return (
    <div style={{ ...BASE, background:`${colors.primary.base}10`, borderBottom:`1px solid ${colors.primary.base}20` }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <span style={{ fontSize:15, animation:'spin 1.2s linear infinite', display:'inline-block' }}>⟳</span>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:700, color:colors.primary.light }}>Sincronizando…</div>
        <div style={{ fontSize:11, color:colors.text[500] }}>Subiendo fichajes pendientes</div>
      </div>
    </div>
  )

  if (syncStatus === 'error') return (
    <div style={{ ...BASE, background:`${colors.semantic.red}10`, borderBottom:`1px solid ${colors.semantic.red}20` }}>
      <div style={{ width:7, height:7, borderRadius:'50%', background:colors.semantic.red, flexShrink:0 }} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ color:colors.semantic.red, fontWeight:600 }}>Error de conexión</div>
        <div style={{ fontSize:11, color:colors.text[500] }}>Datos guardados localmente</div>
      </div>
      <button style={retryBtn} onClick={handleRetry} disabled={retrying}>{retrying ? '…' : 'Reintentar'}</button>
    </div>
  )

  return null
}
