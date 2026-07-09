import { useState, useEffect, useRef } from 'react'
import { gid } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'

export function TabMensajes({ db, u, toast, saveDB }) {
  const chats = db.chats || []
  const adminId = 'admin'
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  const conv = chats
    .filter(m => (m.from === u.id && m.to === adminId) || (m.from === adminId && m.to === u.id))
    .sort((a, b) => a.ts - b.ts)

  useEffect(() => {
    const hasUnread = chats.some(m => m.from === adminId && m.to === u.id && !m.leido)
    if (hasUnread) {
      saveDB(freshDb => ({ chats: (freshDb.chats || []).map(m => m.from === adminId && m.to === u.id ? { ...m, leido: true } : m) }))
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }, [conv.length])

  const send = () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    const msg = { id: gid(), from: u.id, to: adminId, text: t, ts: Date.now(), leido: false, estado: 'enviando' }
    setText('')
    try {
      saveDB(freshDb => ({ chats: [...(freshDb.chats || []), msg] }))
      queuePush('__admin__', `Mensaje de ${u.name}`, t, 'chat', '/?go=admin:mensajes')
      setTimeout(() => { setSending(false) }, 300)
    } catch {
      setSending(false)
    }
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 80)
  }

  return (
    <div style={{ position:'absolute', top:0, left:0, right:0, bottom:'90px', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <div style={{ padding:'14px 16px 12px', background:'linear-gradient(160deg,rgba(108,99,255,.08) 0%,transparent 100%)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:36, height:36, borderRadius:10, background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div>
            <div style={{ fontSize:20, fontWeight:800, letterSpacing:'-.5px' }}>Mensajes</div>
            <div style={{ fontSize:13, color:'var(--text3)' }}>Chat con administración</div>
          </div>
        </div>
      </div>

      <div style={{ flex:1, overflowY:'auto', padding:'12px 14px', display:'flex', flexDirection:'column', gap:8, minHeight:0 }}>
        <div style={{ marginTop:'auto' }} />
        {!conv.length && (
          <div className="empty-premium">
            <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></div>
            <div className="empty-premium-title">Sin mensajes aún</div>
            <div className="empty-premium-sub">Escríbele a la administración y responderá lo antes posible</div>
          </div>
        )}
        {conv.map(m => {
          const isMe = m.from === u.id
          const hora = new Date(m.ts).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' })
          const dia  = new Date(m.ts).toLocaleDateString('es-ES', { day:'numeric', month:'short' })
          return (
            <div key={m.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'flex-end', gap:7 }}>
              {!isMe && (
                <div style={{ width:28, height:28, borderRadius:'50%', background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:2, fontSize:9, fontWeight:800, color:'#fff', letterSpacing:'-.5px' }}>
                  Adm
                </div>
              )}
              <div style={{
                maxWidth:'78%', padding:'9px 13px',
                borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isMe ? 'var(--primary)' : 'var(--bg-600)',
                border: isMe ? 'none' : '1px solid var(--border)',
                fontSize:13, color: isMe ? '#fff' : 'var(--text)', lineHeight:1.45
              }}>
                {!isMe && <div style={{ fontSize:10, fontWeight:700, color:'var(--primary-light)', marginBottom:3 }}>Administración</div>}
                {m.text}
                <div style={{ fontSize:10, color: isMe ? 'rgba(255,255,255,.75)' : 'var(--text4)', marginTop:3, textAlign:'right' }}>
                  {dia} · {hora}{isMe && <span style={{ marginLeft:4 }}>{m.estado === 'enviando' ? '⏳' : '✓'}</span>}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', display:'flex', gap:8, background:'var(--bg-700)', flexShrink:0 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Escribe un mensaje…"
          aria-label="Escribe un mensaje"
          style={{ flex:1, background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:22, padding:'10px 16px', fontSize:14, color:'var(--text)', fontFamily:'inherit', outline:'none' }}
        />
        <button
          onClick={send}
          disabled={!text.trim() || sending}
          aria-label="Enviar mensaje"
          style={{ width:48, height:48, borderRadius:'50%', background:'var(--primary)', border:'none', cursor:(text.trim()&&!sending)?'pointer':'default', opacity:(text.trim()&&!sending)?1:.4, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'opacity .15s' }}>
          {sending
            ? <span style={{ width:16, height:16, border:'2px solid rgba(255,255,255,.3)', borderTopColor:'#fff', borderRadius:'50%', display:'inline-block', animation:'spin 0.7s linear infinite' }} />
            : <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          }
        </button>
      </div>
    </div>
  )
}
