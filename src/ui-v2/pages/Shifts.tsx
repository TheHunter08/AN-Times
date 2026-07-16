import { Avatar } from '../components/Avatar.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconArrowLeft, IconArrowRight, IconClock } from '../components/Icons.js'

export interface ShiftCell {
  type?: 'normal' | 'guardia' | 'libre' | 'vacaciones'
  start?: string
  end?: string
}

export interface ShiftEmployee {
  id: string
  name: string
  dept: string
  week: ShiftCell[] // 7 entries: Mon-Sun
}

export interface ShiftsProps {
  weekLabel: string
  employees: ShiftEmployee[]
  onPrev?: () => void
  onNext?: () => void
  onToday?: () => void
  onOpenEmployee?: (employeeId: string) => void
}

const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

const shiftStyle: Record<string, { bg: string; color: string; label: string }> = {
  normal:     { bg: colors.primary.dim,     color: colors.primary.light, label: 'Normal' },
  guardia:    { bg: 'rgba(245,158,11,.18)',   color: colors.semantic.orange, label: 'Guardia' },
  libre:      { bg: 'rgba(16,185,129,.16)',   color: colors.semantic.green, label: 'Libre' },
  vacaciones: { bg: colors.accent.dim,          color: colors.accent.base, label: 'Vacaciones' },
}

export function Shifts({ weekLabel, employees, onPrev, onNext, onToday, onOpenEmployee }: ShiftsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>Turnos</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={onPrev} aria-label="Semana anterior" style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowLeft width={15} height={15} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], minWidth: 150, textAlign: 'center' }}>{weekLabel}</span>
          <button type="button" onClick={onNext} aria-label="Semana siguiente" style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowRight width={15} height={15} />
          </button>
          <button onClick={onToday} style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: colors.bg[500], color: colors.text[700], fontSize: 12, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit' }}>
            Hoy
          </button>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {Object.entries(shiftStyle).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500] }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: v.bg, border: `1.5px solid ${v.color}` }} />
            {v.label}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="uiv2-shifts-desktop" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: 680 }}>
          <thead>
            <tr>
              <th style={{ width: 180, padding: '8px 12px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], borderBottom: `1px solid ${colors.border.subtle}` }}>Empleado</th>
              {DAY_NAMES.map((d, i) => (
                <th key={d} style={{ padding: '8px 6px', textAlign: 'center', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: i >= 5 ? colors.text[300] : colors.text[500], borderBottom: `1px solid ${colors.border.subtle}` }}>{d}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map(emp => (
              <tr key={emp.id}>
                <td style={{ padding: '8px 12px', borderBottom: `1px solid ${colors.border.subtle}` }}>
                  <button type="button" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`Abrir fichajes de ${emp.name}`} style={{ width:'100%', display: 'flex', alignItems: 'center', gap: 8, padding:0, border:0, background:'transparent', textAlign:'left', cursor:onOpenEmployee?'pointer':'default', fontFamily:'inherit' }}>
                    <Avatar name={emp.name} size={28} />
                    <div>
                      <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text[900] }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: colors.text[500] }}>{emp.dept}</div>
                    </div>
                  </button>
                </td>
                {emp.week.map((cell, di) => {
                  const s = cell.type ? shiftStyle[cell.type] : null
                  return (
                    <td key={di} style={{ padding: '6px 4px', textAlign: 'center', borderBottom: `1px solid ${colors.border.subtle}` }}>
                      {s ? (
                        <button type="button" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`${DAY_NAMES[di]}: ${cell.start ? `${cell.start}${cell.end ? ` a ${cell.end}` : ''}` : s.label}. Abrir fichajes de ${emp.name}`} style={{ width:'100%', padding: '6px 4px', borderRadius: radius.sm, background: s.bg, border: `1px solid color-mix(in srgb, ${s.color} 27%, transparent)`, cursor: onOpenEmployee ? 'pointer' : 'default', fontFamily:'inherit' }}>
                          {cell.start && (
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, fontSize: 10.5, color: s.color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                              <IconClock width={10} height={10} />
                              {cell.start}
                            </div>
                          )}
                          {!cell.start && (
                            <div style={{ fontSize: 10.5, color: s.color, fontWeight: 700 }}>{s.label}</div>
                          )}
                        </button>
                      ) : (
                        <div style={{ height: 30, borderRadius: radius.xs, border: `1px dashed ${colors.border.subtle}`, opacity: .4 }} />
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="uiv2-shifts-mobile" role="list" aria-label="Turnos por empleado">
        {employees.map(emp => (
          <article key={emp.id} className="uiv2-shift-card" role="listitem">
            <button type="button" className="uiv2-shift-card-head" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`Abrir fichajes de ${emp.name}`}>
              <Avatar name={emp.name} size={34} />
              <div style={{ minWidth: 0 }}>
                <div className="uiv2-shift-card-name">{emp.name}</div>
                <div className="uiv2-shift-card-meta">{emp.dept}</div>
              </div>
            </button>
            <div className="uiv2-shift-days">
              {emp.week.map((cell, di) => {
                const s = cell.type ? shiftStyle[cell.type] : null
                return (
                  <div key={di} className="uiv2-shift-day">
                    <span>{DAY_NAMES[di]}</span>
                    <button type="button" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`${DAY_NAMES[di]}: ${s ? (cell.start ? `${cell.start}${cell.end ? ` a ${cell.end}` : ''}` : s.label) : 'Sin turno'}. Abrir fichajes de ${emp.name}`} style={s ? { background: s.bg, color: s.color, borderColor: `color-mix(in srgb, ${s.color} 27%, transparent)` } : undefined}>
                      {s ? (cell.start ? `${cell.start}${cell.end ? `–${cell.end}` : ''}` : s.label) : 'Sin turno'}
                    </button>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
      <style>{`
        .uiv2-shifts-mobile{display:none}
        @media(max-width:700px){
          .uiv2-shifts-desktop{display:none}
          .uiv2-shifts-mobile{display:grid;gap:12px}
          .uiv2-shift-card{padding:16px;background:${colors.bg[700]};border:1px solid ${colors.border.subtle};border-radius:${radius.lg}}
          .uiv2-shift-card-head{width:100%;display:flex;align-items:center;gap:10px;padding:0 0 14px;margin-bottom:12px;border:0;border-bottom:1px solid ${colors.border.subtle};background:transparent;text-align:left;cursor:pointer;font-family:inherit}
          .uiv2-shift-card-name{font-size:14px;font-weight:700;color:${colors.text[900]};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .uiv2-shift-card-meta{font-size:11px;color:${colors.text[500]};margin-top:2px}
          .uiv2-shift-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
          .uiv2-shift-day>span{display:block;margin-bottom:4px;font-size:10px;font-weight:700;text-transform:uppercase;color:${colors.text[500]}}
          .uiv2-shift-day>button{display:flex;width:100%;min-height:38px;padding:7px 8px;align-items:center;justify-content:center;border:1px dashed ${colors.border.subtle};border-radius:${radius.sm};background:transparent;font-size:11px;color:${colors.text[400]};font-weight:700;font-variant-numeric:tabular-nums;text-align:center;cursor:pointer;font-family:inherit}
        }
      `}</style>
    </div>
  )
}
