import { useAppStore } from '../../store/appStore.js'

export function SyncBadge() {
  const syncStatus     = useAppStore(s => s.syncStatus)
  const syncError      = useAppStore(s => s.syncError)
  const realtimeStatus = useAppStore(s => s.realtimeStatus)
  const isNoConfig = syncError === 'no_config'

  const syncColor = syncStatus === 'synced' ? 'var(--green)'
    : syncStatus === 'syncing' ? 'var(--orange)'
    : isNoConfig ? 'var(--text3)'
    : 'var(--danger)'
  const syncLabel = syncStatus === 'synced' ? 'Sincronizado'
    : syncStatus === 'syncing' ? 'Guardando…'
    : isNoConfig ? 'Solo local'
    : 'Sin conexión'

  // Punto Realtime: verde=conectado, amarillo=reconectando, gris=sin iniciar
  const rtColor = realtimeStatus === 'SUBSCRIBED' ? 'var(--green)'
    : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT' || realtimeStatus === 'CLOSED' ? 'var(--orange)'
    : 'var(--text4)'
  const rtTitle = realtimeStatus === 'SUBSCRIBED' ? 'Tiempo real activo'
    : realtimeStatus === 'CHANNEL_ERROR' || realtimeStatus === 'TIMED_OUT' || realtimeStatus === 'CLOSED' ? 'Reconectando tiempo real…'
    : 'Tiempo real inactivo'

  return (
    <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
      <span style={{ color: syncColor, display:'flex', alignItems:'center', gap:4 }}>
        <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
        {syncLabel}
      </span>
      <span title={rtTitle} style={{
        width:6, height:6, borderRadius:'50%', background: rtColor, flexShrink:0,
        boxShadow: realtimeStatus === 'SUBSCRIBED' ? '0 0 0 2px color-mix(in srgb, var(--green) 25%, transparent)' : 'none'
      }} />
    </div>
  )
}
