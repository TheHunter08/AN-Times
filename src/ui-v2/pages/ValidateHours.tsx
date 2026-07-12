import { useState, useEffect, useRef } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { Search } from '../components/Search.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconCheck, IconX, IconClock, IconEdit } from '../components/Icons.js'

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
}

export interface ValidateHoursProps {
  rows: ValidateRow[]
  weekLabel?: string
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onModify?: (id: string, entry: string, exit: string) => void
  onDelete?: (id: string) => void
}

const diffColor = { ok: colors.semantic.green, over: colors.semantic.orange, under: colors.semantic.red }

function useIsMobile() {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.innerWidth < 700)
  useEffect(() => {
    const h = () => setM(window.innerWidth < 700)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return m
}

export function ValidateHours({ rows, weekLabel, onApprove, onReject, onModify, onDelete }: ValidateHoursProps) {
  const [search, setSearch] = useState('')
  const [localRows, setLocalRows] = useState(rows)
  const [tab, setTab] = useState<'pending' | 'reviewed'>('pending')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editEntry, setEditEntry] = useState('')
  const [editExit, setEditExit] = useState('')
  const editedRows = useRef(new Map<string, { entry: string; exit: string }>())
  const isMobile = useIsMobile()

  // Keep the optimistic decision visible while the store/Supabase round-trip
  // finishes. A parent refresh can briefly contain the old pending row; in
  // that case replacing localRows made the card jump back to the first state.
  useEffect(() => {
    setLocalRows(prev => rows.map(row => {
      const current = prev.find(item => item.id === row.id)
      const edited = editedRows.current.get(row.id)
      if (edited && row.entry === edited.entry && row.exit === edited.exit) editedRows.current.delete(row.id)
      if (edited && (row.entry !== edited.entry || row.exit !== edited.exit)) {
        return { ...row, entry: edited.entry, exit: edited.exit, status: current?.status === 'rejected' ? current.status : 'approved' }
      }
      return current && current.status !== 'pending' && row.status === 'pending'
        ? { ...row, status: current.status, entry: current.entry, exit: current.exit }
        : row
    }))
  }, [rows])

  const handleApprove = (id: string) => {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, status: 'approved' } : r))
    onApprove?.(id)
  }
  const handleReject = (id: string) => {
    setLocalRows(prev => prev.map(r => r.id === id ? { ...r, status: 'rejected' } : r))
    onReject?.(id)
  }
  const handleModify = (row: ValidateRow) => {
    setEditingId(row.id)
    setEditEntry(row.entry)
    setEditExit(row.exit)
  }
  const handleSaveModify = () => {
    if (!editingId) return
    editedRows.current.set(editingId, { entry: editEntry, exit: editExit })
    setLocalRows(prev => prev.map(r => r.id === editingId ? { ...r, entry: editEntry, exit: editExit, status: 'approved' } : r))
    onModify?.(editingId, editEntry, editExit)
    setEditingId(null)
  }
  const handleDelete = (id: string) => {
    if (!window.confirm('¿Eliminar este fichaje? Esta acción no se puede deshacer.')) return
    editedRows.current.delete(id)
    setLocalRows(prev => prev.filter(row => row.id !== id))
    onDelete?.(id)
  }

  const visible = localRows
    .filter(r => tab === 'pending' ? r.status === 'pending' : r.status !== 'pending')
    .filter(r => (r.empName + r.dept + r.date).toLowerCase().includes(search.toLowerCase()))

  const pendingCount = localRows.filter(r => r.status === 'pending').length
  const totalOvertime = localRows.filter(r => r.diffTone === 'over').length

  const inputStyle = {
    padding: '8px 10px', borderRadius: radius.sm,
    border: `1px solid ${colors.border.default}`,
    background: colors.bg[600], color: colors.text[900],
    fontSize: 14, fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' as const,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 960 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <PageTitle>Validar horas</PageTitle>
          {weekLabel && <div style={{ fontSize: 12, color: colors.text[500], marginTop: 3 }}>{weekLabel}</div>}
        </div>
        <Search placeholder="Buscar empleado…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Pendientes', value: String(pendingCount), color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)' },
          { label: 'Horas extra', value: String(totalOvertime), color: colors.primary.light, bg: colors.primary.dim },
          { label: 'Total', value: String(localRows.length), color: colors.text[700], bg: colors.bg[600] },
        ].map((k, i) => (
          <div key={i} style={{ padding: '10px 14px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)` }}>
            <div style={{ fontSize: 10, color: colors.text[500], marginBottom: 3, textTransform: 'uppercase', letterSpacing: '.4px' }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: radius.md, background: colors.bg[600], width: 'fit-content' }}>
        {(['pending', 'reviewed'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '6px 14px', borderRadius: radius.sm, border: 'none', fontSize: 12.5,
            fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t ? colors.bg[300] : 'transparent',
            color: tab === t ? colors.text[900] : colors.text[500],
          }}>
            {t === 'pending' ? `Pendientes (${pendingCount})` : 'Validados'}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div style={{ padding: 32, textAlign: 'center', color: colors.text[500], fontSize: 13,
          background: colors.bg[700], borderRadius: radius.md, border: `1px solid ${colors.border.subtle}` }}>
          {tab === 'pending' ? 'No hay registros pendientes' : 'No hay registros validados'}
        </div>
      )}

      {/* Vista móvil: tarjetas */}
      {isMobile && visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visible.map(row => (
            <div key={row.id} style={{
              background: colors.bg[700], borderRadius: radius.lg,
              border: `1px solid ${colors.border.subtle}`, overflow: 'hidden',
            }}>
              {/* Cabecera tarjeta */}
              <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: `1px solid ${colors.border.subtle}` }}>
                <Avatar name={row.empName} size={32} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.empName}</div>
                  <div style={{ fontSize: 11, color: colors.text[500] }}>{row.date} · {row.dept}</div>
                </div>
                {row.status !== 'pending' && (
                  <Badge tone={row.status === 'approved' ? 'green' : 'red'}>{row.status === 'approved' ? 'Ok' : 'Rechazado'}</Badge>
                )}
              </div>
              {/* Horas */}
              <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, borderBottom: `1px solid ${colors.border.subtle}` }}>
                {[
                  { label: 'Entrada', value: row.entry },
                  { label: 'Salida', value: row.exit },
                  { label: 'Trabajado', value: row.worked },
                ].map(f => (
                  <div key={f.label}>
                    <div style={{ fontSize: 10, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 }}>{f.label}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{f.value}</div>
                  </div>
                ))}
              </div>
              {/* Diferencia */}
              <div style={{ padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconClock width={13} height={13} style={{ color: diffColor[row.diffTone] }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: diffColor[row.diffTone] }}>{row.diff} vs {row.expected} esperadas</span>
              </div>
              {/* Botones acción — solo en pendientes */}
              {(tab === 'pending' || row.status !== 'pending') && (
                <div style={{ padding: '10px 14px', display: 'grid', gridTemplateColumns: tab === 'pending' ? '1fr 1fr 1fr' : '1fr 1fr', gap: 8, borderTop: `1px solid ${colors.border.subtle}` }}>
                  {tab === 'pending' && <button onClick={() => handleApprove(row.id)} style={{
                    padding: '7px 0', borderRadius: radius.md, border: 'none',
                    background: 'rgba(16,185,129,.18)', color: colors.semantic.green,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                    <IconCheck width={14} height={14} /> Aceptar
                  </button>}
                  <button onClick={() => handleModify(row)} style={{
                    padding: '7px 0', borderRadius: radius.md, border: 'none',
                    background: colors.primary.dim, color: colors.primary.light,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                    <IconEdit width={14} height={14} /> Modificar
                  </button>
                  {tab === 'pending' && <button onClick={() => handleReject(row.id)} style={{
                    padding: '7px 0', borderRadius: radius.md, border: 'none',
                    background: 'rgba(239,68,68,.14)', color: colors.semantic.red,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}>
                    <IconX width={14} height={14} /> Rechazar
                  </button>}
                  <button onClick={() => handleDelete(row.id)} style={{
                    gridColumn: tab === 'pending' ? '1 / -1' : 'auto', padding: '7px 0', borderRadius: radius.md, border: '1px solid rgba(239,68,68,.24)',
                    background: 'transparent', color: colors.semantic.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  }}><IconX width={14} height={14} /> Eliminar fichaje</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Vista escritorio: tabla con scroll horizontal */}
      {!isMobile && visible.length > 0 && (
        <div style={{ borderRadius: radius.md, border: `1px solid ${colors.border.subtle}`, background: colors.bg[700], overflowX: 'auto' }}>
          <div style={{ minWidth: 760 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 75px 75px 80px 80px 130px', gap: 8, padding: '10px 16px', borderBottom: `1px solid ${colors.border.subtle}` }}>
              {['Empleado', 'Fecha', 'Entrada', 'Salida', 'Trabajado', 'Esperado', 'Acción'].map(h => (
                <div key={h} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[500] }}>{h}</div>
              ))}
            </div>
            {visible.map((row, i) => (
              <div key={row.id} style={{
                display: 'grid', gridTemplateColumns: '1fr 90px 75px 75px 80px 80px 130px', gap: 8,
                padding: '11px 16px', alignItems: 'center',
                borderBottom: i < visible.length - 1 ? `1px solid ${colors.border.subtle}` : 'none',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar name={row.empName} size={26} />
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 600, color: colors.text[900] }}>{row.empName}</div>
                    <div style={{ fontSize: 11, color: colors.text[500] }}>{row.dept}</div>
                  </div>
                </div>
                <div style={{ fontSize: 12.5, color: colors.text[700] }}>{row.date}</div>
                <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: colors.text[700] }}>{row.entry}</div>
                <div style={{ fontSize: 12.5, fontVariantNumeric: 'tabular-nums', color: colors.text[700] }}>{row.exit}</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], fontVariantNumeric: 'tabular-nums' }}>{row.worked}</div>
                <div style={{ fontSize: 12, color: colors.text[500], fontVariantNumeric: 'tabular-nums' }}>{row.expected}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {tab === 'pending' ? (
                    <>
                      <span style={{ fontSize: 12, fontWeight: 700, color: diffColor[row.diffTone], fontVariantNumeric: 'tabular-nums', minWidth: 32 }}>{row.diff}</span>
                      <button onClick={() => handleApprove(row.id)} title="Aceptar" style={{ padding: '4px 6px', borderRadius: radius.xs, border: 'none', background: 'rgba(16,185,129,.16)', color: colors.semantic.green, cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: 'inherit' }}>Ok</button>
                      <button onClick={() => handleModify(row)} title="Modificar" style={{ padding: '4px', borderRadius: radius.xs, border: 'none', background: colors.primary.dim, color: colors.primary.light, cursor: 'pointer', display: 'flex' }}><IconEdit width={12} height={12} /></button>
                      <button onClick={() => handleReject(row.id)} title="Rechazar" style={{ padding: '4px', borderRadius: radius.xs, border: 'none', background: 'rgba(239,68,68,.14)', color: colors.semantic.red, cursor: 'pointer', display: 'flex' }}><IconX width={12} height={12} /></button>
                      <button onClick={() => handleDelete(row.id)} title="Eliminar fichaje" style={{ padding: '4px', borderRadius: radius.xs, border: '1px solid rgba(239,68,68,.24)', background: 'transparent', color: colors.semantic.red, cursor: 'pointer', display: 'flex' }}><IconX width={12} height={12} /></button>
                    </>
                  ) : (
                    <>
                      <Badge tone={row.status === 'approved' ? 'green' : 'red'}>{row.status === 'approved' ? 'Aprobado' : 'Rechazado'}</Badge>
                      <button onClick={() => handleModify(row)} title="Modificar fichaje validado" style={{ padding: '4px', borderRadius: radius.xs, border: 'none', background: colors.primary.dim, color: colors.primary.light, cursor: 'pointer', display: 'flex' }}><IconEdit width={12} height={12} /></button>
                      <button onClick={() => handleDelete(row.id)} title="Eliminar fichaje" style={{ padding: '4px', borderRadius: radius.xs, border: '1px solid rgba(239,68,68,.24)', background: 'transparent', color: colors.semantic.red, cursor: 'pointer', display: 'flex' }}><IconX width={12} height={12} /></button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal modificar horario */}
      {editingId && (
        <div className="uiv2-sheet-overlay" onClick={() => setEditingId(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.6)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div className="uiv2-sheet-panel" role="dialog" aria-modal="true" aria-label="Modificar horario" onClick={e => e.stopPropagation()} style={{ background: colors.bg[800], borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}`, padding: 24, width: '100%', maxWidth: 360, maxHeight: '90dvh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>Modificar horario</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase' }}>Entrada</div>
                <input type="time" value={editEntry} onChange={e => setEditEntry(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], marginBottom: 5, textTransform: 'uppercase' }}>Salida</div>
                <input type="time" value={editExit} onChange={e => setEditExit(e.target.value)} style={inputStyle} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Cancelar</button>
              <button onClick={handleSaveModify} style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
