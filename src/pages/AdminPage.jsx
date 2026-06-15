import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'
import { today, mhm, p2, ftime, fds, calcSecs, calcMin, gid, vacData, wkStart, recWorkSecs, sortedEmps } from '../utils/time.js'
import { WD, WK, ADMIN_PIN } from '../config/constants.js'

const PAGES = [
  { id:'dashboard',   ico:'📊', label:'Dashboard' },
  { id:'control',     ico:'🕐', label:'Control Live' },
  { id:'fichajes',    ico:'📋', label:'Fichajes' },
  { id:'solicitudes', ico:'🌴', label:'Solicitudes' },
  { id:'empleados',   ico:'👥', label:'Empleados' },
  { id:'informes',    ico:'📈', label:'Informes' },
  { id:'obras',       ico:'🏗️',  label:'Obras' },
  { id:'exportar',    ico:'📤', label:'Exportar' },
  { id:'auditoria',   ico:'🔍', label:'Auditoría' },
]

export default function AdminPage() {
  const { db, session, currentAdminPage, setAdminPage, saveDB, toast, setScreen, logout, openModal, closeModal, activeModal, modalData, syncStatus } = useAppStore()
  const [sideOpen, setSideOpen] = useState(false)
  const [mobilePage, setMobilePage] = useState(0)
  const isMobile = window.innerWidth < 768

  const doLogout = () => { logout(); try { if (window._fbSignOut) window._fbSignOut() } catch {} }

  const nav = (id) => { setAdminPage(id); setSideOpen(false) }

  const actPanel = PAGES.find(p => p.id === currentAdminPage) || PAGES[0]

  return (
    <div className="screen active" id="sAdmin">
      {/* Topbar */}
      <div className="adm-topbar">
        <div style={{ display:'flex', alignItems:'center', gap:12 }}>
          <button className="adm-menu-btn" onClick={() => setSideOpen(s => !s)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
          </button>
          <div className="adm-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><polygon points="12 2 2 7 12 12 22 7" fill="#5e6ad2"/><polyline points="2 17 12 22 22 17" stroke="#5e6ad2" strokeWidth="2" strokeLinejoin="round"/><polyline points="2 12 12 17 22 12" stroke="#8b97e8" strokeWidth="1.5" strokeLinejoin="round"/></svg>
            TIMES INC
          </div>
          <div className="adm-page-title">{actPanel.ico} {actPanel.label}</div>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <SyncBadge />
          {session.user && (
            <button className="btn btn-secondary btn-sm" onClick={() => setScreen('emp')}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Panel Emp.
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={doLogout}>Salir</button>
        </div>
      </div>

      <div style={{ display:'flex', flex:1, height:'calc(100vh - 56px)', overflow:'hidden', position:'relative' }}>
        {/* Sidebar */}
        <div className={`adm-sidebar${sideOpen ? ' open' : ''}`}>
          <div className="adm-sidebar-inner">
            <div className="adm-nav-section">MENÚ PRINCIPAL</div>
            {PAGES.map(p => (
              <div key={p.id} className={`adm-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => nav(p.id)}>
                <span className="adm-nav-ico">{p.ico}</span>
                <span>{p.label}</span>
              </div>
            ))}
            <div className="adm-nav-divider" />
            <div className="adm-nav-item" onClick={doLogout} style={{ color:'var(--danger)' }}>
              <span className="adm-nav-ico">🚪</span><span>Cerrar sesión</span>
            </div>
          </div>
        </div>
        {sideOpen && <div className="adm-sidebar-ov" onClick={() => setSideOpen(false)} />}

        {/* Main content */}
        <div className="adm-main">
          {currentAdminPage === 'dashboard'   && <PanelDashboard   db={db} toast={toast} />}
          {currentAdminPage === 'control'     && <PanelControl     db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'fichajes'    && <PanelFichajes    db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'solicitudes' && <PanelSolicitudes db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'empleados'   && <PanelEmpleados   db={db} toast={toast} saveDB={saveDB} openModal={openModal} closeModal={closeModal} activeModal={activeModal} modalData={modalData} />}
          {currentAdminPage === 'informes'    && <PanelInformes    db={db} toast={toast} />}
          {currentAdminPage === 'obras'       && <PanelObras       db={db} toast={toast} saveDB={saveDB} />}
          {currentAdminPage === 'exportar'    && <PanelExportar    db={db} toast={toast} />}
          {currentAdminPage === 'auditoria'   && <PanelAuditoria   db={db} />}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="adm-mobile-nav">
        {PAGES.slice(0,5).map(p => (
          <div key={p.id} className={`adm-mobile-nav-item${currentAdminPage===p.id?' active':''}`} onClick={() => setAdminPage(p.id)}>
            <span>{p.ico}</span>
            <span>{p.label.slice(0,8)}</span>
          </div>
        ))}
        <div className={`adm-mobile-nav-item${['informes','obras','exportar','auditoria'].includes(currentAdminPage)?' active':''}`} onClick={() => setSideOpen(true)}>
          <span>⋯</span><span>Más</span>
        </div>
      </div>
    </div>
  )
}

function SyncBadge() {
  const syncStatus = useAppStore(s => s.syncStatus)
  return (
    <div style={{ fontSize:11, fontWeight:600, display:'flex', alignItems:'center', gap:4, color: syncStatus==='synced'?'var(--green)':syncStatus==='syncing'?'var(--orange)':'var(--danger)' }}>
      <span style={{ width:6, height:6, borderRadius:'50%', background:'currentColor', flexShrink:0 }} />
      {syncStatus==='synced'?'Sincronizado':syncStatus==='syncing'?'Guardando…':'Sin conexión'}
    </div>
  )
}

// ─── PANEL DASHBOARD ──────────────────────────────────────────────────────────
function PanelDashboard({ db }) {
  const now = new Date()
  const todayStr = today()
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []

  const liveRecs = recs.filter(r => !r.fin)
  const todayRecs = recs.filter(r => r.inicio.startsWith(todayStr))
  const checkedIn = new Set(liveRecs.map(r => r.empId)).size

  const ws = wkStart(now)
  const weekRecs = recs.filter(r => r.fin && new Date(r.inicio) >= ws)
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0)

  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = recs.filter(r => r.fin && r.inicio.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)

  const vacPend = (db.vacaciones || []).filter(v => v.estado === 'pendiente').length

  const heat = buildHeatmap(recs, emps.length)
  const recentAudit = (db.audit || []).slice(-5).reverse()

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Dashboard</h1>
        <div className="adm-panel-sub">{now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}</div>
      </div>

      <div className="adm-stats-grid">
        {[
          { label:'Fichados ahora', val: checkedIn, total: emps.length, color:'var(--green)', bg:'var(--green-dim)', ico:'▶️' },
          { label:'Horas esta semana', val: mhm(weekMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:'⏱️' },
          { label:'Horas este mes', val: mhm(monthMin), color:'var(--teal)', bg:'rgba(12,200,232,.1)', ico:'📅' },
          { label:'Solicitudes pendientes', val: vacPend, color:'var(--orange)', bg:'var(--orange-dim)', ico:'📬' },
        ].map(({ label, val, total, color, bg, ico }) => (
          <div key={label} className="adm-stat-card">
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              <div style={{ width:34, height:34, background:bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{ico}</div>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text3)' }}>{label}</div>
            </div>
            <div style={{ fontSize:28, fontWeight:800, letterSpacing:'-1px', color }}>
              {val}{total !== undefined ? <span style={{ fontSize:14, color:'var(--text3)', fontWeight:400 }}>/{total}</span> : ''}
            </div>
          </div>
        ))}
      </div>

      {/* Live workers */}
      {liveRecs.length > 0 && (
        <div className="adm-section">
          <div className="adm-section-title">👥 Trabajando ahora</div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
            {liveRecs.map(r => {
              const emp = emps.find(e => e.id === r.empId)
              const t = calcSecs(r)
              return (
                <div key={r.id} className="live-chip">
                  <div className="live-chip-av" style={{ background: emp?.color || 'var(--primary)' }}>
                    {(emp?.initials || emp?.name?.slice(0,2) || '?').toUpperCase()}
                  </div>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{emp?.name?.split(' ')[0] || r.empName}</div>
                    <div style={{ fontSize:10, color:'var(--text3)' }}>{mhm(Math.floor(t.work/60))} · {r.centro}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Heatmap */}
      <div className="adm-section">
        <div className="adm-section-title">📆 Actividad (últimas 12 semanas)</div>
        <Heatmap data={heat} />
      </div>

      {/* Recent audit */}
      {recentAudit.length > 0 && (
        <div className="adm-section">
          <div className="adm-section-title">🔍 Actividad reciente</div>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {recentAudit.map((a, i) => (
              <div key={i} className="audit-row">
                <div className="audit-ico">📝</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600 }}>{a.action}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{a.user} · {a.ts ? new Date(a.ts).toLocaleString('es-ES', { hour:'2-digit', minute:'2-digit', month:'short', day:'numeric' }) : ''}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildHeatmap(recs, empCount) {
  const map = {}
  const now = new Date()
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0,10)
    map[k] = { count: 0, min: 0 }
  }
  recs.filter(r => r.fin).forEach(r => {
    const k = r.inicio.slice(0,10)
    if (map[k]) { map[k].count++; map[k].min += calcMin(r) }
  })
  return Object.entries(map).map(([date, v]) => ({ date, ...v }))
}

function Heatmap({ data }) {
  const max = Math.max(1, ...data.map(d => d.count))
  const weeks = []
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i+7))

  return (
    <div style={{ overflowX:'auto', paddingBottom:4 }}>
      <div style={{ display:'flex', gap:3 }}>
        {weeks.map((week, wi) => (
          <div key={wi} style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {week.map(({ date, count, min }) => {
              const pct = count / max
              const alpha = pct < 0.01 ? 0 : Math.max(0.15, pct)
              return (
                <div key={date} title={`${date}: ${count} fichajes · ${mhm(Math.floor(min))}`}
                  style={{ width:12, height:12, borderRadius:2, flexShrink:0,
                    background: alpha < 0.01 ? 'var(--bg-500)' : `rgba(94,106,210,${alpha})`,
                    border: alpha > 0 ? '1px solid rgba(94,106,210,.2)' : '1px solid var(--border)' }} />
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PANEL CONTROL LIVE ───────────────────────────────────────────────────────
function PanelControl({ db, toast, saveDB }) {
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin)
  const [tick, setTick] = useState(0)
  useEffect(() => { const iv = setInterval(() => setTick(t => t+1), 5000); return () => clearInterval(iv) }, [])

  const force = (rec) => {
    if (!window.confirm(`¿Forzar cierre de jornada de ${rec.empName}?`)) return
    const now = new Date().toISOString()
    const breaks = [...(rec.breaks || [])]
    if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
    const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
    const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
    const records = recs.map(r => r.id === rec.id ? closed : r)
    saveDB({ records })
    toast('✅ Jornada cerrada forzosamente')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Control en tiempo real</h1>
        <div className="adm-panel-sub">{liveRecs.length} empleados activos de {emps.length}</div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Tiempo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {emps.map(e => {
              const live = liveRecs.find(r => r.empId === e.id)
              const t = live ? calcSecs(live) : null
              return (
                <tr key={e.id} style={{ opacity: live ? 1 : 0.4 }}>
                  <td>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:28, height:28, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                        {(e.initials||e.name.slice(0,2)).toUpperCase()}
                      </div>
                      {e.name}
                    </div>
                  </td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{live?.centro || e.centroTrabajo || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{live ? ftime(live.inicio) : '—'}</td>
                  <td style={{ fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{t ? mhm(Math.floor(t.work/60)) : '—'}</td>
                  <td>
                    {live ? (
                      <span className={`badge ${live.enDescanso?'badge-orange':'badge-green'}`}>
                        {live.enDescanso ? '⏸ Descanso' : '▶ Trabajando'}
                      </span>
                    ) : <span className="badge">Libre</span>}
                  </td>
                  <td>{live && <button className="btn btn-sm btn-danger" onClick={() => force(live)}>Cerrar</button>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL FICHAJES ───────────────────────────────────────────────────────────
function PanelFichajes({ db, toast, saveDB }) {
  const [search, setSearch] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterEmp, setFilterEmp] = useState('')
  const emps = db.employees || []
  const recs = (db.records || []).filter(r => r.fin)

  const filtered = recs.filter(r => {
    if (filterDate && !r.inicio.startsWith(filterDate)) return false
    if (filterEmp && r.empId !== filterEmp) return false
    if (search) {
      const q = search.toLowerCase()
      if (!r.empName?.toLowerCase().includes(q) && !r.centro?.toLowerCase().includes(q)) return false
    }
    return true
  }).sort((a,b) => b.inicio.localeCompare(a.inicio)).slice(0, 200)

  const del = (id) => {
    if (!window.confirm('¿Eliminar este fichaje?')) return
    saveDB({ records: (db.records||[]).filter(r => r.id !== id) })
    toast('Fichaje eliminado')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Fichajes</h1>
        <div className="adm-panel-sub">{recs.length} registros totales</div>
      </div>
      <div className="adm-filters">
        <input placeholder="Buscar empleado o centro…" value={search} onChange={e => setSearch(e.target.value)} />
        <input type="date" value={filterDate} onChange={e => setFilterDate(e.target.value)} />
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
          <option value="">Todos los empleados</option>
          {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Centro</th><th>Entrada</th><th>Salida</th><th>Trabajo</th><th>Descanso</th><th></th></tr></thead>
          <tbody>
            {filtered.map(r => {
              const wm = Math.floor(recWorkSecs(r)/60)
              const bm = Math.floor((r.breakSecs||0)/60)
              const over = wm > WD
              return (
                <tr key={r.id}>
                  <td>{r.empName}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{r.centro || '—'}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{ftime(r.inicio)}</td>
                  <td style={{ fontVariantNumeric:'tabular-nums', fontSize:12 }}>{ftime(r.fin)}</td>
                  <td style={{ fontWeight:700, color: over ? 'var(--orange)' : undefined }}>{mhm(wm)}</td>
                  <td style={{ color:'var(--text3)', fontSize:12 }}>{mhm(bm)}</td>
                  <td><button className="btn btn-sm btn-danger" onClick={() => del(r.id)}>✕</button></td>
                </tr>
              )
            })}
            {!filtered.length && <tr><td colSpan={7} className="empty">Sin resultados</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL SOLICITUDES ────────────────────────────────────────────────────────
function PanelSolicitudes({ db, toast, saveDB }) {
  const vacs = (db.vacaciones || []).sort((a,b) => b.ts?.localeCompare(a.ts||'')||0)
  const pend = vacs.filter(v => v.estado === 'pendiente')
  const rest = vacs.filter(v => v.estado !== 'pendiente')

  const act = (id, estado) => {
    const updated = (db.vacaciones||[]).map(v => v.id === id ? { ...v, estado, resolvedAt: new Date().toISOString() } : v)
    saveDB({ vacaciones: updated })
    toast(estado === 'aprobada' ? '✅ Solicitud aprobada' : '❌ Solicitud rechazada')
  }

  const VacRow = ({ v }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)', marginBottom:8 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{v.empName}</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)} · {v.dias} días</div>
        {v.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:2 }}>{v.motivo}</div>}
      </div>
      <div className={`badge${v.estado==='aprobada'?' badge-green':v.estado==='rechazada'?' badge-red':' badge-orange'}`}>
        {v.estado==='aprobada'?'✓ Aprobada':v.estado==='rechazada'?'✗ Rechazada':'⏳ Pendiente'}
      </div>
      {v.estado === 'pendiente' && (
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-primary" onClick={() => act(v.id, 'aprobada')}>✓</button>
          <button className="btn btn-sm btn-danger" onClick={() => act(v.id, 'rechazada')}>✗</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Solicitudes</h1>
        <div className="adm-panel-sub">{pend.length} pendientes</div>
      </div>
      {pend.length > 0 && (
        <>
          <div className="adm-section-title" style={{ padding:'0 0 12px' }}>⏳ Pendientes de revisión</div>
          {pend.map(v => <VacRow key={v.id} v={v} />)}
        </>
      )}
      {rest.length > 0 && (
        <>
          <div className="adm-section-title" style={{ padding:'16px 0 12px' }}>Historial</div>
          {rest.slice(0, 30).map(v => <VacRow key={v.id} v={v} />)}
        </>
      )}
      {!vacs.length && <div className="empty">Sin solicitudes</div>}
    </div>
  )
}

// ─── PANEL EMPLEADOS ──────────────────────────────────────────────────────────
function PanelEmpleados({ db, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  const emps = sortedEmps(db)
  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)

  const EMPTY_EMP = { id: gid(), name:'', pin:'', email:'', role:'emp', empresa:'', centroTrabajo:'', color:'#5E6AD2', baja:false, fechaAlta: today() }
  const [form, setForm] = useState(EMPTY_EMP)

  const openNew = () => { setForm({ ...EMPTY_EMP, id: gid() }); setShowForm(true); setEditEmp(null) }
  const openEdit = (e) => { setForm({ ...e }); setShowForm(true); setEditEmp(e.id) }

  const saveEmp = () => {
    if (!form.name.trim()) { toast('Nombre requerido'); return }
    if (!form.pin || form.pin.length < 4) { toast('PIN de mínimo 4 dígitos'); return }
    const exists = (db.employees||[]).find(e => e.pin === form.pin && e.id !== form.id)
    if (exists) { toast('PIN ya está en uso'); return }
    const emps2 = editEmp
      ? (db.employees||[]).map(e => e.id === editEmp ? form : e)
      : [...(db.employees||[]), form]
    saveDB({ employees: emps2 })
    toast(editEmp ? '✅ Empleado actualizado' : '✅ Empleado creado')
    setShowForm(false)
  }

  const del = (id) => {
    if (!window.confirm('¿Dar de baja a este empleado?')) return
    const emps2 = (db.employees||[]).map(e => e.id === id ? { ...e, baja:true, fechaBaja: today() } : e)
    saveDB({ employees: emps2 })
    toast('Empleado dado de baja')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Empleados</h1>
        <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo</button>
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editEmp ? 'Editar empleado' : 'Nuevo empleado'}</div>
          <div className="field-row">
            <div className="field"><label>Nombre completo *</label><input value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} /></div>
            <div className="field"><label>PIN (4-6 dígitos) *</label><input value={form.pin} maxLength={6} onChange={e => setForm(f=>({...f,pin:e.target.value.replace(/\D/,'')}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" value={form.email||''} onChange={e => setForm(f=>({...f,email:e.target.value}))} /></div>
            <div className="field"><label>Rol</label>
              <select value={form.role||'emp'} onChange={e => setForm(f=>({...f,role:e.target.value}))}>
                <option value="emp">Empleado</option>
                <option value="encargado">Encargado</option>
                <option value="jefe_obra">Jefe de Obra</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Empresa</label><input value={form.empresa||''} onChange={e => setForm(f=>({...f,empresa:e.target.value}))} /></div>
            <div className="field"><label>Centro de trabajo</label><input value={form.centroTrabajo||''} onChange={e => setForm(f=>({...f,centroTrabajo:e.target.value}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Color avatar</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {['#5E6AD2','#7C5CFF','#00D2FF','#00C48C','#FF6B6B','#FFB547','#E040FB'].map(c => (
                  <div key={c} onClick={() => setForm(f=>({...f,color:c}))} style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border: form.color===c?'2px solid white':'2px solid transparent', transition:'.15s' }} />
                ))}
              </div>
            </div>
            <div className="field"><label>Fecha alta</label><input type="date" value={form.fechaAlta||''} onChange={e => setForm(f=>({...f,fechaAlta:e.target.value}))} /></div>
          </div>
          <div className="modal-btns">
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={saveEmp}>Guardar</button>
          </div>
        </div>
      )}

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>PIN</th><th>Rol</th><th>Empresa</th><th>Alta</th><th></th></tr></thead>
          <tbody>
            {emps.map(e => (
              <tr key={e.id} style={{ opacity: e.baja ? 0.4 : 1 }}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:28, height:28, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>
                      {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    </div>
                    <span>{e.name}</span>
                  </div>
                </td>
                <td style={{ fontFamily:'monospace', letterSpacing:2 }}>{'•'.repeat(e.pin?.length||4)}</td>
                <td>
                  <span className={`badge${e.role==='encargado'?' badge-purple':e.role==='jefe_obra'?' badge-blue':''}`}>
                    {e.role==='encargado'?'⭐ Enc.':e.role==='jefe_obra'?'🏗️ JO':'👷 Emp'}
                  </span>
                </td>
                <td style={{ color:'var(--text3)', fontSize:12 }}>{e.empresa || '—'}</td>
                <td style={{ color:'var(--text3)', fontSize:12 }}>{e.fechaAlta || '—'}</td>
                <td>
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm btn-secondary" onClick={() => openEdit(e)}>✏️</button>
                    {!e.baja && <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>Baja</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL INFORMES ───────────────────────────────────────────────────────────
function PanelInformes({ db }) {
  const emps = (db.employees || []).filter(e => !e.baja)
  const recs = db.records || []
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const rows = sortedEmps(db).filter(e => !e.baja).map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio.startsWith(mk))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const expected = WK * 4
    const diff = totalMin - expected
    const vac = vacData(e.id, db)
    return { e, totalMin, diff, days: eRecs.length, vac }
  })

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Informes</h1>
        <div className="adm-panel-sub">{now.toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</div>
      </div>
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Empleado</th><th>Días</th><th>Total mes</th><th>Esperadas</th><th>Diferencia</th><th>Vac. disp.</th></tr></thead>
          <tbody>
            {rows.map(({ e, totalMin, diff, days, vac }) => (
              <tr key={e.id}>
                <td>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:24, height:24, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, flexShrink:0 }}>
                      {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    </div>
                    {e.name}
                  </div>
                </td>
                <td>{days}</td>
                <td style={{ fontWeight:700 }}>{mhm(totalMin)}</td>
                <td style={{ color:'var(--text3)' }}>{mhm(WK * 4)}</td>
                <td style={{ fontWeight:700, color: diff >= 0 ? 'var(--green)' : 'var(--danger)' }}>
                  {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))}
                </td>
                <td>{vac.available}d</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── PANEL OBRAS ──────────────────────────────────────────────────────────────
function PanelObras({ db, toast, saveDB }) {
  const obras = db.centrosTrabajo || []
  const [newObra, setNewObra] = useState('')

  const addObra = () => {
    const o = newObra.trim()
    if (!o) { toast('Escribe un nombre'); return }
    if (obras.includes(o)) { toast('Ya existe'); return }
    saveDB({ centrosTrabajo: [...obras, o] })
    setNewObra('')
    toast('✅ Centro añadido')
  }

  const del = (o) => {
    if (!window.confirm(`¿Eliminar "${o}"?`)) return
    saveDB({ centrosTrabajo: obras.filter(x => x !== o) })
    toast('Centro eliminado')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title">Centros / Obras</h1>
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        <input style={{ flex:1 }} placeholder="Nombre del centro o obra…" value={newObra} onChange={e => setNewObra(e.target.value)} onKeyDown={e => e.key==='Enter'&&addObra()} />
        <button className="btn btn-primary" onClick={addObra}>Añadir</button>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {!obras.length && <div className="empty">Sin centros de trabajo</div>}
        {obras.map(o => (
          <div key={o} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(94,106,210,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🏗️</div>
            <div style={{ flex:1, fontSize:14, fontWeight:600 }}>{o}</div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>
              {(db.records||[]).filter(r=>r.centro===o&&r.fin).length} fichajes
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => del(o)}>✕</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── PANEL EXPORTAR ───────────────────────────────────────────────────────────
function PanelExportar({ db, toast }) {
  const emps = (db.employees||[]).filter(e => !e.baja)
  const [selEmp, setSelEmp] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const exportCSV = () => {
    let recs = (db.records||[]).filter(r => r.fin)
    if (selEmp) recs = recs.filter(r => r.empId === selEmp)
    if (from) recs = recs.filter(r => r.inicio.slice(0,10) >= from)
    if (to)   recs = recs.filter(r => r.inicio.slice(0,10) <= to)
    if (!recs.length) { toast('Sin datos para exportar'); return }

    const rows = [['Empleado','Centro','Empresa','Entrada','Salida','Horas trabajo','Horas descanso']]
    recs.forEach(r => {
      const wm = Math.floor(recWorkSecs(r)/60), bm = Math.floor((r.breakSecs||0)/60)
      rows.push([r.empName, r.centro||'', r.empresa||'',
        new Date(r.inicio).toLocaleString('es-ES'), new Date(r.fin).toLocaleString('es-ES'),
        `${Math.floor(wm/60)}:${p2(wm%60)}`, `${Math.floor(bm/60)}:${p2(bm%60)}`])
    })

    const csv = '﻿' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type:'text/csv;charset=utf-8;' }))
    a.download = `fichajes_${from||'todo'}_${to||'hoy'}.csv`
    a.click()
    toast('✅ CSV descargado')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header"><h1 className="adm-panel-title">Exportar datos</h1></div>
      <div className="card" style={{ maxWidth:400 }}>
        <div className="field"><label>Empleado</label>
          <select value={selEmp} onChange={e => setSelEmp(e.target.value)}>
            <option value="">Todos</option>
            {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div className="field-row">
          <div className="field"><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
        </div>
        <button className="btn btn-primary btn-full" style={{ marginTop:8 }} onClick={exportCSV}>
          📥 Exportar CSV
        </button>
      </div>
    </div>
  )
}

// ─── PANEL AUDITORÍA ──────────────────────────────────────────────────────────
function PanelAuditoria({ db }) {
  const audit = (db.audit || []).slice().reverse()
  return (
    <div className="adm-panel">
      <div className="adm-panel-header"><h1 className="adm-panel-title">Auditoría</h1></div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {!audit.length && <div className="empty">Sin registros de auditoría</div>}
        {audit.map((a, i) => (
          <div key={i} className="audit-row">
            <div className="audit-ico">📝</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>{a.action}</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{a.user}</div>
              {a.detail && <div style={{ fontSize:11, color:'var(--text4)', marginTop:2 }}>{a.detail}</div>}
            </div>
            <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right', flexShrink:0 }}>
              {a.ts ? new Date(a.ts).toLocaleString('es-ES') : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
