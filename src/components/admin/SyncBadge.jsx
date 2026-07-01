import { useAppStore } from '../../store/appStore.js'

export function SyncBadge() {
  const syncStatus = useAppStore(s => s.syncStatus)
  const syncError  = useAppStore(s => s.syncError)
  const isNoConfig = syncError === 'no_config'
  const color = syncStatus === 'synced' ? 'var(--green)'
    : syncStatus === 'syncing' ? 'var(--orange)'
    : isNoConfig ? 'var(--text3)'
    : 'var(--danger)'
  const label = syncStatus === 'synced' ? 'Sincronizado'
    : syncStatus === 'syncing' ? 'Guardando…'
    : isNoConfig ? 'Solo local'
    : 'Sin conexión'
  return (
    <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, color }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {label}
    </div>
  )
}
