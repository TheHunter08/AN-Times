import type { ReactNode } from 'react'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'
import { IconPlay, IconPause, IconStop, IconMapPin, IconArrowRight, IconArrowLeft } from '../components/Icons.js'

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
  extraAction?: React.ReactNode
}

const stateConfig: Record<ClockState, { status: string; statusDesc: string; mainLabel: string; color: string; pulse: boolean }> = {
  idle:    { status: 'Sin fichar',       statusDesc: 'Tu jornada no ha comenzado',  mainLabel: 'Iniciar jornada', color: colors.primary.base,    pulse: false },
  working: { status: 'Jornada en curso', statusDesc: 'Estás registrado y trabajando', mainLabel: 'Pausar',         color: colors.semantic.green,  pulse: true  },
  break:   { status: 'En pausa',         statusDesc: 'El tiempo de pausa está activo', mainLabel: 'Reanudar',      color: colors.semantic.orange, pulse: false },
}

const toneColor: Record<string, string> = {
  green:  colors.semantic.green,
  orange: colors.semantic.orange,
  red:    colors.semantic.red,
  gray:   colors.text[500],
}

function PunchIcon({ type, tone }: { type?: RecentPunch['type']; tone?: string }) {
  const c = toneColor[tone ?? 'gray']
  const bg = `${c}18`
  const icon = type === 'entrada'  ? <IconArrowRight width={10} height={10} color={c} />
             : type === 'salida'   ? <IconArrowLeft  width={10} height={10} color={c} />
             : type === 'pausa'    ? <IconPause      width={10} height={10} color={c} />
             : type === 'reanuda'  ? <IconPlay       width={10} height={10} color={c} />
             : null
  return (
    <span style={{
      width: 22, height: 22, borderRadius: '50%', background: bg,
      border: `1px solid ${c}30`, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {icon ?? <span style={{ width: 6, height: 6, borderRadius: '50%', background: c }} />}
    </span>
  )
}

function Ring({ pct, color, size = 240 }: { pct: number; color: string; size?: number }) {
  const stroke = 7
  const r = (size - stroke * 2) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(100, pct)) / 100 * c
  const fid = `rg${color.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg width={size} height={size} style={{ position: 'absolute', top: 0, left: 0, transform: 'rotate(-90deg)' }}>
      <defs>
        <filter id={fid} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      <circle cx={size/2} cy={size/2} r={r} stroke={colors.bg[400]} strokeWidth={stroke} fill="none" />
      {pct > 0 && (
        <circle cx={size/2} cy={size/2} r={r} stroke={color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round"
          filter={`url(#${fid})`}
          style={{ transition: transition(['stroke-dasharray']) }}
        />
      )}
    </svg>
  )
}

