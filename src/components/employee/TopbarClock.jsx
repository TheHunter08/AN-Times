import { useState, useEffect } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { useClock } from '../../hooks/useClock.js'
import { colors } from '../../ui-v2/design-system/colors'

export function TopbarClock() {
  const { clockTime, clockDate } = useClock()
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const syncStatus = useAppStore(s => s.syncStatus)
  const [, force] = useState(0)
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
    <div style={{ fontSize:12, color:colors.text[500], whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
      {clockDate} · <span style={{ color:colors.primary.light, fontWeight:600 }}>{clockTime}</span>
    </div>
  )
}
