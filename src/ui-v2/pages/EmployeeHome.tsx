import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import {
  IconArrowLeft,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconMapPin,
  IconPause,
  IconPlay,
  IconStop,
} from '../components/Icons.js'

export type ClockState = 'idle' | 'working' | 'break'

export interface WeekDay {
  label: string
  pct: number
  hours?: string
  isToday?: boolean
}

export interface RecentPunch {
  id: string
  label: string
  time: string
  tone?: 'green' | 'orange' | 'red' | 'gray'
  type?: 'entrada' | 'salida' | 'pausa' | 'reanuda'
}

export interface EmployeeHomeProps {
  time: string
  seconds: string
  dateLabel: string
  state: ClockState
  onStartAction: () => void
  onBreakAction?: () => void
  onStopAction?: () => void
  workedLabel: string
  remainingLabel: string
  progressPct: number
  siteLabel?: string
  streakDays?: number
  week?: WeekDay[]
  weeklyTotal?: string
  recent?: RecentPunch[]
  greeting?: string
  shiftStart?: string
  shiftEnd?: string
  overtimeLabel?: string
  syncLabel?: string
  syncTone?: 'ok' | 'pending' | 'error'
  extraAction?: ReactNode
}

type HoldPhase = 'ready' | 'holding' | 'confirmed'

// 300 ms mantiene la confirmación deliberada sin sentirse lenta en móvil.
// El valor anterior (550 ms) sumado al feedback posterior parecía un bloqueo.
const HOLD_DURATION = 300
const PROGRESS_RADIUS = 127
const HOLD_RADIUS = 114
const PROGRESS_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RADIUS
const HOLD_CIRCUMFERENCE = 2 * Math.PI * HOLD_RADIUS

const stateConfig: Record<ClockState, {
  status: string
  description: string
  action: string
  completed: string
}> = {
  idle: {
    status: 'Fuera de jornada',
    description: 'Todavía no has fichado hoy',
    action: 'Iniciar jornada',
    completed: 'Jornada iniciada',
  },
  working: {
    status: 'Jornada activa',
    description: 'Tu jornada se está registrando',
    action: 'Finalizar jornada',
    completed: 'Jornada finalizada',
  },
  break: {
    status: 'En descanso',
    description: 'El descanso está en curso',
    action: 'Finalizar jornada',
    completed: 'Jornada finalizada',
  },
}

function PunchIcon({ type, tone = 'gray' }: { type?: RecentPunch['type']; tone?: RecentPunch['tone'] }) {
  return (
    <span className="employee-home-v7__timeline-icon" data-tone={tone} aria-hidden="true">
      {type === 'entrada' && <IconArrowRight />}
      {type === 'salida' && <IconArrowLeft />}
      {type === 'pausa' && <IconPause />}
      {type === 'reanuda' && <IconPlay />}
      {!type && <span />}
    </span>
  )
}

function StateActionIcon({ state }: { state: ClockState }) {
  return state === 'idle' ? <IconPlay /> : <IconStop />
}

