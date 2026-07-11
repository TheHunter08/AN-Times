import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { colors } from '../design-system/colors.js'
import { radius } from '../design-system/radius.js'
import { IconCheck, IconX, IconClock, IconClipboard, IconFilter } from '../components/Icons.js'

export interface RequestRow {
  id: string
  type: string
  employeeName: string
  requestedOn: string
  status: 'pending' | 'approved' | 'rejected'
  onApprove?: (id: string) => void
  onReject?: (id: string) => void
  note?: string
  days?: number
}

export interface RequestsProps {
  rows: RequestRow[]
}

const typeCfg: Record<string, { color: string; bg: string; emoji: string }> = {
  'Vacaciones':    { color: colors.kpiTone.primary.base, bg: colors.primary.dim,              emoji: '🌴' },
  'Día personal':  { color: colors.kpiTone.accent.base,  bg: 'rgba(59,130,246,.12)',           emoji: '📅' },
  'Teletrabajo':   { color: colors.kpiTone.cyan.base,    bg: 'rgba(6,182,212,.12)',            emoji: '🏠' },
  'Horas extra':   { color: colors.kpiTone.amber.base,   bg: 'rgba(245,158,11,.12)',           emoji: '⏱️' },
  'Baja':          { color: colors.semantic.red,         bg: 'rgba(239,68,68,.12)',            emoji: '🏥' },
}
function getTypeCfg(type: string) {
  return typeCfg[type] ?? { color: colors.primary.light, bg: colors.primary.dim, emoji: '📋' }
}

const statusCfg = {
  pending:  { label: 'Pendiente', color: colors.semantic.orange, bg: 'rgba(245,158,11,.12)'  },
  approved: { label: 'Aprobada',  color: colors.semantic.green,  bg: 'rgba(16,185,129,.12)'  },
  rejected: { label: 'Rechazada', color: colors.semantic.red,    bg: 'rgba(239,68,68,.12)'   },
}

const FILTERS = ['Todas', 'Pendientes', 'Aprobadas', 'Rechazadas'] as const
type FilterKey = typeof FILTERS[number]

export function Requests({ rows }: RequestsProps) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>('Todas')

  const pending  = rows.filter(r => r.status === 'pending').length
  const approved = rows.filter(r => r.status === 'approved').length
  const rejected = rows.filter(r => r.status === 'rejected').length

  const filtered = rows.filter(r => {
    if (activeFilter === 'Pendientes') return r.status === 'pending'
    if (activeFilter === 'Aprobadas')  return r.status === 'approved'
    if (activeFilter === 'Rechazadas') return r.status === 'rejected'
    return true
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 820 }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: 21, fontWeight: 900, color: colors.text[900], letterSpacing: '-.5px' }}>Solicitudes</div>
        <div style={{ fontSize: 13, color: colors.text[400], marginTop: 3 }}>Gestiona peticiones del equipo</div>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { label: 'Pendientes',  value: pending,  color: colors.semantic.orange, bg: 'rgba(245,158,11,.1)',  icon: <IconClock width={16} height={16} /> },
          { label: 'Aprobadas',   value: approved, color: colors.semantic.green,  bg: 'rgba(16,185,129,.1)', icon: <IconCheck width={16} height={16} /> },
          { label: 'Rechazadas',  value: rejected, color: colors.semantic.red,    bg: 'rgba(239,68,68,.1)',  icon: <IconX width={16} height={16} /> },
        ].map(s => (
          <div key={s.label} style={{
            padding: '16px 18px', borderRadius: radius.lg,
            background: colors.bg[700], border: `1px solid ${colors.border.subtle}`,
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: radius.md, background: s.bg, color: s.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {s.icon}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 900, color: s.color, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
              <div style={{ fontSize: 11, color: colors.text[400], fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <span style={{ color: colors.text[400], display: 'flex', marginRight: 4 }}><IconFilter width={13} height={13} /></span>
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            style={{
              padding: '7px 14px', borderRadius: radius.pill, border: 'none',
              cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
              background: activeFilter === f ? colors.primary.base : colors.bg[700],
              color: activeFilter === f ? '#fff' : colors.text[500],
              border: `1px solid ${activeFilter === f ? 'transparent' : colors.border.subtle}`,
              boxShadow: activeFilter === f ? '0 2px 10px rgba(124,58,237,.3)' : 'none',
              transition: 'all .15s ease',
            }}
          >
            {f}
            {f === 'Pendientes' && pending > 0 && (
              <span style={{ marginLeft: 6, background: colors.semantic.orange, color: '#fff', borderRadius: radius.pill, fontSize: 9.5, fontWeight: 800, padding: '1px 5px' }}>{pending}</span>
            )}
          </button>
        ))}
      </div>

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center', background: colors.bg[700], borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}` }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[700] }}>Sin solicitudes</div>
            <div style={{ fontSize: 12, color: colors.text[400], marginTop: 4 }}>No hay entradas para este filtro</div>
          </div>
        ) : (
          filtered.map(r => <RequestCard key={r.id} row={r} />)
        )}
      </div>

      <style>{`
        .uiv2-req-card:hover { border-color: rgba(124,58,237,.3) !important; }
        .uiv2-req-approve:hover { background: rgba(16,185,129,.22) !important; }
        .uiv2-req-reject:hover  { background: rgba(239,68,68,.22) !important; }
      `}</style>
    </div>
  )
}

