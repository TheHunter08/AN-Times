import { useMemo } from 'react'
import { calcMin, mhm, localDateStr } from '../../utils/time.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function WorkHeatmap({ records, empId }) {
  const dayMap = useMemo(() => {
    const m = {}
    ;(records || []).filter(r => r.empId === empId && r.fin && r.inicio).forEach(r => {
      const d = localDateStr(new Date(r.inicio)); m[d] = (m[d] || 0) + calcMin(r)
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
        // localDateStr (no toISOString().slice(0,10)): dt ya está en medianoche
        // LOCAL — toISOString() la desplaza al día UTC anterior en España.
        const ds = localDateStr(dt)
        col.push({ ds, mins: dayMap[ds] || 0, future: dt > now })
      }
      result.push(col)
    }
    return result
  }, [dayMap])

  const cellColor = (mins, future) => {
    if (future) return 'transparent'
    if (mins === 0) return colors.bg[500]
    if (mins < 120) return `${colors.primary.base}28`
    if (mins < 300) return `${colors.primary.base}55`
    if (mins < 450) return `${colors.primary.base}80`
    return `${colors.primary.base}f0`
  }

  const cell = { width:10, height:10, borderRadius:radius.xs || 2 }

  return (
    <div style={{ overflowX:'auto', paddingBottom:4 }}>
      <div style={{ display:'flex', gap:2, minWidth:'fit-content' }}>
        {weeks.map((col, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:2 }}>
            {col.map(({ ds, mins, future }) => (
              <div key={ds} style={{ ...cell, background: cellColor(mins, future) }}
                title={mins > 0 ? `${ds}: ${mhm(mins)}` : ds} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:8, fontSize:10, color:colors.text[300] }}>
        <span>Menos</span>
        {[0, 120, 300, 450, 600].map((m, i) => (
          <div key={i} style={{ ...cell, background: cellColor(m, false) }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  )
}
