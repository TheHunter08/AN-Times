import { useAppStore } from '../../store/appStore.js'
import { today, fds } from '../../utils/time.js'
import { PullToRefresh } from './PullToRefresh.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function TabVacaciones({ db, u, vac, toast, saveDB }) {
  const { openModal, showConfirm } = useAppStore()
  const myVacs = (db.vacaciones || []).filter(v => v.empId === u.id).sort((a,b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0))

  const cancelVac = (id) => {
    showConfirm('¿Cancelar esta solicitud de vacaciones?', () => {
      saveDB({ vacaciones: (db.vacaciones || []).filter(v => v.id !== id || v.estado !== 'pendiente') })
      toast('Solicitud cancelada', 3000, 'warn')
    })
  }

  const downloadVacICS = (v) => {
    const dtFin = new Date(v.fechaFin + 'T00:00:00')
    dtFin.setDate(dtFin.getDate() + 1)
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TIMES INC//ES', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:vac-${v.id}@times-inc`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${v.fechaInicio.replace(/-/g,'')}`,
      `DTEND;VALUE=DATE:${dtFin.toISOString().slice(0,10).replace(/-/g,'')}`,
      `SUMMARY:Vacaciones ${u.name.split(' ')[0]}`,
      `DESCRIPTION:${v.dias} días de vacaciones aprobadas`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Vacaciones mañana', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vacaciones-${v.fechaInicio}.ics`; a.click()
    URL.revokeObjectURL(url)
    toast('Archivo .ics descargado — ábrelo para añadir al calendario', 3000, 'ok')
  }

  const pct = vac.generated > 0 ? Math.round((vac.used / vac.generated) * 100) : 0
  const todayVacStr = today()
  const daysFrom = (ds) => Math.ceil((new Date(ds + 'T00:00:00') - new Date(todayVacStr + 'T00:00:00')) / 86400000)

  return (
    <PullToRefresh>
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', paddingBottom: 100 }}>

        {/* ── Hero ───────────────────────────────────────────── */}
        <div style={{
          background: colors.bg[600],
          border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius['2xl'],
          padding: '28px 24px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -50, right: -50, width: 200, height: 200,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${colors.primary.base}20 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: radius.pill,
            background: `${colors.primary.base}18`, border: `1px solid ${colors.primary.base}35`,
            fontSize: 10, fontWeight: 700, color: colors.primary.light,
            textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 16,
          }}>
            Mis Vacaciones
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
            <span style={{
              fontSize: 56, fontWeight: 800, color: colors.text[900],
              letterSpacing: '-3px', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
            }}>{vac.available}</span>
            <span style={{ fontSize: 16, fontWeight: 600, color: colors.text[500] }}>días disponibles</span>
          </div>
          <div style={{ fontSize: 12, color: colors.text[500] }}>
            {vac.generated} generados · {vac.used} disfrutados · {vac.pending} pendientes
          </div>
        </div>

        {/* ── Stats row ─────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { val: vac.available, lbl: 'Disponibles', color: colors.primary.light },
            { val: vac.used,      lbl: 'Disfrutadas', color: colors.semantic.green },
            { val: vac.pending,   lbl: 'Pendientes',  color: colors.semantic.orange },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.xl, padding: '14px 10px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 24, fontWeight: 800, color, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{val}</div>
              <div style={{ fontSize: 10, color: colors.text[500], marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{lbl}</div>
            </div>
          ))}
        </div>

        {/* ── Progress card ─────────────────────────────────── */}
        <div style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.xl, padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <span style={{ fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Progreso anual
            </span>
            <span style={{
              fontSize: 12, fontWeight: 700, color: colors.primary.light,
              background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`,
              padding: '2px 10px', borderRadius: radius.pill,
            }}>
              {vac.used} / {vac.generated} días
            </span>
          </div>
          <div style={{ height: 7, background: colors.bg[400], borderRadius: radius.pill, overflow: 'hidden', marginBottom: 8 }}>
            <div style={{
              height: '100%', borderRadius: radius.pill,
              background: `linear-gradient(90deg, #6D28D9, ${colors.primary.base})`,
              width: `${pct}%`, transition: 'width .6s ease',
              boxShadow: `0 0 8px ${colors.primary.base}60`,
            }} />
          </div>
          <div style={{ fontSize: 11, color: colors.text[300] }}>
            Generadas según antigüedad · {vac.months} meses trabajados
          </div>
        </div>

        {/* ── Pending warning ───────────────────────────────── */}
        {vac.pending > 0 && (
          <div style={{
            padding: '12px 16px',
            background: `${colors.semantic.orange}10`, border: `1px solid ${colors.semantic.orange}30`,
            borderRadius: radius.lg, display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={colors.semantic.orange} strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.semantic.orange }}>
                {vac.pending} día{vac.pending !== 1 ? 's' : ''} pendiente{vac.pending !== 1 ? 's' : ''} de aprobación
              </div>
              <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>
                No contabilizados hasta que el admin apruebe
              </div>
            </div>
          </div>
        )}

        {/* ── CTA Button ────────────────────────────────────── */}
        <button
          onClick={() => openModal('vacForm')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '14px 20px', borderRadius: radius.xl,
            border: 'none', background: `linear-gradient(135deg, ${colors.primary.base} 0%, #6D28D9 100%)`,
            color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', boxShadow: `0 4px 20px ${colors.primary.glow}`,
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '.88' }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2.5" fill="none">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>
          </svg>
          Solicitar vacaciones
        </button>

        {/* ── Requests list ─────────────────────────────────── */}
        {myVacs.length > 0 ? (
          <div style={{
            background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            <div style={{
              padding: '14px 18px 10px',
              fontSize: 12, fontWeight: 660, color: colors.text[700],
              textTransform: 'uppercase', letterSpacing: '.5px',
            }}>
              Mis solicitudes
            </div>
            {myVacs.map((v, vi) => {
              const statusColor = v.estado === 'aprobada' ? colors.semantic.green
                                : v.estado === 'rechazada' ? colors.semantic.red
                                : colors.semantic.orange
              const statusLabel = v.estado === 'aprobada' ? '✓ Aprobada'
                                : v.estado === 'rechazada' ? '✗ Rechazada'
                                : '⏳ Pendiente'
              const until     = daysFrom(v.fechaInicio)
              const remaining = daysFrom(v.fechaFin)
              return (
                <div key={v.id} style={{
                  padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12,
                  borderTop: vi > 0 ? `1px solid ${colors.border.subtle}` : 'none',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], marginBottom: 3 }}>
                      {fds(v.fechaInicio)} → {fds(v.fechaFin)}
                    </div>
                    <div style={{ fontSize: 11, color: colors.text[500] }}>
                      {v.dias} días · {v.motivo || 'Vacaciones'}
                    </div>
                    {v.estado === 'rechazada' && v.motivoRechazo && (
                      <div style={{ fontSize: 11, color: colors.semantic.red, marginTop: 4, fontStyle: 'italic' }}>
                        Motivo: {v.motivoRechazo}
                      </div>
                    )}
                    {v.estado === 'aprobada' && until > 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: colors.primary.light, marginTop: 4 }}>
                        🗓 En {until} día{until > 1 ? 's' : ''}
                      </div>
                    )}
                    {v.estado === 'aprobada' && until <= 0 && remaining >= 0 && (
                      <div style={{ fontSize: 10, fontWeight: 700, color: colors.semantic.green, marginTop: 4 }}>
                        🌴 ¡Disfrutando! {remaining} día{remaining !== 1 ? 's' : ''} restante{remaining !== 1 ? 's' : ''}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 700, padding: '3px 10px',
                      borderRadius: radius.pill,
                      background: `${statusColor}15`, border: `1px solid ${statusColor}35`,
                      color: statusColor,
                    }}>{statusLabel}</span>
                    {v.estado === 'aprobada' && (
                      <button onClick={() => downloadVacICS(v)} title="Añadir al calendario" style={{
                        padding: '4px 8px', borderRadius: radius.sm,
                        background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`,
                        color: colors.primary.light, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit',
                      }}>📅</button>
                    )}
                    {v.estado === 'pendiente' && (
                      <button onClick={() => cancelVac(v.id)} title="Cancelar solicitud" style={{
                        padding: '4px 8px', borderRadius: radius.sm,
                        background: 'transparent', border: `1px solid ${colors.border.default}`,
                        color: colors.text[500], cursor: 'pointer', fontSize: 14,
                        fontFamily: 'inherit', lineHeight: 1, transition: 'color .15s',
                      }}
                        onMouseEnter={e => { e.currentTarget.style.color = colors.semantic.red }}
                        onMouseLeave={e => { e.currentTarget.style.color = colors.text[500] }}
                      >✕</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{
            background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.xl, padding: '40px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: '50%', background: colors.bg[400],
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={colors.text[500]} strokeWidth="1.5">
                <path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/>
                <path d="M12 3c0 0-4 4-4 8s4 8 4 8"/>
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: colors.text[900], marginBottom: 6 }}>Sin solicitudes</div>
            <div style={{ fontSize: 12, color: colors.text[500] }}>Pulsa el botón de arriba para solicitar tus vacaciones</div>
          </div>
        )}
      </div>
    </PullToRefresh>
  )
}
