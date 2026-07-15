import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { useEffect } from 'react'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconAlertCircle, IconCheck, IconClock } from '../components/Icons.js'

export interface AnomalyItem {
  id: string
  empName: string
  dept: string
  type: 'retraso' | 'ausencia' | 'extra' | 'sin_salida' | 'solapamiento' | 'jornada_larga' | 'sin_descanso' | 'doble_abierto' | 'fuera_zona' | 'cierre_manual'
  description: string
  date: string
  severity: 'alta' | 'media' | 'baja'
  resolved: boolean
  onResolve?: (id: string) => void
}

export interface AnomaliesProps {
  items: AnomalyItem[]
  onResolve?: (id: string) => void
}

const typeLabel: Record<AnomalyItem['type'], string> = {
  retraso: 'Retraso', ausencia: 'Ausencia', extra: 'Horas extra', sin_salida: 'Sin salida', solapamiento: 'Solapamiento',
  jornada_larga: 'Jornada larga', sin_descanso: 'Sin descanso', doble_abierto: 'Doble fichaje', fuera_zona: 'Fuera de zona', cierre_manual: 'Cierre supervisor',
}

const sevStyle: Record<AnomalyItem['severity'], { bg: string; color: string; label: string }> = {
  alta:  { bg: 'rgba(239,68,68,.14)',  color: colors.semantic.red, label: 'Alta' },
  media: { bg: 'rgba(245,158,11,.14)', color: colors.semantic.orange, label: 'Media' },
  baja:  { bg: 'rgba(16,185,129,.14)', color: colors.semantic.green, label: 'Baja' },
}

export function Anomalies({ items, onResolve }: AnomaliesProps) {
  const [search, setSearch] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [localItems, setLocalItems] = useState(items)
  useEffect(() => setLocalItems(items), [items])

  const handleResolve = (id: string) => {
    setLocalItems(prev => prev.map(i => i.id === id ? { ...i, resolved: true } : i))
    onResolve?.(id)
  }

  const filtered = localItems
    .filter(i => showResolved || !i.resolved)
    .filter(i => (i.empName + i.description + typeLabel[i.type]).toLowerCase().includes(search.toLowerCase()))

  const pending = localItems.filter(i => !i.resolved).length
  const highSev = localItems.filter(i => !i.resolved && i.severity === 'alta').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PageTitle>Anomalías</PageTitle>
          {highSev > 0 && (
            <span style={{ padding: '3px 9px', borderRadius: radius.pill, background: 'rgba(239,68,68,.16)', color: colors.semantic.red, fontSize: 11, fontWeight: 700 }}>
              {highSev} alta severidad
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Search placeholder="Buscar anomalía…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Sin resolver', value: String(pending), color: colors.semantic.red, bg: 'rgba(239,68,68,.10)' },
          { label: 'Severidad alta', value: String(highSev), color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)' },
          { label: 'Total detectadas', value: String(localItems.length), color: colors.text[700], bg: colors.bg[600] },
        ].map((k, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)` }}>
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, letterSpacing: '-.5px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', userSelect: 'none', fontSize: 12.5, color: colors.text[500] }}>
        <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} style={{ accentColor: colors.primary.base }} />
        Mostrar resueltas
      </label>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: colors.text[500], fontSize: 13, borderRadius: radius.md, border: `1px dashed ${colors.border.subtle}` }}>
            {showResolved ? 'No hay anomalías' : 'No hay anomalías pendientes — ¡todo en orden!'}
          </div>
        )}
        {filtered.map(item => {
          const sev = sevStyle[item.severity]
          return (
            <div key={item.id} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: radius.md,
              background: item.resolved ? 'transparent' : colors.bg[700],
              border: `1px solid ${item.resolved ? colors.border.subtle : `color-mix(in srgb, ${sev.color} 20%, transparent)`}`,
              opacity: item.resolved ? .55 : 1,
            }}>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: radius.sm, background: sev.bg, color: sev.color, flexShrink: 0 }}>
                <IconAlertCircle width={16} height={16} />
              </span>
              <Avatar name={item.empName} size={30} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{item.empName}</span>
                  <span style={{ fontSize: 10.5, padding: '2px 7px', borderRadius: radius.pill, background: sev.bg, color: sev.color, fontWeight: 700 }}>Severidad {sev.label}</span>
                  <Badge tone="gray">{typeLabel[item.type]}</Badge>
                </div>
                <div style={{ fontSize: 12, color: colors.text[500], marginTop: 3 }}>{item.description}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: colors.text[300] }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IconClock width={10} height={10} />{item.date}</span>
                  <span>·</span>
                  <span>{item.dept}</span>
                </div>
              </div>
              {!item.resolved ? (
                <button onClick={() => handleResolve(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: radius.sm, border: 'none', background: 'rgba(16,185,129,.16)', color: colors.semantic.green, cursor: 'pointer', fontSize: 12, fontWeight: 640, fontFamily: 'inherit', flexShrink: 0 }}>
                  <IconCheck width={13} height={13} /> Resolver
                </button>
              ) : (
                <Badge tone="green">Resuelta</Badge>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
