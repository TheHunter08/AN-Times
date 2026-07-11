import { useId } from 'react'
import { colors } from '../design-system/colors.js'

export interface AreaChartPoint {
  label: string
  value: number // 0-100
}

export interface AreaChartProps {
  data: AreaChartPoint[]
  height?: number
  color?: string
  /** Segunda serie opcional (p.ej. "semana pasada") — línea discontinua gris,
   * sin área rellena, para comparar sin competir visualmente con la serie
   * principal. */
  compareData?: AreaChartPoint[]
  legend?: { current: string; compare: string }
  /** Modo sparkline (tarjetas KPI pequeñas): sin etiquetas de eje ni puntos
   * marcados — a esa escala ("0 1 2 3 4 5 6") solo añaden ruido, no
   * información legible. */
  compact?: boolean
}

function toPoints(data: AreaChartPoint[], w: number, h: number) {
  const n = data.length
  const stepX = n > 1 ? w / (n - 1) : w
  return data.map((d, i) => [i * stepX, h - (Math.max(0, Math.min(100, d.value)) / 100) * h] as const)
}

// Gráfico de área suave en SVG puro (sin librería) — sustituye a las barras
// CSS planas, que es uno de los detalles que más delataban una UI de
// plantilla en vez de un dashboard de producto real.
export function AreaChart({ data, height = 180, color = colors.primary.base, compareData, legend, compact = false }: AreaChartProps) {
  const gradId = useId()
  const w = 100, h = 100
  const points = toPoints(data, w, h)
  const comparePoints = compareData ? toPoints(compareData, w, h) : null

  // Curva suave tipo Catmull-Rom -> Bézier, para que no se vea como un
  // gráfico de líneas rectas hecho a mano.
  const smoothPath = (pts: readonly (readonly [number, number])[]) => {
    if (pts.length < 2) return ''
    let d = `M ${pts[0][0]} ${pts[0][1]}`
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i === 0 ? 0 : i - 1]
      const [x1, y1] = pts[i]
      const [x2, y2] = pts[i + 1]
      const [x3, y3] = pts[i + 2 < pts.length ? i + 2 : i + 1]
      const cp1x = x1 + (x2 - x0) / 6
      const cp1y = y1 + (y2 - y0) / 6
      const cp2x = x2 - (x3 - x1) / 6
      const cp2y = y2 - (y3 - y1) / 6
      d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${x2} ${y2}`
    }
    return d
  }

  const linePath = smoothPath(points)
  const areaPath = `${linePath} L ${points[points.length - 1][0]} ${h} L ${points[0][0]} ${h} Z`
  const comparePath = comparePoints ? smoothPath(comparePoints) : null

  return (
    <div style={{ position: 'relative' }}>
      {legend && (
        <div style={{ display: 'flex', gap: 16, marginBottom: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, color: colors.text[700] }}>
            <span style={{ width: 10, height: 2, borderRadius: 2, background: color }} />{legend.current}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 500, color: colors.text[500] }}>
            <span style={{ width: 10, height: 2, borderRadius: 2, background: colors.text[300] }} />{legend.compare}
          </span>
        </div>
      )}
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.45" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        {comparePath && (
          <path d={comparePath} fill="none" stroke={colors.text[300]} strokeWidth="1.4" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        )}
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
        {!compact && points.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r="1.4" vectorEffect="non-scaling-stroke" fill={colors.bg[600]} stroke={color} strokeWidth="1.2" />
        ))}
      </svg>
      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          {data.map(d => (
            <span key={d.label} style={{ fontSize: 11, fontWeight: 600, color: colors.text[500] }}>{d.label}</span>
          ))}
        </div>
      )}
    </div>
  )
}
