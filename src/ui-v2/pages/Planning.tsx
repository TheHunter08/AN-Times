import { Avatar } from '../components/Avatar.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconArrowLeft, IconArrowRight, IconLock } from '../components/Icons.js'

export interface PlanCell {
  status: 'ok' | 'live' | 'turno' | 'absent' | 'vac' | 'weekend' | 'future'
  value?: string
  // Solo aplica a 'absent': el día cae en una semana ya cerrada como
  // revisada desde Planning — se bloquea añadir un fichaje manual ahí.
  locked?: boolean
}

export interface PlanEmployee {
  id: string
  name: string
  dept: string
  week: PlanCell[] // 7 (modo semana) o todos los días del mes (modo mes)
}

export type PlanningViewMode = 'week' | 'month'

export interface PlanningProps {
  weekLabel: string
  days: string[] // ['Lun 7', 'Mar 8', ...]
  employees: PlanEmployee[]
  viewMode?: PlanningViewMode
  onChangeViewMode?: (mode: PlanningViewMode) => void
  onPrev?: () => void
  onNext?: () => void
  onToday?: () => void
  onOpenEmployee?: (employeeId: string) => void
  onAddRecord?: (employeeId: string, dayIndex: number) => void
  // Semana actualmente en vista (solo en modo semana): si ya está cerrada
  // como revisada, y el callback para cerrarla/reabrirla.
  weekClosed?: boolean
  onToggleWeekClosed?: () => void
  // Por día visible (mismo índice que `days`): si ese día cae en una semana
  // ya cerrada — se usa para mostrar el candado también en modo mes, donde
  // puede haber semanas cerradas y abiertas a la vez dentro del mismo rango.
  dayLocked?: boolean[]
}

type PlanStatus = PlanCell['status']

const cellDef: Record<PlanStatus, { bg: string; color: string; border: string }> = {
  ok:      { bg: 'rgba(16,185,129,.14)',  color: colors.semantic.green, border: 'rgba(16,185,129,.35)' },
  live:    { bg: 'rgba(16,185,129,.26)',  color: '#34D399', border: '#34D399' },
  turno:   { bg: colors.primary.dim,      color: colors.primary.light, border: `color-mix(in srgb, ${colors.primary.base} 33%, transparent)` },
  absent:  { bg: 'rgba(239,68,68,.12)',   color: colors.semantic.red, border: 'rgba(239,68,68,.3)' },
  vac:     { bg: colors.accent.dim,       color: colors.accent.base, border: colors.border.default },
  weekend: { bg: 'rgba(var(--uiv2-overlay-rgb),.03)', color: colors.text[300], border: colors.border.subtle },
  future:  { bg: 'transparent',           color: colors.text[300], border: colors.border.subtle },
}

const PLAN_STATUSES = new Set<PlanStatus>(['ok', 'live', 'turno', 'absent', 'vac', 'weekend', 'future'])

/**
 * The planning payload can be hydrated from older local data where cells used
 * `type` (for example `libre`/`vacaciones`) instead of the current `status`.
 * Keep the screen render-safe while those records are being migrated or when
 * a partially populated week arrives from realtime.
 */
function resolveCell(cell: PlanCell | Partial<PlanCell> | null | undefined): PlanCell {
  const raw = cell as (Partial<PlanCell> & { type?: string }) | null | undefined
  const legacyStatus = raw?.status ?? raw?.type
  const status = legacyStatus === 'libre'
    ? 'weekend'
    : legacyStatus === 'vacaciones'
      ? 'vac'
      : legacyStatus === 'normal'
        ? 'turno'
        : PLAN_STATUSES.has(legacyStatus as PlanStatus)
          ? legacyStatus as PlanStatus
          : 'future'

  return { status, value: raw?.value, locked: raw?.locked }
}

const LEGEND = [
  { status: 'ok', label: 'Trabajó' },
  { status: 'live', label: 'En curso' },
  { status: 'turno', label: 'Turno' },
  { status: 'absent', label: 'Ausente' },
  { status: 'vac', label: 'Vacaciones' },
  { status: 'weekend', label: 'Fin de semana' },
  { status: 'future', label: 'Aún no llega' },
] as const

