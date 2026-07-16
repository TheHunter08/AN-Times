import { useState } from 'react'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconMapPin, IconUsers, IconClock, IconPlus, IconBuilding, IconX } from '../components/Icons.js'
import { ProductState } from '../components/ProductState.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

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
  onViewEmployees?: () => void
}

const statusTone: Record<ObraItem['status'], 'green' | 'orange' | 'gray'> = {
  activa: 'green', completada: 'gray',
}
const statusLabel: Record<ObraItem['status'], string> = {
  activa: 'Activa', completada: 'Completada',
}

export function Obras({ items, onAdd, onViewEmployees }: ObrasProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ObraItem['status'] | 'all'>('all')
  const [detail, setDetail] = useState<ObraItem | null>(null)
  const detailDialogRef = useDialogA11y(Boolean(detail), () => setDetail(null))

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
          <div
            key={obra.id}
            role="button"
            tabIndex={0}
            aria-label={`Ver detalle de la obra ${obra.name}`}
            onClick={() => setDetail(obra)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(obra) } }}
            style={{ borderRadius: radius.lg, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
          >
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

      {detail && (
        <div onClick={() => setDetail(null)} style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'rgba(0,0,0,.72)' }}>
          <div
            ref={detailDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Detalle de la obra ${detail.name}`}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, padding: 24, borderRadius: radius.xl, border: `1px solid ${colors.border.default}`, background: colors.bg[900], boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 18 }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 42, height: 42, borderRadius: radius.md, background: colors.primary.dim, color: colors.primary.light }}><IconBuilding width={18} height={18} /></span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>{detail.name}</div>
                  <Badge tone={statusTone[detail.status]}>{statusLabel[detail.status]}</Badge>
                </div>
              </div>
              <button type="button" aria-label="Cerrar detalle de la obra" onClick={() => setDetail(null)} style={{ padding: 4, border: 0, background: 'transparent', color: colors.text[500], cursor: 'pointer' }}><IconX width={18} height={18} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 12px', borderRadius: radius.sm, background: colors.bg[700], color: colors.text[700], fontSize: 12 }}>
              <IconMapPin width={14} height={14} /> {detail.address}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {[
                { label: 'Equipo asignado', value: `${detail.employeeCount} empleados`, icon: <IconUsers width={14} height={14} /> },
                { label: 'Jornada de hoy', value: detail.hoursToday, icon: <IconClock width={14} height={14} /> },
              ].map(stat => (
                <div key={stat.label} style={{ padding: '12px 14px', borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`, background: colors.bg[700] }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: colors.text[500], marginBottom: 5 }}>{stat.icon}{stat.label}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: colors.text[900] }}>{stat.value}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 12, color: colors.text[500] }}>
              <div>Encargado: <strong style={{ color: colors.text[700] }}>{detail.manager}</strong></div>
              <div>Fecha de inicio: <strong style={{ color: colors.text[700] }}>{detail.startDate}</strong></div>
            </div>

            {onViewEmployees && (
              <button type="button" onClick={() => { setDetail(null); onViewEmployees() }} style={{ padding: '11px 14px', borderRadius: radius.md, border: 0, background: colors.primary.base, color: '#fff', fontFamily: 'inherit', fontSize: 13, fontWeight: 750, cursor: 'pointer' }}>
                Ver equipo de empleados →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
