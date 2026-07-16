import { useEffect, useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Card } from '../components/Card.js'
import { PageTitle } from '../components/PageTitle.js'
import { ProductState } from '../components/ProductState.js'
import { IconClock, IconMapPin, IconUsers } from '../components/Icons.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'

export interface OnlineTeamRow {
  id: string
  employeeId: string
  name: string
  location: string
  startedAt: string
  onBreak: boolean
  isSelf?: boolean
}

function elapsed(startedAt: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${hours}h ${String(minutes).padStart(2, '0')}m`
}

export function OnlineTeam({ rows, hasScope, onFinishShift, recentClose, onUndoClose, missingCount = 0, onRemindMissing, onFinishMany, onOpenEmployee }: { rows: OnlineTeamRow[]; hasScope: boolean; onFinishShift?: (row: OnlineTeamRow) => void; recentClose?: { name: string; reason: string } | null; onUndoClose?: () => void; missingCount?: number; onRemindMissing?: () => void; onFinishMany?: (rows: OnlineTeamRow[]) => void; onOpenEmployee?: (row: OnlineTeamRow) => void }) {
  const [now, setNow] = useState(Date.now())
  const [search, setSearch] = useState('')
  const [location, setLocation] = useState('all')
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])

  const locations = [...new Set(rows.map(row => row.location).filter(Boolean))].sort()
  const visibleRows = rows.filter(row =>
    (location === 'all' || row.location === location) &&
    `${row.name} ${row.location}`.toLocaleLowerCase('es').includes(search.trim().toLocaleLowerCase('es'))
  )
  // Sobre visibleRows, no rows: si se filtra por obra/búsqueda, los KPI deben
  // reflejar el subconjunto visible, no el total global (confuso — parecía
  // que el filtro no funcionaba).
  const working = visibleRows.filter(row => !row.onBreak).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <PageTitle>Equipo en línea</PageTitle>
        <p style={{ margin: '6px 0 0', color: colors.text[500], fontSize: 13 }}>Fichajes activos de tu misma obra y centro de trabajo, actualizados en tiempo real.</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
        <Card padding={4} style={{ minHeight: 86 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.semantic.green }}><IconUsers width={18} height={18} /><strong style={{ fontSize: 24 }}>{visibleRows.length}</strong></div>
          <div style={{ marginTop: 7, fontSize: 12, color: colors.text[500] }}>Fichajes activos</div>
        </Card>
        <Card padding={4} style={{ minHeight: 86 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: colors.primary.base }}><IconClock width={18} height={18} /><strong style={{ fontSize: 24 }}>{working}</strong></div>
          <div style={{ marginTop: 7, fontSize: 12, color: colors.text[500] }}>Trabajando ahora</div>
        </Card>
      </div>

      {recentClose && (
        <Card style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, padding: '12px 16px', borderColor: 'rgba(245,158,11,.32)' }}>
          <div>
            <strong style={{ color: colors.text[900], fontSize: 13 }}>Jornada de {recentClose.name} finalizada</strong>
            <div style={{ color: colors.text[500], fontSize: 11.5, marginTop: 3 }}>Motivo: {recentClose.reason}</div>
          </div>
          {onUndoClose && <button type="button" onClick={onUndoClose} style={{ border: `1px solid ${colors.border.default}`, background: colors.bg[500], color: colors.text[700], borderRadius: radius.sm, padding: '7px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Deshacer</button>}
        </Card>
      )}

      {rows.length > 0 && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar empleado…" aria-label="Buscar empleado" style={{ flex: '1 1 220px', minHeight: 38, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], padding: '7px 11px', fontFamily: 'inherit' }} />
          <select value={location} onChange={event => setLocation(event.target.value)} aria-label="Filtrar por obra o centro de trabajo" style={{ minHeight: 38, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: colors.bg[600], color: colors.text[900], padding: '7px 11px', fontFamily: 'inherit' }}>
            <option value="all">Todas las obras y centros</option>
            {locations.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          {visibleRows.length > 1 && onFinishMany && <button onClick={() => onFinishMany(visibleRows)} style={{ minHeight:38, padding:'7px 11px', borderRadius:radius.sm, border:'1px solid rgba(239,68,68,.3)', background:'rgba(239,68,68,.1)', color:colors.semantic.red, fontWeight:700, cursor:'pointer' }}>Finalizar visibles ({visibleRows.length})</button>}
          {missingCount > 0 && onRemindMissing && <button onClick={onRemindMissing} style={{ minHeight:38, padding:'7px 11px', borderRadius:radius.sm, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:700, cursor:'pointer' }}>Recordar fichaje ({missingCount})</button>}
        </div>
      )}

      {!hasScope ? (
        <ProductState compact title="Falta asignar tu obra o centro" description="Un administrador debe completar tus asignaciones para mostrarte el equipo correcto." icon={<IconMapPin />} />
      ) : rows.length === 0 ? (
        <ProductState compact title="Nadie ha fichado todavía" description="No hay jornadas abiertas en tu misma obra o centro." icon={<IconUsers />} />
      ) : visibleRows.length === 0 ? (
        <ProductState compact title="No encontramos fichajes" description="Prueba con otro nombre o selecciona todas las obras y centros." icon={<IconUsers />} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 12 }}>
          {visibleRows.map(row => (
            <Card key={row.id} padding={4} role="button" tabIndex={0} onClick={() => onOpenEmployee?.(row)} onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && onOpenEmployee) { event.preventDefault(); onOpenEmployee(row) } }} aria-label={`${row.name}, ${row.onBreak ? 'en pausa' : 'trabajando'}. Abrir fichajes`} style={{ minHeight: 128, cursor:onOpenEmployee?'pointer':'default', transition:'transform .15s ease,border-color .15s ease' }} className="uiv2-online-employee-card">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <Avatar name={row.name} size={42} status="online" />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: colors.text[900], fontSize: 14 }}>{row.name}</strong>
                    {row.isSelf && <span style={{ fontSize: 10, color: colors.primary.base, background: colors.primary.dim, padding: '2px 6px', borderRadius: radius.pill }}>Tú</span>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: colors.text[500], fontSize: 12, marginTop: 4 }}><IconMapPin width={13} height={13} />{row.location}</div>
                </div>
                <span style={{ whiteSpace: 'nowrap', fontSize: 10.5, fontWeight: 750, color: row.onBreak ? colors.semantic.orange : colors.semantic.green, background: row.onBreak ? 'rgba(245,158,11,.12)' : 'rgba(16,185,129,.12)', padding: '5px 8px', borderRadius: radius.pill }}>{row.onBreak ? 'En pausa' : 'Trabajando'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 18, paddingTop: 12, borderTop: `1px solid ${colors.border.subtle}`, fontSize: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flex: '1 1 170px' }}>
                  <span style={{ color: colors.text[500] }}>Entrada <strong style={{ color: colors.text[700] }}>{new Date(row.startedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</strong></span>
                  <strong style={{ color: colors.text[700] }}>{elapsed(row.startedAt, now)}</strong>
                </div>
                {onFinishShift && (
                  <button
                    type="button"
                    onClick={event => { event.stopPropagation(); onFinishShift(row) }}
                    style={{ border: '1px solid rgba(239,68,68,.32)', background: 'rgba(239,68,68,.10)', color: colors.semantic.red, borderRadius: radius.md, padding: '7px 10px', fontSize: 11, fontWeight: 750, cursor: 'pointer', fontFamily: 'inherit' }}
                  >
                    Finalizar jornada
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      <style>{`.uiv2-online-employee-card:hover{transform:translateY(-2px);border-color:${colors.border.default}!important}.uiv2-online-employee-card:focus-visible{outline:2px solid ${colors.primary.base};outline-offset:2px}`}</style>
    </div>
  )
}
