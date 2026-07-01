import { wkStart, calcMin } from '../../utils/time.js'

export function WeeklyBars({ db, u, timer }) {
  const DAYS = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']
  const now = new Date()
  const dow = (now.getDay() + 6) % 7
  const ws = wkStart(now)
  const bars = DAYS.map((label, i) => {
    const d = new Date(ws)
    d.setDate(d.getDate() + i)
    const ds = d.toISOString().slice(0, 10)
    let min = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(ds))
      .reduce((s, r) => s + calcMin(r), 0)
    if (i === dow && timer.state !== 'idle') min += Math.floor(timer.ws / 60)
    return { label, min, isToday: i === dow }
  })
  const maxMin = Math.max(1, ...bars.map(b => b.min))

  return (
    <div style={{ marginBottom: 12 }}>
      <div className="week-bars">
        {bars.map(({ label, min, isToday }) => (
          <div key={label} className={`week-bar${isToday ? ' today-bar' : ''}`}
            style={{ height: min > 0 ? Math.max(6, min / maxMin * 100) + '%' : '3px', opacity: min > 0 ? 1 : 0.3 }}>
            <span className="week-bar-label">{label}</span>
          </div>
        ))}
      </div>
      <div style={{ height: 22 }} />
    </div>
  )
}
