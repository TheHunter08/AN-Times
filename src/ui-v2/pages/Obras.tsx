import { useState } from 'react'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconMapPin, IconUsers, IconClock, IconPlus, IconBuilding } from '../components/Icons.js'
import { ProductState } from '../components/ProductState.js'

export interface ObraItem {
  id: string
  name: string
  address: string
  status: 'activa' | 'completada'
  employeeCount: number
  hoursToday: string
  manager: string
  startDate: string
}

export interface ObrasProps {
  items: ObraItem[]
  onAdd?: () => void
}

const statusTone: Record<ObraItem['status'], 'green' | 'orange' | 'gray'> = {
  activa: 'green', completada: 'gray',
}
const statusLabel: Record<ObraItem['status'], string> = {
  activa: 'Activa', completada: 'Completada',
}

export function Obras({ items, onAdd }: ObrasProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ObraItem['status'] | 'all'>('all')

  const filtered = items
    .filter(o => (filter === 'all' || o.status === filter))
    .filter(o => (o.name + o.address + o.manager).toLowerCase().includes(search.toLowerCase()))

  const counts = {
    activa: items.filter(o => o.status === 'activa').length,
    completada: items.filter(o => o.status === 'completada').length,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 1000 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Obras</PageTitle>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Search placeholder="Buscar obra o encargado…" value={search} onChange={e => setSearch(e.target.value)} />
          <Button size="md" icon={<IconPlus width={15} height={15} />} onClick={onAdd}>Nueva obra</Button>
        </div>
      </div>

      {/* Status filter chips */}
      <div style={{ display: 'flex', gap: 6 }}>
        {(['all', 'activa', 'completada'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 13px', borderRadius: radius.pill, border: `1px solid ${filter === f ? colors.primary.base : colors.border.subtle}`,
            background: filter === f ? colors.primary.dim : 'transparent',
            color: filter === f ? colors.primary.light : colors.text[500],
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {f === 'all' ? `Todas (${items.length})` : `${statusLabel[f as ObraItem['status']]} (${counts[f as ObraItem['status']]})`}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {filtered.map(obra => (
          <div key={obra.id} style={{ borderRadius: radius.lg, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Header strip */}
            <div style={{ height: 4, background: obra.status === 'activa' ? colors.semantic.green : colors.text[300] }} />

            <div style={{ padding: '16px 16px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: radius.sm, background: colors.primary.dim, color: colors.primary.light, flexShrink: 0 }}>
                    <IconBuilding width={16} height={16} />
                  </span>
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 700, color: colors.text[900], lineHeight: 1.3 }}>{obra.name}</div>
                    <Badge tone={statusTone[obra.status]}>{statusLabel[obra.status]}</Badge>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: colors.text[500], marginBottom: 12 }}>
                <IconMapPin width={12} height={12} />
                {obra.address}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {[
                  { icon: <IconUsers width={12} height={12} />, label: `${obra.employeeCount} empleados` },
                  { icon: <IconClock width={12} height={12} />, label: `${obra.hoursToday} hoy` },
                ].map((stat, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: radius.sm, background: colors.bg[600], fontSize: 11.5, color: colors.text[700] }}>
                    {stat.icon} {stat.label}
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${colors.border.subtle}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: colors.text[500] }}>Encargado: <span style={{ color: colors.text[700], fontWeight: 600 }}>{obra.manager}</span></span>
                <span style={{ fontSize: 11, color: colors.text[300] }}>Desde {obra.startDate}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <ProductState compact title="No encontramos obras" description="Prueba con otra búsqueda o filtro." actionLabel={items.length === 0 ? 'Crear primera obra' : undefined} onAction={items.length === 0 ? onAdd : undefined} />
      )}
    </div>
  )
}
