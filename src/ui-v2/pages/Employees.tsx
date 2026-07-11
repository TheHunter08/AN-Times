import { useState } from 'react'
import { Avatar } from '../components/Avatar.js'
import { colors } from '../design-system/colors'
import { radius } from '../design-system/radius'
import { IconPlus, IconSearch, IconUsers, IconClock, IconMapPin, IconDots, IconCheck, IconX } from '../components/Icons.js'

export interface EmployeeRow {
  id: string
  name: string
  dept: string
  status: 'active' | 'break' | 'off'
  role?: string
  email?: string
  horasHoy?: string
  location?: string
  phone?: string
  obrasAsignadas?: string[]
  centroTrabajo?: string
}

export interface EmployeesProps {
  rows: EmployeeRow[]
  onAdd?: () => void
  onEdit?: (id: string) => void
  onSelect?: (id: string) => void
  onViewTimesheets?: (id: string) => void
}

const statusCfg: Record<EmployeeRow['status'], { label: string; color: string; bg: string; dot: string }> = {
  active: { label: 'Trabajando',  color: colors.semantic.green,  bg: 'rgba(16,185,129,.12)', dot: colors.semantic.green  },
  break:  { label: 'En pausa',    color: colors.semantic.orange, bg: 'rgba(245,158,11,.12)', dot: colors.semantic.orange },
  off:    { label: 'Inactivo',    color: colors.text[400],       bg: 'rgba(255,255,255,.06)', dot: colors.text[300]    },
}

function StatusPill({ status }: { status: EmployeeRow['status'] }) {
  const cfg = statusCfg[status]
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '4px 9px', borderRadius: radius.pill,
      background: cfg.bg, color: cfg.color,
      fontSize: 11, fontWeight: 700,
    }}>
      <span style={{
        width: 5, height: 5, borderRadius: '50%', background: cfg.dot, flexShrink: 0,
        boxShadow: status !== 'off' ? `0 0 6px ${cfg.dot}` : 'none',
        animation: status === 'active' ? 'uiv2EmpPulse 2s ease-in-out infinite' : 'none',
      }} />
      {cfg.label}
    </div>
  )
}

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '14px 22px', borderRadius: radius.lg,
      background: colors.bg[700], border: `1px solid ${colors.border.subtle}`,
      minWidth: 90, gap: 3,
    }}>
      <div style={{ fontSize: 22, fontWeight: 900, color, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
      <div style={{ fontSize: 11, color: colors.text[400], fontWeight: 600 }}>{label}</div>
    </div>
  )
}

const FILTERS = [
  { key: 'all', label: 'Todos' },
  { key: 'active', label: 'Trabajando' },
  { key: 'break', label: 'En pausa' },
  { key: 'off', label: 'Inactivo' },
] as const

