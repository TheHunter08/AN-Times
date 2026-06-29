import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { p2, gid } from '../../utils/time.js'
import { auditLog } from '../../services/dataService.js'
import { queuePush } from '../../services/dataService.js'
import DocPreview from '../../components/DocPreview.jsx'

export default function PanelDocumentos({ db, toast, saveDB, session }) {
  const { showConfirm } = useAppStore()
  const emps = (db.employees||[]).filter(e => !e.baja)
  const docs = db.documentos || []
  const who = session?.user?.name || 'Admin'
  const [showForm, setShowForm] = useState(false)
  const [tab, setTab] = useState('todos')
  const [viewing, setViewing] = useState(null)
  const viewingPushed = useRef(false)

  useEffect(() => {
    if (!viewing) {
      if (viewingPushed.current) { viewingPushed.current = false; window.history.back() }
      return
    }
    window.history.pushState({ timesModal: true }, '')
    viewingPushed.current = true
    const onPop = () => { if (!viewingPushed.current) return; viewingPushed.current = false; setViewing(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [viewing])

  const EMPTY = { empId:'', tipo:'nomina', titulo:'', mes:'', url:'' }
  const [form, setForm] = useState(EMPTY)
  const [fileData, setFileData] = useState('')
  const [fileName, setFileName] = useState('')

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    if (f.size > 700000) { toast('Archivo muy grande (máx. 700KB). Comprime el PDF o usa una URL.'); return }
    const reader = new FileReader()
    reader.onload = ev => { setFileData(ev.target.result); setFileName(f.name) }
    reader.readAsDataURL(f)
  }

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }

  const add = () => {
    if (!form.empId) { toast('Selecciona un empleado'); return }
    if (!form.titulo.trim()) { toast('Escribe un título'); return }
    const emp = emps.find(e => e.id === form.empId)
    const doc = { ...form, id: gid(), empName: emp?.name || '', createdAt: new Date().toISOString(), firma: null }
    if (fileData) { doc.fileData = fileData; doc.fileName = fileName }
    const noti = { id: gid(), empId: form.empId, action: `Nuevo documento pendiente de firma`, detail: `${TIPO_LABELS[form.tipo]||form.tipo}: ${form.titulo}`, ts: new Date().toISOString(), leido: false }
    const withAudit = auditLog(db, 'Documento enviado', `${TIPO_LABELS[form.tipo]||form.tipo}: ${form.titulo} → ${doc.empName}`, who)
    saveDB({ documentos: [...docs, doc], notis: [...(db.notis||[]), noti], audit: withAudit.audit })
    queuePush(form.empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
    toast('Documento enviado al empleado', 3000, 'ok')
    setShowForm(false)
    setForm(EMPTY)
    setFileData(''); setFileName('')
  }

  const addJornada = (empId) => {
    const now = new Date()
    const mes = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
    const emp = emps.find(e => e.id === empId)
    if (!emp) return
    const already = docs.find(d => d.empId === empId && d.tipo === 'jornada' && d.mes === mes)
    if (already) { toast('Ya existe jornada para ese mes'); return }
    const doc = { id: gid(), empId, empName: emp.name, tipo:'jornada', titulo:`Jornada mensual ${mes}`, mes, url:'', createdAt: new Date().toISOString(), firma: null }
    const noti = { id: gid(), empId, action: 'Jornada mensual pendiente de firma', detail: `Necesitas firmar la jornada del mes ${mes}`, ts: new Date().toISOString(), leido: false }
    const withAudit = auditLog(db, 'Jornada enviada para firma', `${emp.name} · ${mes}`, who)
    saveDB({ documentos: [...docs, doc], notis: [...(db.notis||[]), noti], audit: withAudit.audit })
    queuePush(empId, noti.action, noti.detail, 'times-doc', '/?go=emp:documentos')
    toast('Jornada enviada para firma', 3000, 'ok')
  }

  const del = (id) => {
    showConfirm('¿Eliminar este documento?', () => {
      const doc = docs.find(d => d.id === id)
      const withAudit = auditLog(db, 'Documento eliminado', doc?.titulo || '', who)
      saveDB({ documentos: docs.filter(d => d.id !== id), audit: withAudit.audit })
      toast('Documento eliminado')
    })
  }

  const filtered = tab === 'todos' ? docs
    : tab === 'pendientes' ? docs.filter(d => !d.firma)
    : tab === 'firmados' ? docs.filter(d => d.firma)
    : docs.filter(d => d.tipo === tab)

  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <h1 className="adm-panel-title gradient-text">Documentos</h1>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => { setShowForm(false); setTab('todos') }}>
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><line x1="21" y1="4" x2="7" y2="4"/><line x1="3" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="11" y2="12"/><line x1="7" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/></svg>
            Jornadas mensuales
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowForm(s => !s)}>+ Nuevo documento</button>
        </div>
      </div>

      {showForm && (
        <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:20, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>Enviar documento a empleado</div>
          <div className="field-row">
            <div className="field">
              <label>Empleado *</label>
              <select value={form.empId} onChange={e => setForm(f=>({...f,empId:e.target.value}))}>
                <option value="">— Seleccionar —</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Tipo *</label>
              <select value={form.tipo} onChange={e => setForm(f=>({...f,tipo:e.target.value}))}>
                <option value="nomina">Nómina</option>
                <option value="contrato">Contrato de trabajo</option>
                <option value="jornada">Jornada mensual</option>
              </select>
            </div>
          </div>
          <div className="field-row">
            <div className="field"><label>Título *</label><input value={form.titulo} onChange={e => setForm(f=>({...f,titulo:e.target.value}))} placeholder="Ej: Nómina enero 2026" /></div>
            <div className="field"><label>Mes (YYYY-MM)</label><input type="month" value={form.mes} onChange={e => setForm(f=>({...f,mes:e.target.value}))} /></div>
          </div>
          <div className="field-row">
            <div className="field">
              <label>Archivo (PDF / imagen, máx 700KB)</label>
              <label style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg-600)', border:`1px dashed ${fileData?'var(--green)':'var(--border2)'}`, borderRadius:8, cursor:'pointer', transition:'border-color .15s' }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={fileData?'var(--green)':'var(--text3)'} strokeWidth="2" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                <span style={{ fontSize:12, color: fileData?'var(--green)':'var(--text3)' }}>{fileData ? `✓ ${fileName}` : 'Subir archivo…'}</span>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFile} style={{ display:'none' }} />
              </label>
            </div>
            <div className="field"><label>O enlace URL</label><input value={form.url} onChange={e => setForm(f=>({...f,url:e.target.value}))} placeholder="https://..." /></div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:4 }}>
            <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
            <button className="btn btn-primary" onClick={add}>Enviar documento</button>
          </div>
        </div>
      )}

      <div style={{ background:'linear-gradient(135deg,var(--primary-dim),rgba(0,212,255,.06))', border:'1px solid rgba(108,99,255,.2)', borderRadius:'var(--r)', padding:'16px 20px', marginBottom:20 }}>
        <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="var(--primary-light)" strokeWidth="2" style={{ marginRight:6, verticalAlign:'middle' }}><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          Solicitar firma de jornada mensual
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
          {emps.map(e => {
            const now = new Date()
            const mes = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
            const signed = docs.find(d => d.empId === e.id && d.tipo === 'jornada' && d.mes === mes && d.firma)
            const pending = docs.find(d => d.empId === e.id && d.tipo === 'jornada' && d.mes === mes && !d.firma)
            return (
              <div key={e.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', background:'var(--bg-700)', borderRadius:8, border:'1px solid var(--border)' }}>
                <div style={{ width:26, height:26, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {(e.initials||e.name.slice(0,2)).toUpperCase()}
                </div>
                <span style={{ fontSize:12, fontWeight:600 }}>{e.name.split(' ')[0]}</span>
                {signed ? (
                  <span className="badge badge-green">✓ Firmada</span>
                ) : pending ? (
                  <span className="badge badge-orange">⏳ Pendiente</span>
                ) : (
                  <button className="btn btn-sm btn-primary" onClick={() => addJornada(e.id)}>Solicitar</button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ display:'flex', gap:6, marginBottom:16 }}>
        {[['todos','Todos'],['pendientes','Pendientes'],['firmados','Firmados'],['nomina','Nóminas'],['contrato','Contratos'],['jornada','Jornadas']].map(([id,lbl]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding:'5px 12px', borderRadius:20, border:'1px solid', fontSize:11, fontWeight:600, cursor:'pointer',
              background: tab===id ? 'var(--primary)' : 'transparent',
              color: tab===id ? '#fff' : 'var(--text3)',
              borderColor: tab===id ? 'var(--primary)' : 'var(--border)' }}>
            {lbl}
          </button>
        ))}
      </div>

      <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {!filtered.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></div>
            <div className="empty-premium-title">Sin documentos</div>
            <div className="empty-premium-sub">Los documentos enviados a los empleados aparecerán aquí</div>
          </div>
        )}
        {[...filtered].sort((a,b) => b.createdAt?.localeCompare(a.createdAt||'')||0).map(d => (
          <div key={d.id} className="card-lift" style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)' }}>
            <div style={{ width:40, height:40, borderRadius:10, background:'var(--bg-500)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={TIPO_COLORS[d.tipo]||'var(--text3)'} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{d.titulo}</div>
                <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'var(--bg-400)', color:TIPO_COLORS[d.tipo]||'var(--text3)', flexShrink:0 }}>{TIPO_LABELS[d.tipo]||d.tipo}</span>
              </div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>
                {d.empName} · {d.createdAt ? new Date(d.createdAt).toLocaleDateString('es-ES') : ''}
                {d.firma && <span style={{ color:'var(--green)', marginLeft:8, fontWeight:600 }}>✓ Firmado {new Date(d.firma.firmadoAt).toLocaleDateString('es-ES')}</span>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              <button className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                Ver
              </button>
              {d.firma ? (
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  {d.firma.signatureData && (
                    <img src={d.firma.signatureData} alt="firma" style={{ height:32, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-600)' }} />
                  )}
                  <span className="badge badge-green">Firmado</span>
                </div>
              ) : (
                <span className="badge badge-orange">Pendiente</span>
              )}
              <button className="btn btn-sm btn-danger" onClick={() => del(d.id)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {viewing && (
        <div className="modal-ov" onClick={() => setViewing(null)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:560 }}>
            <div className="modal-drag" />
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
              <button onClick={() => setViewing(null)} style={{ background:'var(--bg-500)', border:'1px solid var(--border)', color:'var(--text2)', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
              <h2 style={{ margin:0, fontSize:16, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewing.titulo}</h2>
            </div>
            <DocPreview d={viewing} db={db} empId={viewing.empId} />
          </div>
        </div>
      )}
    </div>
  )
}
