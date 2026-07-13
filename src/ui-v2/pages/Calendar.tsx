import { useState } from 'react'
import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'
import { shadows } from '../design-system/shadows.js'
import { IconArrowLeft, IconArrowRight } from '../components/Icons.js'
import { WeekSchedule } from '../components/WeekSchedule.js'
import type { WeekScheduleProps } from '../components/WeekSchedule.js'

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
  /** Vista semanal detallada con horario por bloques — la misma que se usa
   * como widget en el Dashboard, ahora también disponible aquí como la
   * pantalla completa a la que ese widget debería apuntar. */
  week?: WeekScheduleProps
}

const dotColor: Record<'complete' | 'partial' | 'off', string> = {
  complete: '#22C55E',
  partial: '#F59E0B',
  off: '#64748B',
}

export function Calendar({ monthLabel, weeks, onPrev, onNext, week }: CalendarProps) {
  const [view, setView] = useState<'mes' | 'semana'>('mes')
  return (
    <div className="uiv2-calendar-page" style={{ maxWidth: view === 'semana' ? 980 : 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>{monthLabel}</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {week && (
            <div style={{ display: 'flex', gap: 3, padding: 3, background: colors.bg[500], borderRadius: radius.sm }}>
              {(['semana', 'mes'] as const).map(v => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  style={{
                    padding: '6px 14px', borderRadius: radius.xs, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: 12, fontWeight: 600, textTransform: 'capitalize',
                    background: view === v ? colors.primary.base : 'transparent',
                    color: view === v ? '#fff' : colors.text[500],
                    transition: transition(['background', 'color']),
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', gap: 6 }}>
            {([[IconArrowLeft, onPrev], [IconArrowRight, onNext]] as const).map(([Icon, fn], i) => (
              <button
                key={i}
                onClick={fn}
                className="uiv2-cal-nav"
                style={{ width: 32, height: 32, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: shadows.sm, transition: transition(['background', 'border-color']) }}
              >
                <Icon width={14} height={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'semana' && week ? (
        <Card padding={5}>
          <WeekSchedule {...week} onPrev={onPrev} onNext={onNext} />
        </Card>
      ) : (
        <>
          <Card padding={5}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 10 }}>
              {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map(d => (
                <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: colors.text[500] }}>{d}</div>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {weeks.map((w, wi) => (
                <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 8 }}>
                  {w.map((d, di) => {
                    const isToday = d.status === 'today'
                    return (
                      <div
                        key={di}
                        className={d.day ? 'uiv2-cal-day' : undefined}
                        style={{
                          position: 'relative',
                          aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                          borderRadius: radius.md,
                          minHeight: 74,
                          fontSize: 13, fontWeight: isToday ? 800 : 600,
                          border: `1px solid ${isToday ? colors.primary.base : colors.border.subtle}`,
                          background: isToday ? colors.gradients.brand : colors.bg[700],
                          boxShadow: isToday ? `0 10px 28px ${colors.primary.glow}` : '0 2px 10px rgba(0,0,0,.08)',
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
        </>
      )}

      <style>{`
        .uiv2-calendar-page { width:100%; margin:0 auto; }
        .uiv2-cal-nav:hover { background:${colors.bg[500]} !important; border-color:${colors.primary.base} !important; transform:translateY(-1px); }
        .uiv2-cal-day:hover { border-color:${colors.primary.base} !important; transform:translateY(-2px); box-shadow:0 10px 24px rgba(0,0,0,.16) !important; }
        @media(max-width:640px){ .uiv2-cal-day{min-height:48px !important;aspect-ratio:auto !important}.uiv2-calendar-page{padding-bottom:80px} }
      `}</style>
    </div>
  )
}
