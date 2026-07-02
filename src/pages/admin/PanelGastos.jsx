import { useState, useMemo } from 'react'
import { gid, fds } from '../../utils/time.js'
import { auditLog } from '../../services/dataService.js'

const CATEGORIA_LABELS = {
  dieta: '🍽️ Dieta',
  transporte: '🚗 Transporte',
  material: '📦 Material',
  otro: '📎 Otro',
}

const CATEGORIA_COLORS = {
  dieta: '#f59e0b',
  transporte: '#6366f1',
  material: '#22c55e',
  otro: '#64748b',
}

const ESTADO_COLORS = {
  pendiente: '#f59e0b',
  aprobado: '#22c55e',
  rechazado: '#ef4444',
}

const ESTADO_BG = {
  pendiente: 'rgba(245,158,11,.12)',
  aprobado: 'rgba(34,197,94,.12)',
  rechazado: 'rgba(239,68,68,.12)',
}

const fmt = (n) => Number(n).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function PanelGastos({ db, toast, saveDB, session }) {
  const [tab, setTab] = useState('pendiente')
  const [filterEmp, setFilterEmp] = useState('')
  const [rejectingId, setRejectingId] = useState(null)
  const [rejectMotivo, setRejectMotivo] = useState('')
  const [lightboxSrc, setLightboxSrc] = useState(null)

  const who = session?.user?.name || 'Admin'
  const gastos = db.gastos || []
  const employees = db.employees || []

  const filtered = useMemo(() => {
    return gastos
      .filter(g => g.estado === tab)
      .filter(g => !filterEmp || g.empId === filterEmp)
      .sort((a, b) => (b.ts || '').localeCompare(a.ts || ''))
  }, [gastos, tab, filterEmp])

  const counts = useMemo(() => ({
    pendiente: gastos.filter(g => g.estado === 'pendiente').length,
    aprobado: gastos.filter(g => g.estado === 'aprobado').length,
    rechazado: gastos.filter(g => g.estado === 'rechazado').length,
  }), [gastos])

  const totalPendiente = useMemo(
    () => gastos.filter(g => g.estado === 'pendiente').reduce((s, g) => s + (Number(g.importe) || 0), 0),
    [gastos]
  )

  const now = new Date()
  const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const totalAprobadoMes = useMemo(
    () => gastos.filter(g => g.estado === 'aprobado' && (g.resolvedAt || '').startsWith(mesActual)).reduce((s, g) => s + (Number(g.importe) || 0), 0),
    [gastos, mesActual]
  )

  const approve = (gasto) => {
    const noti = {
      id: gid(),
      empId: gasto.empId,
      action: 'Gasto aprobado',
      detail: `${gasto.concepto} — ${fmt(gasto.importe)} €`,
      ts: new Date().toISOString(),
      leido: false,
    }
    const updated = gastos.map(g =>
      g.id === gasto.id
        ? { ...g, estado: 'aprobado', resolvedAt: new Date().toISOString(), resolvedBy: who }
        : g
    )
    const withAudit = auditLog(db, 'Gasto aprobado', `${gasto.empName}: ${gasto.concepto} ${gasto.importe}€`, who)
    saveDB({ gastos: updated, notis: [...(db.notis || []), noti], audit: withAudit.audit })
    toast('Gasto aprobado', 3000, 'ok')
  }

  const reject = (gasto, motivo) => {
    const noti = {
      id: gid(),
      empId: gasto.empId,
      action: 'Gasto rechazado',
      detail: `${gasto.concepto}${motivo ? ' · ' + motivo : ''}`,
      ts: new Date().toISOString(),
      leido: false,
    }
    const updated = gastos.map(g =>
      g.id === gasto.id
        ? { ...g, estado: 'rechazado', resolvedAt: new Date().toISOString(), resolvedBy: who, motivoRechazo: motivo || '' }
        : g
    )
    const withAudit = auditLog(db, 'Gasto rechazado', `${gasto.empName}: ${gasto.concepto}`, who)
    saveDB({ gastos: updated, notis: [...(db.notis || []), noti], audit: withAudit.audit })
    setRejectingId(null)
    setRejectMotivo('')
    toast('Gasto rechazado', 3000, 'warn')
  }

  const activeEmps = useMemo(
    () => employees.filter(e => !e.isAdmin && gastos.some(g => g.empId === e.id)),
    [employees, gastos]
  )

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Gestión de Gastos</h1>
          <div className="adm-panel-sub" style={{ marginTop: 2 }}>
            {counts.pendiente} pendientes · {fmt(totalPendiente)} € por aprobar
          </div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 }}>
        <div style={{ background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Pendiente de pago</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalPendiente)} €</div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>{counts.pendiente} gastos</div>
        </div>
        <div style={{ background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.2)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Aprobado este mes</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#22c55e', fontVariantNumeric: 'tabular-nums' }}>{fmt(totalAprobadoMes)} €</div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>{counts.aprobado} total aprobados</div>
        </div>
        <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 10, color: 'var(--text4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Rechazados</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ef4444', fontVariantNumeric: 'tabular-nums' }}>{counts.rechazado}</div>
          <div style={{ fontSize: 10, color: 'var(--text4)', marginTop: 2 }}>gastos devueltos</div>
        </div>
      </div>

      {/* Tabs + Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        <div className="pill-tabs" style={{ margin: 0 }}>
          {[
            { id: 'pendiente', label: `⏳ Pendientes${counts.pendiente ? ` (${counts.pendiente})` : ''}` },
            { id: 'aprobado', label: `✓ Aprobados${counts.aprobado ? ` (${counts.aprobado})` : ''}` },
            { id: 'rechazado', label: `✕ Rechazados${counts.rechazado ? ` (${counts.rechazado})` : ''}` },
          ].map(t => (
            <button key={t.id} className={`pill-tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>
        {activeEmps.length > 1 && (
          <select
            value={filterEmp}
            onChange={e => setFilterEmp(e.target.value)}
            style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', color: 'var(--text2)', fontSize: 12, fontFamily: 'inherit' }}
          >
            <option value="">Todos los empleados</option>
            {activeEmps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        )}
      </div>

      {/* List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <div className="empty-premium">
            <div className="empty-premium-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                <line x1="1" y1="10" x2="23" y2="10"/>
              </svg>
            </div>
            <div className="empty-premium-title">Sin gastos {tab === 'pendiente' ? 'pendientes' : tab === 'aprobado' ? 'aprobados' : 'rechazados'}</div>
            <div className="empty-premium-sub">
              {tab === 'pendiente'
                ? 'Los empleados envían sus gastos desde la app móvil'
                : 'Aquí aparecerán los gastos procesados'}
            </div>
          </div>
        )}

        {filtered.map(g => (
          <div
            key={g.id}
            style={{
              background: 'rgba(255,255,255,.04)',
              border: `1px solid rgba(255,255,255,.07)`,
              borderRadius: 12,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {/* Header row */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              {/* Foto thumbnail */}
              {g.foto ? (
                <div
                  onClick={() => setLightboxSrc(g.foto)}
                  style={{
                    width: 52, height: 52, borderRadius: 8, overflow: 'hidden', flexShrink: 0,
                    cursor: 'pointer', border: '1px solid rgba(255,255,255,.1)',
                    background: 'var(--bg-500)',
                  }}
                  title="Ver justificante"
                >
                  <img src={g.foto} alt="Justificante" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
              ) : (
                <div style={{
                  width: 52, height: 52, borderRadius: 8, flexShrink: 0,
                  background: `${CATEGORIA_COLORS[g.categoria] || '#64748b'}22`,
                  border: `1px solid ${CATEGORIA_COLORS[g.categoria] || '#64748b'}44`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                }}>
                  {(CATEGORIA_LABELS[g.categoria] || '📎').split(' ')[0]}
                </div>
              )}

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text1)' }}>{g.empName || '—'}</span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 600,
                    background: `${CATEGORIA_COLORS[g.categoria] || '#64748b'}22`,
                    color: CATEGORIA_COLORS[g.categoria] || '#64748b',
                    border: `1px solid ${CATEGORIA_COLORS[g.categoria] || '#64748b'}44`,
                  }}>
                    {CATEGORIA_LABELS[g.categoria] || g.categoria || 'Otro'}
                  </span>
                  <span style={{
                    fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 700,
                    background: ESTADO_BG[g.estado] || 'rgba(255,255,255,.06)',
                    color: ESTADO_COLORS[g.estado] || 'var(--text3)',
                    border: `1px solid ${(ESTADO_COLORS[g.estado] || '#888') + '44'}`,
                    textTransform: 'uppercase', letterSpacing: '.4px',
                  }}>
                    {g.estado}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 3 }}>{g.concepto}</div>
                <div style={{ fontSize: 11, color: 'var(--text4)', marginTop: 2 }}>
                  {fds(g.fecha)}
                  {g.resolvedAt && g.resolvedBy && (
                    <span style={{ marginLeft: 8 }}>· {g.estado === 'aprobado' ? 'Aprobado' : 'Rechazado'} por {g.resolvedBy}</span>
                  )}
                </div>
                {g.motivoRechazo && (
                  <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3, fontStyle: 'italic' }}>
                    Motivo rechazo: {g.motivoRechazo}
                  </div>
                )}
              </div>

              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text1)', fontVariantNumeric: 'tabular-nums' }}>
                  {fmt(g.importe)} €
                </div>
              </div>
            </div>

            {/* Action row for pending */}
            {g.estado === 'pendiente' && rejectingId !== g.id && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => approve(g)}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(34,197,94,.3)',
                    background: 'rgba(34,197,94,.12)', color: '#22c55e', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ✓ Aprobar
                </button>
                <button
                  onClick={() => { setRejectingId(g.id); setRejectMotivo('') }}
                  style={{
                    flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)',
                    background: 'rgba(239,68,68,.1)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  }}
                >
                  ✕ Rechazar
                </button>
                {g.foto && (
                  <button
                    onClick={() => setLightboxSrc(g.foto)}
                    style={{
                      padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)',
                      background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer',
                    }}
                    title="Ver justificante"
                  >
                    🔍
                  </button>
                )}
              </div>
            )}

            {/* Reject form */}
            {g.estado === 'pendiente' && rejectingId === g.id && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', background: 'rgba(239,68,68,.06)', borderRadius: 8, border: '1px solid rgba(239,68,68,.2)' }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>Motivo del rechazo</div>
                <input
                  autoFocus
                  maxLength={200}
                  value={rejectMotivo}
                  onChange={e => setRejectMotivo(e.target.value.slice(0, 200))}
                  placeholder="Indica el motivo (opcional)"
                  style={{
                    background: 'var(--bg-500)', border: '1px solid rgba(255,255,255,.1)', borderRadius: 8,
                    padding: '7px 10px', color: 'var(--text1)', fontSize: 12, fontFamily: 'inherit',
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') reject(g, rejectMotivo.trim())
                    if (e.key === 'Escape') { setRejectingId(null); setRejectMotivo('') }
                  }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => { setRejectingId(null); setRejectMotivo('') }}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid rgba(255,255,255,.1)', background: 'transparent', color: 'var(--text3)', fontSize: 12, cursor: 'pointer' }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => reject(g, rejectMotivo.trim())}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid rgba(239,68,68,.3)', background: 'rgba(239,68,68,.15)', color: '#ef4444', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    Confirmar rechazo
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {lightboxSrc && (
        <div
          onClick={() => setLightboxSrc(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 2000,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out',
          }}
        >
          <div style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={lightboxSrc}
              alt="Justificante de gasto"
              style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 12, boxShadow: '0 32px 80px rgba(0,0,0,.8)', display: 'block' }}
            />
            <button
              onClick={() => setLightboxSrc(null)}
              style={{
                position: 'absolute', top: -14, right: -14, width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(0,0,0,.7)', border: '1px solid rgba(255,255,255,.2)', color: '#fff',
                fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
