import { useMemo, useCallback } from 'react'
import { vacData, p2, calcMin, mhm, today, localDateStr } from '../../utils/time.js'
import { calcStreak } from '../../utils/streaks.js'
import { applyBrandColor } from '../../utils/webauthn.js'
import TabGastos from '../TabGastos.jsx'
import TabDenuncia from '../TabDenuncia.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'

export function TabPerfil({ u, session, db, saveDB, toast, doLogout, openModal, perfilView = 'perfil', setPerfilView }) {
  // Hooks DEBEN ir antes de cualquier early return (Rules of Hooks)
  const myRecs = useMemo(() => (db.records || []).filter(r => r.empId === u.id && r.fin), [db.records, u.id])
  const saveAccentColor = useCallback((color) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, accentColor: color || undefined } : e)
    saveDB({ employees: emps2 })
    if (color) applyBrandColor(color)
  }, [db.employees, u.id, saveDB])
  const saveReminderTime = useCallback((time) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime: time || undefined } : e)
    saveDB({ employees: emps2 })
    if (time && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }
    toast(time ? `Recordatorio activado a las ${time}` : 'Recordatorio desactivado', 2500, 'ok')
  }, [db.employees, u.id, saveDB, toast])

  if (perfilView === 'gastos')   return <TabGastos db={db} u={u} toast={toast} saveDB={saveDB} onBack={() => setPerfilView('perfil')} />
  if (perfilView === 'denuncia') return <TabDenuncia db={db} u={u} toast={toast} saveDB={saveDB} onBack={() => setPerfilView('perfil')} />

  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:140, borderRadius:14 }} />
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
        <div className="skeleton" style={{ height:200, borderRadius:14 }} />
      </div>
    </div>
  )
  const initials = u.initials || u.name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || '?'
  const vac = vacData(u.id, db)
  const now = new Date()
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const monthMin = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0)
  const pendingDocs = (db.documentos || []).filter(d => d.empId === u.id && !d.firma).length

  // Personal stats (myRecs ya calculado arriba con useMemo)
  const yearStr = `${now.getFullYear()}-`
  const yearRecs = myRecs.filter(r => r.inicio?.startsWith(yearStr))
  const yearMin = yearRecs.reduce((s, r) => s + calcMin(r), 0)
  // localDateStr, no r.inicio.slice(0,10): inicio se guarda en UTC, esto cuenta
  // días distintos en hora local (un fichaje de madrugada no debe archivarse
  // bajo el día UTC anterior).
  const yearDays = new Set(yearRecs.map(r => localDateStr(new Date(r.inicio)))).size
  const dayMap = {}
  myRecs.forEach(r => { if (!r.inicio) return; const d = localDateStr(new Date(r.inicio)); dayMap[d] = (dayMap[d]||0) + calcMin(r) })
  const recordMin = Math.max(0, ...Object.values(dayMap).filter(Boolean))
  // calcStreak (utils/streaks.js), no una tercera reimplementación inline: había
  // tres cálculos de racha distintos en la app (aquí, en ModalLogros y en
  // Inicio) que podían mostrar números diferentes al mismo empleado en el mismo
  // instante — y ésta en concreto heredaba el mismo bug UTC/local de las otras.
  const streak = calcStreak(db.records, u.id, today())

  return (
    <PullToRefresh>
      <div className="prf-hero">
        <div style={{ position:'relative', marginBottom:14 }}>
          <div className="prf-av-wrap">
            <div className="prf-av" style={{ background: u.color || 'var(--primary)' }}>{initials}</div>
          </div>
        </div>
        <div className="prf-name">{u.name}</div>
        <div className="prf-role">{u.role === 'encargado' ? '⭐ Encargado' : u.role === 'jefe_obra' ? '🏗️ Jefe de Obra' : '👷 Empleado'}</div>
        <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', marginBottom:10 }}>{u.empresa || u.centroTrabajo || '—'}</div>
        <div className="prf-status-pill"><span className="dot" />Activo</div>
      </div>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:0, margin:'12px 16px 16px', background:'var(--glass-bg)', backdropFilter:'blur(20px)', WebkitBackdropFilter:'blur(20px)', border:'1px solid var(--glass-border)', borderRadius:'var(--r-lg)', flexShrink:0 }}>
        {[
          { val: mhm(monthMin), lbl:'Mes actual', color:'var(--primary-light)' },
          { val: vac.available, lbl:'Días vac.', color:'var(--green)' },
          { val: vac.months, lbl:'Antigüedad', color:'var(--teal)' },
        ].map(({ val, lbl, color }, i) => (
          <div key={lbl} style={{ padding:'16px 8px', textAlign:'center', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <div className="counter-val" style={{ fontSize:20, fontWeight:800, letterSpacing:'-.4px', color }}>{val}</div>
            <div style={{ fontSize:9, color:'var(--text4)', textTransform:'uppercase', letterSpacing:'.5px', fontWeight:700, marginTop:4 }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Personal stats */}
      <div style={{ margin:'0 16px 16px' }}>
        <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>Mis estadísticas</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:10 }}>
          {[
            { val:`${yearDays}`, unit:'días', lbl:'Trabajados (año)', ico:'📅', color:'var(--primary-light)', bg:'var(--primary-dim)' },
            { val:mhm(yearMin), unit:'', lbl:'Horas totales (año)', ico:'⏱️', color:'var(--teal)', bg:'rgba(0,212,255,.1)' },
            { val:`${streak}`, unit:'días', lbl:'Racha actual', ico:'🔥', color:'var(--orange)', bg:'var(--orange-dim)' },
            { val:recordMin > 0 ? mhm(recordMin) : '—', unit:'', lbl:'Récord diario', ico:'🏆', color:'var(--green)', bg:'var(--green-dim)' },
          ].map(({ val, unit, lbl, ico, color, bg }) => (
            <div key={lbl} style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--r-lg)', padding:'14px 12px', backdropFilter:'blur(10px)', WebkitBackdropFilter:'blur(10px)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14 }}>{ico}</div>
                <div style={{ fontSize:10, color:'var(--text3)', fontWeight:600, lineHeight:1.2 }}>{lbl}</div>
              </div>
              <div style={{ fontSize:22, fontWeight:800, color, letterSpacing:'-.5px' }}>{val}<span style={{ fontSize:12, fontWeight:500, opacity:.7, marginLeft:2 }}>{unit}</span></div>
            </div>
          ))}
        </div>

      </div>

      {/* Cierres mensuales pendientes de firma */}
      {(() => {
        const pendingCierres = (db.cierres || []).filter(c => c.empId === u.id && c.estado === 'pendiente' && !c.desactualizado)
        if (!pendingCierres.length) return null
        return (
          <div onClick={() => openModal('cierreSign')} style={{ margin:'0 0 14px', padding:'12px 16px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r-lg)', cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:22 }}>📋</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--orange)' }}>Cierre mensual pendiente de firma</div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{pendingCierres.map(c => c.mes).join(', ')} · Toca para revisar y firmar</div>
            </div>
            <span style={{ minWidth:20, height:20, borderRadius:10, background:'var(--orange)', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', flexShrink:0 }}>{pendingCierres.length}</span>
          </div>
        )
      })()}

      {/* Sección: Gastos y Denuncia */}
      <div className="prf-section">
        <div className="prf-section-title">Más opciones</div>
        <div className="prf-section-grid">
          <div className="prf-section-card" onClick={() => setPerfilView('gastos')}>
            <div className="prf-section-ico" style={{ background:'rgba(16,185,129,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#34d399' }}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <span className="prf-section-lbl">Gastos</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => setPerfilView('denuncia')}>
            <div className="prf-section-ico" style={{ background:'rgba(99,102,241,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#a5b4fc' }}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span className="prf-section-lbl">Denuncia</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* Sección: Mi cuenta */}
      <div className="prf-section">
        <div className="prf-section-title">Mi cuenta</div>
        <div className="prf-section-grid">
          <div className="prf-section-card" onClick={() => openModal('infoPersonal')}>
            <div className="prf-section-ico" style={{ background:'rgba(99,102,241,.15)' }}>
              <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            </div>
            <span className="prf-section-lbl">Información personal</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => openModal('documentos')}>
            <div className="prf-section-ico" style={{ background:'rgba(59,130,246,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#60a5fa' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <span className="prf-section-lbl">Documentos</span>
              {pendingDocs > 0 && <div style={{ fontSize:10, color:'var(--orange)', fontWeight:600 }}>{pendingDocs} pendiente{pendingDocs > 1 ? 's' : ''} de firma</div>}
            </div>
            {pendingDocs > 0 && <span style={{ minWidth:18, height:18, borderRadius:9, background:'var(--orange)', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 5px', flexShrink:0 }}>{pendingDocs}</span>}
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => openModal('sign')}>
            <div className="prf-section-ico" style={{ background:'rgba(124,92,255,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#a78bfa' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <span className="prf-section-lbl">Firma digital</span>
              {!db.firmas?.[u?.id]?.main && <div style={{ fontSize:10, color:'var(--orange)', fontWeight:600 }}>Sin configurar</div>}
            </div>
            {!db.firmas?.[u?.id]?.main && <span style={{ fontSize:16, color:'var(--orange)', flexShrink:0 }}>!</span>}
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => openModal('miQR')}>
            <div className="prf-section-ico" style={{ background:'rgba(16,185,129,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#34d399' }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" fill="#34d399" stroke="none"/></svg>
            </div>
            <span className="prf-section-lbl">Mi código QR</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* Sección: Personalización */}
      <div className="prf-section">
        <div className="prf-section-title">Personalización</div>
        <div className="prf-section-grid">
          <div className="prf-section-card" onClick={() => openModal('temas')}>
            <div className="prf-section-ico" style={{ background:'rgba(139,92,246,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#8b5cf6' }}><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/><path d="M3.05 11a9 9 0 1 0 .5-2.6"/></svg>
            </div>
            <span className="prf-section-lbl">Temas y colores</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => openModal('configuracion')}>
            <div className="prf-section-ico" style={{ background:'rgba(14,165,233,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#38bdf8' }}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </div>
            <span className="prf-section-lbl">Configuración</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
          <div className="prf-section-card" onClick={() => openModal('logros')}>
            <div className="prf-section-ico" style={{ background:'rgba(245,158,11,.15)' }}>
              <svg viewBox="0 0 24 24" style={{ stroke:'#f59e0b' }}><circle cx="12" cy="8" r="6"/><path d="M8.56 2.75c4.37 6.03 6.02 9.42 8.03 17.72m2.54-15.38c-3.72 4.35-8.94 5.66-16.88 5.85m19.5 1.9c-3.5-.93-6.63-.82-8.94 0-2.58.92-5.01 2.86-7.44 6.32"/></svg>
            </div>
            <span className="prf-section-lbl">Logros</span>
            <svg className="prf-section-arr" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>
      </div>

      {/* Cerrar sesión */}
      <div style={{ margin:'4px 16px 24px' }}>
        <div className="prf-section-card prf-logout-card" onClick={doLogout}>
          <div className="prf-section-ico" style={{ background:'rgba(239,68,68,.12)' }}>
            <svg viewBox="0 0 24 24" style={{ stroke:'#ef4444' }}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </div>
          <span className="prf-section-lbl" style={{ color:'var(--danger)' }}>Cerrar sesión</span>
          <svg className="prf-section-arr" viewBox="0 0 24 24" style={{ stroke:'var(--danger)' }}><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>

      {/* Historial de cambios */}
      {(() => {
        const myAudit = (db.audit || [])
          .filter(a => a.detail?.includes(u.name) || a.empId === u.id || (a.detail && a.detail.includes(u.id)))
          .slice(-20)
          .reverse()
        if (!myAudit.length) return null
        return (
          <div className="card" style={{ marginTop:12 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'var(--text2)', marginBottom:10 }}>Historial de cambios</div>
            {myAudit.slice(0, 5).map((a, i) => (
              <div key={i} style={{ display:'flex', gap:10, padding:'8px 0', borderBottom: i < Math.min(myAudit.length,5)-1 ? '1px solid var(--border)' : 'none' }}>
                <div style={{ width:32, height:32, borderRadius:10, background:'var(--bg-500)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>📋</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.action}</div>
                  {a.detail && <div style={{ fontSize:11, color:'var(--text3)', marginTop:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.detail}</div>}
                  <div style={{ fontSize:10, color:'var(--text4)', marginTop:2 }}>{new Date(a.ts).toLocaleString('es-ES')}</div>
                </div>
              </div>
            ))}
          </div>
        )
      })()}
    </PullToRefresh>
  )
}
