import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, ftime, fds, calcSecs, calcMin, gid, recWorkSecs } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { flagStaleCierreForEdit, clipBreaksToWindow, notifyStaleCierre } from '../../utils/adminHelpers.js'

export default function PanelMiObra({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const enc = session.user
  const misCentros = enc?.obrasAsignadas || []
  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin && (misCentros.includes(e.centroTrabajo) || (e.obrasAsignadas || []).some(o => misCentros.includes(o))))
  const empIds = new Set(emps.map(e => e.id))
  const recs = db.records || []
  const liveRecs = recs.filter(r => !r.fin && empIds.has(r.empId))
  const pendRecs = recs.filter(r => r.fin && empIds.has(r.empId) && !r.aceptada)
    .sort((a,b) => (b.inicio||'').localeCompare(a.inicio||'')).slice(0, 50)
  const correcsPend = (db.correccionesFichaje || []).filter(c => c.estado === 'pendiente' && empIds.has(c.empId)).sort((a,b) => b.ts - a.ts)
  const correcsHist = (db.correccionesFichaje || []).filter(c => c.estado !== 'pendiente' && empIds.has(c.empId)).sort((a,b) => b.ts - a.ts).slice(0, 15)
  const teamAus = [
    ...(db.medicos  || []).map(a => ({ ...a, tipoAus:'medico'   })),
    ...(db.ausencias|| []).map(a => ({ ...a, tipoAus:'ausencia' })),
  ].filter(a => empIds.has(a.empId)).sort((a,b) => (b.fechaInicio||'').localeCompare(a.fechaInicio||'')).slice(0, 30)

  const [tab, setTab]       = useState('live')
  const [editing, setEditing] = useState(null)
  const editingPushed = useRef(false)
  useEffect(() => {
    if (!editing) {
      if (editingPushed.current) { editingPushed.current = false; window.history.back() }
      return
    }
    window.history.pushState({ timesModal: true }, '')
    editingPushed.current = true
    const onPop = () => { if (!editingPushed.current) return; editingPushed.current = false; setEditing(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [editing])
  const [ausForm, setAusForm] = useState({ empId:'', tipo:'medico', fechaInicio:today(), fechaFin:today(), motivo:'' })

  const aceptar = (rec) => {
    const updated = recs.map(r => r.id === rec.id ? { ...r, aceptada: true, aceptadaPor: enc.name, aceptadaAt: new Date().toISOString() } : r)
    const withAudit = auditLog(db, 'Jornada aceptada', `${rec.empName} · ${fds(rec.inicio)}`, enc.name)
    saveDB({ records: updated, audit: withAudit.audit })
    queuePush(rec.empId, '✅ Jornada validada', `Tu jornada del ${fds(rec.inicio)} ha sido validada por ${enc.name}.`, 'jornada', '/?tab=jornada')
    toast('Jornada aceptada', 3000, 'ok')
  }

  const startEdit = (rec) => setEditing({ id: rec.id, inicio: rec.inicio?.slice(0,16) || '', fin: rec.fin ? rec.fin.slice(0,16) : '', motivo:'' })

  const saveEdit = () => {
    if (!editing.motivo?.trim()) { toast('Indica el motivo del cambio', 3500, 'err'); return }
    const rec = recs.find(r => r.id === editing.id)
    if (!rec) return
    const motivo = editing.motivo.trim()
    const newInicio = new Date(editing.inicio).toISOString()
    const newFin = editing.fin ? new Date(editing.fin).toISOString() : rec.fin
    if (newFin && newInicio >= newFin) { toast('La entrada debe ser anterior a la salida', 3500, 'err'); return }
    const updated = recs.map(r => {
      if (r.id !== editing.id) return r
      const breaks = newFin ? clipBreaksToWindow(r.breaks, newInicio, newFin) : (r.breaks || [])
      const closed = { ...r, inicio: newInicio, fin: newFin, breaks }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      const corr = { campo:'inicio+fin', antes: `${ftime(r.inicio)}–${ftime(r.fin)}`, despues: `${ftime(newInicio)}–${ftime(newFin)}`, motivo, por: enc.name, ts: new Date().toISOString() }
      return { ...closed, correcciones: [...(r.correcciones||[]), corr] }
    })
    const withAudit = auditLog(db, 'Jornada modificada', `${rec.empName} · ${fds(editing.inicio)} · Motivo: ${motivo}`, enc.name)
    const { cierres, flagged, staleCierres } = flagStaleCierreForEdit(db.cierres, rec.empId, rec.inicio, newInicio)
    saveDB({ records: updated, audit: withAudit.audit, cierres })
    queuePush(rec.empId, '✏️ Jornada modificada', `${enc.name} corrigió tu jornada del ${fds(editing.inicio)}: ${motivo}`, 'jornada', '/?tab=jornada')
    staleCierres.forEach(sc => notifyStaleCierre(sc, enc.id))
    const warn = flagged ? ' ⚠️ El cierre de ese mes quedó desactualizado — pide que lo regeneren en Informes.' : ''
    toast('Jornada modificada' + warn, warn ? 6000 : 3000, warn ? 'warn' : 'ok')
    setEditing(null)
  }

  const startJornada = (e) => {
    const alreadyOpen = liveRecs.find(r => r.empId === e.id)
    if (alreadyOpen) { toast('Este empleado ya tiene una jornada abierta', 3000, 'warn'); return }
    const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || misCentros[0] || '', breaks: [], workSecs: 0, creadoPor: enc.name }
    const withAudit = auditLog(db, 'Jornada iniciada por encargado', e.name, enc.name)
    saveDB({ records: [...recs, newRec], audit: withAudit.audit })
    queuePush(e.id, '▶ Jornada iniciada', `${enc.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
    toast('Jornada iniciada', 3000, 'ok')
  }

  const toggleDescanso = (rec) => {
    const now = new Date().toISOString()
    let updated
    if (rec.enDescanso) {
      const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
      updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
      queuePush(rec.empId, '▶ Descanso finalizado', `${enc.name} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso finalizado', 3000, 'ok')
    } else {
      updated = { ...rec, enDescanso: true, bStartTs: now }
      queuePush(rec.empId, '⏸ Descanso iniciado', `${enc.name} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
      toast('Descanso iniciado', 3000, 'ok')
    }
    saveDB({ records: recs.map(r => r.id === rec.id ? updated : r) })
  }

  const forceClose = (rec) => {
    showConfirm(`¿Finalizar jornada de ${rec.empName}?`, () => {
      const now = new Date().toISOString()
      const breaks = [...(rec.breaks || [])]
      if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
      const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
      const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
      saveDB(freshDb => {
        const wA = auditLog(freshDb, 'Jornada finalizada por encargado', rec.empName, enc.name)
        return { records: (freshDb.records || []).map(r => r.id === rec.id ? closed : r), audit: wA.audit }
      })
      queuePush(rec.empId, '⏹ Jornada finalizada', `${enc.name} ha finalizado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
      toast('Jornada finalizada', 3000, 'ok')
    })
  }

  const addAus = () => {
    if (!ausForm.empId || !ausForm.fechaInicio) { toast('Selecciona empleado y fecha'); return }
    if (ausForm.fechaFin && ausForm.fechaFin < ausForm.fechaInicio) { toast('La fecha fin no puede ser anterior al inicio', 3500, 'err'); return }
    const emp = emps.find(e => e.id === ausForm.empId)
    const key  = ausForm.tipo === 'medico' ? 'medicos' : 'ausencias'
    const item = { id: gid(), empId: ausForm.empId, empName: emp?.name || '', fechaInicio: ausForm.fechaInicio, fechaFin: ausForm.fechaFin || ausForm.fechaInicio, motivo: ausForm.motivo, ts: new Date().toISOString(), registradoPor: enc.name }
    saveDB({ [key]: [...(db[key] || []), item] })
    const tipoLbl = ausForm.tipo === 'medico' ? 'Ausencia médica' : 'Ausencia'
    queuePush(ausForm.empId, `🗓️ ${tipoLbl} registrada`, `${enc.name} registró una ${tipoLbl.toLowerCase()} el ${ausForm.fechaInicio}.`, 'ausencia', '/?tab=calendario')
    setAusForm(f => ({ ...f, empId:'', motivo:'' }))
    toast('Ausencia registrada', 3000, 'ok')
  }

  const delAus = (id, tipo) => {
    const key = tipo === 'medico' ? 'medicos' : 'ausencias'
    showConfirm('¿Eliminar esta ausencia?', () => {
      saveDB(freshDb => ({ [key]: (freshDb[key] || []).filter(a => a.id !== id) }))
      toast('Ausencia eliminada')
    })
  }

  const actCorr = (id, estado) => {
    const corr = (db.correccionesFichaje || []).find(c => c.id === id)
    if (!corr) return
    let newRecords = db.records || []
    if (estado === 'aprobada') {
      newRecords = newRecords.map(r => {
        if (r.id !== corr.recId) return r
        const updated = { ...r, inicio: corr.propInicio, fin: corr.propFin }
        const t = calcSecs(updated)
        return { ...updated, workSecs: t.work, breakSecs: t.brk }
      })
    }
    const updated = (db.correccionesFichaje || []).map(c => c.id === id ? { ...c, estado, resolvedAt: new Date().toISOString(), resolvedBy: enc.name } : c)
    const noti = { id: gid(), empId: corr.empId, action: estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', detail: corr.motivo || '', ts: new Date().toISOString(), leido: false }
    const withAuditEnc = auditLog(db, estado === 'aprobada' ? 'correccion_aprobada' : 'correccion_rechazada', `${corr.empName}: ${corr.motivo || ''}`, enc.name)
    saveDB({ correccionesFichaje: updated, records: newRecords, notis: [...(db.notis || []), noti], audit: withAuditEnc.audit })
    queuePush(corr.empId, noti.action, `Tu solicitud de corrección ha sido ${estado === 'aprobada' ? 'aprobada' : 'rechazada'}.`, 'correccion', '/?tab=jornada')
    toast(estado === 'aprobada' ? 'Corrección aplicada' : 'Corrección rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
  }

  if (!misCentros.length) {
    return (
      <div className="adm-panel">
        <div className="adm-panel-header"><h1 className="adm-panel-title">Mi obra</h1></div>
        <div className="empty">No tienes ninguna obra/centro de trabajo asignado. Pide al administrador que te asigne uno en Empleados.</div>
      </div>
    )
  }

  const Badge = ({ n }) => n > 0 ? <span style={{ minWidth:16, height:16, borderRadius:8, background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'0 4px', marginLeft:5 }}>{n}</span> : null

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Mi obra</h1>
          <div className="adm-panel-sub">{misCentros.join(', ')} · {emps.length} empleado{emps.length !== 1 ? 's' : ''}</div>
        </div>
        {(pendRecs.length + correcsPend.length) > 0 && (
          <span style={{ fontSize:12, fontWeight:700, padding:'4px 10px', borderRadius:20, background:'var(--orange-dim)', color:'var(--orange)', border:'1px solid rgba(245,158,11,.25)' }}>
            {pendRecs.length + correcsPend.length} pendientes
          </span>
        )}
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {[
          ['live',        '🔴 En vivo',     liveRecs.length],
          ['jornadas',    '📋 Jornadas',    pendRecs.length],
          ['ausencias',   '🏥 Ausencias',   0],
          ['correcciones','✏️ Correcciones', correcsPend.length],
        ].map(([id, label, badge]) => (
          <button key={id} className={`pill-tab${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
            {label}<Badge n={badge} />
          </button>
        ))}
      </div>

      {/* ── Tab: En vivo ─────────────────────────────────────────────────── */}
      {tab === 'live' && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:14 }}>
          {emps.map(e => {
            const live = liveRecs.find(r => r.empId === e.id)
            const t = live ? calcSecs(live) : null
            const isWorking = live && !live.enDescanso
            const isBreak   = live && live.enDescanso
            return (
              <div key={e.id} style={{ background:'var(--bg-700)', border:`1px solid ${isWorking?'rgba(54,178,126,.35)':isBreak?'rgba(255,145,57,.35)':'var(--border)'}`, borderRadius:'var(--r)', padding:16 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:38, height:38, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{live?.centro || e.centroTrabajo || '—'}</div>
                  </div>
                </div>
                <div style={{ textAlign:'center', marginBottom:12 }}>
                  <div style={{ fontSize:22, fontWeight:800, color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)', fontVariantNumeric:'tabular-nums' }}>
                    {t ? mhm(Math.floor(t.work/60)) : '—'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{isWorking?'Trabajando':isBreak?'En descanso':'Sin jornada hoy'}</div>
                </div>
                {live ? (
                  <div style={{ display:'flex', gap:6 }}>
                    <button className="btn btn-sm btn-secondary" style={{ flex:1, fontSize:11 }} onClick={() => toggleDescanso(live)}>
                      {live.enDescanso ? '▶ Continuar' : '⏸ Pausa'}
                    </button>
                    <button className="btn btn-sm btn-danger" style={{ flex:1, fontSize:11 }} onClick={() => forceClose(live)}>■ Finalizar</button>
                  </div>
                ) : (
                  <button className="btn btn-sm btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => startJornada(e)}>▶ Iniciar jornada</button>
                )}
              </div>
            )
          })}
          {!emps.length && <div className="empty">Sin empleados asignados a tu obra</div>}
        </div>
      )}

      {/* ── Tab: Jornadas ────────────────────────────────────────────────── */}
      {tab === 'jornadas' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {pendRecs.map(r => (
            <div key={r.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-600)', borderRadius:'var(--r)', border:'1px solid var(--border)', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:160 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{r.empName}</div>
                <div style={{ fontSize:12, color:'var(--text3)' }}>{fds(r.inicio)} · {ftime(r.inicio)} → {ftime(r.fin)} · {mhm(Math.floor(recWorkSecs(r)/60))}</div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => startEdit(r)}>Modificar</button>
                <button className="btn btn-sm btn-primary"   onClick={() => aceptar(r)}>✓ Aceptar</button>
              </div>
            </div>
          ))}
          {!pendRecs.length && <div className="empty">Sin jornadas pendientes de aceptar</div>}
        </div>
      )}

      {/* ── Tab: Ausencias ───────────────────────────────────────────────── */}
      {tab === 'ausencias' && (
        <div>
          <div className="dash-widget" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Registrar ausencia</div>
            <div className="field-row">
              <div className="field" style={{ marginBottom:0 }}>
                <label>Empleado</label>
                <select value={ausForm.empId} onChange={e => setAusForm(f => ({ ...f, empId:e.target.value }))}>
                  <option value="">Selecciona…</option>
                  {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Tipo</label>
                <select value={ausForm.tipo} onChange={e => setAusForm(f => ({ ...f, tipo:e.target.value }))}>
                  <option value="medico">🏥 Baja médica</option>
                  <option value="ausencia">📋 Ausencia justificada</option>
                </select>
              </div>
            </div>
            <div className="field-row" style={{ marginTop:10 }}>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha inicio</label>
                <input type="date" value={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaInicio:e.target.value }))} />
              </div>
              <div className="field" style={{ marginBottom:0 }}>
                <label>Fecha fin</label>
                <input type="date" value={ausForm.fechaFin} min={ausForm.fechaInicio} onChange={e => setAusForm(f => ({ ...f, fechaFin:e.target.value }))} />
              </div>
            </div>
            <div className="field" style={{ marginTop:10, marginBottom:14 }}>
              <label>Motivo (opcional)</label>
              <input value={ausForm.motivo} onChange={e => setAusForm(f => ({ ...f, motivo:e.target.value }))} placeholder="Breve descripción" />
            </div>
            <button className="btn btn-primary" onClick={addAus} style={{ width:'100%' }}>+ Registrar ausencia</button>
          </div>

          <div className="adm-section-title" style={{ padding:'0 0 12px' }}>Historial de mi equipo</div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {teamAus.map(a => {
              const dias = Math.round((new Date(a.fechaFin+'T00:00:00') - new Date(a.fechaInicio+'T00:00:00')) / 86400000) + 1
              return (
                <div key={a.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:20 }}>{a.tipoAus === 'medico' ? '🏥' : '📋'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{a.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{fds(a.fechaInicio)} → {fds(a.fechaFin)} · {dias}d · {a.tipoAus === 'medico' ? 'Baja médica' : 'Ausencia'}</div>
                    {a.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:1 }}>{a.motivo}</div>}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => delAus(a.id, a.tipoAus)}>✕</button>
                </div>
              )
            })}
            {!teamAus.length && <div className="empty">Sin ausencias registradas en tu equipo</div>}
          </div>
        </div>
      )}

      {/* ── Tab: Correcciones ────────────────────────────────────────────── */}
      {tab === 'correcciones' && (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {correcsPend.length > 0 && (
            <>
              <div className="adm-section-title" style={{ padding:'0 0 10px' }}>Pendientes de revisar ({correcsPend.length})</div>
              {correcsPend.map(c => (
                <div key={c.id} style={{ padding:'14px 16px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:12, flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:180 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{c.empName}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:3 }}>
                        Original: {ftime(c.recInicio)} → {c.recFin ? ftime(c.recFin) : '—'}
                      </div>
                      <div style={{ fontSize:11, color:'var(--primary-light)', marginTop:2 }}>
                        Propuesto: {ftime(c.propInicio)} → {ftime(c.propFin)}
                      </div>
                      {c.motivo && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4, fontStyle:'italic' }}>"{c.motivo}"</div>}
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      <button className="btn btn-sm btn-primary" onClick={() => actCorr(c.id, 'aprobada')}>✓ Aprobar</button>
                      <button className="btn btn-sm btn-danger"  onClick={() => actCorr(c.id, 'rechazada')}>✗ Rechazar</button>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
          {correcsHist.length > 0 && (
            <>
              <div className="adm-section-title" style={{ padding:'16px 0 10px' }}>Historial</div>
              {correcsHist.map(c => (
                <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', borderRadius:'var(--r)', border:'1px solid var(--border)' }}>
                  <span style={{ fontSize:16 }}>{c.estado === 'aprobada' ? '✅' : '❌'}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{c.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>{fds(c.propInicio)} · {ftime(c.propInicio)} → {ftime(c.propFin)}</div>
                  </div>
                  <span className={`badge ${c.estado === 'aprobada' ? 'badge-green' : 'badge-red'}`}>{c.estado}</span>
                </div>
              ))}
            </>
          )}
          {!correcsPend.length && !correcsHist.length && <div className="empty">Sin correcciones de tu equipo</div>}
        </div>
      )}

      {editing && (
        <div className="modal-ov center" onClick={() => setEditing(null)}>
          <div className="modal center-modal" onClick={e => e.stopPropagation()} style={{ maxWidth:380, width:'calc(100% - 32px)' }}>
            <h2 style={{ margin:'0 0 16px', fontSize:16 }}>Modificar jornada</h2>
            <div className="field" style={{ marginBottom:12 }}>
              <label>ENTRADA</label>
              <input type="datetime-local" value={editing.inicio} onChange={e => setEditing(s => ({ ...s, inicio:e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom:16 }}>
              <label>SALIDA</label>
              <input type="datetime-local" value={editing.fin} onChange={e => setEditing(s => ({ ...s, fin:e.target.value }))} />
            </div>
            <div className="field" style={{ marginBottom:16 }}>
              <label>MOTIVO DEL CAMBIO (obligatorio)</label>
              <input type="text" maxLength={200} placeholder="Ej: olvidó fichar la salida, se fue antes por cita médica…"
                value={editing.motivo || ''} onChange={e => setEditing(s => ({ ...s, motivo:e.target.value }))} />
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={!editing.motivo?.trim()} onClick={saveEdit}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

