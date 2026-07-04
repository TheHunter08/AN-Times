import type { ReactNode } from 'react'
import { Card } from '../components/Card.js'
import { Badge } from '../components/Badge.js'
import { Avatar } from '../components/Avatar.js'
import { AreaChart } from '../components/AreaChart.js'
import type { AreaChartPoint } from '../components/AreaChart.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export type KpiTone = 'primary' | 'accent' | 'cyan' | 'amber'

export interface KPI {
  label: string
  value: string
  delta?: { text: string; tone: 'up' | 'down' | 'flat' }
  icon?: ReactNode
  tone?: KpiTone
}

export interface ActivityItem {
  id: string
  text: string
  time: string
  tone?: 'green' | 'orange' | 'red' | 'purple' | 'gray'
}

export interface TeamMember {
  id: string
  name: string
  status: 'active' | 'break' | 'off'
  detail: string
}

export interface DashboardProps {
  greeting: string
  kpis: KPI[]
  activity: ActivityItem[]
  team?: TeamMember[]
  trend?: AreaChartPoint[]
  quickActions?: ReactNode
}

const deltaColor = { up: colors.semantic.green, down: colors.semantic.red, flat: colors.text[500] }
const kpiAccent: Record<KpiTone, string> = {
  primary: colors.primary.base,
  accent: colors.accent.base,
  cyan: '#0EA5E9',
  amber: colors.semantic.orange,
}
const KPI_TONE_ROTATION: KpiTone[] = ['primary', 'accent', 'cyan', 'amber']
const statusColor: Record<TeamMember['status'], string> = {
  active: colors.semantic.green,
  break: colors.semantic.orange,
  off: colors.text[300],
}
const statusLabel: Record<TeamMember['status'], string> = { active: 'Activo', break: 'En pausa', off: 'Fuera' }

function KpiCard({ kpi, tone }: { kpi: KPI; tone: KpiTone }) {
  const accent = kpiAccent[tone]
  return (
    <div
      className="uiv2-kpi-card"
      style={{
        position: 'relative',
        overflow: 'hidden',
        background: `linear-gradient(160deg, ${colors.bg[500]} 0%, ${colors.bg[600]} 65%)`,
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius['2xl'],
        padding: 20,
        transition: transition(['transform', 'box-shadow', 'border-color']),
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
      <div style={{ position: 'absolute', top: -30, right: -30, width: 90, height: 90, borderRadius: '50%', background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`, pointerEvents: 'none' }} />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, position: 'relative' }}>
        <div style={{ width: 30, height: 30, borderRadius: radius.sm, background: `${accent}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent, fontSize: 14 }}>
          {kpi.icon ?? '◆'}
        </div>
        {kpi.delta && <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor[kpi.delta.tone] }}>{kpi.delta.text}</span>}
      </div>
      <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-1.4px', color: colors.text[900], fontVariantNumeric: 'tabular-nums', position: 'relative' }}>{kpi.value}</div>
      <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginTop: 5, position: 'relative' }}>{kpi.label}</div>
    </div>
  )
}

// Centro de control real: columna principal con tendencia + KPIs, columna
// lateral con el pulso del equipo en vivo y la actividad reciente — dos
// densidades de información en paralelo, no una sola lista plana.
export function Dashboard({ greeting, kpis, activity, team, trend, quickActions }: DashboardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22, maxWidth: 1200 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <PageTitle>{greeting}</PageTitle>
        {quickActions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{quickActions}</div>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(240px, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* Columna principal */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
            {kpis.map((kpi, i) => (
              <KpiCard key={kpi.label} kpi={kpi} tone={kpi.tone ?? KPI_TONE_ROTATION[i % KPI_TONE_ROTATION.length]} />
            ))}
          </div>

          {trend && trend.length > 0 && (
            <Card title="Tendencia semanal">
              <AreaChart data={trend} height={170} color={colors.primary.base} />
            </Card>
          )}

          <Card title="Actividad reciente">
            {!activity.length ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>Sin actividad todavía</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {activity.map(item => (
                  <div key={item.id} className="uiv2-activity-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 8px', borderRadius: radius.sm, transition: transition(['background']) }}>
                    <Badge tone={item.tone ?? 'gray'} style={{ width: 6, height: 6, padding: 0, borderRadius: '50%', flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, color: colors.text[900] }}>{item.text}</span>
                    <span style={{ fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{item.time}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Columna lateral: pulso del equipo */}
        {team && (
          <Card title="Equipo en vivo" padding={5}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {team.map(m => (
                <div key={m.id} className="uiv2-team-row" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 6px', borderRadius: radius.sm, transition: transition(['background']) }}>
                  <div style={{ position: 'relative' }}>
                    <Avatar name={m.name} size={30} />
                    <span style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: statusColor[m.status], border: `2px solid ${colors.bg[600]}` }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</div>
                    <div style={{ fontSize: 10.5, color: colors.text[500] }}>{m.detail}</div>
                  </div>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: statusColor[m.status], textTransform: 'uppercase', letterSpacing: '.4px' }}>{statusLabel[m.status]}</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <style>{`
        .uiv2-kpi-card:hover { transform: translateY(-2px); border-color: ${colors.border.default}; }
        .uiv2-activity-row:hover, .uiv2-team-row:hover { background: rgba(255,255,255,.03); }
      `}</style>
    </div>
  )
}
