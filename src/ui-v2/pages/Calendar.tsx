import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { typeScale } from '../design-system/typography.js'

export interface CalendarDay {
  day: number
  status?: 'complete' | 'partial' | 'today' | 'off'
  label?: string
}

export interface CalendarProps {
  monthLabel: string
  weeks: CalendarDay[][]
  onPrev: () => void
  onNext: () => void
}

const dayColor: Record<NonNullable<CalendarDay['status']>, string> = {
  complete: colors.semantic.green,
  partial: colors.semantic.orange,
  today: colors.primary.base,
  off: colors.text[300],
}

export function Calendar({ monthLabel, weeks, onPrev, onNext }: CalendarProps) {
  return (
    <div style={{ maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ fontSize: typeScale.h1.size, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking }}>{monthLabel}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['‹', onPrev], ['›', onNext]] as const).map(([label, fn]) => (
            <button
              key={label}
              onClick={fn}
              style={{ width: 32, height: 32, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], cursor: 'pointer', fontSize: 16 }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6, marginBottom: 6 }}>
        {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: colors.text[500] }}>{d}</div>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {week.map((d, di) => (
              <div
                key={di}
                style={{
                  aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  borderRadius: radius.sm,
                  fontSize: 13, fontWeight: d.status === 'today' ? 800 : 600,
                  background: d.status === 'today' ? colors.primary.base : d.status ? `${dayColor[d.status]}1a` : 'transparent',
                  color: d.status === 'today' ? '#fff' : d.day ? colors.text[900] : 'transparent',
                }}
              >
                {d.day || ''}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