function RequestCard({ row }: { row: RequestRow }) {
  const tc = getTypeCfg(row.type)
  const sc = statusCfg[row.status]
  const isPending = row.status === 'pending'

  return (
    <div
      className="uiv2-req-card"
      style={{
        background: colors.bg[700],
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.xl,
        padding: '18px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        transition: 'border-color .18s',
        borderLeft: isPending ? `3px solid ${colors.semantic.orange}` : `1px solid ${colors.border.subtle}`,
      }}
    >
      {/* Type icon */}
      <div style={{
        width: 44, height: 44, borderRadius: radius.md,
        background: tc.bg, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20,
      }}>
        {tc.emoji}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: colors.text[900], letterSpacing: '-.2px' }}>{row.type}</span>
          {row.days && (
            <span style={{ fontSize: 11, fontWeight: 600, color: tc.color, background: tc.bg, padding: '2px 7px', borderRadius: radius.pill }}>
              {row.days} {row.days === 1 ? 'día' : 'días'}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 5 }}>
          <Avatar name={row.employeeName} size={20} />
          <span style={{ fontSize: 12, color: colors.text[500], fontWeight: 600 }}>{row.employeeName}</span>
          <span style={{ color: colors.text[300], fontSize: 11 }}>·</span>
          <span style={{ fontSize: 11.5, color: colors.text[400] }}>{row.requestedOn}</span>
        </div>
        {row.note && (
          <div style={{ marginTop: 6, fontSize: 11.5, color: colors.text[400], fontStyle: 'italic' }}>"{row.note}"</div>
        )}
      </div>

      {/* Status / Actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {isPending ? (
          <>
            <button
              className="uiv2-req-approve"
              onClick={() => row.onApprove?.(row.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: radius.md, border: 'none', background: 'rgba(16,185,129,.14)', color: colors.semantic.green, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', transition: 'background .15s' }}
            >
              <IconCheck width={13} height={13} /> Aprobar
            </button>
            <button
              className="uiv2-req-reject"
              onClick={() => row.onReject?.(row.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '8px 14px', borderRadius: radius.md, border: 'none', background: 'rgba(239,68,68,.14)', color: colors.semantic.red, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, fontFamily: 'inherit', transition: 'background .15s' }}
            >
              <IconX width={13} height={13} /> Rechazar
            </button>
          </>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: radius.pill, background: sc.bg, color: sc.color, fontSize: 12, fontWeight: 700 }}>
            {row.status === 'approved' ? <IconCheck width={11} height={11} /> : <IconX width={11} height={11} />}
            {sc.label}
          </div>
        )}
      </div>
    </div>
  )
}
