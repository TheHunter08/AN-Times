import type { ReactNode } from 'react'
import { AreaChart } from '../components/AreaChart.js'
import type { AreaChartPoint } from '../components/AreaChart.js'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'
import { IconDownload, IconChevronDown, IconArrowRight, IconClock, IconUsers, IconCalendar } from '../components/Icons.js'

export type KpiTone = 'primary' | 'accent' | 'cyan' | 'amber'

export interface KPI {
  label: string
  value: string
  delta?: { text: string; tone: 'up' | 'down' | 'flat' }
  icon?: ReactNode
  tone?: KpiTone
  sparkline?: number[]
}

export interface ActivityItem {
  id: string
  text: string
  time: string
  tone?: 'green' | 'orange' | 'red' | 'purple' | 'gray'
}

export interface QuickLink {
  id: string
  label: string
  value: string
  icon?: ReactNode
  onClick?: () => void
}

export interface TeamSlot {
  shown: { id: string; name: string; color?: string }[]
  extra: number
  activeCount: number
  pauseCount: number
  total: number
}

export interface DashboardProps {
  greeting: string
  greetingSub?: string
  kpis: KPI[]
  activity: ActivityItem[]
  trend?: AreaChartPoint[]
  compareTrend?: AreaChartPoint[]
  quickActions?: ReactNode
  nextEvent?: { label: string; time: string }
  fichaje?: { statusLabel: string; time: string; tone: 'green' | 'primary' | 'orange' }
  quickLinks?: QuickLink[]
  teamSlot?: TeamSlot
}

const toneOrder: KpiTone[] = ['primary', 'accent', 'cyan', 'amber']

const toneAccent: Record<KpiTone, string> = {
  primary: colors.kpiTone.primary.base,
  accent:  colors.kpiTone.accent.base,
  cyan:    colors.kpiTone.cyan.base,
  amber:   colors.kpiTone.amber.base,
}

const fichajeToneColor: Record<'green' | 'primary' | 'orange', string> = {
  green: colors.semantic.green, primary: colors.primary.base, orange: colors.semantic.orange,
}

const activityTone: Record<string, string> = {
  green:  colors.semantic.green,
  orange: colors.semantic.orange,
  red:    colors.semantic.red,
  purple: colors.primary.base,
  gray:   colors.text[500],
}

function KpiCard({ kpi, tone }: { kpi: KPI; tone: KpiTone }) {
  const accent = toneAccent[tone]
  const deltaColor = kpi.delta?.tone === 'up' ? colors.semantic.green
    : kpi.delta?.tone === 'down' ? colors.semantic.red
    : colors.text[500]
  const deltaBg = kpi.delta?.tone === 'up' ? 'rgba(16,185,129,.12)'
    : kpi.delta?.tone === 'down' ? 'rgba(239,68,68,.12)'
    : colors.bg[400]

  return (
    <div className="uiv2-kpi-card" style={{
      background: colors.bg[600],
      border: `1px solid ${colors.border.subtle}`,
      borderRadius: radius.lg,
      borderTop: `2px solid ${accent}`,
      padding: '16px 18px',
      display: 'flex', flexDirection: 'column', gap: 10,
      transition: transition(['border-color', 'transform']),
      cursor: 'default',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {kpi.icon && (
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 34, height: 34, borderRadius: radius.sm, flexShrink: 0,
            background: `${accent}18`, color: accent,
          }}>
            {kpi.icon}
          </span>
        )}
        {kpi.delta && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '3px 8px', borderRadius: radius.pill,
            background: deltaBg, color: deltaColor,
            fontSize: 10, fontWeight: 700,
          }}>
            {kpi.delta.tone === 'up' ? '▲' : kpi.delta.tone === 'down' ? '▼' : '—'} {kpi.delta.text}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 500, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px' }}>{kpi.label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.8px', color: colors.text[900], fontVariantNumeric: 'tabular-nums', marginTop: 3, lineHeight: 1 }}>{kpi.value}</div>
      </div>
      {kpi.sparkline && (
        <AreaChart compact data={kpi.sparkline.map((v, j) => ({ label: String(j), value: v }))} height={30} color={accent} />
      )}
    </div>
  )
}

