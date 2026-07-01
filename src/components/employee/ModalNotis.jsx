import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'

export function ModalNotis({ visible, db, onClose, toast, saveDB, u }) {
  const [search, setSearch] = useState('')
  const notis = (db.notis || [])
    .filter(n => n.empId === u?.id)
    .slice(-50)
    .reverse()
    .filter(n => !search || (n.action||'').toLowerCase().includes(search.toLowerCase()) || (n.detail||'').toLowerCase().includes(search.toLowerCase()))
  const mensajes = (db.mensajes || []).filter(m => m.to === 'all' || m.to === u?.id).slice(-10).reverse()
  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null
  const markRead = () => {
    const updated = (db.notis || []).map(n => ({ ...n, leido: true }))
    saveDB({ notis: updated })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  const delNoti = (id) => {
    saveDB({ notis: (db.notis || []).filter(n => n.id !== id) })
  }
  const clearAll = () => {
    saveDB({ notis: (db.notis || []).filter(n => n.empId !== u?.id) })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={modalStyle}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 style={{ margin:0 }}>🔔 Notificaciones</h2>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            {notis.some(n => !n.leido) && <button onClick={markRead} style={{ background:'none', border:'none', color:'var(--primary-light)', fontSize:11, fontWeight:600, cursor:'pointer', padding:'2px 6px' }}>Marcar leídas</button>}
            {notis.length > 0 && <button onClick={clearAll} style={{ background:'none', border:'none', color:'var(--danger)', fontSize:11, fontWeight:600, cursor:'pointer', padding:'2px 6px' }}>Borrar todo</button>}
            <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', lineHeight:1 }}>×</button>
          </div>
        </div>
        <input
          type="search"
          placeholder="Buscar notificaciones…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Buscar notificaciones"
          style={{ width:'100%', padding:'8px 12px', borderRadius:10, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, boxSizing:'border-box' }}
        />
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
          {mensajes.map(m => (
            <div key={'msg-'+m.id} className="nitem" style={{ borderLeft:'3px solid var(--primary)' }}>
              <div className="nitem-ico" style={{ background:'var(--primary-dim)' }}>📢</div>
              <div className="nitem-body">
                <div className="nitem-title" style={{ color:'var(--primary-light)' }}>{m.title}</div>
                <div className="nitem-text">{m.body}</div>
                <div className="nitem-time">Administración · {m.ts ? new Date(m.ts).toLocaleString('es-ES') : ''}</div>
              </div>
            </div>
          ))}
          {!notis.length && !mensajes.length ? (
            <div className="empty">Sin notificaciones</div>
          ) : notis.map(n => (
            <div key={n.id} className={`nitem${!n.leido ? ' unread' : ''}`} style={{ position:'relative' }}>
              <div className="nitem-ico" style={{ background:'rgba(108,99,255,.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </div>
              <div className="nitem-body">
                <div className="nitem-title">{n.action || n.title || 'Notificación'}</div>
                <div className="nitem-text">{n.detail || n.body || ''}</div>
                <div className="nitem-time">{n.ts ? new Date(n.ts).toLocaleString('es-ES') : ''}</div>
              </div>
              <button onClick={() => delNoti(n.id)} style={{ position:'absolute', top:6, right:6, background:'none', border:'none', color:'var(--text4)', fontSize:16, cursor:'pointer', lineHeight:1, padding:'2px 5px', borderRadius:4 }} title="Eliminar">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
