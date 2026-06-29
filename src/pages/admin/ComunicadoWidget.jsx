import { useState } from 'react'
import { gid } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'

export default function ComunicadoWidget({ db, toast, saveDB }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast('Completa título y mensaje'); return }
    setSending(true)
    const msg = { id: gid(), from: 'admin', title: title.trim(), body: body.trim(), to: 'all', ts: new Date().toISOString() }
    const withAudit = auditLog(db, 'Comunicado enviado', msg.title, 'Admin')
    saveDB({ mensajes: [...(db.mensajes||[]), msg], audit: withAudit.audit })
    await queuePush('__all__', '📢 ' + msg.title, msg.body, 'comunicado', '/?tab=inicio')
    toast('Comunicado enviado a todos los empleados', 3000, 'ok')
    setSending(false)
    setTitle(''); setBody(''); setOpen(false)
  }

  const mensajes = (db.mensajes || []).slice(-5).reverse()

  return (
    <div className="dash-widget card-lift" style={{ marginTop:16 }}>
      <div className="dash-widget-header">
        <div className="dash-widget-title">📢 Comunicados</div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : '+ Nuevo'}
        </button>
      </div>
      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          <input placeholder="Título del comunicado..." value={title} onChange={e => setTitle(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }} />
          <textarea placeholder="Mensaje para todos los empleados..." value={body} onChange={e => setBody(e.target.value)} rows={3}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13, resize:'vertical', fontFamily:'inherit' }} />
          <button className="btn btn-primary btn-sm" disabled={sending} onClick={send}>{sending ? 'Enviando…' : 'Enviar a todos'}</button>
        </div>
      )}
      {mensajes.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6, marginTop: open ? 14 : 0 }}>
          {mensajes.map(m => (
            <div key={m.id} style={{ padding:'10px 12px', background:'var(--bg-600)', borderRadius:8, border:'1px solid var(--border)', borderLeft:'3px solid var(--primary)' }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{m.title}</div>
              <div style={{ fontSize:11, color:'var(--text3)' }}>{m.body}</div>
              <div style={{ fontSize:10, color:'var(--text4)', marginTop:4 }}>{m.ts ? new Date(m.ts).toLocaleString('es-ES') : ''}</div>
            </div>
          ))}
        </div>
      )}
      {!mensajes.length && !open && (
        <div style={{ fontSize:12, color:'var(--text4)', textAlign:'center', padding:'12px 0' }}>Sin comunicados enviados aún</div>
      )}
    </div>
  )
}
