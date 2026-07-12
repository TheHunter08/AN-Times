import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { Badge } from '../components/Badge.js'
import { PageTitle } from '../components/PageTitle.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconCheck, IconX, IconReceipt, IconFilter } from '../components/Icons.js'

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
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
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

export function Expenses({ items, onApprove, onReject }: ExpensesProps) {
  const [tab, setTab] = useState<'pendiente' | 'aprobado' | 'rechazado'>('pendiente')

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
      <PageTitle>Gastos</PageTitle>

      {/* Summary KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { label: 'Pendiente de aprobar', value: `${fmt(totalPending)} €`, color: colors.semantic.orange, bg: 'rgba(245,158,11,.10)' },
          { label: 'Total aprobado (mes)', value: `${fmt(items.filter(i => i.status === 'aprobado').reduce((s, i) => s + i.amount, 0))} €`, color: colors.semantic.green, bg: 'rgba(16,185,129,.10)' },
          { label: 'Solicitudes este mes', value: String(items.length), color: colors.accent.base, bg: colors.accent.dim },
        ].map((k, i) => (
          <div key={i} style={{ padding: '14px 16px', borderRadius: radius.md, background: k.bg, border: `1px solid rgba(var(--uiv2-overlay-rgb),.06)` }}>
            <div style={{ fontSize: 11, color: colors.text[500], marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, letterSpacing: '-.5px' }}>{k.value}</div>
          </div>
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
          <div style={{ padding: '32px', textAlign: 'center', color: colors.text[500], fontSize: 13, borderRadius: radius.md, border: `1px dashed ${colors.border.subtle}` }}>
            No hay gastos {tab === 'pendiente' ? 'pendientes' : tab === 'aprobado' ? 'aprobados' : 'rechazados'}
          </div>
        )}
        {visible.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: radius.md, background: colors.bg[700], border: `1px solid ${colors.border.subtle}` }}>
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: radius.sm, background: catBg[item.category], color: catColor[item.category], flexShrink: 0 }}>
              <IconReceipt width={16} height={16} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 640, color: colors.text[900] }}>{item.description}</span>
                <span style={{ fontSize: 10.5, padding: '2px 8px', borderRadius: radius.pill, background: catBg[item.category], color: catColor[item.category], fontWeight: 700 }}>{catLabel[item.category]}</span>
              </div>
              <div style={{ fontSize: 11.5, color: colors.text[500], marginTop: 2 }}>
                {item.empName} · {item.date}
              </div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: colors.text[900], letterSpacing: '-.5px', flexShrink: 0 }}>{fmt(item.amount)} €</div>
            {tab === 'pendiente' && (
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button onClick={() => onApprove?.(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: radius.sm, border: 'none', background: 'rgba(16,185,129,.16)', color: colors.semantic.green, cursor: 'pointer', fontSize: 12, fontWeight: 640, fontFamily: 'inherit' }}>
                  <IconCheck width={13} height={13} /> Aprobar
                </button>
                <button onClick={() => onReject?.(item.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: radius.sm, border: 'none', background: 'rgba(239,68,68,.14)', color: colors.semantic.red, cursor: 'pointer', fontSize: 12, fontWeight: 640, fontFamily: 'inherit' }}>
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
    </div>
  )
}
