import type { ReactNode } from 'react'
import { Card } from '../components/Card.js'
import { Badge } from '../components/Badge.js'
import { colors } from '../design-system/colors.js'
import { typeScale } from '../design-system/typography.js'

export interface KPI {
  label: string
  value: string
  delta?: { text: string; tone: 'up' | 'down' | 'flat' }
  icon?: ReactNode
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

// Centro de control: KPIs primero (lo que se necesita saber de un vistazo),
// luego actividad reciente — jerarquía clara, sin saturar con todo a la vez.
export function Dashboard({ greeting, kpis, activity, quickActions }: DashboardProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>
      <div>
        <div style={{ fontSize: typeScale.h1.size, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking, color: colors.text[900] }}>
          {greeting}
        </div>
      </div>

      {quickActions && <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{quickActions}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
        {kpis.map(kpi => (
          <Card key={kpi.label} padding={5}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              {kpi.icon}
              {kpi.delta && (
                <span style={{ fontSize: 11, fontWeight: 700, color: deltaColor[kpi.delta.tone] }}>{kpi.delta.text}</span>
              )}
            </div>
            <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: '-1.5px', color: colors.text[900] }}>{kpi.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginTop: 4 }}>{kpi.label}</div>
          </Card>
        ))}
      </div>

      <Card title="Actividad reciente">
        {!activity.length ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>Sin actividad todavía</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {activity.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 4px' }}>
                <Badge tone={item.tone ?? 'gray'} style={{ width: 6, height: 6, padding: 0, borderRadius: '50%' }} />
                <span style={{ flex: 1, fontSize: 13, color: colors.text[900] }}>{item.text}</span>
                <span style={{ fontSize: 11, color: colors.text[500] }}>{item.time}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
