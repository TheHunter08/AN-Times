import { Card } from '../components/Card.js'
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

const toneColor = { primary: colors.primary.base, green: colors.semantic.green, orange: colors.semantic.orange }

export function Stats({ title, bars, comparison }: StatsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>
      <PageTitle>{title}</PageTitle>

      <Card title="Comparativa semanal">
        <div style={{ display: 'flex', alignItems: 'stretch', gap: 14, height: 170, paddingTop: 20 }}>
          {bars.map(b => (
            <div key={b.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              <div style={{ width: '100%', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', position: 'relative' }}>
                {b.value > 0 && (
                  <span style={{ position: 'absolute', top: `calc(${100 - Math.max(6, b.value)}% - 18px)`, left: '50%', transform: 'translateX(-50%)', fontSize: 10.5, fontWeight: 700, color: colors.text[500], whiteSpace: 'nowrap' }}>
                    {b.value}%
                  </span>
                )}
                <div
                  className="uiv2-stat-bar"
                  style={{
                    width: '100%',
                    height: `${Math.max(6, b.value)}%`,
                    borderRadius: '8px 8px 3px 3px',
                    background: `linear-gradient(180deg, ${toneColor[b.tone ?? 'primary']} 0%, transparent 140%)`,
                    transition: transition(['opacity']),
                  }}
                />
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: colors.text[500] }}>{b.label}</span>
            </div>
          ))}
        </div>
        <style>{`.uiv2-stat-bar:hover { opacity: .8; }`}</style>
      </Card>

      {comparison && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          {comparison.map(c => (
            <div
              key={c.label}
              style={{
                background: colors.bg[600],
                border: `1px solid ${colors.border.subtle}`,
                borderRadius: radius.xl,
                padding: 18,
              }}
            >
              <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500], marginBottom: 8 }}>{c.label}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-.5px' }}>{c.value}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: c.deltaTone === 'up' ? colors.semantic.green : colors.semantic.red }}>
                  {c.deltaTone === 'up' ? '↑' : '↓'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
