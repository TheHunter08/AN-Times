import { useState, useEffect, useRef } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { gid } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function ModalChat({ visible, db, u, onClose, saveDB, toast }) {
  const [text, setText] = useState('')
  const bottomRef = useRef(null)

  const chats   = db.chats || []
  const adminId = 'admin'
  const conv    = u ? chats
    .filter(m => (m.from === u.id && m.to === adminId) || (m.from === adminId && m.to === u.id))
    .sort((a, b) => a.ts - b.ts) : []

  // Marcar mensajes de admin como leídos al abrir.
  // El return temprano va DESPUÉS de todos los hooks (Rules of Hooks).
  useEffect(() => {
    if (!visible || !u) return
    const hasUnread = chats.some(m => m.from === adminId && m.to === u.id && !m.leido)
    if (hasUnread) saveDB(freshDb => ({ chats: (freshDb.chats || []).map(m => m.from === adminId && m.to === u.id ? { ...m, leido: true } : m) }))
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 80)
  }, [visible, chats.length])

  useModalBack(visible, onClose)
  if (!visible || !u) return null

  const send = () => {
    const t = text.trim()
    if (!t) return
    const msg = { id: gid(), from: u.id, to: adminId, text: t, ts: Date.now(), leido: false }
    saveDB(freshDb => ({ chats: [...(freshDb.chats || []), msg] }))
    queuePush('__admin__', `Mensaje de ${u.name}`, t, 'chat', '/?go=admin:mensajes')
    setText('')
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior:'smooth' }), 50)
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:120, background:'rgba(0,0,0,.6)', display:'flex', flexDirection:'column' }}>
      <div style={{ background:colors.bg[700], flex:1, display:'flex', flexDirection:'column', maxHeight:'100%' }}>
        {/* Cabecera */}
        <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 20px', borderBottom:`1px solid ${colors.border.default}` }}>
          <button onClick={onClose} style={{ background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.md, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.text[700]} strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div>
            <div style={{ fontSize:15, fontWeight:700, color:colors.text[900] }}>Chat con Administración</div>
            <div style={{ fontSize:11, color:colors.text[500] }}>Responden en horario de oficina</div>
          </div>
        </div>

        {/* Mensajes */}
        <div style={{ flex:1, overflowY:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ flex:1 }} />
          {!conv.length && (
            <div style={{ textAlign:'center', color:colors.text[500], fontSize:13 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>💬</div>
              Sin mensajes. Escribe tu primera consulta al administrador.
            </div>
          )}
          {conv.map(m => {
            const isMe = m.from === u.id
            return (
              <div key={m.id} style={{ display:'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', alignItems:'flex-end', gap:8 }}>
                {!isMe && (
                  <div style={{ width:30, height:30, borderRadius:'50%', background:colors.primary.dim, border:`1px solid ${colors.primary.glow}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginBottom:2 }}>
                    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={colors.primary.light} strokeWidth="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                )}
                <div style={{ maxWidth:'80%', padding:'10px 14px',
                  borderRadius: isMe ? `${radius.xl} ${radius.xl} ${radius.sm} ${radius.xl}` : `${radius.xl} ${radius.xl} ${radius.xl} ${radius.sm}`,
                  background: isMe ? colors.primary.base : colors.bg[500],
                  border: isMe ? 'none' : `1px solid ${colors.border.default}`,
                  fontSize:14, color: isMe ? '#fff' : colors.text[900] }}>
                  {!isMe && <div style={{ fontSize:10, fontWeight:700, color:colors.primary.light, marginBottom:4 }}>Administración</div>}
                  {m.text}
                  <div style={{ fontSize:10, marginTop:5, opacity:.6, textAlign:'right' }}>
                    {new Date(m.ts).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding:'12px 16px', borderTop:`1px solid ${colors.border.default}`, display:'flex', gap:8 }}>
          <input value={text} onChange={e => setText(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Escribe un mensaje…"
            style={{ flex:1, padding:'11px 16px', borderRadius:24, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[900], fontSize:14, fontFamily:'inherit', outline:'none' }} />
          <button onClick={send} disabled={!text.trim()}
            style={{ width:44, height:44, borderRadius:'50%', background:colors.primary.base, border:'none', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, opacity: text.trim() ? 1 : .4, boxShadow:`0 4px 14px ${colors.primary.glow}` }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" strokeWidth="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    </div>
  )
}