export function Employees({ rows, onAdd, onEdit, onSelect, onViewTimesheets }: EmployeesProps) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | EmployeeRow['status']>('all')
  const [profileEmp, setProfileEmp] = useState<EmployeeRow | null>(null)

  const filtered = rows.filter(r => {
    const matchSearch = (r.name + r.dept + (r.role ?? '') + (r.email ?? '')).toLowerCase().includes(search.toLowerCase())
    const matchFilter = filter === 'all' || r.status === filter
    return matchSearch && matchFilter
  })

  const total   = rows.length
  const active  = rows.filter(r => r.status === 'active').length
  const onBreak = rows.filter(r => r.status === 'break').length
  const off     = rows.filter(r => r.status === 'off').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 21, fontWeight: 900, color: colors.text[900], letterSpacing: '-.5px' }}>Empleados</div>
          <div style={{ fontSize: 13, color: colors.text[400], marginTop: 3 }}>Directorio completo · {total} personas</div>
        </div>
        <button
          onClick={onAdd}
          style={{
            display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: radius.md, border: 'none',
            background: 'linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)',
            color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', letterSpacing: '-.1px',
            boxShadow: '0 4px 16px rgba(124,58,237,.35)',
          }}
          className="uiv2-emp-addbtn"
        >
          <IconPlus width={14} height={14} /> Añadir empleado
        </button>
      </div>

      {/* Stats strip */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <StatChip label="Total" value={total} color={colors.text[900]} />
        <StatChip label="Trabajando" value={active} color={colors.semantic.green} />
        <StatChip label="En pausa" value={onBreak} color={colors.semantic.orange} />
        <StatChip label="Inactivos" value={off} color={colors.text[400]} />
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: 340 }}>
          <span style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', color: colors.text[400], display: 'flex', pointerEvents: 'none' }}>
            <IconSearch width={14} height={14} />
          </span>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empleado, depto…"
            style={{
              width: '100%', boxSizing: 'border-box',
              paddingLeft: 34, paddingRight: 12, paddingTop: 9, paddingBottom: 9,
              borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
              background: colors.bg[700], color: colors.text[900],
              fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
            className="uiv2-emp-search"
          />
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: 6 }}>
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '7px 13px', borderRadius: radius.pill, border: 'none',
                cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, fontWeight: 600,
                background: filter === f.key ? colors.primary.base : colors.bg[700],
                color: filter === f.key ? '#fff' : colors.text[500],
                border: `1px solid ${filter === f.key ? 'transparent' : colors.border.subtle}`,
                boxShadow: filter === f.key ? '0 2px 10px rgba(124,58,237,.3)' : 'none',
                transition: 'all .15s ease',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid de tarjetas */}
      {filtered.length === 0 ? (
        <div style={{
          padding: '56px 24px', textAlign: 'center',
          background: colors.bg[700], borderRadius: radius.xl,
          border: `1px solid ${colors.border.subtle}`,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>👤</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[700] }}>Sin resultados</div>
          <div style={{ fontSize: 12, color: colors.text[400], marginTop: 4 }}>Prueba con otro nombre o filtro</div>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 14,
        }}>
          {filtered.map(emp => (
            <EmployeeCard key={emp.id} emp={emp} onSelect={onSelect} onViewProfile={() => setProfileEmp(emp)} onViewTimesheets={() => onViewTimesheets?.(emp.id)} />
          ))}
        </div>
      )}

      <style>{`
        @keyframes uiv2EmpPulse { 0%,100%{opacity:1;} 50%{opacity:.4;} }
        .uiv2-emp-addbtn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .uiv2-emp-addbtn:active { transform: scale(.98); }
        .uiv2-emp-search:focus { border-color: ${colors.primary.base} !important; }
        .uiv2-emp-card:hover { border-color: rgba(124,58,237,.35) !important; transform: translateY(-2px); box-shadow: 0 8px 28px rgba(0,0,0,.35) !important; }
      `}</style>

      {/* Profile modal */}
      {profileEmp && (
        <div
          onClick={() => setProfileEmp(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: colors.bg[900], borderRadius: radius.xl, border: `1px solid ${colors.border.subtle}`, padding: 28, width: '100%', maxWidth: 420, boxShadow: '0 24px 64px rgba(0,0,0,.6)', display: 'flex', flexDirection: 'column', gap: 20 }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <Avatar name={profileEmp.name} size={52} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: colors.text[900] }}>{profileEmp.name}</div>
                  <div style={{ fontSize: 12, color: colors.text[400], marginTop: 2 }}>{profileEmp.role}</div>
                </div>
              </div>
              <button onClick={() => setProfileEmp(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], display: 'flex', padding: 4 }}>
                <IconX width={18} height={18} />
              </button>
            </div>

            {/* Status */}
            <StatusPill status={profileEmp.status} />

            {/* Details grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Rol', value: profileEmp.role || '—' },
                { label: 'Horas hoy', value: profileEmp.horasHoy || '—' },
                { label: 'Centro de trabajo', value: profileEmp.centroTrabajo || profileEmp.dept || '—' },
                { label: 'Teléfono', value: profileEmp.phone || '—' },
                { label: 'Email', value: profileEmp.email || '—' },
                { label: 'Ubicación actual', value: profileEmp.location || '—' },
              ].map(item => (
                <div key={item.label} style={{ background: colors.bg[700], borderRadius: radius.md, padding: '10px 14px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: colors.text[400], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {/* Obras asignadas */}
            {profileEmp.obrasAsignadas && profileEmp.obrasAsignadas.length > 0 && (
              <div style={{ background: colors.bg[700], borderRadius: radius.md, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: colors.text[400], textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Obras asignadas</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profileEmp.obrasAsignadas.map(o => (
                    <span key={o} style={{ padding: '3px 10px', borderRadius: radius.pill, background: colors.primary.dim, color: colors.primary.light, fontSize: 11.5, fontWeight: 600 }}>{o}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { onViewTimesheets?.(profileEmp.id); setProfileEmp(null) }}
                style={{ flex: 1, padding: '10px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Ver fichajes
              </button>
              {onEdit && (
                <button
                  onClick={() => { onEdit(profileEmp.id); setProfileEmp(null) }}
                  style={{ padding: '10px 16px', borderRadius: radius.md, border: 'none', background: colors.bg[600], color: colors.text[900], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  Editar
                </button>
              )}
              <button
                onClick={() => setProfileEmp(null)}
                style={{ padding: '10px 16px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[700], fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function EmployeeCard({ emp, onSelect, onViewProfile, onViewTimesheets }: { emp: EmployeeRow; onSelect?: (id: string) => void; onViewProfile?: () => void; onViewTimesheets?: () => void }) {
  const initials = emp.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const cfg = statusCfg[emp.status]

  return (
    <div
      className="uiv2-emp-card"
      onClick={() => onSelect?.(emp.id)}
      style={{
        background: colors.bg[700],
        border: `1px solid ${colors.border.subtle}`,
        borderRadius: radius.xl,
        padding: '20px',
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'all .18s ease',
        boxShadow: '0 2px 8px rgba(0,0,0,.2)',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}
    >
      {/* Top row: avatar + status + dots */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <Avatar name={emp.name} size={44} />
            {emp.status !== 'off' && (
              <span style={{
                position: 'absolute', bottom: 1, right: 1,
                width: 10, height: 10, borderRadius: '50%',
                background: cfg.dot,
                border: `2px solid ${colors.bg[700]}`,
                boxShadow: `0 0 6px ${cfg.dot}`,
              }} />
            )}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: colors.text[900], letterSpacing: '-.2px' }}>{emp.name}</div>
            <div style={{ fontSize: 11.5, color: colors.text[400], marginTop: 2 }}>{emp.role ?? emp.dept}</div>
          </div>
        </div>
        <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.text[400], padding: 4, display: 'flex' }}>
          <IconDots width={16} height={16} />
        </button>
      </div>

      {/* Status pill */}
      <StatusPill status={emp.status} />

      {/* Info chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: colors.text[400] }}>
          <IconUsers width={12} height={12} style={{ flexShrink: 0 }} />
          <span>{emp.dept}</span>
        </div>
        {emp.horasHoy && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: colors.text[400] }}>
            <IconClock width={12} height={12} style={{ flexShrink: 0 }} />
            <span>{emp.horasHoy} hoy</span>
          </div>
        )}
        {emp.location && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: colors.text[400] }}>
            <IconMapPin width={12} height={12} style={{ flexShrink: 0 }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.location}</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, borderTop: `1px solid ${colors.border.subtle}`, paddingTop: 12 }}>
        <button
          onClick={e => { e.stopPropagation(); onViewProfile?.() }}
          style={{
            flex: 1, padding: '7px', borderRadius: radius.sm, border: `1px solid ${colors.border.subtle}`,
            background: 'transparent', color: colors.text[500], fontSize: 11.5, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          Ver perfil
        </button>
        <button
          onClick={e => { e.stopPropagation(); onViewTimesheets?.() }}
          style={{
            flex: 1, padding: '7px', borderRadius: radius.sm, border: 'none',
            background: colors.primary.dim, color: colors.primary.light, fontSize: 11.5, fontWeight: 700,
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
          Fichajes
        </button>
      </div>
    </div>
  )
}
