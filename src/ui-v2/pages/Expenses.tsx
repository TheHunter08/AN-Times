import { useState } from 'react'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconCheck, IconX, IconReceipt, IconPlus } from '../components/Icons.js'
import { ProductState } from '../components/ProductState.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'

export interface ExpenseItem {
  id: string
  empName: string
  category: 'dieta' | 'transporte' | 'material' | 'otro'
  description: string
  amount: number
  date: string
  status: 'pendiente' | 'aprobado' | 'rechazado'
}

export interface ExpensesProps {
  items: ExpenseItem[]
  employees?: { id: string; name: string }[]
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  onOpen?: (item: ExpenseItem) => void
  onAddManual?: (empId: string, concepto: string, importe: number, categoria: ExpenseItem['category'], fecha: string) => void
}

const catLabel: Record<ExpenseItem['category'], string> = {
  dieta: 'Dieta', transporte: 'Transporte', material: 'Material', otro: 'Otro',
}

const catColor: Record<ExpenseItem['category'], string> = {
  dieta: colors.semantic.orange,
  transporte: 'var(--uiv2-secondary-base)',
  material: colors.semantic.green,
  otro: colors.text[500],
}

const catBg: Record<ExpenseItem['category'], string> = {
  dieta: 'rgba(245,158,11,.14)',
  transporte: colors.secondary.dim,
  material: 'rgba(16,185,129,.14)',
  otro: 'rgba(148,163,184,.10)',
}

