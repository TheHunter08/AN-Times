// Página "Turnos" — versión ui-v2. Misma lógica que TabTurnos.jsx (legacy),
// relocalizada y restilizada con los tokens v7 (antes usaba variables CSS de
// la paleta antigua: --text1, --bg-800, --primary...).
import { useState } from 'react'
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DAY_NAMES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']


function getMonday(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function toYMD(date: Date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function formatDateLabel(date: Date) {
  return `${date.getDate()} ${date.toLocaleString('es', { month: 'short' })}`
}

function tipoBadgeStyle(tipo: string) {
  if (tipo === 'guardia') return { background: 'var(--warning-soft)', color: colors.semantic.orange }
  if (tipo === 'libre') return { background: 'var(--success-soft)', color: colors.semantic.green }
  return { background: 'color-mix(in srgb, var(--brand-500) 15%, transparent)', color: colors.primary.light }
}

export interface EmployeeTurnosProps { db: any; u: any }

export function EmployeeTurnos({ db, u }: EmployeeTurnosProps) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  const turnos = (db.turnos || []).filter((t: any) => t.empId === u.id)

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })

  const todayYMD = toYMD(new Date())

  function getTurno(date: Date) {
    const ymd = toYMD(date)
    return turnos.find((t: any) => t.fecha === ymd) || null
  }

  function prevWeek() {
    setWeekStart((w: Date) => { const d = new Date(w); d.setDate(d.getDate() - 7); return d })
  }
  function nextWeek() {
    setWeekStart((w: Date) => { const d = new Date(w); d.setDate(d.getDate() + 7); return d })
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const upcoming = turnos
    .filter((t: any) => t.fecha >= toYMD(today) && t.tipo !== 'libre')
    .sort((a: any, b: any) => (a.fecha || '').localeCompare(b.fecha || ''))
    .slice(0, 3)

  const weekLabel = `${formatDateLabel(weekStart)} – ${formatDateLabel(days[6])}`

  return (
    <div className="employee-shifts-v2" style={{ padding: 'var(--space-4)', maxWidth: 520, margin: '0 auto', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>
      <header style={{ padding: '2px 2px var(--space-4)' }}>
        <h1 style={{ margin: 0, fontSize: 'var(--font-heading-xl)', fontWeight: 'var(--font-semibold)', color: colors.text[900], letterSpacing: '-.035em' }}>Turnos</h1>
        <p style={{ margin: '5px 0 0', fontSize: 'var(--font-body-sm)', color: colors.text[500] }}>Tu horario asignado semana a semana.</p>
      </header>

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 10px', fontSize: '.8rem', textTransform: 'uppercase', letterSpacing: '.08em', color: colors.text[500], fontWeight: 700 }}>
            Próximos turnos
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {upcoming.map((t: any) => {
              const d = new Date(t.fecha + 'T00:00:00')
              return (
                <div key={t.id} style={{
                  background: colors.bg[600], borderRadius: 12, padding: '12px 14px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  border: t.fecha === todayYMD ? `1px solid ${colors.primary.base}` : `1px solid ${colors.border.subtle}`,
                }}>
                  <div>
                    <span style={{ color: colors.text[900], fontWeight: 600, fontSize: '.95rem' }}>
                      {DAY_NAMES_FULL[d.getDay()]}
                    </span>
                    <span style={{ color: colors.text[500], fontSize: '.85rem', marginLeft: 8 }}>
                      {formatDateLabel(d)}
                    </span>
                    {t.fecha === todayYMD && (
                      <span style={{ marginLeft: 8, fontSize: '.7rem', background: colors.primary.base, color: '#fff', borderRadius: 6, padding: '1px 6px', fontWeight: 700 }}>
                        HOY
                      </span>
                    )}
                  </div>
                  <span style={{ color: colors.text[900], fontSize: '.9rem', fontWeight: 600 }}>
                    {t.horaInicio} → {t.horaFin}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button onClick={prevWeek} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.sm, color: colors.text[900], width: 36, height: 36, fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>‹</button>
        <span style={{ color: colors.text[500], fontSize: '.85rem', fontWeight: 600 }}>{weekLabel}</span>
        <button onClick={nextWeek} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.sm, color: colors.text[900], width: 36, height: 36, fontSize: '1.1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>›</button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {days.map((day) => {
          const ymd = toYMD(day)
          const turno = getTurno(day)
          const isToday = ymd === todayYMD
          const isWeekend = day.getDay() === 0 || day.getDay() === 6

          return (
            <div key={ymd} style={{
              background: isToday ? 'color-mix(in srgb, var(--brand-500) 12%, transparent)' : colors.bg[600],
              border: isToday ? `1.5px solid ${colors.primary.base}` : `1.5px solid ${colors.border.subtle}`,
              borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              opacity: isWeekend && !turno ? 0.55 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isToday ? colors.primary.base : colors.bg[700], display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: '.6rem', color: isToday ? '#fff' : colors.text[500], lineHeight: 1 }}>{DAY_NAMES[day.getDay()]}</span>
                  <span style={{ fontSize: '.85rem', color: isToday ? '#fff' : colors.text[900], fontWeight: 700, lineHeight: 1 }}>{day.getDate()}</span>
                </div>
                <div>
                  {turno ? (
                    <>
                      <div style={{ color: colors.text[900], fontWeight: 600, fontSize: '.9rem' }}>{turno.horaInicio} → {turno.horaFin}</div>
                      {turno.notas && <div style={{ color: colors.text[300], fontSize: '.75rem', marginTop: 2 }}>{turno.notas}</div>}
                    </>
                  ) : (
                    <span style={{ color: colors.text[300], fontSize: '.85rem' }}>Sin turno</span>
                  )}
                </div>
              </div>

              {turno ? (
                <span style={{ ...tipoBadgeStyle(turno.tipo), borderRadius: radius.sm, padding: '3px 10px', fontSize: '.75rem', fontWeight: 700, textTransform: 'capitalize' }}>
                  {turno.tipo}
                </span>
              ) : (
                <span style={{ background: 'var(--success-soft)', color: colors.semantic.green, borderRadius: radius.sm, padding: '3px 10px', fontSize: '.75rem', fontWeight: 700 }}>
                  Libre
                </span>
              )}
            </div>
          )
        })}
      </div>

      {turnos.length === 0 && (
        <div style={{ textAlign: 'center', color: colors.text[300], marginTop: 24, fontSize: '.9rem' }}>
          No tienes turnos asignados esta semana
        </div>
      )}
    </div>
  )
}
