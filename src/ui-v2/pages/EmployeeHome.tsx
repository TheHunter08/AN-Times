import { Card } from '../components/Card.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export type ClockState = 'idle' | 'working' | 'break'

export interface EmployeeHomeProps {
  time: string // "HH:MM"
  seconds: string // ":SS"
  dateLabel: string
  state: ClockState
  onMainAction: () => void
  onBreakAction?: () => void
  workedLabel: string
  remainingLabel: string
  progressPct: number // 0-100
  siteLabel?: string
}

const stateCopy: Record<ClockState, { label: string; sub: string }> = {
  idle: { label: 'INICIAR', sub: 'Pulsa el círculo para comenzar tu jornada' },
  working: { label: 'PARAR', sub: 'Jornada en curso' },
  break: { label: 'REANUDAR', sub: 'En pausa' },
}

const stateGradient: Record<ClockState, string> = {
  idle: `linear-gradient(148deg, #2540c9 0%, ${colors.primary.base} 50%, ${colors.accent.base} 100%)`,
  working: `linear-gradient(148deg, #065f46 0%, #059669 50%, ${colors.semantic.green} 100%)`,
  break: `linear-gradient(148deg, #78350f 0%, #b45309 50%, ${colors.semantic.orange} 100%)`,
}

// Pantalla de fichaje del empleado — el momento más usado de toda la app,
// a diario, por cada persona. Merece su propio lenguaje visual "hero", no
// una reutilización del layout de tarjetas del panel de admin.
export function EmployeeHome({
  time, seconds, dateLabel, state, onMainAction, onBreakAction,
  workedLabel, remainingLabel, progressPct, siteLabel,
}: EmployeeHomeProps) {
  const copy = stateCopy[state]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520, margin: '0 auto' }}>
      <Card padding={8} style={{ position: 'relative', overflow: 'hidden', textAlign: 'center' }}>
        <div style={{ position: 'absolute', top: -70, left: '50%', transform: 'translateX(-50%)', width: 320, height: 320, borderRadius: '50%', background: `radial-gradient(circle, ${colors.primary.glow} 0%, transparent 70%)`, pointerEvents: 'none' }} />

        <div style={{ position: 'relative', marginBottom: 28 }}>
          <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: '-3px', color: colors.text[900], fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {time}<span style={{ color: colors.text[500], fontSize: 30 }}>{seconds}</span>
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: colors.text[500], marginTop: 8 }}>{dateLabel}</div>
          {siteLabel && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, padding: '5px 12px', borderRadius: radius.pill, background: colors.bg[500], border: `1px solid ${colors.border.subtle}`, fontSize: 11.5, color: colors.text[700] }}>
              📍 {siteLabel}
            </div>
          )}
        </div>

        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
          <button
            onClick={onMainAction}
            className="uiv2-clock-btn"
            style={{
              width: 200, height: 200, borderRadius: '50%',
              border: 'none', cursor: 'pointer',
              background: stateGradient[state],
              boxShadow: `0 0 0 1px rgba(255,255,255,.1) inset, 0 2px 0 rgba(255,255,255,.18) inset, 0 12px 48px ${colors.primary.glow}, 0 4px 16px rgba(0,0,0,.5)`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
              transition: transition(['transform']),
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#fff"><path d={state === 'working' ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M8 5v14l11-7z'} /></svg>
            <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '2px', color: '#fff' }}>{copy.label}</span>
          </button>
        </div>
        <div style={{ position: 'relative', fontSize: 12.5, color: colors.text[500] }}>{copy.sub}</div>

        {state !== 'idle' && onBreakAction && (
          <button
            onClick={onBreakAction}
            style={{
              position: 'relative', marginTop: 16, padding: '9px 20px', borderRadius: radius.pill,
              border: `1px solid ${colors.border.default}`, background: colors.bg[500], color: colors.text[900],
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            {state === 'break' ? '▶ Reanudar jornada' : '⏸ Pausar'}
          </button>
        )}
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.text[900] }}>{workedLabel}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500] }}>Trabajado</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.text[900] }}>{remainingLabel}</div>
            <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500] }}>Restante</div>
          </div>
        </div>
        <div style={{ height: 8, borderRadius: radius.pill, background: colors.bg[500], overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${Math.min(100, progressPct)}%`, borderRadius: radius.pill, background: `linear-gradient(90deg, ${colors.primary.base}, ${colors.accent.base})`, transition: transition(['width']) }} />
        </div>
      </Card>

      <style>{`.uiv2-clock-btn:active { transform: scale(.94); }`}</style>
    </div>
  )
}