export function Dashboard({
  greeting, greetingSub, kpis, activity, trend, compareTrend, quickActions,
  nextEvent, fichaje, quickLinks, teamSlot,
}: DashboardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1100 }}>

      {/* ── Header ───────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <PageTitle>{greeting}</PageTitle>
          {greetingSub && <div style={{ fontSize: 13, color: colors.text[500], marginTop: 4 }}>{greetingSub}</div>}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <button style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
            borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
            background: colors.bg[600], color: colors.text[900], fontSize: 13,
            fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Esta semana <IconChevronDown width={13} height={13} />
          </button>
          <Button size="md" icon={<IconDownload width={15} height={15} />}>Exportar</Button>
          {quickActions}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 14 }} className="uiv2-kpi-row">
        {kpis.map((kpi, i) => (
          <KpiCard key={kpi.label} kpi={kpi} tone={kpi.tone ?? toneOrder[i % toneOrder.length]} />
        ))}
      </div>

      {/* ── Trend + widgets ──────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.65fr 1fr', gap: 14 }} className="uiv2-mid-row">
        {trend && trend.length > 0 && (
          <div style={{
            background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.lg, padding: '20px 22px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 660, color: colors.text[900] }}>Horas trabajadas</div>
                <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>Comparativa semanal</div>
              </div>
              {compareTrend && (
                <div style={{ display: 'flex', gap: 12 }}>
                  {[{ label: 'Esta semana', color: colors.primary.base }, { label: 'Semana pasada', color: colors.border.default }].map(l => (
                    <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: colors.text[500] }}>
                      <div style={{ width: 20, height: 2, borderRadius: 1, background: l.color }} />
                      {l.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <AreaChart data={trend} compareData={compareTrend} height={148} color={colors.primary.base} />
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Fichaje en vivo */}
          {fichaje && (
            <div style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.lg, padding: '16px 18px',
              borderLeft: `3px solid ${fichajeToneColor[fichaje.tone]}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span className={fichaje.tone === 'green' ? 'uiv2-live-dot-dash' : ''} style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: fichajeToneColor[fichaje.tone], flexShrink: 0,
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: fichajeToneColor[fichaje.tone], textTransform: 'uppercase', letterSpacing: '.4px' }}>
                  {fichaje.statusLabel}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                <IconClock width={13} height={13} color={colors.text[500]} />
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums', letterSpacing: '-1px' }}>{fichaje.time}</div>
              </div>
            </div>
          )}

          {/* Próximo evento */}
          {nextEvent && (
            <div style={{
              background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.lg, padding: '16px 18px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <IconCalendar width={13} height={13} color={colors.text[500]} />
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px' }}>Próximo evento</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 660, color: colors.text[900] }}>{nextEvent.label}</div>
              <div style={{ fontSize: 11.5, color: colors.text[500], marginTop: 4 }}>{nextEvent.time}</div>
            </div>
          )}

          {/* Empleados activos */}
          <div style={{
            background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.lg, padding: '16px 18px', flex: 1,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconUsers width={13} height={13} color={colors.text[500]} />
                <div style={{ fontSize: 11, fontWeight: 600, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px' }}>Equipo hoy</div>
              </div>
              {teamSlot && (
                <div style={{ fontSize: 18, fontWeight: 800, color: colors.semantic.green, letterSpacing: '-1px' }}>
                  {teamSlot.activeCount}<span style={{ fontSize: 11, fontWeight: 500, color: colors.text[500] }}>/{teamSlot.total}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex' }}>
              {(teamSlot?.shown ?? []).map((emp, i) => {
                const initials = emp.name.split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase()
                return (
                  <div key={emp.id} title={emp.name} style={{
                    width: 30, height: 30, borderRadius: '50%', marginLeft: i > 0 ? -9 : 0,
                    background: emp.color || colors.avatarPalette[i % colors.avatarPalette.length],
                    border: `2px solid ${colors.bg[600]}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9.5, fontWeight: 700, color: '#fff',
                    zIndex: 10 - i, position: 'relative',
                  }}>{initials}</div>
                )
              })}
              {teamSlot && teamSlot.extra > 0 && (
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', marginLeft: -9,
                  background: colors.bg[400], border: `2px solid ${colors.bg[600]}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 700, color: colors.text[500],
                }}>+{teamSlot.extra}</div>
              )}
            </div>
            <div style={{ fontSize: 11, color: colors.text[500], marginTop: 8 }}>
              {teamSlot ? (
                <>
                  <span style={{ color: colors.semantic.green, fontWeight: 700 }}>{teamSlot.activeCount} activos</span>
                  {teamSlot.pauseCount > 0 && <> · <span style={{ color: colors.semantic.orange }}>{teamSlot.pauseCount} en pausa</span></>}
                  {teamSlot.total - teamSlot.activeCount - teamSlot.pauseCount > 0 && (
                    <> · {teamSlot.total - teamSlot.activeCount - teamSlot.pauseCount} sin fichar</>
                  )}
                </>
              ) : (
                <span>Sin datos de equipo</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Actividad reciente ─────────────────────────────────────── */}
      <div style={{
        background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.lg, padding: '18px 20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 660, color: colors.text[900] }}>Actividad reciente</div>
          <button style={{ fontSize: 11, color: colors.primary.light, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>
            Ver todo →
          </button>
        </div>
        {!activity.length ? (
          <div style={{ padding: '20px 0', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>Sin actividad todavía</div>
        ) : (
          <div style={{ position: 'relative', paddingLeft: 20 }}>
            <div style={{ position: 'absolute', left: 6, top: 6, bottom: 6, width: 1, background: colors.border.subtle }} />
            {activity.map(item => {
              const dot = activityTone[item.tone ?? 'gray']
              return (
                <div key={item.id} className="uiv2-activity-row" style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '7px 6px',
                  borderRadius: radius.xs, transition: transition(['background']), position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', left: -14, width: 8, height: 8, borderRadius: '50%',
                    background: dot, boxShadow: `0 0 5px ${dot}70`,
                    border: `2px solid ${colors.bg[600]}`,
                  }} />
                  <span style={{ flex: 1, fontSize: 12.5, color: colors.text[900] }}>{item.text}</span>
                  <span style={{
                    fontSize: 10.5, color: colors.text[500], fontVariantNumeric: 'tabular-nums',
                    background: colors.bg[500], padding: '2px 7px', borderRadius: radius.xs,
                    border: `1px solid ${colors.border.subtle}`, flexShrink: 0,
                  }}>{item.time}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Quick links ───────────────────────────────────────────── */}
      {quickLinks && quickLinks.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${quickLinks.length}, 1fr)`, gap: 12 }} className="uiv2-quicklinks">
          {quickLinks.map(q => (
            <button key={q.id} onClick={q.onClick} className="uiv2-quicklink" style={{
              background: colors.bg[600],
              border: `1px solid ${colors.border.subtle}`,
              borderRadius: radius.lg,
              padding: '16px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
              transition: transition(['border-color', 'background']),
            }}>
              <div>
                <div style={{ fontSize: 22, fontWeight: 700, color: colors.text[900], letterSpacing: '-.5px', fontVariantNumeric: 'tabular-nums' }}>{q.value}</div>
                <div style={{ fontSize: 11.5, color: colors.text[500], marginTop: 3 }}>{q.label}</div>
              </div>
              <div style={{
                width: 28, height: 28, borderRadius: radius.sm,
                background: colors.primary.dim, color: colors.primary.light,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <IconArrowRight width={13} height={13} />
              </div>
            </button>
          ))}
        </div>
      )}

      <style>{`
        .uiv2-kpi-card:hover { border-color: rgba(255,255,255,.1) !important; transform: translateY(-1px); }
        .uiv2-activity-row:hover { background: rgba(255,255,255,.03); }
        .uiv2-quicklink:hover { border-color: ${colors.border.strong} !important; background: ${colors.bg[500]} !important; }
        @keyframes uiv2BlinkDot { 0%,100%{opacity:1;}50%{opacity:.25;} }
        .uiv2-live-dot-dash { animation: uiv2BlinkDot 1.6s ease-in-out infinite; }
        @media (max-width: 900px) {
          .uiv2-kpi-row { grid-template-columns: 1fr 1fr !important; }
          .uiv2-mid-row, .uiv2-quicklinks { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