export function Planning({ weekLabel, days, employees, viewMode = 'week', onChangeViewMode, onPrev, onNext, onToday, onOpenEmployee, onAddRecord, weekClosed, onToggleWeekClosed, dayLocked }: PlanningProps) {
  const safeDays = Array.isArray(days) ? days : []
  const safeEmployees = Array.isArray(employees) ? employees : []
  const safeDayLocked = Array.isArray(dayLocked) ? dayLocked : []
  const anyLocked = safeDayLocked.some(Boolean)
  const navLabel = viewMode === 'month' ? 'mes' : 'semana'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>{viewMode === 'month' ? 'Planning mensual' : 'Planning semanal'}</PageTitle>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {onChangeViewMode && (
            <div style={{ display: 'flex', gap: 6, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.md, padding: 3 }}>
              {(['week', 'month'] as const).map(m => (
                <button key={m} type="button" onClick={() => onChangeViewMode(m)} style={{
                  padding: '7px 12px', borderRadius: radius.sm, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                  background: viewMode === m ? colors.primary.base : 'transparent',
                  color: viewMode === m ? '#fff' : colors.text[500],
                }}>{m === 'week' ? 'Semana' : 'Mes'}</button>
              ))}
            </div>
          )}
          <button type="button" onClick={onPrev} aria-label={`${navLabel} anterior`} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowLeft width={15} height={15} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], minWidth: 160, textAlign: 'center', textTransform: viewMode === 'month' ? 'capitalize' : 'none' }}>{weekLabel}</span>
          <button type="button" onClick={onNext} aria-label={`${navLabel} siguiente`} style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: 'transparent', color: colors.text[700], cursor: 'pointer' }}>
            <IconArrowRight width={15} height={15} />
          </button>
          <button onClick={onToday} style={{ padding: '7px 14px', borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`, background: colors.bg[500], color: colors.text[700], fontSize: 12, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit' }}>Hoy</button>
          {onToggleWeekClosed && (
            <button type="button" onClick={onToggleWeekClosed}
              title={weekClosed ? 'Reabrir esta semana para poder añadir fichajes' : 'Cerrar esta semana como revisada'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: radius.sm,
                border: `1px solid ${weekClosed ? colors.border.default : 'rgba(16,185,129,.4)'}`,
                background: weekClosed ? colors.bg[600] : 'rgba(16,185,129,.12)',
                color: weekClosed ? colors.text[700] : colors.semantic.green,
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              }}>
              <IconLock width={13} height={13} />
              {weekClosed ? 'Semana cerrada · Reabrir' : 'Cerrar semana revisada'}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        {LEGEND.map(l => (
          <div key={l.status} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500] }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: cellDef[l.status].bg, border: `1.5px solid ${cellDef[l.status].border}` }} />
            {l.label}
          </div>
        ))}
        {anyLocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500] }}>
            <IconLock width={11} height={11} />
            Semana cerrada (revisada)
          </div>
        )}
      </div>

      <div className="uiv2-week-desktop" style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 3px', minWidth: 560 }}>
          <thead>
            <tr>
              <th style={{ width: 110, padding: '6px 8px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500] }}>Empleado</th>
              {safeDays.map((d, i) => (
                <th key={i} style={{ padding: '6px 2px', textAlign: 'center', fontSize: 10, fontWeight: 700, color: i >= 5 ? colors.text[300] : colors.text[500] }}>
                  <div style={{ textTransform: 'uppercase', letterSpacing: '.4px' }}>{d.split(' ')[0]}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: i >= 5 ? colors.text[300] : colors.text[900], letterSpacing: '-.3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                    {d.split(' ')[1]}
                    {safeDayLocked[i] && <IconLock width={8} height={8} style={{ opacity: .6 }} />}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {safeEmployees.map(emp => (
              <tr key={emp.id}>
                <td style={{ padding: '4px 8px', verticalAlign: 'middle', width: 110 }}>
                  <button type="button" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`Abrir fichajes de ${emp.name}`} style={{ width:'100%', display: 'flex', alignItems: 'center', gap: 6, padding:0, border:0, background:'transparent', textAlign:'left', cursor:onOpenEmployee?'pointer':'default', fontFamily:'inherit' }}>
                    <Avatar name={emp.name} size={24} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 11.5, fontWeight: 600, color: colors.text[900], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                        {emp.name.split(' ')[0]}
                      </div>
                      <div style={{ fontSize: 9.5, color: colors.text[500], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 70 }}>
                        {emp.name.split(' ').slice(1).join(' ') || emp.dept}
                      </div>
                    </div>
                  </button>
                </td>
                {(Array.isArray(emp.week) ? emp.week : []).map((cell, di) => {
                  const safeCell = resolveCell(cell)
                  const def = cellDef[safeCell.status]
                  return (
                    <td key={di} style={{ padding: '4px 2px', textAlign: 'center', verticalAlign: 'middle' }}>
                      <button type="button"
                        onClick={() => safeCell.status === 'absent' && onAddRecord && !safeCell.locked ? onAddRecord(emp.id, di) : onOpenEmployee?.(emp.id)}
                        aria-label={`${safeDays[di] || `Día ${di + 1}`}: ${safeCell.value || safeCell.status}. ${safeCell.status === 'absent' && onAddRecord ? (safeCell.locked ? 'Semana cerrada, no se puede añadir' : 'Añadir jornada manual') : `Abrir fichajes de ${emp.name}`}`}
                        style={{
                          width:'100%', border: `1px solid ${def.border}`, cursor:(onOpenEmployee || (safeCell.status === 'absent' && onAddRecord && !safeCell.locked))?'pointer':'default', fontFamily:'inherit',
                          padding: '4px 2px', borderRadius: radius.sm, minHeight: 30,
                          background: def.bg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          position: 'relative',
                        }}>
                        {safeCell.status === 'live' && (
                          <span style={{ position: 'absolute', top: 2, right: 3, width: 5, height: 5, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 0 2px rgba(52,211,153,.25)', animation: 'pulse 2s infinite' }} />
                        )}
                        {safeCell.value ? (
                          <span style={{ fontSize: 9.5, fontWeight: 700, color: def.color, fontVariantNumeric: 'tabular-nums' }}>{safeCell.value}</span>
                        ) : safeCell.status === 'absent' && safeCell.locked ? (
                          <IconLock width={9} height={9} style={{ color: def.color }} />
                        ) : (
                          <span style={{ fontSize: 9, color: def.color, fontWeight: 700 }}>
                            {safeCell.status === 'absent' ? (onAddRecord ? '+' : '—') : safeCell.status === 'vac' ? 'VAC' : safeCell.status === 'weekend' ? '·' : ''}
                          </span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="uiv2-week-mobile" role="list" aria-label="Planning por empleado">
        {safeEmployees.map(emp => (
          <article key={emp.id} className="uiv2-week-card" role="listitem">
            <button type="button" className="uiv2-week-card-head" onClick={() => onOpenEmployee?.(emp.id)} aria-label={`Abrir fichajes de ${emp.name}`}>
              <Avatar name={emp.name} size={34} />
              <div style={{ minWidth: 0 }}>
                <div className="uiv2-week-card-name">{emp.name}</div>
                <div className="uiv2-week-card-meta">{emp.dept}</div>
              </div>
            </button>
            <div className="uiv2-week-days">
              {(Array.isArray(emp.week) ? emp.week : []).map((cell, di) => {
                const safeCell = resolveCell(cell)
                const def = cellDef[safeCell.status]
                return (
                  <div key={di} className="uiv2-week-day">
                    <span className="uiv2-week-day-label" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      {safeDays[di] || ''}
                      {safeDayLocked[di] && <IconLock width={8} height={8} />}
                    </span>
                    <button type="button"
                      onClick={() => safeCell.status === 'absent' && onAddRecord && !safeCell.locked ? onAddRecord(emp.id, di) : onOpenEmployee?.(emp.id)}
                      aria-label={`${safeDays[di] || `Día ${di + 1}`}: ${safeCell.value || safeCell.status}. ${safeCell.status === 'absent' && onAddRecord ? (safeCell.locked ? 'Semana cerrada, no se puede añadir' : 'Añadir jornada manual') : `Abrir fichajes de ${emp.name}`}`}
                      style={{ background: def.bg, border: `1px solid ${def.border}`, color: def.color }} className="uiv2-week-day-value">
                      {safeCell.value || (safeCell.status === 'absent' ? (safeCell.locked ? 'Cerrada' : (onAddRecord ? '+ Añadir' : 'Ausente')) : safeCell.status === 'vac' ? 'Vacaciones' : safeCell.status === 'weekend' ? 'Libre' : '—')}
                    </button>
                  </div>
                )
              })}
            </div>
          </article>
        ))}
      </div>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity:1 } 50% { opacity:.5 } }
        .uiv2-week-mobile{display:none}
        @media(max-width:700px){
          .uiv2-week-desktop{display:none}
          .uiv2-week-mobile{display:grid;gap:12px}
          .uiv2-week-card{padding:16px;background:${colors.bg[700]};border:1px solid ${colors.border.subtle};border-radius:${radius.lg}}
          .uiv2-week-card-head{width:100%;display:flex;align-items:center;gap:10px;padding:0 0 14px;margin-bottom:12px;border:0;border-bottom:1px solid ${colors.border.subtle};background:transparent;text-align:left;cursor:pointer;font-family:inherit}
          .uiv2-week-card-name{font-size:14px;font-weight:700;color:${colors.text[900]};white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          .uiv2-week-card-meta{font-size:11px;color:${colors.text[500]};margin-top:2px}
          .uiv2-week-days{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}
          .uiv2-week-day-label{display:block;margin:0 0 4px;font-size:10px;font-weight:700;text-transform:uppercase;color:${colors.text[500]}}
          .uiv2-week-day-value{display:flex;width:100%;min-height:38px;padding:7px 8px;align-items:center;justify-content:center;border-radius:${radius.sm};font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;text-align:center;cursor:pointer;font-family:inherit}
        }
      `}</style>
    </div>
  )
}
