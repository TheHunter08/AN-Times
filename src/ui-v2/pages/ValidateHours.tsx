import { useState, useEffect } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { IconCheck, IconX, IconClock, IconAlertCircle } from '../components/Icons.js'

export interface ValidateRow {
  id: string
  empName: string
  dept: string
  date: string
  entry: string
  exit: string
  worked: string
  expected: string
  diff: string
  diffTone: 'ok' | 'over' | 'under'
  status: 'pending' | 'approved' | 'rejected'
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

export interface ValidateHoursProps {
  rows: ValidateRow[]
  weekLabel?: string
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
}

const diffColor = { ok: colors.semantic.green, over: colors.semantic.orange, under: colors.semantic.red }

export function ValidateHours({ rows, weekLabel, onApprove, onReject }: ValidateHoursProps) {
  const [search, setSearch] = useState('')
  const [localRows, setLocalRows] = useState(rows)
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')

  // Sync when real DB data changes
  useEffect(() => { setLocalRows(rows) }, [rows])

  const handleApprove = (id: string) => {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r))
    onApprove?.(id)
  }
  const handleReject = (id: string) => {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
    onReject?.(id)
  }

  const visible = localRows
    .filter(r => tab === 'pending' ? r.status === 'pending' : r.status !== 'pending')
    .filter(r => (r.empName + r.dept + r.date).toLowerCase().includes(search.toLowerCase()))

  const pendingCount = localRows.filter(r => r.status === 'pending').length
  const totalOvertime = localRows.filter(r => r.diffTone === 'over').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Validar horas</PageTitle>
          {weekLabel && <div style={{ fontSize: 12, color: colors.text[500], marginTop: 3 }}>{weekLabel}</div>}
        </div>
        <Search placeholder="Buscar empleado o fecha…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Pendientes de validar', value: String(pendingCount), color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)' },
          { label: 'Con horas extra', value: String(totalOvertime), color: colors.primary.light, bg: colors.primary.dim },
          { label: 'Total registros', value: String(localRows.length), color: colors.text[700], bg: colors.bg[600] },
        ].map((k, i) => (
          <div key={i} style={{ padding: '12px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(255,255,255,.06)` }}>
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: k.color, letterSpacing: '-.5px' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: radius.md, background: colors.bg[600], width: 'fit-content' }}>
        {([['pending', `Pendientes (${pendingCount})`], ['reviewed', 'Validados']] as const).map(([t, l]) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 16px', borderRadius: radius.sm, border: 'none', fontSize: 12.5, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t ? colors.bg[300] : 'transparent',
            color: tab === t ? colors.text[900] : colors.text[500],
          }}>
            {l}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`, overflow: 'hidden', background: colors.bg[700] }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 80px 80px 100px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${colors.border.subtle}` }}>
          {['Empleado', 'Fecha', 'Entrada', 'Salida', 'Trabajado', 'Esperado', 'Diferencia'].map(h => (
            <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500] }}>{h}</div>
          ))}
        </div>

        {visible.length === 0 && (
          <div style={{ padding: '32px', textAlign: 'center', color: colors.text[500], fontSize: 13 }}>
            {tab === 'pending' ? 'No hay registros pendientes de validar' : 'No hay registros validados'}
          </div>
        )}

        {visible.map((row, i) => (
          <div key={row.id} style={{
            display: 'grid', gridTemplateColumns: '1fr 90px 80px 80px 80px 80px 100px', gap: 8,
            padding: '12px 16px', alignItems: 'center',
            borderBottom: i < visible.length - 1 ? `1px solid ${colors.border.subtle}` : 'none',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Avatar name={row.empName} size={28} />
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text[900] }}>{row.empName}</div>
                <div style={{ fontSize: 11, color: colors.text[500] }}>{row.dept}</div>
              </div>
            </div>
            <div style={{ fontSize: 12.5, color: colors.text[700] }}>{row.date}</div>
            <div style={{ fontSize: 12.5, color: colors.text[700], fontVariantNumeric: 'tabular-nums' }}>{row.entry}</div>
            <div style={{ fontSize: 12.5, color: colors.text[700], fontVariantNumeric: 'tabular-nums' }}>{row.exit}</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{row.worked}</div>
            <div style={{ fontSize: 12.5, color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{row.expected}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {tab === 'pending' ? (
                <>
                  <span style={{ fontSize: 12, fontWeight: 700, color: diffColor[row.diffTone], fontVariantNumeric: 'tabular-nums' }}>{row.diff}</span>
                  <button onClick={() => handleApprove(row.id)} title="Aprobar" style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: radius.xs, border: 'none', background: 'rgba(16,185,129,.16)', color: colors.semantic.green, cursor: 'pointer' }}>
                    <IconCheck width={12} height={12} />
                  </button>
                  <button onClick={() => handleReject(row.id)} title="Rechazar" style={{ display: 'flex', alignItems: 'center', padding: 5, borderRadius: radius.xs, border: 'none', background: 'rgba(239,68,68,.14)', color: colors.semantic.red, cursor: 'pointer' }}>
                    <IconX width={12} height={12} />
                  </button>
                </>
              ) : (
                <Badge tone={row.status === 'approved' ? 'green' : 'red'}>{row.status === 'approved' ? 'Aprobado' : 'Rechazado'}</Badge>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
