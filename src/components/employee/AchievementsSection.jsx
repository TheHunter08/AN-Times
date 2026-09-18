import { useMemo, useEffect } from 'react'
import { ACHIEVEMENTS, liveUnlockedIds } from '../../utils/achievements.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function AchievementsSection({ myRecs, streak, u, saveDB, db }) {
  // Unión con lo ya persistido (u.achievements): antes `unlocked` se
  // recalculaba solo en vivo contra records/streak actuales, así que un logro
  // basado en la racha (a2-a4) o en el mes en curso (a11-a12) se "re-bloqueaba"
  // en cuanto la racha se rompía o empezaba un mes nuevo, aunque ya se hubiera
  // conseguido — los logros deben ser permanentes una vez desbloqueados.
  const persisted = useMemo(() => new Set(u?.achievements || []), [u?.achievements])
  const unlocked = useMemo(
    () => new Set([...persisted, ...liveUnlockedIds(myRecs, streak)]),
    [myRecs, streak, persisted]
  )

  useEffect(() => {
    if (!u?.id || unlocked.size === 0) return
    const key = `achiev_notified_${u.id}`
    try {
      const prev = new Set(JSON.parse(localStorage.getItem(key) || '[]'))
      if (prev.size === 0) { localStorage.setItem(key, JSON.stringify([...unlocked])); return }
      const newOnes = ACHIEVEMENTS.filter(a => unlocked.has(a.id) && !prev.has(a.id))
      if (newOnes.length > 0) {
        newOnes.forEach(a => {
          try {
            if (Notification.permission === 'granted') {
              new Notification(`🏆 ¡Logro desbloqueado! ${a.icon} ${a.title}`, { body: a.desc, icon: '/pwa-192x192.png' })
            }
          } catch {}
        })
        localStorage.setItem(key, JSON.stringify([...unlocked]))
        if (saveDB && db && newOnes.length > 0) {
          saveDB(fresh => ({
            employees: (fresh.employees || []).map(e => e.id === u.id ? { ...e, achievements: [...unlocked] } : e),
          }))
        }
      }
    } catch {}
  }, [unlocked, u?.id])

  return (
    <div style={{ padding:'0 16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.6px' }}>Logros</div>
        <div style={{ fontSize:11, color:colors.text[300] }}>{unlocked.size}/{ACHIEVEMENTS.length} desbloqueados</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(80px,1fr))', gap:8 }}>
        {ACHIEVEMENTS.map(a => {
          const ok = unlocked.has(a.id)
          return (
            <div key={a.id} title={a.desc} style={{
              background: ok ? `color-mix(in srgb, ${colors.primary.base} 7%, transparent)` : colors.bg[600],
              border: `1px solid ${ok ? `color-mix(in srgb, ${colors.primary.base} 19%, transparent)` : colors.border.subtle}`,
              borderRadius:radius.xl, padding:'10px 6px', textAlign:'center',
              opacity: ok ? 1 : 0.5, transition:'all .2s',
            }}>
              <div style={{ fontSize:22, marginBottom:4, filter: ok ? 'none' : 'grayscale(1)' }}>{ok ? a.icon : '🔒'}</div>
              <div style={{ fontSize:10, fontWeight:700, color: ok ? colors.primary.light : colors.text[500], lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.title}</div>
              <div style={{ fontSize:9, color:colors.text[300], marginTop:2, lineHeight:1.3, display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical', overflow:'hidden' }}>{a.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
