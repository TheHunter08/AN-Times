import { useMemo, useEffect } from 'react'
import { calcMin, p2, localDateStr } from '../../utils/time.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

function localMonthKey(d = new Date()) { return `${d.getFullYear()}-${p2(d.getMonth() + 1)}` }

function workdaysSoFarInMonth(mk, ref = new Date()) {
  const [y, m] = mk.split('-').map(Number)
  let n = 0
  const d = new Date(y, m - 1, 1)
  while (d <= ref) {
    if (d.getDay() !== 0 && d.getDay() !== 6) n++
    d.setDate(d.getDate() + 1)
  }
  return n
}

const ACHIEVEMENTS = [
  { id:'a1', icon:'🌱', title:'Primera jornada', desc:'Primera jornada completada', check:(r)=>r.filter(x=>x.fin).length>=1 },
  { id:'a2', icon:'⚡', title:'Tres en raya', desc:'3 días consecutivos', check:(r,s)=>s>=3 },
  { id:'a3', icon:'🔥', title:'Semana de fuego', desc:'7 días seguidos', check:(r,s)=>s>=7 },
  { id:'a4', icon:'🌟', title:'Mes imparable', desc:'30 días seguidos', check:(r,s)=>s>=30 },
  // localDateStr(new Date(x.inicio)) (no x.inicio.slice(0,10)/slice(0,7)/startsWith(mk)):
  // inicio se guarda en UTC — un fichaje nocturno se atribuía al día/mes siguiente en UTC
  // en vez del día/mes local real, falseando rachas y logros.
  { id:'a5', icon:'📅', title:'50 jornadas', desc:'50 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>localDateStr(new Date(x.inicio)))).size>=50 },
  { id:'a6', icon:'💯', title:'100 jornadas', desc:'100 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>localDateStr(new Date(x.inicio)))).size>=100 },
  { id:'a7', icon:'🏅', title:'Ultramaratón', desc:'10h en un solo día', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const d=localDateStr(new Date(x.inicio));m[d]=(m[d]||0)+calcMin(x)});return Object.values(m).some(v=>v>=600)} },
  { id:'a8', icon:'💪', title:'Centurión', desc:'100h en un mes', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const k=localDateStr(new Date(x.inicio)).slice(0,7);m[k]=(m[k]||0)+calcMin(x)});return Object.values(m).some(v=>v>=6000)} },
  { id:'a9', icon:'⏰', title:'Siempre puntual', desc:'5 días antes de las 09:30', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=570}).length>=5 },
  { id:'a10', icon:'🌅', title:'Madrugador', desc:'3 veces antes de las 08:00', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=480}).length>=3 },
  { id:'a11', icon:'🎯', title:'Cero olvidos', desc:'Ningún fichaje cerrado automáticamente este mes', check:(r)=>{
    const mk = localMonthKey()
    const monthRecs = r.filter(x=>x.inicio && localDateStr(new Date(x.inicio)).startsWith(mk))
    return monthRecs.length>0 && !monthRecs.some(x=>x.autoClosedAt)
  } },
  { id:'a12', icon:'📆', title:'Mes perfecto', desc:'Todos los días laborables fichados este mes, sin olvidos', check:(r)=>{
    const mk = localMonthKey()
    const expected = workdaysSoFarInMonth(mk)
    const monthRecs = r.filter(x=>x.inicio && localDateStr(new Date(x.inicio)).startsWith(mk))
    const workedDays = new Set(monthRecs.filter(x=>x.fin&&calcMin(x)>=30).map(x=>localDateStr(new Date(x.inicio)))).size
    return expected>=5 && workedDays>=expected && monthRecs.length>0 && !monthRecs.some(x=>x.autoClosedAt)
  } },
]

export function AchievementsSection({ myRecs, streak, u, saveDB, db }) {
  const unlocked = useMemo(() => new Set(ACHIEVEMENTS.filter(a => a.check(myRecs, streak)).map(a => a.id)), [myRecs, streak])

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
