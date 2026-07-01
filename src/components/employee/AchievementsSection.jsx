import { useMemo, useEffect } from 'react'
import { calcMin } from '../../utils/time.js'

const ACHIEVEMENTS = [
  { id:'a1', icon:'🌱', title:'Primera jornada', desc:'Primera jornada completada', check:(r)=>r.filter(x=>x.fin).length>=1 },
  { id:'a2', icon:'⚡', title:'Tres en raya', desc:'3 días consecutivos', check:(r,s)=>s>=3 },
  { id:'a3', icon:'🔥', title:'Semana de fuego', desc:'7 días seguidos', check:(r,s)=>s>=7 },
  { id:'a4', icon:'🌟', title:'Mes imparable', desc:'30 días seguidos', check:(r,s)=>s>=30 },
  { id:'a5', icon:'📅', title:'50 jornadas', desc:'50 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>x.inicio.slice(0,10))).size>=50 },
  { id:'a6', icon:'💯', title:'100 jornadas', desc:'100 días trabajados', check:(r)=>new Set(r.filter(x=>x.fin&&x.inicio).map(x=>x.inicio.slice(0,10))).size>=100 },
  { id:'a7', icon:'🏅', title:'Ultramaratón', desc:'10h en un solo día', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const d=x.inicio.slice(0,10);m[d]=(m[d]||0)+calcMin(x)});return Object.values(m).some(v=>v>=600)} },
  { id:'a8', icon:'💪', title:'Centurión', desc:'100h en un mes', check:(r)=>{const m={};r.filter(x=>x.fin&&x.inicio).forEach(x=>{const k=x.inicio.slice(0,7);m[k]=(m[k]||0)+calcMin(x)});return Object.values(m).some(v=>v>=6000)} },
  { id:'a9', icon:'⏰', title:'Siempre puntual', desc:'5 días antes de las 09:30', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=570}).length>=5 },
  { id:'a10', icon:'🌅', title:'Madrugador', desc:'3 veces antes de las 08:00', check:(r)=>r.filter(x=>{if(!x.fin||!x.inicio)return false;const d=new Date(x.inicio);return d.getHours()*60+d.getMinutes()<=480}).length>=3 },
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
          const emps = (db.employees || []).map(e =>
            e.id === u.id ? { ...e, achievements: [...unlocked] } : e
          )
          saveDB({ employees: emps })
        }
      }
    } catch {}
  }, [unlocked, u?.id])

  return (
    <div style={{ padding:'0 16px 16px' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px' }}>Logros</div>
        <div style={{ fontSize:11, color:'var(--text4)' }}>{unlocked.size}/{ACHIEVEMENTS.length} desbloqueados</div>
      </div>
      <div className="v3-achievements-grid">
        {ACHIEVEMENTS.map(a => {
          const ok = unlocked.has(a.id)
          return (
            <div key={a.id} className={`v3-achievement${ok ? ' unlocked' : ''}`} title={a.desc}>
              <div className="v3-achievement-icon">{ok ? a.icon : '🔒'}</div>
              <div className="v3-achievement-title">{a.title}</div>
              <div className="v3-achievement-desc">{a.desc}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
