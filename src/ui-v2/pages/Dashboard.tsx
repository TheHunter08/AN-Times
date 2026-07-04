import type { ReactNode } from 'react'
import { Card } from '../components/Card.js'
import { Badge } from '../components/Badge.js'
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

export interface DashboardProps {
  greeting: string
  kpis: KPI[]
  activity: ActivityItem[]
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

// Centro de control: KPIs primero (lo que se necesita saber de un vistazo),
// luego actividad reciente — jerarquía clara, sin saturar con todo a la vez.
export function Dashboard({ greeting, kpis, activity, quickActions }: DashboardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
      <div>
        <PageTitle>{greeting}</PageTitle>
      </div>

      {quickActions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{quickActions}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14 }}>
        {kpis.map((kpi, i) => {
          const tone = kpi.tone ?? KPI_TONE_ROTATION[i % KPI_TONE_ROTATION.length]
          const accent = kpiAccent[tone]
          return (
            <div
              key={kpi.label}
              style={{
                position: 'relative',
                overflow: 'hidden',
                background: colors.bg[600],
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: radius['2xl'],
                padding: 20,
                transition: transition(['transform', 'box-shadow']),
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <div
                  style={{
                    width: 30, height: 30, borderRadius: radius.sm,
                    background: `${accent}22`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: accent, fontSize: 14,
                  }}
                >
                  {kpi.icon ?? '◆'}
                </div>
                {kpi.delta && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor[kpi.delta.tone] }}>{kpi.delta.text}</span>
                )}
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-1.4px', color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{kpi.value}</div>
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginTop: 5 }}>{kpi.label}</div>
            </div>
          )
        })}
      </div>

      <Card title="Actividad reciente">
        {!activity.length ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>Sin actividad todavía</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {activity.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 6px', borderRadius: radius.sm, transition: transition(['background']) }}>
                <Badge tone={item.tone ?? 'gray'} style={{ width: 6, height: 6, padding: 0, borderRadius: '50%', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: colors.text[900] }}>{item.text}</span>
                <span style={{ fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