const fmt = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function AddManualModal({ employees, onClose, onSave }: { employees: { id: string; name: string }[]; onClose: () => void; onSave: (empId: string, concepto: string, importe: number, categoria: ExpenseItem['category'], fecha: string) => void }) {
  const [empId, setEmpId] = useState(employees[0]?.id || '')
  const [concepto, setConcepto] = useState('')
  const [importe, setImporte] = useState('')
  const [categoria, setCategoria] = useState<ExpenseItem['category']>('dieta')
  const [fecha, setFecha] = useState(todayStr())
  const ref = useDialogA11y(true, onClose)

  const importeNum = parseFloat(importe) || 0
  const canSave = empId && concepto.trim() && importeNum > 0

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Añadir gasto manual"
        onClick={e => e.stopPropagation()}
        style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.default}`, padding: 28, width: '100%', maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 16 }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>Añadir gasto manual</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[500], padding: 4, display: 'flex' }}>
            <IconX width={18} height={18} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: colors.text[500], marginTop: -10 }}>
          Se registra directamente como aprobado — úsalo para reembolsos que gestionas fuera de la app.
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Empleado</div>
          <select value={empId} onChange={e => setEmpId(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Concepto</div>
          <input type="text" value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: Reembolso peajes"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Importe €</div>
            <input type="number" min={0.01} step={0.01} value={importe} onChange={e => setImporte(e.target.value)} placeholder="0.00"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Fecha</div>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'rgba(var(--uiv2-overlay-rgb),.06)', color: colors.text[900], fontSize: 13, fontFamily: 'inherit', outline: 'none' }} />
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: colors.text[500], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Categoría</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
            {(Object.keys(catLabel) as ExpenseItem['category'][]).map(c => (
              <button key={c} type="button" onClick={() => setCategoria(c)}
                style={{
                  padding: '8px 4px', borderRadius: radius.sm, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11.5, fontWeight: 700,
                  border: `1px solid ${categoria === c ? catColor[c] : colors.border.default}`,
                  background: categoria === c ? catBg[c] : 'transparent',
                  color: categoria === c ? catColor[c] : colors.text[500],
                }}>
                {catLabel[c]}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => { if (canSave) { onSave(empId, concepto.trim(), importeNum, categoria, fecha); onClose() } }}
            disabled={!canSave}
            style={{ flex: 1, padding: '11px', borderRadius: radius.md, border: 'none', background: canSave ? colors.primary.base : colors.bg[500], color: canSave ? '#fff' : colors.text[500], fontSize: 14, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
            Guardar aprobado
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

export function Expenses({ items, employees = [], onApprove, onReject, onOpen, onAddManual }: ExpensesProps) {
  const [tab, setTab] = useState<'pendiente' | 'aprobado' | 'rechazado'>('pendiente')
  const [showAdd, setShowAdd] = useState(false)

  const counts = {
    pendiente: items.filter(i => i.status === 'pendiente').length,
    aprobado:  items.filter(i => i.status === 'aprobado').length,
    rechazado: items.filter(i => i.status === 'rechazado').length,
  }

  const totalPending = items.filter(i => i.status === 'pendiente').reduce((s, i) => s + i.amount, 0)
  const visible = items.filter(i => i.status === tab)

  const tabs = [
    { id: 'pendiente' as const, label: 'Pendientes', tone: 'orange' as const },
    { id: 'aprobado' as const, label: 'Aprobados', tone: 'green' as const },
    { id: 'rechazado' as const, label: 'Rechazados', tone: 'red' as const },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 820 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <PageTitle>Gastos</PageTitle>
        {onAddManual && employees.length > 0 && (
          <button
            onClick={() => setShowAdd(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', borderRadius: radius.md, border: 'none',
              background: colors.gradients.brand,
              color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'inherit', letterSpacing: '-.1px',
              boxShadow: '0 8px 24px var(--uiv2-primary-glow)',
            }}
          >
            <IconPlus width={14} height={14} /> Añadir gasto
          </button>
        )}
      </div>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Pendiente de aprobar', value: `${fmt(totalPending)} €`, color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)', target:'pendiente' as const },
          { label: 'Total aprobado (mes)', value: `${fmt(items.filter(i => i.status === 'aprobado').reduce((s, i) => s + i.amount, 0))} €`, color: colors.semantic.green, bg: 'rgba(16,185,129,.10)', target:'aprobado' as const },
          { label: 'Solicitudes rechazadas', value: String(counts.rechazado), color: colors.semantic.red, bg: 'rgba(239,68,68,.10)', target:'rechazado' as const },
        ].map((k, i) => (
          <button key={i} type="button" onClick={() => setTab(k.target)} aria-pressed={tab === k.target} aria-label={`${k.label}: ${k.value}. Filtrar gastos`} style={{ padding: '14px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)`, cursor:'pointer', fontFamily:'inherit', textAlign:'left' }}>
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, letterSpacing: '-.5px' }}>{k.value}</div>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, padding: 3, borderRadius: radius.md, background: colors.bg[600], width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '6px 16px', borderRadius: radius.sm, border: 'none', fontSize: 12.5, fontWeight: 640, cursor: 'pointer', fontFamily: 'inherit',
            background: tab === t.id ? colors.bg[300] : 'transparent',
            color: tab === t.id ? colors.text[900] : colors.text[500],
          }}>
            {t.label} · {counts[t.id]}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visible.length === 0 && (
          <ProductState compact title={`No hay gastos ${tab === 'pendiente' ? 'pendientes' : tab === 'aprobado' ? 'aprobados' : 'rechazados'}`} description="Las nuevas solicitudes aparecerán aquí automáticamente." />
        )}
        {visible.map(item => (
          <div key={item.id} className="uiv2-expense-row" onClick={() => onOpen?.(item)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: radius.md, background: colors.bg[700], border: `1px solid ${colors.border.subtle}`, cursor:onOpen?'pointer':'default', transition:'border-color .15s, transform .15s' }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: radius.sm, background: catBg[item.category], color: catColor[item.category], flexShrink: 0 }}>
              <IconReceipt width={16} height={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{item.description}</span>
                <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: radius.pill, background: catBg[item.category], color: catColor[item.category], fontWeight: 700 }}>{catLabel[item.category]}</span>
              </div>
              <div style={{ fontSize: 11.5, color: colors.text[500], marginTop: 2, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                <span>{item.empName} · {item.date}</span>
                {onOpen && <button type="button" aria-label={`Abrir fichajes de ${item.empName}`} onClick={event => { event.stopPropagation(); onOpen(item) }} style={{ padding:0, border:0, background:'transparent', color:colors.primary.light, fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Ver fichajes →</button>}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.text[900], letterSpacing: '-.5px', flexShrink: 0 }}>{fmt(item.amount)} €</div>
            {tab === 'pendiente' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={event => { event.stopPropagation(); onApprove?.(item.id) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: radius.sm, border: 'none', background: 'rgba(16,185,129,.16)', color: colors.semantic.green, cursor: 'pointer', fontSize: 12, fontWeight: 640, fontFamily: 'inherit' }}>
                  <IconCheck width={13} height={13} /> Aprobar
                </button>
                <button onClick={event => { event.stopPropagation(); onReject?.(item.id) }} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: radius.sm, border: 'none', background: 'rgba(239,68,68,.14)', color: colors.semantic.red, cursor: 'pointer', fontSize: 12, fontWeight: 640, fontFamily: 'inherit' }}>
                  <IconX width={13} height={13} /> Rechazar
                </button>
              </div>
            )}
            {tab !== 'pendiente' && (
              <Badge tone={tab === 'aprobado' ? 'green' : 'red'}>{tab === 'aprobado' ? 'Aprobado' : 'Rechazado'}</Badge>
            )}
          </div>
        ))}
      </div>

      {showAdd && onAddManual && (
        <AddManualModal
          employees={employees}
          onClose={() => setShowAdd(false)}
          onSave={onAddManual}
        />
      )}
    </div>
  )
}
