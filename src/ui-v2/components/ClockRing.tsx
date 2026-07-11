import { colors } from '../design-system/colors'
import { transition } from '../design-system/animations.js'

export interface ClockRingProps {
  pct: number
  color: string
  size?: number
}

// Anillo de progreso SVG — réplica directa de una referencia real que trajo
// el usuario (panel "Iniciar fichaje" con anillo circular de estado).
// Compartido entre el panel de empleado y el widget de fichaje del admin.
export function ClockRing({ pct, color, size = 216 }: ClockRingProps) {
  const stroke = 5
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(100, pct)) / 100 * c
  return (
    <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke={colors.bg[400]} strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
        style={{ transition: transition(['stroke-dasharray']) }}
      />
    </svg>
  )
}