export function EmployeeHome({
  time,
  seconds,
  dateLabel,
  state,
  onStartAction,
  onBreakAction,
  onStopAction,
  workedLabel,
  remainingLabel,
  progressPct,
  siteLabel,
  streakDays,
  week,
  weeklyTotal,
  recent,
  greeting,
  shiftStart,
  shiftEnd,
  overtimeLabel,
  syncLabel,
  syncTone = 'ok',
  extraAction,
}: EmployeeHomeProps) {
  const cfg = stateConfig[state]
  const mainAction = state === 'idle' ? onStartAction : (onStopAction ?? onStartAction)
  const actionRef = useRef(mainAction)
  actionRef.current = mainAction

  const [holdPhase, setHoldPhase] = useState<HoldPhase>('ready')
  const [holdProgress, setHoldProgress] = useState(0)
  const holdActiveRef = useRef(false)
  const holdCompletedRef = useRef(false)
  const holdStartedAtRef = useRef(0)
  const frameRef = useRef<number | null>(null)
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintId = useId()

  const safeProgress = Number.isFinite(progressPct)
    ? Math.max(0, Math.min(100, progressPct))
    : 0
  const progressDash = safeProgress / 100 * PROGRESS_CIRCUMFERENCE
  const holdDash = holdProgress / 100 * HOLD_CIRCUMFERENCE

  const clearFrame = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
  }, [])
  const pointerStartRef = useRef({ id: -1, x: 0, y: 0 })

  const cancelHold = useCallback(() => {
    if (!holdActiveRef.current || holdCompletedRef.current) return
    holdActiveRef.current = false
    clearFrame()
    setHoldProgress(0)
    setHoldPhase('ready')
  }, [clearFrame])

  const completeHold = useCallback(() => {
    if (holdCompletedRef.current) return
    holdActiveRef.current = false
    holdCompletedRef.current = true
    clearFrame()
    setHoldProgress(100)
    setHoldPhase('confirmed')

    if ('vibrate' in navigator) {
      try { navigator.vibrate([18, 35, 24]) } catch { /* Vibración no disponible. */ }
    }

    actionRef.current()
    resetTimerRef.current = setTimeout(() => {
      holdCompletedRef.current = false
      setHoldProgress(0)
      setHoldPhase('ready')
    }, 450)
  }, [clearFrame])

  const beginHold = useCallback(() => {
    if (holdActiveRef.current || holdPhase !== 'ready') return
    if (resetTimerRef.current !== null) {
      clearTimeout(resetTimerRef.current)
      resetTimerRef.current = null
    }

    holdActiveRef.current = true
    holdCompletedRef.current = false
    setHoldProgress(0)
    setHoldPhase('holding')
    const startedAt = performance.now()
    holdStartedAtRef.current = startedAt

    const update = (now: number) => {
      if (!holdActiveRef.current) return
      const nextProgress = Math.min(100, ((now - startedAt) / HOLD_DURATION) * 100)
      setHoldProgress(nextProgress)
      if (nextProgress >= 100) {
        completeHold()
        return
      }
      frameRef.current = requestAnimationFrame(update)
    }

    frameRef.current = requestAnimationFrame(update)
  }, [completeHold, holdPhase])

  const finishHold = useCallback(() => {
    if (
      holdActiveRef.current
      && performance.now() - holdStartedAtRef.current >= HOLD_DURATION
    ) {
      completeHold()
      return
    }
    cancelHold()
  }, [cancelHold, completeHold])

  useEffect(() => () => {
    clearFrame()
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current)
  }, [clearFrame])

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    pointerStartRef.current = { id:event.pointerId, x:event.clientX, y:event.clientY }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    beginHold()
  }

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current
    if (start.id !== event.pointerId) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) cancelHold()
  }

  const handlePointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    // Comprueba también el tiempo real: en dispositivos lentos el último
    // requestAnimationFrame puede no ejecutarse antes de que el usuario suelte.
    finishHold()
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    pointerStartRef.current.id = -1
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) {
      event.preventDefault()
      beginHold()
    }
  }

  const handleKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      finishHold()
    }
  }

  const hasQuickActions = state !== 'idle' && (onBreakAction || onStopAction)

  return (
    <section className="employee-home-v7" data-state={state}>
      <header className="employee-home-v7__header">
        <div className="employee-home-v7__welcome">
          {greeting && <h1>{greeting}</h1>}
          <p>{dateLabel}</p>
        </div>
        <div className="employee-home-v7__header-status">
          {syncLabel && (
            <div className="employee-home-v7__sync" data-tone={syncTone} role="status">
              <span aria-hidden="true" />
              {syncLabel}
            </div>
          )}
          {!!streakDays && (
            <div className="employee-home-v7__streak" aria-label={`${streakDays} días seguidos fichando`}>
              <span aria-hidden="true" />
              <strong>{streakDays}</strong>
              <span>días seguidos</span>
            </div>
          )}
        </div>
      </header>

      <div className="employee-home-v7__layout">
        <article className="employee-home-v7__hero" aria-labelledby={`${hintId}-title`}>
          <div className="employee-home-v7__hero-heading">
            <div>
              <span className="employee-home-v7__eyebrow">Mi jornada</span>
              <div className="employee-home-v7__status" role="status">
                <span className="employee-home-v7__status-dot" aria-hidden="true" />
                <span id={`${hintId}-title`}>{cfg.status}</span>
              </div>
              <p>{cfg.description}</p>
            </div>
            {siteLabel && (
              <div className="employee-home-v7__site" title={siteLabel}>
                <IconMapPin aria-hidden="true" />
                <span>{siteLabel}</span>
              </div>
            )}
          </div>

          <div className="employee-home-v7__clock-wrap">
            <button
              type="button"
              className="employee-home-v7__clock-button"
              data-gesture-lock="true"
              data-phase={holdPhase}
              aria-label={`${cfg.action}. Mantén pulsado para confirmar.`}
              aria-describedby={hintId}
              aria-pressed={holdPhase === 'holding'}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerEnd}
              onPointerCancel={cancelHold}
              onLostPointerCapture={cancelHold}
              onPointerLeave={cancelHold}
              onKeyDown={handleKeyDown}
              onKeyUp={handleKeyUp}
              onBlur={cancelHold}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className="employee-home-v7__clock-glow" aria-hidden="true" />
              <svg className="employee-home-v7__clock-rings" viewBox="0 0 288 288" aria-hidden="true">
                <circle className="employee-home-v7__orbit employee-home-v7__orbit--outer" cx="144" cy="144" r="140" />
                <circle className="employee-home-v7__track" cx="144" cy="144" r={PROGRESS_RADIUS} />
                <circle
                  className="employee-home-v7__progress-ring"
                  cx="144"
                  cy="144"
                  r={PROGRESS_RADIUS}
                  strokeDasharray={`${progressDash} ${PROGRESS_CIRCUMFERENCE - progressDash}`}
                />
                <circle className="employee-home-v7__orbit employee-home-v7__orbit--inner" cx="144" cy="144" r="103" />
                <circle
                  className="employee-home-v7__hold-ring"
                  cx="144"
                  cy="144"
                  r={HOLD_RADIUS}
                  strokeDasharray={`${holdDash} ${HOLD_CIRCUMFERENCE - holdDash}`}
                />
              </svg>

              <span className="employee-home-v7__clock-center" aria-live="polite">
                {holdPhase === 'confirmed' ? (
                  <span className="employee-home-v7__confirmation">
                    <span className="employee-home-v7__confirmation-icon"><IconCheck /></span>
                    <strong>{cfg.completed}</strong>
                    <small>Acción completada</small>
                  </span>
                ) : holdPhase === 'holding' ? (
                  <span className="employee-home-v7__holding">
                    <strong>{Math.round(holdProgress)}%</strong>
                    <span>Mantén pulsado</span>
                    <small>Suelta para cancelar</small>
                  </span>
                ) : (
                  <>
                    <span className="employee-home-v7__clock-label">Tiempo trabajado</span>
                    <span className="employee-home-v7__clock-time">
                      {time}<small>{seconds}</small>
                    </span>
                    <span className="employee-home-v7__clock-action">
                      <span><StateActionIcon state={state} /></span>
                      {cfg.action}
                    </span>
                  </>
                )}
              </span>
            </button>
          </div>

          <p id={hintId} className="employee-home-v7__hold-hint">
            <span aria-hidden="true"><IconClock /></span>
            Mantén pulsado hasta completar el círculo
          </p>

          {(shiftStart || shiftEnd) && (
            <div className="employee-home-v7__shift">
              <span>Turno previsto</span>
              <strong>{shiftStart ?? '—'} – {shiftEnd ?? '—'}</strong>
              {overtimeLabel && <small>{overtimeLabel}</small>}
            </div>
          )}

          <div className="employee-home-v7__progress-copy">
            <div>
              <span>Objetivo diario</span>
              <strong>{safeProgress}%</strong>
            </div>
            <div className="employee-home-v7__progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgress}>
              <span style={{ width: `${safeProgress}%` }} />
            </div>
          </div>

          <div className="employee-home-v7__facts">
            <div>
              <span>Trabajado hoy</span>
              <strong>{workedLabel}</strong>
            </div>
            <div>
              <span>Tiempo restante</span>
              <strong>{remainingLabel}</strong>
            </div>
          </div>

          {hasQuickActions && (
            <div className="employee-home-v7__quick-actions" aria-label="Acciones disponibles">
              {onBreakAction && (
                <button type="button" className="employee-home-v7__quick-action" onClick={onBreakAction}>
                  <span aria-hidden="true">{state === 'break' ? <IconPlay /> : <IconPause />}</span>
                  <span>
                    <strong>{state === 'break' ? 'Finalizar descanso' : 'Iniciar descanso'}</strong>
                    <small>{state === 'break' ? 'Volver a la jornada' : 'Registrar una pausa'}</small>
                  </span>
                </button>
              )}
              {onStopAction && (
                <button type="button" className="employee-home-v7__quick-action employee-home-v7__quick-action--danger" onClick={onStopAction}>
                  <span aria-hidden="true"><IconStop /></span>
                  <span>
                    <strong>Fichar salida</strong>
                    <small>Finalizar la jornada</small>
                  </span>
                </button>
              )}
            </div>
          )}

          {extraAction && <div className="employee-home-v7__extra">{extraAction}</div>}
        </article>

        <aside className="employee-home-v7__side">
          {week && week.length > 0 && (
            <section className="employee-home-v7__panel employee-home-v7__week" aria-labelledby={`${hintId}-week`}>
              <div className="employee-home-v7__panel-heading">
                <div>
                  <span className="employee-home-v7__eyebrow">Resumen</span>
                  <h2 id={`${hintId}-week`}>Esta semana</h2>
                </div>
                {weeklyTotal && (
                  <div className="employee-home-v7__weekly-total">
                    <strong>{weeklyTotal}</strong>
                    <span>registradas</span>
                  </div>
                )}
              </div>

              <div className="employee-home-v7__week-chart" role="img" aria-label="Horas registradas durante la semana">
                {week.map((day, index) => {
                  const dayProgress = Number.isFinite(day.pct) ? Math.max(0, Math.min(100, day.pct)) : 0
                  return (
                    <div className="employee-home-v7__week-day" data-today={day.isToday || undefined} key={`${day.label}-${index}`}>
                      <span className="employee-home-v7__week-hours">{day.hours || '—'}</span>
                      <span className="employee-home-v7__week-track">
                        <span style={{ height: `${Math.max(4, dayProgress)}%` }} />
                      </span>
                      <span className="employee-home-v7__week-label">{day.label}</span>
                    </div>
                  )
                })}
              </div>

              <div className="employee-home-v7__week-legend" aria-hidden="true">
                <span><i /> Jornada parcial</span>
                <span><i /> Día actual</span>
              </div>
            </section>
          )}

          <section className="employee-home-v7__panel employee-home-v7__timeline" aria-labelledby={`${hintId}-timeline`}>
            <div className="employee-home-v7__panel-heading">
              <div>
                <span className="employee-home-v7__eyebrow">En tiempo real</span>
                <h2 id={`${hintId}-timeline`}>Actividad de hoy</h2>
              </div>
              {recent && recent.length > 0 && <span className="employee-home-v7__activity-count">{recent.length}</span>}
            </div>

            {recent && recent.length > 0 ? (
              <ol className="employee-home-v7__timeline-list">
                {recent.map((item, index) => (
                  <li key={item.id} data-last={index === recent.length - 1 || undefined}>
                    <PunchIcon type={item.type} tone={item.tone} />
                    <span className="employee-home-v7__timeline-copy">
                      <strong>{item.label}</strong>
                      <small>{item.type === 'pausa' ? 'Descanso' : item.type === 'reanuda' ? 'Jornada reanudada' : siteLabel || 'Registro horario'}</small>
                    </span>
                    <time>{item.time}</time>
                  </li>
                ))}
              </ol>
            ) : (
              <div className="employee-home-v7__empty">
                <span aria-hidden="true"><IconClock /></span>
                <strong>Sin movimientos todavía</strong>
                <p>Cuando fiches, la actividad de hoy aparecerá aquí.</p>
              </div>
            )}
          </section>
        </aside>
      </div>

      <style>{employeeHomeStyles}</style>
    </section>
  )
}

