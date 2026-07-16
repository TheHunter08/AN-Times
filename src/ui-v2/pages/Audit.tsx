import { useState } from 'react'
import { PageTitle } from '../components/PageTitle.js'
import { Button } from '../components/Button.js'
import { Search } from '../components/Search.js'
import { ProductState } from '../components/ProductState.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconShield, IconDownload, IconClock, IconUsers, IconFileText, IconMapPin, IconSettings } from '../components/Icons.js'

export interface AuditEntry {
  id: string
  action: string
  category: 'jornada' | 'empleado' | 'obra' | 'documento' | 'solicitud' | 'sistema' | 'seguridad'
  user: string
  detail: string
  ts: string
}

export interface AuditProps {
  entries: AuditEntry[]
  onExport?: () => void
}

const catIcon: Record<AuditEntry['category'], React.ReactNode> = {
  jornada:   <IconClock width={14} height={14} />,
  empleado:  <IconUsers width={14} height={14} />,
  obra:      <IconMapPin width={14} height={14} />,
  documento: <IconFileText width={14} height={14} />,
  solicitud: <IconFileText width={14} height={14} />,
  sistema:   <IconSettings width={14} height={14} />,
  seguridad: <IconShield width={14} height={14} />,
}

const catStyle: Record<AuditEntry['category'], { bg: string; color: string }> = {
  jornada:   { bg: 'rgba(16,185,129,.15)',  color: colors.semantic.green },
  empleado:  { bg: colors.primary.dim,      color: colors.primary.light },
  obra:      { bg: colors.secondary.dim,    color: colors.secondary.base },
  documento: { bg: 'rgba(245,158,11,.15)',   color: colors.semantic.orange },
  solicitud: { bg: colors.accent.dim,       color: colors.accent.base },
  sistema:   { bg: 'rgba(148,163,184,.12)', color: colors.text[700] },
  seguridad: { bg: 'rgba(239,68,68,.14)',   color: colors.semantic.red },
}

export function Audit({ entries, onExport }: AuditProps) {
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<AuditEntry['category'] | 'all'>('all')

  const filtered = entries
    .filter(e => catFilter === 'all' || e.category === catFilter)
    .filter(e => (e.action + e.user + e.detail).toLowerCase().includes(search.toLowerCase()))

  const cats = ['all', 'jornada', 'empleado', 'obra', 'documento', 'solicitud', 'sistema', 'seguridad'] as const
  const catLabels: Record<string, string> = {
    all: 'Todo', jornada: 'Jornada', empleado: 'Empleado', obra: 'Obra',
    documento: 'Documento', solicitud: 'Solicitud', sistema: 'Sistema', seguridad: 'Seguridad',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 860 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <PageTitle>Auditoría</PageTitle>
          <span style={{ fontSize: 11.5, color: colors.text[500], padding: '3px 10px', borderRadius: radius.pill, background: colors.bg[500], border: `1px solid ${colors.border.subtle}` }}>
            {entries.length} registros
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Search placeholder="Buscar acción, usuario…" value={search} onChange={e => setSearch(e.target.value)} />
          <Button size="sm" variant="ghost" icon={<IconDownload width={13} height={13} />} onClick={onExport}>Exportar CSV</Button>
        </div>
      </div>

      {/* Category chips */}
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {cats.map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            padding: '4px 11px', borderRadius: radius.pill,
            border: `1px solid ${catFilter === c ? (c === 'all' ? colors.primary.base : catStyle[c as AuditEntry['category']]?.color ?? colors.primary.base) : colors.border.subtle}`,
            background: catFilter === c ? (c === 'all' ? colors.primary.dim : (catStyle[c as AuditEntry['category']]?.bg ?? colors.primary.dim)) : 'transparent',
            color: catFilter === c ? (c === 'all' ? colors.primary.light : (catStyle[c as AuditEntry['category']]?.color ?? colors.primary.light)) : colors.text[500],
            fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {catLabels[c]}
          </button>
        ))}
      </div>

      {/* Timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, position: 'relative' }}>
        {filtered.length === 0 && (
          <ProductState
            compact
            title={entries.length ? 'No encontramos registros' : 'Aún no hay actividad de auditoría'}
            description={entries.length ? 'Prueba con otra búsqueda o categoría.' : 'Las acciones importantes del equipo aparecerán aquí automáticamente.'}
            icon={<IconShield />}
          />
        )}
        {filtered.map((entry, i) => {
          const s = catStyle[entry.category]
          return (
            <div key={entry.id} style={{ display: 'flex', gap: 14, padding: '10px 0', position: 'relative' }}>
              {/* Timeline line */}
              {i < filtered.length - 1 && (
                <div style={{ position: 'absolute', left: 16, top: 44, bottom: 0, width: 1, background: colors.border.subtle }} />
              )}
              {/* Icon */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: s.bg, color: s.color, flexShrink: 0, zIndex: 1 }}>
                {catIcon[entry.category]}
              </div>
              {/* Content */}
              <div style={{ flex: 1, paddingBottom: 12, borderBottom: i < filtered.length - 1 ? `1px solid ${colors.border.subtle}` : 'none' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{entry.action}</span>
                  <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: radius.pill, background: s.bg, color: s.color, fontWeight: 700 }}>{catLabels[entry.category]}</span>
                </div>
                <div style={{ fontSize: 12, color: colors.text[500], marginTop: 3 }}>
                  {entry.detail}
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 5, fontSize: 11, color: colors.text[300] }}>
                  <span>👤 {entry.user}</span>
                  <span>·</span>
                  <span>{entry.ts}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
