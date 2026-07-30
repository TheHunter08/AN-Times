import { mhm } from '../../utils/time.js'

export interface WeeklyBalanceRow {
  start: string
  end: string
  minutes: number
  targetMin: number
  justifiedMin?: number
  nonContractMin?: number
  extraMin: number
  deficitMin: number
  completed: boolean
}

interface WeeklyBalanceBreakdownProps {
  weeks: WeeklyBalanceRow[]
  title?: string
}

const formatDate = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString('es-ES', {
  day: '2-digit',
  month: 'short',
})

export function WeeklyBalanceBreakdown({ weeks, title = 'Desglose semanal' }: WeeklyBalanceBreakdownProps) {
  if (!weeks.length) return null

  return (
    <section style={{
      border: '1px solid var(--border-subtle, var(--uiv2-border-subtle))',
      borderRadius: 'var(--radius-xl, 14px)',
      background: 'var(--bg-card, var(--uiv2-bg-700))',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '13px 16px 10px',
        color: 'var(--text-secondary, var(--uiv2-text-700))',
        fontSize: 11,
        fontWeight: 750,
        letterSpacing: '.5px',
        textTransform: 'uppercase',
      }}>{title}</div>
      <div style={{ display: 'grid' }}>
        {weeks.map((week, index) => {
          const excused = (week.justifiedMin || 0) + (week.nonContractMin || 0)
          const balance = week.extraMin - week.deficitMin
          return (
            <div key={week.start} style={{
              padding: '11px 16px',
              borderTop: '1px solid var(--border-subtle, var(--uiv2-border-subtle))',
              display: 'grid',
              gap: 8,
              background: index % 2 ? 'color-mix(in srgb, var(--text-primary, var(--uiv2-text-900)) 2%, transparent)' : 'transparent',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                <div style={{ color: 'var(--text-primary, var(--uiv2-text-900))', fontSize: 12, fontWeight: 750 }}>
                  {formatDate(week.start)} – {formatDate(week.end)}
                </div>
                <span style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 750,
                  color: week.completed ? 'var(--success-400, #10b981)' : 'var(--warning-400, #f59e0b)',
                  background: week.completed ? 'var(--success-soft, rgba(16,185,129,.12))' : 'var(--warning-soft, rgba(245,158,11,.12))',
                }}>{week.completed ? 'Cerrada' : 'En curso'}</span>
              </div>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(88px, 1fr))',
                gap: 7,
              }}>
                {[
                  ['Trabajadas', mhm(week.minutes)],
                  ['Exigibles', mhm(week.targetMin)],
                  ['Justificadas', mhm(excused)],
                  ['Extra', week.extraMin ? `+${mhm(week.extraMin)}` : '0h 00m'],
                  ['Déficit', week.deficitMin ? `-${mhm(week.deficitMin)}` : '0h 00m'],
                  ['Saldo', `${balance >= 0 ? '+' : '-'}${mhm(Math.abs(balance))}`],
                ].map(([label, value]) => (
                  <div key={label} style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--text-tertiary, var(--uiv2-text-500))', fontSize: 9.5, marginBottom: 2 }}>{label}</div>
                    <div style={{
                      color: label === 'Déficit' && week.deficitMin
                        ? 'var(--danger-400, #ef4444)'
                        : label === 'Extra' && week.extraMin
                          ? 'var(--success-400, #10b981)'
                          : 'var(--text-primary, var(--uiv2-text-900))',
                      fontSize: 11.5,
                      fontWeight: 750,
                      fontVariantNumeric: 'tabular-nums',
                    }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
