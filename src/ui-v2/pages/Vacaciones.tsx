import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconPlus, IconX, IconSearch, IconCalendar, IconCheck, IconFilter } from '../components/Icons.js'
import { ProductState } from '../components/ProductState.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface VacEmpRow {
  id: string
  name: string
  generated: number
  used: number
  pending: number
  available: number
  extra: number
  months: number
}

export interface VacRequestRow {
  id: string
  empId: string
  empName: string
  fechaInicio: string
  fechaFin: string
  dias: number
  estado: 'pendiente' | 'aprobada' | 'rechazada'
  motivo?: string
  motivoRechazo?: string
}

export interface VacacionesProps {
  employees: VacEmpRow[]
  requests: VacRequestRow[]
  onAdjust: (empId: string, extra: number) => void
  onAssign: (empId: string, fechaInicio: string, fechaFin: string, motivo: string) => void
  onApprove: (id: string) => void
  onReject: (id: string, motivo: string) => void
  onDelete: (id: string) => void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function fds(iso?: string) {
  if (!iso) return '—'
  try {
    const d = iso.length <= 10 ? new Date(iso + 'T00:00:00') : new Date(iso)
    return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch { return iso ?? '—' }
}

function daysBetween(a: string, b: string) {
  const ms = new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()
  return Math.max(1, Math.round(ms / 86400000) + 1)
}

const STATUS_CFG = {
  pendiente: { label: 'Pendiente', color: colors.semantic.orange, bg: 'rgba(245,158,11,.12)' },
  aprobada:  { label: 'Aprobada',  color: colors.semantic.green,  bg: 'rgba(16,185,129,.12)' },
  rechazada: { label: 'Rechazada', color: colors.semantic.red,    bg: 'rgba(239,68,68,.12)'  },
}

// ── Modal: ajustar días extra ──────────────────────────────────────────────────

function AdjustModal({ emp, onClose, onSave }: { emp: VacEmpRow; onClose: () => void; onSave: (extra: number) => void }) {
  const [val, setVal] = useState(String(emp.extra))
  const ref = useDialogA11y(true, onClose)
  const num = parseFloat(val) || 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Ajustar vacaciones de ${emp.name}`}
        onClick={e => e.stopPropagation()}
        style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.default}`, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 20 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>Ajustar vacaciones</div>
            <div style={{ fontSize: 12, color: colors.text[500], marginTop: 2 }}>{emp.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4, display: 'flex' }}>
            <IconX width={18} height={18} />
          </button>
        </div>

        {/* Saldo actual */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            { lbl: 'Generados', val: emp.generated, color: colors.text[900] },
            { lbl: 'Usados',    val: emp.used,      color: colors.semantic.green },
            { lbl: 'Disponibles', val: emp.available, color: colors.primary.light },
          ].map(s => (
            <div key={s.lbl} style={{ background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.md, padding: '10px 8px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: '-1px' }}>{s.val}</div>
              <div style={{ fontSize: 10, color: colors.text[500], marginTop: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.lbl}</div>
            </div>
          ))}
        </div>

        {/* Input ajuste */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>
            Ajuste (días extra o descuento)
          </div>
          <input
            type="number" step={0.5} min={-365} max={365}
            value={val}
            onChange={e => setVal(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 14px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 18, fontFamily: 'inherit', outline: 'none', fontWeight: 700, textAlign: 'center' }}
          />
          <div style={{ fontSize: 11, color: colors.text[500], marginTop: 6, textAlign: 'center' }}>
            Positivo = días extra · Negativo = descuento · 0 = sin ajuste
          </div>
        </div>

        {/* Vista previa */}
        {num !== emp.extra && (
          <div style={{ padding: '10px 14px', borderRadius: radius.md, background: num > emp.extra ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.08)', border: `1px solid ${num > emp.extra ? 'rgba(16,185,129,.25)' : 'rgba(239,68,68,.2)'}`, fontSize: 12, color: colors.text[700] }}>
            Nuevo total generado: <strong style={{ color: colors.text[900] }}>{(emp.generated - emp.extra + num).toFixed(1)}</strong> días
            {' '}· Disponibles: <strong style={{ color: colors.text[900] }}>{Math.max(0, emp.available - emp.extra + num).toFixed(1)}</strong>
          </div>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { onSave(num); onClose() }}
            style={{ flex: 1, padding: '11px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Guardar ajuste
          </button>
          <button onClick={onClose}
            style={{ padding: '11px 18px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: asignar vacaciones ──────────────────────────────────────────────────

function AssignModal({ emp, onClose, onSave }: { emp: VacEmpRow; onClose: () => void; onSave: (inicio: string, fin: string, motivo: string) => void }) {
  const [inicio, setInicio] = useState('')
  const [fin, setFin] = useState('')
  const [motivo, setMotivo] = useState('Vacaciones')
  // Sin este guard, un doble clic asigna dos periodos idénticos ya
  // aprobados — vacData() descontaría los días dos veces del saldo real.
  const [sending, setSending] = useState(false)
  const ref = useDialogA11y(true, onClose)

  const dias = inicio && fin && fin >= inicio ? daysBetween(inicio, fin) : 0
  const canSave = inicio && fin && fin >= inicio && !sending

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={`Asignar vacaciones a ${emp.name}`}
        onClick={e => e.stopPropagation()}
        style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.default}`, padding: 28, width: '100%', maxWidth: 380, boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 18 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>Asignar vacaciones</div>
            <div style={{ fontSize: 12, color: colors.text[500], marginTop: 2 }}>{emp.name} · {emp.available} días disponibles</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4, display: 'flex' }}>
            <IconX width={18} height={18} />
          </button>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Fecha inicio</div>
          <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Fecha fin</div>
          <input type="date" value={fin} min={inicio} onChange={e => setFin(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>

        {dias > 0 && (
          <div style={{ padding: '10px 14px', borderRadius: radius.md, background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`, fontSize: 13, color: colors.primary.light, fontWeight: 600, textAlign: 'center' }}>
            {dias} día{dias !== 1 ? 's' : ''} de vacaciones
          </div>
        )}

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Motivo</div>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Vacaciones"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { if (canSave) { setSending(true); onSave(inicio, fin, motivo || 'Vacaciones'); onClose() } }}
            disabled={!canSave}
            style={{ flex: 1, padding: '11px', borderRadius: radius.md, border: 'none', background: canSave ? colors.primary.base : colors.bg[500], color: canSave ? '#fff' : colors.text[500], fontSize: 14, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Asignar aprobadas
          </button>
          <button onClick={onClose}
            style={{ padding: '11px 18px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal: rechazar solicitud ──────────────────────────────────────────────────

function RejectModal({ reqId, empName, onClose, onConfirm }: { reqId: string; empName: string; onClose: () => void; onConfirm: (id: string, motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  const ref = useDialogA11y(true, onClose)
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div ref={ref} role="dialog" aria-modal="true" onClick={e => e.stopPropagation()}
        style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.default}`, padding: 24, width: '100%', maxWidth: 340, boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: colors.text[900] }}>Rechazar solicitud</div>
        <div style={{ fontSize: 12, color: colors.text[500] }}>{empName}</div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Motivo (opcional)</div>
          <input type="text" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Coincide con otra ausencia"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => { onConfirm(reqId, motivo); onClose() }}
            style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: 'none', background: colors.semantic.red, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
            Rechazar
          </button>
          <button onClick={onClose}
            style={{ padding: '10px 16px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta de empleado ────────────────────────────────────────────────────────

function EmpVacCard({ emp, onAdjust, onAssign }: { emp: VacEmpRow; onAdjust: () => void; onAssign: () => void }) {
  const pct = emp.generated > 0 ? Math.min(100, Math.round((emp.used / emp.generated) * 100)) : 0
  return (
    <div style={{
      background: colors.bg[700], border: `1px solid ${colors.border.subtle}`,
      borderRadius: radius.xl, padding: '18px 20px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Avatar name={emp.name} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.name}</div>
          <div style={{ fontSize: 11, color: colors.text[500], marginTop: 1 }}>{emp.months} mes{emp.months !== 1 ? 'es' : ''} trabajados</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 26, fontWeight: 900, color: colors.primary.light, letterSpacing: '-1.5px', lineHeight: 1 }}>{emp.available}</div>
          <div style={{ fontSize: 10, color: colors.text[500], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>disponibles</div>
        </div>
      </div>

      {/* Barra progreso */}
      <div>
        <div style={{ height: 6, background: colors.bg[400], borderRadius: radius.pill, overflow: 'hidden', marginBottom: 6 }}>
          <div style={{ height: '100%', borderRadius: radius.pill, background: 'var(--uiv2-primary-base)', width: `${pct}%`, transition: 'width .5s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.text[500] }}>
          <span>{emp.used} usados de {emp.generated} generados</span>
          {emp.pending > 0 && <span style={{ color: colors.semantic.orange }}>{emp.pending} pendiente{emp.pending !== 1 ? 's' : ''}</span>}
          {emp.extra !== 0 && (
            <span style={{ color: emp.extra > 0 ? colors.semantic.green : colors.semantic.red, fontWeight: 700 }}>
              {emp.extra > 0 ? `+${emp.extra}` : emp.extra} ajuste
            </span>
          )}
        </div>
      </div>

      {/* Acciones */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onAdjust}
          style={{ flex: 1, padding: '8px', borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
          ± Ajustar días
        </button>
        <button onClick={onAssign}
          style={{ flex: 1, padding: '8px', borderRadius: radius.sm, border: 'none', background: colors.primary.dim, color: colors.primary.light, fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          <IconPlus width={11} height={11} /> Asignar período
        </button>
      </div>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────────

type ActiveTab = 'empleados' | 'solicitudes'
type FilterReq = 'todas' | 'pendiente' | 'aprobada' | 'rechazada'

export function Vacaciones({ employees, requests, onAdjust, onAssign, onApprove, onReject, onDelete }: VacacionesProps) {
  const [tab, setTab] = useState<ActiveTab>('solicitudes')
  const [search, setSearch] = useState('')
  const [filterReq, setFilterReq] = useState<FilterReq>('todas')
  const [adjustEmp, setAdjustEmp] = useState<VacEmpRow | null>(null)
  const [assignEmp, setAssignEmp] = useState<VacEmpRow | null>(null)
  const [rejectReq, setRejectReq] = useState<{ id: string; empName: string } | null>(null)

  const filteredEmps = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )
  const filteredReqs = requests.filter(r => {
    const matchSearch = r.empName.toLowerCase().includes(search.toLowerCase())
    const matchFilter = filterReq === 'todas' || r.estado === filterReq
    return matchSearch && matchFilter
  })

  const pendingCount = requests.filter(r => r.estado === 'pendiente').length
  const totalGenerated = employees.reduce((s, e) => s + e.generated, 0)
  const totalUsed = employees.reduce((s, e) => s + e.used, 0)
  const totalAvailable = employees.reduce((s, e) => s + e.available, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 900 }}>

      {/* Header */}
      <div>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 600, color: colors.text[900], letterSpacing: '-.4px' }}>Vacaciones</h1>
        <div style={{ fontSize: 13, color: colors.text[500], marginTop: 3 }}>
          Gestiona días, ajustes y solicitudes del equipo
        </div>
      </div>

      {/* Resumen global */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { lbl: 'Total generados', val: totalGenerated, color: colors.text[900] },
          { lbl: 'Días usados',     val: totalUsed,      color: colors.semantic.green },
          { lbl: 'Disponibles',     val: totalAvailable, color: colors.primary.light },
          { lbl: 'Solicitudes pend.', val: pendingCount, color: colors.semantic.orange },
        ].map(s => (
          <div key={s.lbl} style={{ background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.lg, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{s.val}</div>
            <div style={{ fontSize: 10, color: colors.text[500], marginTop: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px' }}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: 4, background: colors.bg[700], borderRadius: radius.lg, border: `1px solid ${colors.border.subtle}`, width: 'fit-content' }}>
        {([['solicitudes', 'Solicitudes'], ['empleados', 'Por empleado']] as [ActiveTab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{
              padding: '8px 20px', borderRadius: radius.md, border: 'none',
              background: tab === key ? colors.primary.base : 'transparent',
              color: tab === key ? '#fff' : colors.text[500],
              fontSize: 13, fontWeight: tab === key ? 700 : 500,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: tab === key ? '0 4px 14px var(--uiv2-primary-glow)' : 'none',
              transition: 'all .15s',
            }}>
            {label}
            {key === 'solicitudes' && pendingCount > 0 && (
              <span style={{ marginLeft: 6, padding: '1px 7px', borderRadius: radius.pill, background: tab === 'solicitudes' ? 'rgba(255,255,255,.25)' : colors.semantic.orange, color: '#fff', fontSize: 10, fontWeight: 800 }}>
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Buscador */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: 320 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.text[500], display: 'flex', pointerEvents: 'none' }}>
            <IconSearch width={14} height={14} />
          </span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar empleado…"
            style={{ width: '100%', boxSizing: 'border-box', paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9, borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: colors.bg[700], color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>

        {tab === 'solicitudes' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {([['todas', 'Todas'], ['pendiente', 'Pendientes'], ['aprobada', 'Aprobadas'], ['rechazada', 'Rechazadas']] as [FilterReq, string][]).map(([key, label]) => (
              <button key={key} onClick={() => setFilterReq(key)}
                style={{
                  padding: '7px 13px', borderRadius: radius.pill, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 12, fontWeight: 600,
                  background: filterReq === key ? colors.primary.base : colors.bg[700],
                  color: filterReq === key ? '#fff' : colors.text[500],
                  border: `1px solid ${filterReq === key ? 'transparent' : colors.border.subtle}`,
                  boxShadow: filterReq === key ? '0 4px 14px var(--uiv2-primary-glow)' : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB: Solicitudes ─────────────────────────────────────────────────── */}
      {tab === 'solicitudes' && (
        <div>
          {filteredReqs.length === 0 ? (
            <ProductState title="Sin solicitudes" description={filterReq !== 'todas' ? 'Prueba con otro filtro.' : 'No hay solicitudes de vacaciones.'} />
          ) : (
            <div style={{ background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, overflow: 'hidden' }}>
              {filteredReqs.map((req, i) => {
                const sc = STATUS_CFG[req.estado]
                const dias = req.dias || (req.fechaInicio && req.fechaFin ? daysBetween(req.fechaInicio, req.fechaFin) : 0)
                return (
                  <div key={req.id} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12, borderTop: i > 0 ? `1px solid ${colors.border.subtle}` : 'none', flexWrap: 'wrap' }}>
                    <Avatar name={req.empName} size={36} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900] }}>{req.empName}</div>
                      <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>
                        {fds(req.fechaInicio)} → {fds(req.fechaFin)} · {dias} día{dias !== 1 ? 's' : ''}
                        {req.motivo ? ` · ${req.motivo}` : ''}
                      </div>
                      {req.motivoRechazo && (
                        <div style={{ fontSize: 11, color: colors.semantic.red, marginTop: 2, fontStyle: 'italic' }}>Motivo rechazo: {req.motivoRechazo}</div>
                      )}
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: radius.pill, background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {sc.label}
                    </span>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      {req.estado === 'pendiente' && (
                        <>
                          <button onClick={() => onApprove(req.id)} aria-label="Aprobar"
                            style={{ width: 34, height: 34, borderRadius: radius.sm, border: 'none', background: 'rgba(16,185,129,.15)', color: colors.semantic.green, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <IconCheck width={15} height={15} />
                          </button>
                          <button onClick={() => setRejectReq({ id: req.id, empName: req.empName })} aria-label="Rechazar"
                            style={{ width: 34, height: 34, borderRadius: radius.sm, border: 'none', background: 'rgba(239,68,68,.12)', color: colors.semantic.red, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <IconX width={15} height={15} />
                          </button>
                        </>
                      )}
                      <button onClick={() => { if (window.confirm('¿Eliminar esta solicitud de vacaciones? Esta acción no se puede deshacer.')) onDelete(req.id) }} aria-label="Eliminar"
                        style={{ width: 34, height: 34, borderRadius: radius.sm, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[500], cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        title="Eliminar solicitud">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: Por empleado ────────────────────────────────────────────────── */}
      {tab === 'empleados' && (
        <div>
          {filteredEmps.length === 0 ? (
            <ProductState title="Sin empleados" description="Prueba con otro nombre." />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
              {filteredEmps.map(emp => (
                <EmpVacCard
                  key={emp.id}
                  emp={emp}
                  onAdjust={() => setAdjustEmp(emp)}
                  onAssign={() => setAssignEmp(emp)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Modales ──────────────────────────────────────────────────────────── */}
      {adjustEmp && (
        <AdjustModal
          emp={adjustEmp}
          onClose={() => setAdjustEmp(null)}
          onSave={extra => onAdjust(adjustEmp.id, extra)}
        />
      )}
      {assignEmp && (
        <AssignModal
          emp={assignEmp}
          onClose={() => setAssignEmp(null)}
          onSave={(inicio, fin, mot) => onAssign(assignEmp.id, inicio, fin, mot)}
        />
      )}
      {rejectReq && (
        <RejectModal
          reqId={rejectReq.id}
          empName={rejectReq.empName}
          onClose={() => setRejectReq(null)}
          onConfirm={onReject}
        />
      )}
    </div>
  )
}
