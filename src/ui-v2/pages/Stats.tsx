import { Card } from '../components/Card.js'
import { AreaChart } from '../components/AreaChart.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { transition } from '../design-system/animations.js'

export interface StatsBar {
  label: string
  value: number // 0-100
  tone?: 'primary' | 'green' | 'orange'
}

export interface StatsProps {
  title: string
  bars: StatsBar[]
  comparison?: { label: string; value: string; deltaTone: 'up' | 'down' }[]
}

export function Stats({ title, bars, comparison }: StatsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <PageTitle>{title}</PageTitle>

      <Card title="Comparativa semanal">
        <AreaChart data={bars} height={190} color={colors.primary.base} />
      </Card>

      {comparison && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {comparison.map(c => (
            <div
              key={c.label}
              className="uiv2-stat-kpi"
              style={{
                background: `linear-gradient(160deg, ${colors.bg[500]} 0%, ${colors.bg[600]} 70%)`,
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: radius.xl,
                padding: 18,
                transition: transition(['transform', 'border-color']),
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginBottom: 8 }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: '-.6px' }}>{c.value}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.deltaTone === 'up' ? colors.semantic.green : colors.semantic.red }}>
                  {c.deltaTone === 'up' ? '↑' : '↓'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <style>{`.uiv2-stat-kpi:hover { transform: translateY(-2px); border-color: ${colors.border.default}; }`}</style>
    </div>
  )
}
