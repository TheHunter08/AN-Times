import { useState, useEffect, useRef } from 'react'
import { gid } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'

export default function PanelMensajes({ db, toast, saveDB, session }) {
  const [selEmpId, setSelEmpId] = useState(null)
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const emps = (db.employees || []).filter(e => !e.baja && !e.isAdmin)
  const chats = db.chats || []
  const adminId = 'admin'

  const getConv = empId => chats
    .filter(m => (m.from === empId && m.to === adminId) || (m.from === adminId && m.to === empId))
    .sort((a, b) => a.ts - b.ts)

  const unreadFor = empId => chats.filter(m => m.from === empId && m.to === adminId && !m.leido).length

  const selEmp = emps.find(e => e.id === selEmpId)
  const conv = selEmpId ? getConv(selEmpId) : []

  useEffect(() => {
    if (!selEmpId) return
    // Marcar mensajes del empleado como leídos
    const hasUnread = chats.some(m => m.from === selEmpId && m.to === adminId && !m.leido)
    if (hasUnread) {
      saveDB({ chats: chats.map(m => m.from === selEmpId && m.to === adminId ? { ...m, leido: true } : m) })
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }, [selEmpId, chats.length])

  const send = () => {
    const t = text.trim()
    if (!t || !selEmpId) return
    const msg = { id: gid(), from: adminId, to: selEmpId, text: t, ts: Date.now(), leido: false }
    saveDB({ chats: [...chats, msg] })
    queuePush(selEmpId, `Mensaje de ${session?.user?.name || 'Admin'}`, t, 'chat', '/?go=emp:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  const totalUnread = emps.reduce((s, e) => s + unreadFor(e.id), 0)

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Mensajes</h1>
          <div className="adm-panel-sub">{totalUnread > 0 ? `${totalUnread} sin leer` : 'Chat interno con empleados'}</div>
        </div>
      </div>

      <div style={{ display:'flex', gap:14, height:'calc(100vh - 200px)', minHeight:400 }}>
        {/* Lista empleados */}
        <div style={{ width:200, flexShrink:0, display:'flex', flexDirection:'column', gap:6 }}>
          {emps.map(e => {
            const conv2 = getConv(e.id)
            const last  = conv2[conv2.length - 1]
            const unr   = unreadFor(e.id)
            return (
              <button key={e.id} onClick={() => setSelEmpId(e.id)}
                style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 12px',
                  background: selEmpId === e.id ? 'var(--primary-dim)' : 'var(--bg-700)',
                  border: `1px solid ${selEmpId === e.id ? 'var(--primary-glow)' : 'var(--border)'}`,
                  borderRadius:'var(--r)', cursor:'pointer', fontFamily:'inherit', textAlign:'left', width:'100%' }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0, position:'relative' }}>
                  {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  {unr > 0 && <span style={{ position:'absolute', top:-4, right:-4, minWidth:14, height:14, borderRadius:7, background:'var(--danger)', color:'#fff', fontSize:8, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 2px' }}>{unr}</span>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]}</div>
                  {last && <div style={{ fontSize:10, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{last.from === adminId ? 'Tú: ' : ''}{last.text}</div>}
                </div>
              </button>
            )
          })}
          {!emps.length && <div style={{ fontSize:12, color:'var(--text3)', padding:12 }}>Sin empleados</div>}
        </div>

        {/* Conversación */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          {!selEmpId ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--text3)' }}>
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              <div style={{ fontSize:13 }}>Selecciona un empleado</div>
            </div>
          ) : (
            <>
              {/* Cabecera */}
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:'50%', background: selEmp?.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' }}>
                  {(selEmp?.initials||selEmp?.name.slice(0,2)||'?').toUpperCase()}
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{selEmp?.name}</div>
                  <div style={{ fontSize:11, color:'var(--text3)' }}>{selEmp?.empresa}</div>
                </div>
              </div>

              {/* Mensajes */}
              <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ flex:1 }} />
                {!conv.length && <div style={{ textAlign:'center', fontSize:12, color:'var(--text3)' }}>Sin mensajes. Escribe el primero.</div>}
                {conv.map(m => {
                  const isAdmin = m.from === adminId
                  return (
                    <div key={m.id} style={{ display:'flex', justifyContent: isAdmin ? 'flex-end' : 'flex-start' }}>
                      <div style={{ maxWidth:'75%', padding:'8px 12px', borderRadius: isAdmin ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                        background: isAdmin ? 'var(--primary)' : 'var(--bg-500)',
                        border: isAdmin ? 'none' : '1px solid var(--border)',
                        fontSize:13, color: isAdmin ? '#fff' : 'var(--text)' }}>
                        {m.text}
                        <div style={{ fontSize:10, marginTop:4, opacity:.65, textAlign:'right' }}>{new Date(m.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input */}
              <div style={{ padding:'12px 16px', borderTop:'1px solid var(--border)', display:'flex', gap:8 }}>
                <input value={text} onChange={e => setText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
                  placeholder="Escribe un mensaje…"
                  style={{ flex:1, padding:'10px 14px', borderRadius:22, border:'1px solid var(--border)', background:'var(--bg-500)', color:'var(--text)', fontSize:13, fontFamily:'inherit' }} />
                <button onClick={send} disabled={!text.trim()}
                  style={{ width:40, height:40, borderRadius:'50%', background:'var(--primary)', border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity: text.trim() ? 1 : .4 }}>
                  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
