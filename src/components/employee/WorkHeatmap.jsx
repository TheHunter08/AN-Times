import { useMemo } from 'react'
import { calcMin, mhm } from '../../utils/time.js'

export function WorkHeatmap({ records, empId }) {
  const dayMap = useMemo(() => {
    const m = {}
    ;(records || []).filter(r => r.empId === empId && r.fin && r.inicio).forEach(r => {
      const d = r.inicio.slice(0, 10); m[d] = (m[d] || 0) + calcMin(r)
    })
    return m
  }, [records, empId])

  const weeks = useMemo(() => {
    const now = new Date(); now.setHours(0, 0, 0, 0)
    const start = new Date(now)
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 14 * 7)
    const result = []
    for (let w = 0; w < 15; w++) {
      const col = []
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start)
        dt.setDate(dt.getDate() + w * 7 + d)
        const ds = dt.toISOString().slice(0, 10)
        col.push({ ds, mins: dayMap[ds] || 0, future: dt > now })
      }
      result.push(col)
    }
    return result
  }, [dayMap])

  const color = (mins, future) => {
    if (future) return 'transparent'
    if (mins === 0) return 'var(--bg-500)'
    if (mins < 120) return 'rgba(59,91,255,.25)'
    if (mins < 300) return 'rgba(59,91,255,.5)'
    if (mins < 450) return 'rgba(59,91,255,.75)'
    return 'rgba(59,91,255,.95)'
  }

  return (
    <div className="v3-heatmap-wrap">
      <div className="v3-heatmap-grid">
        {weeks.map((col, wi) => (
          <div key={wi} className="v3-heatmap-col">
            {col.map(({ ds, mins, future }) => (
              <div key={ds} className="v3-heatmap-cell" style={{ background: color(mins, future) }}
                title={mins > 0 ? `${ds}: ${mhm(mins)}` : ds} />
            ))}
          </div>
        ))}
      </div>
      <div className="v3-heatmap-legend">
        <span>Menos</span>
        {[0, 120, 300, 450, 600].map((m, i) => (
          <div key={i} className="v3-heatmap-cell" style={{ background: color(m, false), width:10, height:10 }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}
