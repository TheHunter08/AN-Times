import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconArrowLeft, IconArrowRight } from './Icons.js'

export interface ScheduleEvent {
  id: string
  day: number // 0-6, índice de columna
  startHour: number // p.ej. 9.5 = 09:30
  endHour: number
  label: string
  time: string
  tone: 'primary' | 'red' | 'gray'
}

export interface WeekScheduleProps {
  monthLabel: string
  days: { label: string; date: number; isToday?: boolean }[]
  events: ScheduleEvent[]
  startHour?: number
  endHour?: number
  onPrev?: () => void
  onNext?: () => void
}

const toneBg: Record<ScheduleEvent['tone'], string> = {
  primary: colors.primary.dim,
  red: 'rgba(239,68,68,.16)',
  gray: colors.bg[400],
}
const toneBorder: Record<ScheduleEvent['tone'], string> = {
  primary: colors.primary.base,
  red: colors.semantic.red,
  gray: colors.text[300],
}

// Calendario semanal con bloques de horario — réplica directa de la
// referencia real: columnas por día, franja horaria fija, eventos
// posicionados por hora de inicio/fin como bloques de color.
export function WeekSchedule({ monthLabel, days, events, startHour = 8, endHour = 18, onPrev, onNext }: WeekScheduleProps) {
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i)
  const rowH = 46

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{monthLabel}</span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={onPrev} style={{ width: 24, height: 24, borderRadius: radius.xs, border: 'none', background: colors.bg[500], color: colors.text[700], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconArrowLeft width={12} height={12} /></button>
          <button onClick={onNext} style={{ width: 24, height: 24, borderRadius: radius.xs, border: 'none', background: colors.bg[500], color: colors.text[700], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><IconArrowRight width={12} height={12} /></button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: `36px repeat(${days.length}, 1fr)`, marginBottom: 4 }}>
        <div />
        {days.map(d => (
          <div key={d.date} style={{ textAlign: 'center', padding: '4px 0' }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: colors.text[500], textTransform: 'uppercase' }}>{d.label}</div>
            <div
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: '50%',
                fontSize: 11.5, fontWeight: d.isToday ? 700 : 500,
                background: d.isToday ? colors.primary.base : 'transparent',
                color: d.isToday ? '#fff' : colors.text[900],
                marginTop: 2,
              }}
            >
              {d.date}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: `36px repeat(${days.length}, 1fr)` }}>
        <div>
          {hours.map(h => (
            <div key={h} style={{ height: rowH, fontSize: 9.5, fontWeight: 500, color: colors.text[500], transform: 'translateY(-6px)' }}>{String(h).padStart(2, '0')}:00</div>
          ))}
        </div>
        {days.map((_, di) => (
          <div key={di} style={{ position: 'relative', borderLeft: `1px solid ${colors.border.subtle}` }}>
            {hours.map(h => (
              <div key={h} style={{ height: rowH, borderTop: `1px solid ${colors.border.subtle}` }} />
            ))}
            {events.filter(e => e.day === di).map(e => {
              const top = (e.startHour - startHour) * rowH
              const height = Math.max(20, (e.endHour - e.startHour) * rowH - 2)
              return (
                <div
                  key={e.id}
                  style={{
                    position: 'absolute', top, left: 2, right: 2, height,
                    background: toneBg[e.tone], borderLeft: `2px solid ${toneBorder[e.tone]}`, borderRadius: radius.xs,
                    padding: '3px 6px', overflow: 'hidden',
                  }}
                >
                  <div style={{ fontSize: 10, fontWeight: 640, color: colors.text[900], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.label}</div>
                  <div style={{ fontSize: 9, color: colors.text[500] }}>{e.time}</div>
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
