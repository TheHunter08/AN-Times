import { AreaChart } from '../components/AreaChart.js'
import { DonutChart } from '../components/DonutChart.js'
import type { DonutSlice } from '../components/DonutChart.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { transition } from '../design-system/animations.js'
import { shadows } from '../design-system/shadows.js'

export interface StatKpi {
  label: string
  value: string
  delta?: string
  deltaTone?: 'up' | 'down' | 'flat'
  tone?: 'primary' | 'accent' | 'cyan' | 'amber'
}

export interface StatsBar {
  label: string
  value: number // 0-100
  tone?: 'primary' | 'green' | 'orange'
}

export interface StatsProps {
  title: string
  kpis?: StatKpi[]
  bars: StatsBar[]
  centrosBars?: StatsBar[]
  comparison?: { label: string; value: string; deltaTone: 'up' | 'down' }[]
  donut?: { slices: DonutSlice[]; centerValue: string; centerLabel: string }
}

type KpiTone = 'primary' | 'accent' | 'cyan' | 'amber'
const toneOrder: KpiTone[] = ['primary', 'accent', 'cyan', 'amber']

const darkPanel: React.CSSProperties = {
  background: colors.bg[600],
  border: `1px solid ${colors.border.subtle}`,
  borderRadius: radius.lg,
  boxShadow: shadows.sm,
}

function KpiChip({ tone, arrow }: { tone: KpiTone; arrow: 'up' | 'down' | 'flat' }) {
  const t = colors.kpiTone[tone]
  const arrow_txt = arrow === 'up' ? '▲' : arrow === 'down' ? '▼' : '—'
  const arrowColor = arrow === 'up' ? colors.semantic.green : arrow === 'down' ? colors.semantic.red : colors.text[500]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 9px', borderRadius: radius.pill, background: t.dim, fontSize: 11, fontWeight: 700, color: arrowColor }}>
      <span>{arrow_txt}</span>
    </div>
  )
}

export function Stats({ title, kpis, bars, centrosBars, comparison, donut }: StatsProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
      <PageTitle>{title}</PageTitle>

      {/* Tarjetas KPI — mismo patrón que Dashboard para consistencia visual */}
      {(kpis && kpis.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14 }} className="uiv2-stats-kpi-row">
          {kpis.map((kpi, i) => {
            const tone: KpiTone = kpi.tone ?? toneOrder[i % toneOrder.length]
            const t = colors.kpiTone[tone]
            const deltaColor = kpi.deltaTone === 'up' ? colors.semantic.green : kpi.deltaTone === 'down' ? colors.semantic.red : colors.text[500]
            return (
              <div key={kpi.label} style={{ ...darkPanel, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.base, boxShadow: `0 0 8px ${t.base}` }} />
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: colors.text[500] }}>{kpi.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 640, letterSpacing: '-.5px', color: colors.text[900], fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{kpi.value}</div>
                </div>
                {kpi.delta && (
                  <div style={{ fontSize: 11, fontWeight: 600, color: deltaColor }}>
                    {kpi.deltaTone === 'up' ? '▲' : kpi.deltaTone === 'down' ? '▼' : ''} {kpi.delta}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Gráfico de área + donut en grid */}
      <div style={{ display: 'grid', gridTemplateColumns: donut ? '1.6fr 1fr' : '1fr', gap: 16 }} className="uiv2-stats-mid">
        <div style={{ ...darkPanel, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], marginBottom: 12 }}>Comparativa semanal</div>
          <AreaChart data={bars} height={180} color={colors.primary.base} />
        </div>
        {donut && (
          <div style={{ ...darkPanel, padding: '18px 20px' }}>
            <div style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], marginBottom: 12 }}>Distribución por departamento</div>
            <DonutChart slices={donut.slices} centerValue={donut.centerValue} centerLabel={donut.centerLabel} />
          </div>
        )}
      </div>

      {/* Horas por centro de trabajo */}
      {centrosBars && centrosBars.length > 0 && (
        <div style={{ ...darkPanel, padding: '18px 20px' }}>
          <div style={{ fontSize: 13, fontWeight: 640, color: colors.text[900], marginBottom: 16 }}>Horas por centro de trabajo</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {centrosBars.map(bar => (
              <div key={bar.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 11.5, fontWeight: 600, color: colors.text[700] }}>{bar.label}</span>
                  <span style={{ fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{bar.value}h</span>
                </div>
                <div style={{ height: 6, borderRadius: radius.pill, background: colors.bg[400], overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: radius.pill,
                    width: `${Math.min(100, bar.value > 0 ? Math.round(bar.value / (centrosBars[0]?.value || 1) * 100) : 0)}%`,
                    background: `linear-gradient(90deg, ${colors.primary.base}, ${colors.accent.base})`,
                    transition: 'width .6s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Comparativa numérica — tarjetas neutras con acento de color en dot, no borderTop */}
      {comparison && comparison.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
          {comparison.map((c, i) => {
            const tone: KpiTone = toneOrder[i % toneOrder.length]
            const t = colors.kpiTone[tone]
            const accentColor = c.deltaTone === 'up' ? colors.semantic.green : colors.semantic.red
            return (
              <div
                key={c.label}
                className="uiv2-stat-kpi"
                style={{ ...darkPanel, padding: '16px 18px', transition: transition(['border-color', 'transform']) }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', color: colors.text[500] }}>{c.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: radius.pill, background: c.deltaTone === 'up' ? 'rgba(16,185,129,.14)' : 'rgba(239,68,68,.14)', fontSize: 10.5, fontWeight: 700, color: accentColor }}>
                    {c.deltaTone === 'up' ? '↑' : '↓'}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-.8px', color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{c.value}</span>
                </div>
                <div style={{ marginTop: 8, height: 2, borderRadius: radius.pill, background: t.dim }}>
                  <div style={{ height: '100%', width: '60%', borderRadius: radius.pill, background: t.base, opacity: .7 }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      <style>{`
        .uiv2-stat-kpi:hover { transform: translateY(-1px); border-color: ${colors.border.default} !important; }
        @media (max-width: 900px) {
          .uiv2-stats-kpi-row { grid-template-columns: 1fr 1fr !important; }
          .uiv2-stats-mid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