export function EmployeeHome({
  time, seconds, dateLabel, state, onStartAction, onBreakAction, onStopAction,
  workedLabel, remainingLabel, progressPct, siteLabel, streakDays, week, weeklyTotal,
  recent, greeting, shiftStart, shiftEnd, overtimeLabel, extraAction,
}: EmployeeHomeProps) {
  const cfg = stateConfig[state]
  const mainClick = state === 'idle' ? onStartAction : (onBreakAction ?? onStartAction)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto' }}>

      {/* ── Cabecera ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px' }}>
        <div>
          {greeting && <div style={{ fontSize: 18, fontWeight: 660, color: colors.text[900], letterSpacing: '-.3px' }}>{greeting}</div>}
          <div style={{ fontSize: 11.5, color: colors.text[500], marginTop: greeting ? 2 : 0 }}>{dateLabel}</div>
        </div>
        {!!streakDays && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 5,
            padding: '5px 12px', borderRadius: radius.pill,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.2)',
            color: colors.kpiTone.amber.base, fontSize: 12, fontWeight: 700,
          }}>
            🔥 {streakDays} días seguidos
          </div>
        )}
      </div>

      {/* ── Héroe ──────────────────────────────────────────────── */}
      <div style={{
        background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius['2xl'], padding: '28px 24px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Glow ambiental */}
        <div style={{
          position: 'absolute', top: -60, left: '50%', transform: 'translateX(-50%)',
          width: 320, height: 320, borderRadius: '50%',
          background: `radial-gradient(circle, ${cfg.color}18 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        {/* Pill estado + descripción */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: radius.pill,
            background: `${cfg.color}18`, border: `1px solid ${cfg.color}35`,
            fontSize: 11, fontWeight: 700, color: cfg.color, textTransform: 'uppercase', letterSpacing: '.5px',
          }}>
            {cfg.pulse && <span className="uiv2-live-dot" style={{ width: 5, height: 5, borderRadius: '50%', background: cfg.color }} />}
            {cfg.status}
          </div>
          <div style={{ fontSize: 12, color: colors.text[500] }}>{cfg.statusDesc}</div>
        </div>

        {/* Anillo — botón principal */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          {/* Glow pulsante cuando idle */}
          {state === 'idle' && (
            <div className="uiv2-idle-glow" style={{
              position: 'absolute', inset: -14, borderRadius: '50%',
              background: `radial-gradient(circle, ${colors.primary.base}22 0%, transparent 70%)`,
              pointerEvents: 'none',
            }} />
          )}
          <button
            onClick={mainClick}
            aria-label={cfg.mainLabel}
            className="uiv2-ring-btn"
            style={{
              position: 'relative', width: 240, height: 240, display: 'block',
              border: 'none', background: 'none', cursor: 'pointer', borderRadius: '50%', padding: 0,
            }}
          >
            <Ring pct={state === 'idle' ? 0 : progressPct} color={cfg.color} />
            {state === 'working' && (
              <span className="uiv2-ring-pulse" style={{
                position: 'absolute', inset: 6, borderRadius: '50%',
                border: `1px solid ${cfg.color}40`, pointerEvents: 'none',
              }} />
            )}

            {/* Centro: hora + site + hint */}
            <div className="uiv2-ring-center" style={{
              position: 'absolute', inset: 0,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              transition: 'opacity 0.2s',
            }}>
              <div style={{
                fontSize: 44, fontWeight: 660, letterSpacing: '-2.5px',
                color: colors.text[900], fontVariantNumeric: 'tabular-nums', lineHeight: 1,
              }}>
                {time}<span style={{ color: colors.text[400], fontSize: 22 }}>{seconds}</span>
              </div>
              {siteLabel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: colors.text[500] }}>
                  <IconMapPin width={11} height={11} />{siteLabel}
                </div>
              )}
              {state === 'idle' && (
                <div className="uiv2-idle-hint" style={{
                  marginTop: 8, display: 'flex', alignItems: 'center', gap: 5,
                  fontSize: 11, fontWeight: 600, color: colors.primary.light,
                }}>
                  <IconPlay width={9} height={9} color={colors.primary.light} />
                  Pulsa para iniciar jornada
                </div>
              )}
            </div>

            {/* Overlay hover */}
            <div className="uiv2-ring-overlay" style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              background: 'rgba(9,7,13,0.62)', opacity: 0,
              transition: 'opacity 0.18s ease', backdropFilter: 'blur(3px)',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: '50%', background: cfg.color,
                boxShadow: `0 0 28px ${cfg.color}90`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {state === 'idle'    && <IconPlay  width={20} height={20} color="#fff" />}
                {state === 'working' && <IconPause width={20} height={20} color="#fff" />}
                {state === 'break'   && <IconPlay  width={20} height={20} color="#fff" />}
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: '-.2px' }}>{cfg.mainLabel}</div>
                <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,.55)', marginTop: 2 }}>
                  {state === 'idle'    && 'Toca para comenzar tu turno'}
                  {state === 'working' && 'Toca para pausar tu jornada'}
                  {state === 'break'   && 'Toca para retomar el trabajo'}
                </div>
              </div>
            </div>
          </button>
        </div>

        {/* Hint exterior idle */}
        {state === 'idle' && (
          <div style={{ textAlign: 'center', marginBottom: 20, fontSize: 12.5, color: colors.text[500] }}>
            Toca el reloj para registrar tu entrada
          </div>
        )}

        {/* Turno previsto — solo cuando hay turno definido y no está idle */}
        {(shiftStart || shiftEnd) && state !== 'idle' && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '8px 14px', borderRadius: radius.md, marginBottom: 16,
            background: colors.bg[500], border: `1px solid ${colors.border.subtle}`,
          }}>
            <span style={{ fontSize: 11, color: colors.text[500] }}>Turno previsto</span>
            <span style={{ fontSize: 12, fontWeight: 660, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>
              {shiftStart} – {shiftEnd}
            </span>
            {overtimeLabel && (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: radius.pill,
                background: 'rgba(251,191,36,0.15)', color: colors.kpiTone.amber.base,
                border: '1px solid rgba(251,191,36,0.25)',
              }}>+{overtimeLabel} extra</span>
            )}
          </div>
        )}

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Trabajado hoy',  value: workedLabel,   color: cfg.color,       sublabel: 'de 8h jornada' },
            { label: 'Tiempo restante', value: remainingLabel, color: colors.text[700], sublabel: 'para completar' },
          ].map(s => (
            <div key={s.label} style={{
              background: colors.bg[500], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.md, padding: '12px 14px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 20, fontWeight: 660, color: s.color, letterSpacing: '-.8px', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 10.5, color: colors.text[500], marginTop: 2, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 9.5, color: colors.text[300], marginTop: 1 }}>{s.sublabel}</div>
            </div>
          ))}
        </div>

        {/* Progreso */}
        <div style={{ marginBottom: state !== 'idle' ? 16 : 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: colors.text[500], marginBottom: 6 }}>
            <span>Progreso de jornada</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: cfg.color }}>{progressPct}%</span>
          </div>
          <div style={{ height: 5, borderRadius: radius.pill, background: colors.bg[400], overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: radius.pill,
              width: `${Math.min(100, progressPct)}%`,
              background: `linear-gradient(90deg, ${cfg.color} 0%, ${cfg.color}cc 100%)`,
              boxShadow: `0 0 8px ${cfg.color}60`,
              transition: transition(['width']),
            }} />
          </div>
        </div>

        {/* Finalizar */}
        {state !== 'idle' && onStopAction && (
          <button onClick={onStopAction} className="uiv2-stop-btn" style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '10px 14px', borderRadius: radius.md,
            border: `1px solid rgba(239,68,68,.25)`, background: 'transparent',
            color: colors.semantic.red, fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
            transition: transition(['background', 'border-color']),
          }}>
            <IconStop width={12} height={12} />
            Finalizar jornada y marcar salida
          </button>
        )}
      </div>

      {extraAction}

      {/* ── Semana ─────────────────────────────────────────────── */}
      {week && week.length > 0 && (
        <div style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.xl, padding: '18px 20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div style={{ fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Esta semana
            </div>
            {weeklyTotal && (
              <div style={{ fontSize: 12, fontWeight: 660, color: colors.primary.light, fontVariantNumeric: 'tabular-nums' }}>
                {weeklyTotal} <span style={{ fontSize: 10, fontWeight: 500, color: colors.text[500] }}>totales</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 100 }}>
            {week.map(d => (
              <div key={d.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, height: '100%' }}>
                {d.hours ? (
                  <div style={{ fontSize: 9.5, color: d.isToday ? colors.primary.light : colors.text[500], fontVariantNumeric: 'tabular-nums', fontWeight: d.isToday ? 700 : 400 }}>
                    {d.hours}
                  </div>
                ) : <div style={{ height: 13 }} />}
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{
                    width: '100%',
                    height: `${Math.max(5, d.pct)}%`,
                    borderRadius: `${radius.sm} ${radius.sm} 3px 3px`,
                    background: d.isToday
                      ? colors.primary.base
                      : d.pct >= 95
                        ? `${colors.primary.base}70`
                        : d.pct > 0
                          ? `${colors.primary.base}35`
                          : colors.bg[400],
                    boxShadow: d.isToday ? `0 0 14px ${colors.primary.base}60` : 'none',
                    transition: transition(['height']),
                  }} />
                </div>
                <span style={{
                  fontSize: 10, fontWeight: d.isToday ? 700 : 500,
                  color: d.isToday ? colors.primary.light : colors.text[500],
                }}>
                  {d.label}
                </span>
              </div>
            ))}
          </div>
          {/* Leyenda de colores */}
          <div style={{ display: 'flex', gap: 14, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${colors.border.subtle}` }}>
            {[
              { label: 'Completo',  color: `${colors.primary.base}70` },
              { label: 'Parcial',   color: `${colors.primary.base}35` },
              { label: 'Hoy',       color: colors.primary.base },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: l.color }} />
                <span style={{ fontSize: 9.5, color: colors.text[500] }}>{l.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Timeline ────────────────────────────────────────────── */}
      {recent && recent.length > 0 && (
        <div style={{
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius.xl, padding: '18px 20px',
        }}>
          <div style={{ fontSize: 12, fontWeight: 660, color: colors.text[700], marginBottom: 16, textTransform: 'uppercase', letterSpacing: '.5px' }}>
            Actividad de hoy
          </div>
          <div style={{ position: 'relative', paddingLeft: 24 }}>
            <div style={{
              position: 'absolute', left: 10, top: 10, bottom: 10,
              width: 1, background: colors.border.subtle,
            }} />
            {recent.map((r) => {
              const dotColor = toneColor[r.tone ?? 'gray']
              return (
                <div key={r.id} className="uiv2-timeline-row" style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '7px 6px', borderRadius: radius.sm,
                  transition: transition(['background']), position: 'relative',
                }}>
                  <div style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)' }}>
                    <PunchIcon type={r.type} tone={r.tone} />
                  </div>
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 500, color: colors.text[900] }}>{r.label}</span>
                  <span style={{
                    fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums',
                    background: colors.bg[500], padding: '2px 7px', borderRadius: radius.xs,
                    border: `1px solid ${colors.border.subtle}`,
                  }}>{r.time}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <style>{`
        .uiv2-ring-btn:hover .uiv2-ring-overlay { opacity: 1 !important; }
        .uiv2-ring-btn:hover .uiv2-ring-center  { opacity: 0.15; }
        .uiv2-ring-btn:active .uiv2-ring-overlay { transform: scale(.96); }
        .uiv2-stop-btn:hover  { background: rgba(239,68,68,.08) !important; border-color: rgba(239,68,68,.45) !important; }
        .uiv2-timeline-row:hover { background: rgba(255,255,255,.03); }
        @keyframes uiv2IdleGlow { 0%,100% { opacity:.4; transform:scale(1); } 50% { opacity:.9; transform:scale(1.06); } }
        .uiv2-idle-glow { animation: uiv2IdleGlow 3s ease-in-out infinite; }
        @keyframes uiv2IdleHint { 0%,100% { opacity:.6; } 50% { opacity:1; } }
        .uiv2-idle-hint { animation: uiv2IdleHint 2.5s ease-in-out infinite; }
        @keyframes uiv2Pulse { 0% { transform:scale(1); opacity:.5; } 100% { transform:scale(1.12); opacity:0; } }
        .uiv2-ring-pulse { animation: uiv2Pulse 2.2s cubic-bezier(.16,1,.3,1) infinite; }
        @keyframes uiv2Blink { 0%,100% { opacity:1; } 50% { opacity:.3; } }
        .uiv2-live-dot { animation: uiv2Blink 1.4s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
