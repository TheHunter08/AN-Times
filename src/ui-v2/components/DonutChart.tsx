import { colors } from '../design-system/colors'

export interface DonutSlice {
  label: string
  pct: number // 0-100, debe sumar ~100 entre todas las slices
  color: string
}

export interface DonutChartProps {
  slices: DonutSlice[]
  centerValue: string
  centerLabel: string
  size?: number
}

// Donut SVG puro — réplica del gráfico de distribución por departamento de
// la referencia real aportada por el usuario. Cada slice es un arco de
// stroke-dasharray sobre un círculo común, con el total en el centro.
export function DonutChart({ slices, centerValue, centerLabel, size = 140 }: DonutChartProps) {
  const stroke = 16
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          {slices.map(s => {
            const dash = (s.pct / 100) * c
            const el = (
              <circle
                key={s.label}
                cx={size / 2} cy={size / 2} r={r}
                stroke={s.color} strokeWidth={stroke} fill="none"
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += dash
            return el
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 17, fontWeight: 640, color: colors.text[900], letterSpacing: '-.4px' }}>{centerValue}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: colors.text[500] }}>{centerLabel}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {slices.map(s => (
          <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: colors.text[700], flex: 1 }}>{s.label}</span>
            <span style={{ fontSize: 12, fontWeight: 640, color: colors.text[900] }}>{s.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
