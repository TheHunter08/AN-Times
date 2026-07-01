import { calcMin, mhm } from '../../utils/time.js'

export function buildHeatmap(recs, empCount) {
  const map = {}
  const now = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0,10)
    map[k] = { count: 0, min: 0 }
  }
  recs.filter(r => r.fin && r.inicio).forEach(r => {
    const k = r.inicio.slice(0,10)
    if (map[k]) { map[k].count++; map[k].min += calcMin(r) }
  })
  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

export function Heatmap({ data }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const weeks = []
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i+7))

  return (
    <div style={{ overflowX:'auto', paddingBottom:4 }}>
      <div style={{ display:'flex', gap:3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {week.map(({ date, count, min }) => {
              const pct = count / max
              const alpha = pct < 0.01 ? 0 : Math.max(0.15, pct)
              return (
                <div key={date} title={`${date}: ${count} fichajes · ${mhm(Math.floor(min))}`}
                  style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                    background: alpha < 0.01 ? 'var(--bg-500)' : `rgba(108,99,255,${alpha})`,
                    border: alpha > 0 ? '1px solid rgba(108,99,255,.2)' : '1px solid var(--border)' }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
