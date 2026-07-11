import { wkStart, calcMin, localDateStr } from '../../utils/time.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function WeeklyBars({ db, u, timer }) {
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const now = new Date()
  const dow = (now.getDay() + 6) % 7
  const ws = wkStart(now)
  const bars = DAYS.map((label, i) => {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    const ds = localDateStr(d)
    let min = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(ds))
      .reduce((s, r) => s + calcMin(r), 0)
    if (i === dow && timer.state !== 'idle') min += Math.floor(timer.ws / 60)
    return { label, min, isToday: i === dow }
  })
  const maxMin = Math.max(1, ...bars.map(b => b.min))

  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:80 }}>
        {bars.map(({ label, min, isToday }) => (
          <div key={label} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-end', gap:4, height:'100%' }}>
            <div style={{
              width:'100%', borderRadius:`${radius.sm} ${radius.sm} 0 0`,
              background: isToday ? colors.primary.base : `${colors.primary.base}50`,
              height: min > 0 ? `${Math.max(8, min / maxMin * 100)}%` : 3,
              opacity: min > 0 ? 1 : 0.3,
              transition: 'height .3s ease',
              boxShadow: isToday ? `0 0 10px ${colors.primary.glow}` : 'none',
            }} />
            <span style={{ fontSize:9, fontWeight: isToday ? 800 : 600, color: isToday ? colors.primary.light : colors.text[300], letterSpacing:'.3px' }}>{label}</span>
          </div>
        ))}
      </div>
      <div style={{ height:4 }} />
    </div>
  )
}
