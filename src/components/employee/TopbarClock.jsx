import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { useClock } from '../../hooks/useClock.js'

export function TopbarClock() {
  const { clockTime, clockDate } = useClock()
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const syncStatus = useAppStore(s => s.syncStatus)
  const [, force] = useState(0)
  // Re-render cada minuto para refrescar "hace X min"
  useEffect(() => { const id = setInterval(() => force(t => t + 1), 60000); return () => clearInterval(id) }, [])

  const syncLabel = (() => {
    if (syncStatus === 'syncing') return 'sincronizando…'
    if (syncStatus === 'error') return 'sin conexión'
    if (!lastSyncTime) return null
    const m = Math.floor((Date.now() - lastSyncTime) / 60000)
    if (m < 1) return 'sincronizado ahora'
    if (m < 60) return `hace ${m} min`
    const h = Math.floor(m / 60)
    if (h < 24) return `hace ${h} h`
    return `hace ${Math.floor(h / 24)} d`
  })()

  return (
    <div className="emp-subdate">
      {clockDate} · <span style={{ color:'var(--primary-light)', fontWeight:600 }}>{clockTime}</span>
      {syncLabel && <span style={{ marginLeft:6, color: syncStatus === 'error' ? 'var(--danger)' : 'var(--text4)', fontSize:10 }}>· {syncLabel}</span>}
    </div>
  )
}
