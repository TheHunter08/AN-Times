import { useState, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, ftime, fds, calcSecs, calcMin, gid } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'

export default function PanelSolicitudes({ db, toast, saveDB, session }) {
  const [solTab, setSolTab] = useState('vacaciones')
  const [ausForm, setAusForm] = useState({ empId:'', tipo:'medico', fechaInicio:today(), fechaFin:today(), motivo:'' })
  const [rejecting, setRejecting] = useState(null)
  const [rejMotivo, setRejMotivo] = useState('')
  const [editCorrId, setEditCorrId] = useState(null)
  const [editInicio, setEditInicio] = useState('')
  const [editFin, setEditFin] = useState('')

  const vacs = (db.vacaciones || []).sort((a,b) => b.ts?.localeCompare(a.ts||'')||0)
  const pend = vacs.filter(v => v.estado === 'pendiente')
  const rest = vacs.filter(v => v.estado !== 'pendiente')
  const emps = (db.employees || []).filter(e => !e.baja)

  const act = (id, estado, motivoRechazo) => {
    const v = (db.vacaciones||[]).find(x => x.id === id)
    const extra = estado === 'rechazada' && motivoRechazo ? { motivoRechazo } : {}
    const updated = (db.vacaciones||[]).map(v => v.id === id ? { ...v, estado, resolvedAt: new Date().toISOString(), ...extra } : v)
    const withAudit = auditLog(db, estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', v?.empName || '', session?.user?.name || 'Admin')
    const noti = { id: gid(), empId: v?.empId, action: estado === 'aprobada' ? 'Vacaciones aprobadas' : 'Vacaciones rechazadas', detail: v ? `${fds(v.fechaInicio)} → ${fds(v.fechaFin)}` : '', ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: updated, audit: withAudit.audit, notis: [...(db.notis||[]), noti] })
    if (v?.empId) {
      const pushBody = estado === 'rechazada' && motivoRechazo ? `${noti.detail} · ${motivoRechazo}` : noti.detail
      queuePush(v.empId, noti.action, pushBody, 'vacaciones', '/?go=emp:vacaciones')
    }
    toast(estado === 'aprobada' ? 'Solicitud aprobada' : 'Solicitud rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
  }

  const allAus = [
    ...(db.medicos||[]).map(a => ({ ...a, tipo:'medico' })),
    ...(db.ausencias||[]).map(a => ({ ...a, tipo:'ausencia' })),
  ].sort((a,b) => (b.fechaInicio||b.fecha||'').localeCompare(a.fechaInicio||a.fecha||''))

  const addAus = () => {
    if (!ausForm.empId || !ausForm.fechaInicio) { toast('Selecciona empleado y fecha'); return }
    if (ausForm.fechaFin && ausForm.fechaFin < ausForm.fechaInicio) { toast('La fecha fin no puede ser anterior al inicio', 3500, 'err'); return }
    const emp = emps.find(e => e.id === ausForm.empId)
    const key = ausForm.tipo === 'medico' ? 'medicos' : 'ausencias'
    const item = { id: gid(), empId: ausForm.empId, empName: emp?.name || '', fechaInicio: ausForm.fechaInicio, fechaFin: ausForm.fechaFin || ausForm.fechaInicio, motivo: ausForm.motivo, ts: new Date().toISOString() }
    saveDB({ [key]: [...(db[key]||[]), item] })
    const tipoLbl2 = ausForm.tipo === 'medico' ? 'Ausencia médica' : 'Ausencia'
    queuePush(ausForm.empId, `🗓️ ${tipoLbl2} registrada`, `Se ha registrado una ${tipoLbl2.toLowerCase()} el ${ausForm.fechaInicio}.`, 'ausencia', '/?tab=calendario')
    setAusForm(f => ({ ...f, empId:'', motivo:'' }))
    toast('Ausencia registrada', 3000, 'ok')
  }

  const delAus = (id, tipo) => {
    const key = tipo === 'medico' ? 'medicos' : 'ausencias'
    saveDB({ [key]: (db[key]||[]).filter(a => a.id !== id) })
    toast('Ausencia eliminada')
  }

  const VacRow = ({ v }) => {
    const [swipeX, setSwipeX] = useState(0)
    const [isDragging, setIsDragging] = useState(false)
    const swipeRef = useRef({ startX: 0, active: false })

    const onTouchStart = (e) => {
      if (v.estado !== 'pendiente') return
      swipeRef.current = { startX: e.touches[0].clientX, active: true }
      setIsDragging(true)
    }
    const onTouchMove = (e) => {
      if (!swipeRef.current.active) return
      const dx = e.touches[0].clientX - swipeRef.current.startX
      setSwipeX(Math.max(-100, Math.min(100, dx)))
    }
    const onTouchEnd = () => {
      if (!swipeRef.current.active) return
      swipeRef.current.active = false
      setIsDragging(false)
      if (swipeX > 75) {
        act(v.id, 'aprobada')
        try { navigator.vibrate(15) } catch {}
      } else if (swipeX < -75) {
        setRejecting(v.id); setRejMotivo('')
        try { navigator.vibrate(10) } catch {}
      }
      setSwipeX(0)
    }

    const THRESH = 75
    const progress = Math.abs(swipeX) / THRESH
    const isApprove = swipeX > 20
    const isReject = swipeX < -20

    return (
      <div style={{ position:'relative', marginBottom:8, borderRadius:'var(--r-lg)', overflow:'hidden' }}>
        {v.estado === 'pendiente' && (
          <>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:20, background:'var(--green-dim)', borderRadius:'var(--r-lg)', opacity: isApprove ? Math.min(1, progress) : 0, transition: isDragging ? 'none' : 'opacity .3s', pointerEvents:'none' }}>
              <span style={{ fontSize:20 }}>✓</span>
              <span style={{ marginLeft:8, fontSize:12, fontWeight:700, color:'var(--green)' }}>Aprobar</span>
            </div>
            <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'flex-end', paddingRight:20, background:'rgba(239,68,68,.1)', borderRadius:'var(--r-lg)', opacity: isReject ? Math.min(1, progress) : 0, transition: isDragging ? 'none' : 'opacity .3s', pointerEvents:'none' }}>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--danger)' }}>Rechazar</span>
              <span style={{ fontSize:20, marginLeft:8 }}>✗</span>
            </div>
          </>
        )}
        <div
          className={`sol-card${v.estado==='pendiente'?' pending':v.estado==='aprobada'?' approved':' rejected'}`}
          style={{ flexWrap:'wrap', transform:`translateX(${swipeX}px)`, transition: isDragging ? 'none' : 'transform .3s cubic-bezier(.16,1,.3,1)', marginBottom:0, position:'relative', zIndex:1 }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <div style={{ width:40, height:40, borderRadius:12, background: v.estado==='pendiente'?'var(--orange-dim)':v.estado==='aprobada'?'var(--green-dim)':'rgba(239,68,68,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
            {v.estado==='pendiente'?'⏳':v.estado==='aprobada'?'✓':'✗'}
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:13, fontWeight:700 }}>{v.empName}</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginTop:2 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)} · {v.dias} días</div>
            {v.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:3 }}>{v.motivo}</div>}
            {v.estado === 'rechazada' && v.motivoRechazo && (
              <div style={{ fontSize:11, color:'var(--danger)', marginTop:3, fontStyle:'italic' }}>Motivo: {v.motivoRechazo}</div>
            )}
          </div>
          <div className={`badge${v.estado==='aprobada'?' badge-green':v.estado==='rechazada'?' badge-red':' badge-orange'}`}>
            {v.estado==='aprobada'?'Aprobada':v.estado==='rechazada'?'Rechazada':'Pendiente'}
          </div>
          {v.estado === 'pendiente' && rejecting !== v.id && (
            <div style={{ display:'flex', gap:6 }}>
              <button className="btn btn-sm btn-primary" onClick={() => act(v.id, 'aprobada')}>✓</button>
              <button className="btn btn-sm btn-danger" onClick={() => { setRejecting(v.id); setRejMotivo('') }}>✗</button>
            </div>
          )}
          {rejecting === v.id && (
            <div style={{ width:'100%', marginTop:10, display:'flex', flexDirection:'column', gap:6 }}>
              <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                <input
                  autoFocus
                  maxLength={200}
                  style={{ flex:1, background:'var(--bg-500)', border:'1px solid var(--border2)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:'inherit' }}
                  placeholder="Motivo del rechazo (obligatorio)"
                  value={rejMotivo}
                  onChange={e => setRejMotivo(e.target.value.slice(0, 200))}
                  onKeyDown={e => {
                    if (e.key === 'Enter') { act(v.id, 'rechazada', rejMotivo.trim()); setRejecting(null) }
                    if (e.key === 'Escape') setRejecting(null)
                  }}
                />
                <button className="btn btn-sm btn-danger" disabled={!rejMotivo.trim()} onClick={() => { act(v.id, 'rechazada', rejMotivo.trim()); setRejecting(null) }}>Rechazar</button>
                <button className="btn btn-sm btn-secondary" onClick={() => setRejecting(null)}>✕</button>
              </div>
              <div style={{ fontSize:10, color: rejMotivo.length > 180 ? 'var(--orange)' : 'var(--text4)', textAlign:'right' }}>{rejMotivo.length}/200</div>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Solicitudes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{pend.length} pendientes de revisión</div>
        </div>
      </div>

      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {[['vacaciones','🌴 Vacaciones'],['ausencias','🏥 Ausencias médicas'],['correcciones','✏️ Correcciones']].map(([v,l]) => (
          <button key={v} className={`pill-tab${solTab===v?' active':''}`} onClick={() => setSolTab(v)}>{l}</button>
        ))}
      </div>

      {solTab === 'vacaciones' && (
        <>
          {pend.length > 0 && (
            <>
              <div className="section-header">Pendientes de revisión</div>
              <div className="stagger-in">
                {pend.map(v => <VacRow key={v.id} v={v} />)}
              </div>
            </>
          )}
          {rest.length > 0 && (
            <>
              <div className="section-header" style={{ marginTop:20 }}>Historial</div>
              {rest.slice(0, 30).map(v => <VacRow key={v.id} v={v} />)}
            </>
          )}
          {!vacs.length && (
            <div className="empty-premium">
              <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
              <div className="empty-premium-title">Sin solicitudes</div>
              <div className="empty-premium-sub">Las solicitudes de vacaciones de los empleados aparecerán aquí</div>
            </div>
          )}
        </>
      )}

      {solTab === 'ausencias' && (
        <>
          <div className="dash-widget" style={{ marginBottom:20 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>Registrar ausencia / baja médica</div>
            <div className="field-row">
              <div className="field" style={{ marginBottom:0 }}>
                <label>Empleado</label>
                <select value={ausForm.empId} onChange={e => setAusForm(f => ({ ...f, empId:e.target.value }))}>
                  <option value="">Selecciona empleado</option>
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
              <input value={ausForm.motivo} onChange={e => setAusForm(f => ({ ...f, motivo:e.target.value }))} placeholder="Descripción breve de la ausencia" />
            </div>
            <button className="btn btn-primary" onClick={addAus} style={{ width:'100%' }}>+ Registrar ausencia</button>
          </div>

          <div className="section-header">Historial de ausencias</div>
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {allAus.map(a => {
              const start = new Date(a.fechaInicio + 'T00:00:00'), end = new Date(a.fechaFin + 'T00:00:00')
              const dias = Math.round((end - start) / 86400000) + 1
              return (
                <div key={a.id} className="card" style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18,
                    background: a.tipo==='medico' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)' }}>
                    {a.tipo==='medico'?'🏥':'📋'}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{a.empName}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {fds(a.fechaInicio)} → {fds(a.fechaFin)} · {dias}d · <span style={{ color: a.tipo==='medico'?'var(--red)':'var(--orange)' }}>{a.tipo==='medico'?'Baja médica':'Ausencia'}</span>
                    </div>
                    {a.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:1 }}>{a.motivo}</div>}
                  </div>
                  <button className="btn btn-sm btn-danger" onClick={() => delAus(a.id, a.tipo)}>✕</button>
                </div>
              )
            })}
          </div>
          {!allAus.length && (
            <div className="empty-premium">
              <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg></div>
              <div className="empty-premium-title">Sin ausencias registradas</div>
              <div className="empty-premium-sub">Las bajas médicas y ausencias aparecerán aquí.</div>
            </div>
          )}
        </>
      )}

      {solTab === 'correcciones' && (() => {
        const corrPend = (db.correccionesFichaje || []).filter(c => c.estado === 'pendiente').sort((a,b) => b.ts - a.ts)
        const corrRest = (db.correccionesFichaje || []).filter(c => c.estado !== 'pendiente').sort((a,b) => b.ts - a.ts).slice(0, 20)

        const actCorr = (id, estado, overrideInicio, overrideFin) => {
          const corr = (db.correccionesFichaje || []).find(c => c.id === id)
          if (!corr) return
          let newRecords = db.records || []
          if (estado === 'aprobada') {
            const finalInicio = overrideInicio || corr.propInicio
            const finalFin = overrideFin || corr.propFin
            newRecords = newRecords.map(r => {
              if (r.id !== corr.recId) return r
              const updated = { ...r, inicio: finalInicio, fin: finalFin }
              const t = calcSecs(updated)
              return { ...updated, workSecs: t.work, breakSecs: t.brk }
            })
          }
          const finalInicioLabel = overrideInicio || corr.propInicio
          const finalFinLabel = overrideFin || corr.propFin
          const updated = (db.correccionesFichaje || []).map(c => c.id === id ? { ...c, estado, resolvedAt: new Date().toISOString(), resolvedBy: session?.user?.name || 'Admin', finalInicio: finalInicioLabel, finalFin: finalFinLabel } : c)
          const noti = { id: gid(), empId: corr.empId, action: estado === 'aprobada' ? 'Corrección aprobada' : 'Corrección rechazada', detail: corr.motivo || '', ts: new Date().toISOString(), leido: false }
          const withAudit = auditLog(db, estado === 'aprobada' ? 'correccion_aprobada' : 'correccion_rechazada', `${corr.empName}: ${corr.motivo || ''}`, session?.user?.name || 'Admin')
          saveDB({ correccionesFichaje: updated, records: newRecords, notis: [...(db.notis||[]), noti], audit: withAudit.audit })
          queuePush(corr.empId, noti.action, `Tu solicitud de corrección ha sido ${estado === 'aprobada' ? 'aprobada' : 'rechazada'}.`, 'correccion', '/?tab=jornada')
          toast(estado === 'aprobada' ? 'Corrección aplicada' : 'Corrección rechazada', 3000, estado === 'aprobada' ? 'ok' : 'warn')
          setEditCorrId(null)
        }

        return (
          <>
            {corrPend.length > 0 && (
              <div style={{ marginBottom:20 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Pendientes · {corrPend.length}</div>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {corrPend.map(c => (
                    <div key={c.id} className="card" style={{ display:'flex', gap:12, alignItems:'flex-start' }}>
                      <div style={{ width:38, height:38, borderRadius:10, background:'var(--orange-dim)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>✏️</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:700 }}>{c.empName}</div>
                        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                          Original: {ftime(c.recInicio)} → {c.recFin ? ftime(c.recFin) : '—'}
                          {c.recInicio && c.recFin && <span style={{ marginLeft:6, fontVariantNumeric:'tabular-nums' }}>({mhm(Math.floor((new Date(c.recFin)-new Date(c.recInicio))/60000))})</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--primary-light)', marginTop:2 }}>
                          Propuesto: {ftime(c.propInicio)} → {c.propFin ? ftime(c.propFin) : '—'}
                          {c.propInicio && c.propFin && (() => {
                            const origMin = c.recInicio && c.recFin ? Math.floor((new Date(c.recFin)-new Date(c.recInicio))/60000) : 0
                            const propMin = Math.floor((new Date(c.propFin)-new Date(c.propInicio))/60000)
                            const diff = propMin - origMin
                            return <span style={{ marginLeft:6, fontVariantNumeric:'tabular-nums', color: diff >= 0 ? 'var(--green)' : 'var(--red)', fontWeight:700 }}>({mhm(propMin)} · {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))})</span>
                          })()}
                        </div>
                        {c.motivo && <div style={{ fontSize:11, color:'var(--text4)', marginTop:3, fontStyle:'italic' }}>"{c.motivo}"</div>}
                        {editCorrId === c.id && (
                          <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6, padding:10, background:'var(--bg-500)', borderRadius:8, border:'1px solid var(--border)' }}>
                            <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', marginBottom:2 }}>Editar horas antes de aprobar</div>
                            <div style={{ display:'flex', gap:8 }}>
                              <div style={{ flex:1 }}>
                                <label style={{ fontSize:10, color:'var(--text3)' }}>Entrada</label>
                                <input type="datetime-local" value={editInicio} onChange={e => setEditInicio(e.target.value)}
                                  style={{ width:'100%', fontSize:11, padding:'5px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', marginTop:2 }} />
                              </div>
                              <div style={{ flex:1 }}>
                                <label style={{ fontSize:10, color:'var(--text3)' }}>Salida</label>
                                <input type="datetime-local" value={editFin} onChange={e => setEditFin(e.target.value)}
                                  style={{ width:'100%', fontSize:11, padding:'5px 6px', borderRadius:6, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', marginTop:2 }} />
                              </div>
                            </div>
                            <div style={{ display:'flex', gap:6, justifyContent:'flex-end', marginTop:2 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => setEditCorrId(null)}>Cancelar</button>
                              <button className="btn btn-primary btn-sm" onClick={() => {
                                const ini = editInicio ? new Date(editInicio).toISOString() : null
                                const fin = editFin   ? new Date(editFin).toISOString()   : null
                                actCorr(c.id, 'aprobada', ini, fin)
                              }}>Aprobar y guardar</button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                        <button className="btn btn-sm btn-primary" onClick={() => actCorr(c.id, 'aprobada')}>✓</button>
                        <button className="btn btn-sm" style={{ background:'var(--bg-500)', color:'var(--text2)', border:'1px solid var(--border)' }}
                          onClick={() => {
                            if (editCorrId === c.id) { setEditCorrId(null); return }
                            setEditCorrId(c.id)
                            setEditInicio(c.propInicio ? c.propInicio.slice(0,16) : '')
                            setEditFin(c.propFin ? c.propFin.slice(0,16) : '')
                          }}>✎</button>
                        <button className="btn btn-sm btn-danger"  onClick={() => actCorr(c.id, 'rechazada')}>✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {!corrPend.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></div>
                <div className="empty-premium-title">Sin correcciones pendientes</div>
                <div className="empty-premium-sub">Cuando un empleado solicite corregir un fichaje aparecerá aquí</div>
              </div>
            )}
            {corrRest.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Historial</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {corrRest.map(c => (
                    <div key={c.id} style={{ display:'flex', gap:10, padding:'9px 12px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', alignItems:'center' }}>
                      <div style={{ fontSize:15 }}>{c.estado==='aprobada'?'✅':'❌'}</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600 }}>{c.empName}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>{c.motivo || 'Sin motivo'}</div>
                      </div>
                      <div className={`badge ${c.estado==='aprobada'?'badge-green':'badge-red'}`}>{c.estado}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )
      })()}
    </div>
  )
}