const employeeHomeStyles = `
  .employee-home-v7 {
    width: 100%;
    max-width: 1120px;
    margin: 0 auto;
    color: var(--text-primary);
    font-family: Geist, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .employee-home-v7 *,
  .employee-home-v7 *::before,
  .employee-home-v7 *::after { box-sizing: border-box; }

  .employee-home-v7__header {
    min-height: 58px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-bottom: var(--space-5);
    padding: 0 var(--space-1);
  }

  .employee-home-v7__welcome h1 {
    margin: 0;
    color: var(--text-primary);
    font-size: clamp(22px, 3vw, var(--font-heading-xl));
    font-weight: var(--font-semibold);
    line-height: var(--leading-heading);
    letter-spacing: -0.035em;
  }

  .employee-home-v7__welcome p {
    margin: var(--space-1) 0 0;
    color: var(--text-tertiary);
    font-size: var(--font-body-sm);
    line-height: var(--leading-body);
  }

  .employee-home-v7__streak {
    min-height: 36px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--space-3);
    border: 1px solid rgba(245, 158, 11, 0.22);
    border-radius: var(--radius-pill);
    background: var(--warning-soft);
    color: var(--warning-400);
    white-space: nowrap;
    font-size: var(--font-caption);
    font-weight: var(--font-medium);
  }

  .employee-home-v7__streak > span:first-child {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    box-shadow: 0 0 12px rgba(245, 158, 11, 0.38);
  }

  .employee-home-v7__streak strong { color: var(--text-primary); font-variant-numeric: tabular-nums; }

  .employee-home-v7__layout {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(300px, 0.65fr);
    align-items: stretch;
    gap: var(--space-5);
  }

  .employee-home-v7__header-status { display:flex; align-items:center; justify-content:flex-end; gap:8px; flex-wrap:wrap; }
  .employee-home-v7__sync {
    min-height:30px; display:inline-flex; align-items:center; gap:7px; padding:0 10px; border:1px solid var(--border-subtle);
    border-radius:999px; background:var(--bg-elevated); color:var(--text-tertiary); font-size:10px; font-weight:var(--font-semibold);
  }
  .employee-home-v7__sync > span { width:7px; height:7px; border-radius:50%; background:var(--success-400); box-shadow:0 0 0 3px var(--success-soft); }
  .employee-home-v7__sync[data-tone="pending"] > span { background:var(--warning-400); box-shadow:0 0 0 3px var(--warning-soft); animation:employeeHomeSyncPulse 1.4s ease-in-out infinite; }
  .employee-home-v7__sync[data-tone="error"] > span { background:var(--danger-400); box-shadow:0 0 0 3px var(--danger-soft); }
  @keyframes employeeHomeSyncPulse { 50% { opacity:.45; } }

  .employee-home-v7__hero,
  .employee-home-v7__panel {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--border-subtle);
    background: var(--gradient-card), var(--bg-card);
    box-shadow: var(--shadow-sm);
  }

  .employee-home-v7__hero {
    min-width: 0;
    padding: var(--space-6);
    border-radius: var(--radius-xl);
    isolation: isolate;
  }

  .employee-home-v7__hero::before {
    content: "";
    position: absolute;
    z-index: -1;
    top: -220px;
    left: 50%;
    width: 540px;
    height: 540px;
    transform: translateX(-50%);
    background: var(--gradient-clock);
    pointer-events: none;
  }

  .employee-home-v7__hero-heading,
  .employee-home-v7__panel-heading {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
  }

  .employee-home-v7__eyebrow {
    display: block;
    margin-bottom: 6px;
    color: var(--text-tertiary);
    font-size: var(--font-micro);
    font-weight: var(--font-semibold);
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
  }

  .employee-home-v7__status {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-primary);
    font-size: var(--font-heading-sm);
    font-weight: var(--font-semibold);
    letter-spacing: -0.02em;
  }

  .employee-home-v7__status-dot {
    width: 8px;
    height: 8px;
    flex: 0 0 auto;
    border-radius: 50%;
    background: var(--text-disabled);
    box-shadow: 0 0 0 4px rgba(81, 93, 114, 0.12);
  }

  .employee-home-v7[data-state="working"] .employee-home-v7__status-dot {
    background: var(--success-400);
    box-shadow: 0 0 0 4px var(--success-soft), 0 0 16px rgba(49, 217, 130, 0.28);
  }

  .employee-home-v7[data-state="break"] .employee-home-v7__status-dot {
    background: var(--warning-400);
    box-shadow: 0 0 0 4px var(--warning-soft), 0 0 16px rgba(245, 158, 11, 0.24);
  }

  .employee-home-v7__hero-heading p {
    margin: 5px 0 0 16px;
    color: var(--text-tertiary);
    font-size: var(--font-caption);
  }

  .employee-home-v7__site {
    min-width: 0;
    max-width: 190px;
    min-height: 36px;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-pill);
    background: var(--bg-elevated);
    color: var(--text-secondary);
    font-size: var(--font-caption);
  }

  .employee-home-v7__site svg { width: 15px; height: 15px; flex: 0 0 auto; color: var(--brand-400); }
  .employee-home-v7__site span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

  .employee-home-v7__clock-wrap {
    display: grid;
    place-items: center;
    min-height: 312px;
    margin: var(--space-2) 0 0;
  }

  .employee-home-v7__clock-button {
    position: relative;
    width: 288px;
    height: 288px;
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    outline: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    touch-action: pan-y;
    user-select: none;
    -webkit-touch-callout: none;
    -webkit-tap-highlight-color: transparent;
    transition: transform var(--duration-normal) var(--ease-standard), filter var(--duration-normal) var(--ease-standard);
  }

  .employee-home-v7__clock-button:focus-visible {
    outline: 2px solid var(--brand-300) !important;
    outline-offset: 7px !important;
  }

  .employee-home-v7__clock-button[data-phase="holding"] { transform: scale(1.018); }
  .employee-home-v7__clock-button[data-phase="confirmed"] { transform: scale(0.99); }

  .employee-home-v7__clock-glow {
    position: absolute;
    inset: 28px;
    border-radius: 50%;
    background: var(--clock-glow-bg);
    box-shadow: 0 0 58px var(--clock-glow-shadow), inset 0 0 32px var(--clock-glow-bg);
    transition: background var(--duration-normal) var(--ease-standard), box-shadow var(--duration-normal) var(--ease-standard);
  }

  .employee-home-v7__clock-button[data-phase="holding"] .employee-home-v7__clock-glow {
    background: rgba(53, 104, 255, 0.15);
    box-shadow: 0 0 72px rgba(53, 104, 255, 0.32), inset 0 0 36px rgba(124, 92, 255, 0.12);
  }

  .employee-home-v7__clock-button[data-phase="confirmed"] .employee-home-v7__clock-glow {
    background: var(--success-soft);
    box-shadow: 0 0 68px rgba(22, 201, 111, 0.26), inset 0 0 34px rgba(22, 201, 111, 0.1);
  }

  .employee-home-v7__clock-rings { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .employee-home-v7__clock-rings circle { fill: none; vector-effect: non-scaling-stroke; }

  .employee-home-v7__orbit {
    stroke: rgba(95, 135, 255, 0.2);
    transition: stroke var(--duration-normal) var(--ease-standard);
  }

  .employee-home-v7__orbit--outer { stroke-width: 1; stroke-dasharray: 2 7; }
  .employee-home-v7__orbit--inner { stroke: rgba(124, 92, 255, 0.36); stroke-width: 1.5; }
  .employee-home-v7__track { stroke: var(--clock-track); stroke-width: 8; }

  .employee-home-v7__progress-ring,
  .employee-home-v7__hold-ring {
    transform: rotate(-90deg);
    transform-origin: center;
    stroke-linecap: round;
  }

  .employee-home-v7__progress-ring {
    stroke: var(--brand-500);
    stroke-width: 8;
    filter: drop-shadow(0 0 7px rgba(53, 104, 255, 0.42));
    transition: stroke-dasharray var(--duration-slow) var(--ease-standard), opacity var(--duration-normal) var(--ease-standard);
  }

  .employee-home-v7__hold-ring {
    stroke: var(--accent-400);
    stroke-width: 5;
    opacity: 0;
    filter: drop-shadow(0 0 8px rgba(124, 92, 255, 0.55));
  }

  .employee-home-v7__clock-button[data-phase="holding"] .employee-home-v7__hold-ring { opacity: 1; }
  .employee-home-v7__clock-button[data-phase="confirmed"] .employee-home-v7__hold-ring { opacity: 1; stroke: var(--success-400); }
  .employee-home-v7__clock-button[data-phase="confirmed"] .employee-home-v7__progress-ring { opacity: 0.28; stroke: var(--success-400); }

  .employee-home-v7__clock-center {
    position: relative;
    z-index: 1;
    width: 192px;
    height: 192px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--clock-center-border);
    border-radius: 50%;
    background: var(--clock-center);
    box-shadow: inset 0 0 30px var(--clock-glow-bg), var(--shadow-md);
  }

  .employee-home-v7__clock-label {
    margin-bottom: var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--font-micro);
    font-weight: var(--font-medium);
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .employee-home-v7__clock-time {
    color: var(--text-primary);
    font-size: 42px;
    font-weight: var(--font-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.065em;
    line-height: 1;
  }

  .employee-home-v7__clock-time small {
    margin-left: 2px;
    color: var(--text-secondary);
    font-size: 20px;
    font-weight: var(--font-medium);
    letter-spacing: -0.04em;
  }

  .employee-home-v7__clock-action {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin-top: var(--space-4);
    color: var(--brand-200);
    font-size: var(--font-caption);
    font-weight: var(--font-semibold);
  }

  .employee-home-v7__clock-action > span {
    width: 26px;
    height: 26px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--gradient-brand);
    color: white;
    box-shadow: 0 5px 16px rgba(53, 104, 255, 0.32);
  }

  .employee-home-v7__clock-action svg { width: 10px; height: 10px; }

  .employee-home-v7__holding,
  .employee-home-v7__confirmation {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .employee-home-v7__holding strong {
    color: var(--text-primary);
    font-size: 42px;
    font-weight: var(--font-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.05em;
    line-height: 1;
  }

  .employee-home-v7__holding span,
  .employee-home-v7__confirmation strong {
    margin-top: var(--space-3);
    color: var(--text-primary);
    font-size: var(--font-body-sm);
    font-weight: var(--font-semibold);
  }

  .employee-home-v7__holding small,
  .employee-home-v7__confirmation small {
    margin-top: var(--space-1);
    color: var(--text-tertiary);
    font-size: var(--font-micro);
  }

  .employee-home-v7__confirmation-icon {
    width: 58px;
    height: 58px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--success-soft);
    color: var(--success-400);
    box-shadow: 0 0 0 8px rgba(22, 201, 111, 0.06), 0 0 30px rgba(22, 201, 111, 0.24);
    animation: employeeV7Confirm var(--duration-modal) var(--ease-enter) both;
  }

  .employee-home-v7__confirmation-icon svg { width: 28px; height: 28px; stroke-width: 2.2; }

  .employee-home-v7__hold-hint {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    margin: -2px 0 var(--space-5);
    color: var(--text-tertiary);
    font-size: var(--font-caption);
    text-align: center;
  }

  .employee-home-v7__hold-hint > span {
    width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--info-soft);
    color: var(--info-400);
  }

  .employee-home-v7__hold-hint svg { width: 13px; height: 13px; }

  .employee-home-v7__shift {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: 10px var(--space-3);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    font-size: var(--font-caption);
  }

  .employee-home-v7__shift > span { color: var(--text-tertiary); }
  .employee-home-v7__shift strong { color: var(--text-primary); font-variant-numeric: tabular-nums; }
  .employee-home-v7__shift small { margin-left: auto; color: var(--warning-400); }

  .employee-home-v7__progress-copy {
    padding: var(--space-4) 0;
    border-top: 1px solid var(--border-subtle);
    border-bottom: 1px solid var(--border-subtle);
  }

  .employee-home-v7__progress-copy > div:first-child {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--space-2);
    color: var(--text-tertiary);
    font-size: var(--font-caption);
  }

  .employee-home-v7__progress-copy strong { color: var(--brand-300); font-weight: var(--font-semibold); font-variant-numeric: tabular-nums; }

  .employee-home-v7__progress-bar {
    height: 6px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--clock-soft-fill);
  }

  .employee-home-v7__progress-bar > span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--brand-500);
    box-shadow: 0 0 12px rgba(53, 104, 255, 0.4);
    transition: width var(--duration-slow) var(--ease-standard);
  }

  .employee-home-v7__facts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    padding: var(--space-4) 0;
  }

  .employee-home-v7__facts > div { min-width: 0; padding: 0 var(--space-4); }
  .employee-home-v7__facts > div:first-child { padding-left: 0; }
  .employee-home-v7__facts > div + div { border-left: 1px solid var(--border-subtle); }

  .employee-home-v7__facts span {
    display: block;
    margin-bottom: 5px;
    color: var(--text-tertiary);
    font-size: var(--font-micro);
    font-weight: var(--font-medium);
  }

  .employee-home-v7__facts strong {
    display: block;
    overflow: hidden;
    color: var(--text-primary);
    font-size: var(--font-heading-md);
    font-weight: var(--font-semibold);
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.035em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .employee-home-v7__quick-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding-top: var(--space-1);
  }

  .employee-home-v7__quick-action {
    min-width: 0;
    min-height: 58px;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: 10px var(--space-3);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: transform var(--duration-fast) var(--ease-standard), background var(--duration-fast) var(--ease-standard), border-color var(--duration-fast) var(--ease-standard);
  }

  .employee-home-v7__quick-action:hover { border-color: rgba(95, 135, 255, 0.32); background: var(--bg-card-hover); transform: translateY(-1px); }
  .employee-home-v7__quick-action:active { transform: scale(0.98); }
  .employee-home-v7__quick-action:focus-visible { outline: 2px solid var(--border-focus) !important; outline-offset: 2px !important; }

  .employee-home-v7__quick-action > span:first-child {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    display: grid;
    place-items: center;
    border-radius: var(--radius-sm);
    background: var(--info-soft);
    color: var(--info-400);
  }

  .employee-home-v7__quick-action--danger > span:first-child { background: var(--danger-soft); color: var(--danger-400); }
  .employee-home-v7__quick-action svg { width: 16px; height: 16px; }
  .employee-home-v7__quick-action strong { display: block; overflow: hidden; font-size: var(--font-caption); font-weight: var(--font-semibold); text-overflow: ellipsis; white-space: nowrap; }
  .employee-home-v7__quick-action small { display: block; margin-top: 2px; color: var(--text-tertiary); font-size: 10px; }

  .employee-home-v7__extra { margin-top: var(--space-3); }
  .employee-home-v7__extra > button {
    min-height: 46px !important;
    border: 1px solid var(--border-default) !important;
    border-radius: var(--radius-md) !important;
    background: var(--bg-elevated) !important;
    color: var(--text-secondary) !important;
    box-shadow: none !important;
  }

  .employee-home-v7__side {
    min-width: 0;
    display: grid;
    grid-template-rows: repeat(2, minmax(0, 1fr));
    gap: var(--space-5);
  }
  .employee-home-v7__panel { height: 100%; min-height: 0; padding: var(--space-5); border-radius: var(--radius-lg); }

  .employee-home-v7__panel-heading { align-items: center; margin-bottom: var(--space-5); }
  .employee-home-v7__panel-heading h2 { margin: 0; color: var(--text-primary); font-size: var(--font-body-lg); font-weight: var(--font-semibold); letter-spacing: -0.025em; }

  .employee-home-v7__weekly-total { display: flex; flex-direction: column; align-items: flex-end; }
  .employee-home-v7__weekly-total strong { color: var(--brand-300); font-size: var(--font-body-sm); font-weight: var(--font-semibold); font-variant-numeric: tabular-nums; }
  .employee-home-v7__weekly-total span { margin-top: 2px; color: var(--text-tertiary); font-size: 10px; }

  .employee-home-v7__week-chart {
    height: 150px;
    display: grid;
    grid-template-columns: repeat(7, minmax(20px, 1fr));
    gap: 7px;
    padding-top: var(--space-1);
  }

  .employee-home-v7__week-day { min-width: 0; display: grid; grid-template-rows: 18px 1fr 16px; justify-items: center; gap: 5px; }
  .employee-home-v7__week-hours { color: var(--text-tertiary); font-size: 9px; font-variant-numeric: tabular-nums; }
  .employee-home-v7__week-track { width: 100%; max-width: 24px; display: flex; align-items: flex-end; overflow: hidden; border-radius: 7px; background: var(--clock-week-track); }
  .employee-home-v7__week-track > span { width: 100%; min-height: 4px; border-radius: 7px; background: rgba(53, 104, 255, 0.36); transition: height var(--duration-slow) var(--ease-standard); }
  .employee-home-v7__week-day[data-today="true"] .employee-home-v7__week-track > span { background: var(--brand-500); box-shadow: 0 0 14px rgba(53, 104, 255, 0.34); }
  .employee-home-v7__week-day[data-today="true"] .employee-home-v7__week-hours,
  .employee-home-v7__week-day[data-today="true"] .employee-home-v7__week-label { color: var(--brand-300); font-weight: var(--font-semibold); }
  .employee-home-v7__week-label { color: var(--text-tertiary); font-size: var(--font-micro); font-weight: var(--font-medium); }

  .employee-home-v7__week-legend {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    margin-top: var(--space-4);
    padding-top: var(--space-3);
    border-top: 1px solid var(--border-subtle);
    color: var(--text-tertiary);
    font-size: 10px;
  }

  .employee-home-v7__week-legend span { display: inline-flex; align-items: center; gap: 6px; }
  .employee-home-v7__week-legend i { width: 7px; height: 7px; border-radius: 2px; background: rgba(53, 104, 255, 0.38); }
  .employee-home-v7__week-legend span:last-child i { background: var(--brand-500); }

  .employee-home-v7__activity-count {
    min-width: 24px;
    height: 24px;
    display: grid;
    place-items: center;
    border: 1px solid rgba(95, 135, 255, 0.18);
    border-radius: var(--radius-pill);
    background: var(--info-soft);
    color: var(--brand-300);
    font-size: var(--font-micro);
    font-weight: var(--font-semibold);
    font-variant-numeric: tabular-nums;
  }

  .employee-home-v7__timeline-list { margin: 0; padding: 0; list-style: none; }
  .employee-home-v7__timeline-list li { position: relative; display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: var(--space-3); min-height: 55px; }
  .employee-home-v7__timeline-list li:not([data-last="true"])::after { content: ""; position: absolute; top: 39px; bottom: -16px; left: 16.5px; width: 1px; background: var(--border-default); }

  .employee-home-v7__timeline-icon {
    --timeline-tone: var(--text-tertiary);
    position: relative;
    z-index: 1;
    width: 34px;
    height: 34px;
    display: grid;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--timeline-tone) 28%, transparent);
    border-radius: 50%;
    background: var(--bg-elevated);
    color: var(--timeline-tone);
    box-shadow: 0 0 0 4px var(--bg-card);
  }

  .employee-home-v7__timeline-icon[data-tone="green"] { --timeline-tone: var(--success-400); }
  .employee-home-v7__timeline-icon[data-tone="orange"] { --timeline-tone: var(--warning-400); }
  .employee-home-v7__timeline-icon[data-tone="red"] { --timeline-tone: var(--danger-400); }
  .employee-home-v7__timeline-icon svg { width: 13px; height: 13px; }
  .employee-home-v7__timeline-icon > span { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .employee-home-v7__timeline-copy { min-width: 0; }
  .employee-home-v7__timeline-copy strong { display: block; overflow: hidden; color: var(--text-primary); font-size: var(--font-body-sm); font-weight: var(--font-medium); text-overflow: ellipsis; white-space: nowrap; }
  .employee-home-v7__timeline-copy small { display: block; overflow: hidden; margin-top: 3px; color: var(--text-tertiary); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .employee-home-v7__timeline-list time { padding: 4px 7px; border: 1px solid var(--border-subtle); border-radius: var(--radius-xs); background: var(--bg-elevated); color: var(--text-secondary); font-size: var(--font-micro); font-variant-numeric: tabular-nums; }

  .employee-home-v7__empty { display: flex; flex-direction: column; align-items: center; padding: var(--space-6) var(--space-4); text-align: center; }
  .employee-home-v7__empty > span { width: 42px; height: 42px; display: grid; place-items: center; margin-bottom: var(--space-3); border-radius: var(--radius-md); background: var(--info-soft); color: var(--info-400); }
  .employee-home-v7__empty strong { color: var(--text-secondary); font-size: var(--font-body-sm); font-weight: var(--font-semibold); }
  .employee-home-v7__empty p { max-width: 230px; margin: 5px 0 0; color: var(--text-tertiary); font-size: var(--font-micro); line-height: var(--leading-body); }

  @keyframes employeeV7Confirm {
    from { opacity: 0; transform: scale(0.72); }
    to { opacity: 1; transform: scale(1); }
  }

  @media (max-width: 860px) {
    .employee-home-v7 { max-width: 620px; }
    .employee-home-v7__layout { grid-template-columns: minmax(0, 1fr); }
    .employee-home-v7__side { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-template-rows: minmax(288px, 1fr); align-items: stretch; }
  }

  @media (max-width: 620px) {
    .employee-home-v7__header { min-height: 52px; margin-bottom: var(--space-4); }
    .employee-home-v7__welcome h1 { font-size: 22px; }
    .employee-home-v7__streak > span:last-child { display: none; }
    .employee-home-v7__layout { display: flex; flex-direction: column; gap: var(--space-4); }
    .employee-home-v7__side { display: grid; grid-template-columns: 1fr; grid-auto-rows: 288px; gap: var(--space-4); }
    .employee-home-v7__hero { width: 100%; padding: var(--space-5) var(--space-4); border-radius: var(--radius-xl); }
    .employee-home-v7__panel { width: 100%; padding: var(--space-4); }
    .employee-home-v7__clock-wrap { min-height: 294px; }
    .employee-home-v7__clock-button { width: 272px; height: 272px; }
    .employee-home-v7__clock-center { width: 180px; height: 180px; }
    .employee-home-v7__clock-time { font-size: 39px; }
    .employee-home-v7__site { max-width: 145px; }
  }

  @media (max-width: 390px) {
    .employee-home-v7__hero-heading { align-items: center; }
    .employee-home-v7__hero-heading p { display: none; }
    .employee-home-v7__site { max-width: 122px; min-height: 32px; padding: 0 9px; }
    .employee-home-v7__clock-wrap { min-height: 270px; }
    .employee-home-v7__clock-button { width: 252px; height: 252px; }
    .employee-home-v7__clock-center { width: 166px; height: 166px; }
    .employee-home-v7__clock-label { font-size: 9px; }
    .employee-home-v7__clock-time { font-size: 35px; }
    .employee-home-v7__clock-time small { font-size: 17px; }
    .employee-home-v7__clock-action { margin-top: var(--space-3); }
    .employee-home-v7__quick-action { min-height: 54px; padding: 9px; gap: var(--space-2); }
    .employee-home-v7__quick-action > span:first-child { width: 32px; height: 32px; }
    .employee-home-v7__quick-action small { display: none; }
  }

  @media (prefers-reduced-motion: reduce) {
    .employee-home-v7 *,
    .employee-home-v7 *::before,
    .employee-home-v7 *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
`
