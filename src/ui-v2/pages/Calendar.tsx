import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

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

const dotColor: Record<'complete' | 'partial' | 'off', string> = {
  complete: colors.primary.base,
  partial: colors.semantic.orange,
  off: colors.text[300],
}

export function Calendar({ monthLabel, weeks, onPrev, onNext }: CalendarProps) {
  return (
    <div style={{ maxWidth: 660 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <PageTitle>{monthLabel}</PageTitle>
        <div style={{ display: 'flex', gap: 6 }}>
          {([['‹', onPrev], ['›', onNext]] as const).map(([label, fn]) => (
            <button
              key={label}
              onClick={fn}
              className="uiv2-cal-nav"
              style={{ width: 32, height: 32, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], cursor: 'pointer', fontSize: 16, transition: transition(['background', 'border-color']) }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Card padding={5}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 10 }}>
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: colors.text[500] }}>{d}</div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {week.map((d, di) => {
                const isToday = d.status === 'today'
                return (
                  <div
                    key={di}
                    className={d.day ? 'uiv2-cal-day' : undefined}
                    style={{
                      position: 'relative',
                      aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                      borderRadius: radius.sm,
                      fontSize: 13, fontWeight: isToday ? 800 : 600,
                      background: isToday ? colors.primary.base : 'transparent',
                      boxShadow: isToday ? `0 0 0 1px ${colors.primary.base}, 0 4px 16px ${colors.primary.glow}` : 'none',
                      color: isToday ? '#fff' : d.day ? colors.text[900] : 'transparent',
                      transition: transition(['background']),
                    }}
                  >
                    {d.day || ''}
                    {d.day > 0 && !isToday && d.status && d.status !== 'off' && (
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor[d.status as 'complete' | 'partial'] }} />
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 16, marginTop: 14, fontSize: 11, color: colors.text[500] }}>
        {(Object.entries(dotColor) as [keyof typeof dotColor, string][]).map(([k, c]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />
            {k === 'complete' ? 'Completo' : k === 'partial' ? 'Parcial' : 'Descanso'}
          </div>
        ))}
      </div>

      <style>{`.uiv2-cal-nav:hover { background: ${colors.bg[500]} !important; border-color: ${colors.border.strong} !important; } .uiv2-cal-day:hover { background: rgba(255,255,255,.04) !important; }`}</style>
    </div>
  )
}
