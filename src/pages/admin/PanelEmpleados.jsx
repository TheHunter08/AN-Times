import { useState, useMemo, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useAppStore } from '../../store/appStore.js'
import { today, mhm, p2, calcMin, gid, sortedEmps } from '../../utils/time.js'
import { hashPin, isPinHashed } from '../../utils/auth.js'
import { auditLog } from '../../services/dataService.js'
import { queuePush } from '../../services/dataService.js'

export default function PanelEmpleados({ db, toast, saveDB, session }) {
  const allEmps = sortedEmps(db)
  const [empSearch, setEmpSearch] = useState('')
  const [qrEmp, setQrEmp] = useState(null)
  const qrCanvasRef = useRef(null)
  const { showConfirm } = useAppStore()

  useEffect(() => {
    if (!qrEmp || !qrCanvasRef.current) return
    const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(qrEmp.id)}`
    QRCode.toCanvas(qrCanvasRef.current, url, { width: 240, margin: 2, color: { dark: '#0d0d18', light: '#ffffff' } }).catch(() => {})
  }, [qrEmp])

  const emps = useMemo(() => {
    if (!empSearch.trim()) return allEmps
    const q = empSearch.toLowerCase()
    return allEmps.filter(e => e.name?.toLowerCase().includes(q) || e.email?.toLowerCase().includes(q) || e.empresa?.toLowerCase().includes(q) || e.centroTrabajo?.toLowerCase().includes(q))
  }, [allEmps, empSearch])

  const [showForm, setShowForm] = useState(false)
  const [editEmp, setEditEmp] = useState(null)
  const EMPTY_EMP = { id: gid(), name:'', pin:'', email:'', role:'emp', empresa:'', centroTrabajo:'', obrasAsignadas:[], color:'#5E6AD2', baja:false, fechaAlta: today(), startDate: today(), horasSemanales: 40 }
  const [form, setForm] = useState(EMPTY_EMP)

  const openNew = () => { setForm({ ...EMPTY_EMP, id: gid() }); setShowForm(true); setEditEmp(null) }
  const openEdit = (e) => { setForm({ obrasAsignadas: [], ...e, pin: '' }); setShowForm(true); setEditEmp(e.id) }

  const toggleObra = (centro) => {
    setForm(f => {
      const cur = f.obrasAsignadas || []
      return { ...f, obrasAsignadas: cur.includes(centro) ? cur.filter(c => c !== centro) : [...cur, centro] }
    })
  }

  const saveEmp = async () => {
    if (!form.name.trim()) { toast('Nombre requerido'); return }
    const isNewPin = form.pin && form.pin.length >= 4
    if (!editEmp && !isNewPin) { toast('PIN de mínimo 4 dígitos'); return }
    if (form.pin && form.pin.length > 0 && form.pin.length < 4) { toast('PIN de mínimo 4 dígitos'); return }
    if (isNewPin) {
      for (const e of (db.employees||[])) {
        if (e.id === form.id) continue
        const dup = isPinHashed(e.pin) ? (await hashPin(form.pin, e.id)) === e.pin : e.pin === form.pin
        if (dup) { toast('PIN ya está en uso'); return }
      }
    }
    let finalPin = form.pin
    let pinLen
    if (isNewPin) {
      pinLen = form.pin.length
      finalPin = await hashPin(form.pin, form.id)
    } else if (editEmp) {
      const existing = (db.employees||[]).find(e => e.id === editEmp)
      finalPin = existing?.pin || ''
      pinLen = existing?.pinLen
    }
    const updatedForm = { ...form, pin: finalPin, ...(pinLen !== undefined ? { pinLen } : {}) }
    if (!updatedForm.empresa?.trim()) updatedForm.empresa = 'Sin asignar'
    const emps2 = editEmp
      ? (db.employees||[]).map(e => e.id === editEmp ? updatedForm : e)
      : [...(db.employees||[]), updatedForm]
    const auditAction = editEmp
      ? (isNewPin ? 'Empleado actualizado (PIN cambiado)' : 'Empleado actualizado')
      : 'Empleado creado'
    const withAudit = auditLog(db, auditAction, form.name, session?.user?.name || 'Admin')
    const extraData = {}
    if (!editEmp) {
      const welcomeMsg = {
        id: gid(), from: 'admin', to: updatedForm.id,
        text: `¡Bienvenido/a a TIMES INC, ${updatedForm.name.split(' ')[0]}! 👋\nHas sido dado de alta en el sistema. Usa tu PIN para acceder y registrar tu jornada diaria. Si tienes dudas, escríbeme aquí.`,
        ts: Date.now(), leido: false
      }
      extraData.chats = [...(db.chats || []), welcomeMsg]
      const noti = { id: gid(), empId: updatedForm.id, action: '¡Bienvenido/a!', detail: 'Ya puedes acceder con tu PIN', ts: Date.now(), leido: false }
      extraData.notis = [...(db.notis || []), noti]
    }
    saveDB({ employees: emps2, audit: withAudit.audit, ...extraData })
    toast(editEmp ? '✅ Empleado actualizado' : '✅ Empleado creado')
    setShowForm(false)
  }

  const del = (id) => {
    showConfirm('¿Dar de baja a este empleado? Esta acción se puede revertir desde el perfil.', () => {
      try { navigator.vibrate(20) } catch {}
      const emp = (db.employees||[]).find(e => e.id === id)
      const emps2 = (db.employees||[]).map(e => e.id === id ? { ...e, baja:true, fechaBaja: today() } : e)
      const withAudit = auditLog(db, 'Empleado dado de baja', emp?.name || '', session?.user?.name || 'Admin')
      saveDB({ employees: emps2, audit: withAudit.audit })
      toast('Empleado dado de baja')
    })
  }

  const exportEmpleadosXLSX = async () => {
    const now2 = new Date()
    const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
    const XLSX = await import('xlsx')
    const empNombre = (db.config?.companyName || (db.empresas||[])[0] || '')
    const title = [`Empleados — ${empNombre || 'TIMES INC'} — ${mk2}`]
    const headers = ['Nombre','Email','Rol','Empresa','Centro trabajo','Alta','H/sem','H. trabajadas (mes actual)','H. trabajadas (dec.)','Estado']
    const dataRows = allEmps.map(e => {
      const monthMin = (db.records||[]).filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(mk2)).reduce((s,r)=>s+calcMin(r),0)
      return [e.name, e.email||'', e.role||'emp', e.empresa||'', e.centroTrabajo||'', e.startDate||'', e.horasSemanales||40, mhm(monthMin), Math.round(monthMin/60*100)/100, e.baja?'Baja':'Activo']
    })
    const ws = XLSX.utils.aoa_to_sheet([title, [], headers, ...dataRows])
    ws['!cols'] = [22,22,12,18,16,12,7,14,14,8].map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Empleados')
    XLSX.writeFile(wb, `empleados_${empNombre?empNombre.replace(/\s+/g,'_')+'_':''}${mk2}.xlsx`)
    toast('Excel descargado', 3000, 'ok')
  }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Empleados</h1>
          <div className="adm-panel-sub" style={{ marginTop:2 }}>{emps.length} empleado{emps.length!==1?'s':''} {empSearch ? 'encontrados' : `(${emps.filter(e=>!e.baja).length} activos)`}</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={exportEmpleadosXLSX} title="Exportar Excel">
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            Excel
          </button>
          <button className="btn btn-primary btn-sm" onClick={openNew}>+ Nuevo</button>
        </div>
      </div>

      <div className="premium-filters" style={{ marginBottom:16 }}>
        <input placeholder="Buscar empleado, empresa, centro…" value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ flex:1 }} />
      </div>

      {showForm && (
        <div className="card" style={{ marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>{editEmp ? 'Editar empleado' : 'Nuevo empleado'}</div>
          <div className="field-row">
            <div className="field"><label>Nombre completo *</label><input value={form.name} maxLength={80} onChange={e => setForm(f=>({...f,name:e.target.value.slice(0,80)}))} /></div>
            <div className="field"><label>PIN (4-6 dígitos){editEmp ? '' : ' *'}</label><input type="password" value={form.pin} maxLength={6} placeholder={editEmp ? 'Vacío = sin cambios' : ''} onChange={e => setForm(f=>({...f,pin:e.target.value.replace(/\D/g,'').slice(0,6)}))} /></div>
          </div>
          <div className="field-row">
            <div className="field"><label>Email</label><input type="email" value={form.email||''} maxLength={100} onChange={e => setForm(f=>({...f,email:e.target.value.slice(0,100)}))} /></div>
            <div className="field"><label>WhatsApp (ej: 34612345678)</label><input type="tel" value={form.telefono||''} maxLength={15} placeholder="34612345678" onChange={e => setForm(f=>({...f,telefono:e.target.value.replace(/\D/g,'').slice(0,15)}))} /></div>
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
            <div className="field"><label>Centro de trabajo</label>
              <select value={form.centroTrabajo||''} onChange={e => setForm(f=>({...f,centroTrabajo:e.target.value}))}>
                <option value="">— Sin asignar —</option>
                {(db.centrosTrabajo||[]).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {(form.role === 'encargado' || form.role === 'jefe_obra') && (
            <div className="field" style={{ marginBottom:14 }}>
              <label>Obras asignadas para gestión (verá y aceptará jornadas de estas obras)</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {(db.centrosTrabajo||[]).map(c => (
                  <div key={c} onClick={() => toggleObra(c)}
                    style={{ padding:'6px 12px', borderRadius:20, fontSize:12, fontWeight:600, cursor:'pointer',
                      background: (form.obrasAsignadas||[]).includes(c) ? 'var(--primary-dim)' : 'var(--bg-600)',
                      color: (form.obrasAsignadas||[]).includes(c) ? 'var(--primary-light)' : 'var(--text3)',
                      border: `1px solid ${(form.obrasAsignadas||[]).includes(c) ? 'var(--primary)' : 'var(--border)'}` }}>
                    {c}
                  </div>
                ))}
                {!(db.centrosTrabajo||[]).length && <div className="empty" style={{ padding:0 }}>Crea primero un centro de trabajo en Obras</div>}
              </div>
            </div>
          )}
          <div className="field-row">
            <div className="field"><label>Color avatar</label>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap', paddingTop:4 }}>
                {['#5E6AD2','#7C5CFF','#00D2FF','#00C48C','#FF6B6B','#FFB547','#E040FB'].map(c => (
                  <div key={c} onClick={() => setForm(f=>({...f,color:c}))} style={{ width:24, height:24, borderRadius:'50%', background:c, cursor:'pointer', border: form.color===c?'2px solid white':'2px solid transparent', transition:'.15s' }} />
                ))}
              </div>
            </div>
            <div className="field"><label>Fecha alta</label><input type="date" value={form.fechaAlta||''} onChange={e => setForm(f=>({...f,fechaAlta:e.target.value,startDate:e.target.value}))} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Horas contratadas / semana</label>
              <input type="number" min={1} max={60} value={form.horasSemanales||40} onChange={e => setForm(f=>({...f,horasSemanales:parseInt(e.target.value)||40}))} placeholder="40" />
            </div>
            <div className="field" style={{ display:'flex', alignItems:'flex-end' }}>
              <div style={{ fontSize:11, color:'var(--text3)', lineHeight:1.5, paddingBottom:6 }}>
                Usado para calcular horas extra y desvío en informes.<br/>Por defecto: 40h/semana.
              </div>
            </div>
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
            {emps.length === 0 && (
              <tr><td colSpan={6}>
                <div style={{ padding:'40px 20px', textAlign:'center', color:'var(--text3)' }}>
                  <div style={{ fontSize:36, marginBottom:12 }}>👷</div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text2)', marginBottom:6 }}>Sin empleados {empSearch ? 'con ese filtro' : 'todavía'}</div>
                  <div style={{ fontSize:13, marginBottom:16 }}>{empSearch ? 'Prueba otra búsqueda.' : 'Crea el primer empleado con el botón "+ Nuevo".'}</div>
                  {!empSearch && <button className="btn btn-primary btn-sm" onClick={openNew}>+ Añadir empleado</button>}
                </div>
              </td></tr>
            )}
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
                <td style={{ fontFamily:'monospace', letterSpacing:2 }}>{'•'.repeat(e.pinLen || (e.pin?.length <= 6 ? e.pin?.length : 4) || 4)}</td>
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
                    <button className="btn btn-sm btn-secondary" title="Generar QR de acceso" onClick={() => setQrEmp(e)}>QR</button>
                    {!e.baja && <button className="btn btn-sm btn-danger" onClick={() => del(e.id)}>Baja</button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {qrEmp && (
        <div onClick={() => setQrEmp(null)} style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.6)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)' }}>
          <div onClick={e => e.stopPropagation()} style={{ background:'var(--bg-700)', borderRadius:20, padding:'28px 24px 24px', boxShadow:'0 20px 60px rgba(0,0,0,.5)', border:'1px solid var(--border2)', textAlign:'center', maxWidth:320, width:'90%' }}>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>QR de acceso rápido</div>
            <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16 }}>{qrEmp.name} · escanea para pre-seleccionar</div>
            <div style={{ background:'#fff', borderRadius:12, display:'inline-block', padding:12, marginBottom:16 }}>
              <canvas ref={qrCanvasRef} />
            </div>
            <div style={{ fontSize:11, color:'var(--text4)', marginBottom:20, lineHeight:1.5 }}>
              Al escanear el QR, la app abrirá la pantalla de login con este empleado ya seleccionado.
            </div>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <button className="btn btn-secondary btn-sm" style={{ flex:1 }} onClick={() => {
                const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(qrEmp.id)}`
                navigator.clipboard?.writeText(url).then(() => toast('Enlace copiado', 2000, 'ok')).catch(() => toast('No se pudo copiar', 2000, 'err'))
              }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:4 }}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                Copiar enlace
              </button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setQrEmp(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
