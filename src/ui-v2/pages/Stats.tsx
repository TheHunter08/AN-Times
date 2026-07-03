import { Card } from '../components/Card.js'
import { colors } from '../design-system/colors.js'
import { typeScale } from '../design-system/typography.js'

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

const toneColor = { primary: colors.primary.base, green: colors.semantic.green, orange: colors.semantic.orange }

export function Stats({ title, bars, comparison }: StatsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <div style={{ fontSize: typeScale.h1.size, fontWeight: typeScale.h1.weight, letterSpacing: typeScale.h1.tracking }}>{title}</div>

      <Card title="Comparativa semanal">
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 12, height: 160, paddingTop: 12 }}>
          {bars.map(b => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '100%', flex: 1, display: 'flex', alignItems: 'flex-end' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${Math.max(6, b.value)}%`,
                    borderRadius: '8px 8px 3px 3px',
                    background: `linear-gradient(180deg, ${toneColor[b.tone ?? 'primary']} 0%, transparent 140%)`,
                  }}
                />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: colors.text[500] }}>{b.label}</span>
            </div>
          ))}
        </div>
      </Card>

      {comparison && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {comparison.map(c => (
            <Card key={c.label} padding={4}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginBottom: 6 }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 22, fontWeight: 800 }}>{c.value}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: c.deltaTone === 'up' ? colors.semantic.green : colors.semantic.red }}>
                  {c.deltaTone === 'up' ? '↑' : '↓'}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
