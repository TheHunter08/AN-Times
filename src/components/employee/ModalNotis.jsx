import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV  = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxHeight:'90vh', overflowY:'auto', position:'relative' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 18px' }

export function ModalNotis({ visible, db, onClose, toast, saveDB, u }) {
  const [search, setSearch] = useState('')
  const notis = (db.notis || [])
    .filter(n => n.empId === u?.id && !n.deleted)
    .slice(-50)
    .reverse()
    .filter(n => !search || (n.action||'').toLowerCase().includes(search.toLowerCase()) || (n.detail||'').toLowerCase().includes(search.toLowerCase()))
  const mensajes = (db.mensajes || []).filter(m => m.to === 'all' || m.to === u?.id).slice(-10).reverse()
  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null
  const markRead = () => {
    const updated = (db.notis || []).map(n => n.empId === u?.id && !n.deleted ? { ...n, leido: true } : n)
    saveDB({ notis: updated })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  const delNoti = (id) => {
    saveDB({ notis: (db.notis || []).map(n => n.id === id ? { ...n, deleted: true, leido: true } : n) })
  }
  const clearAll = () => {
    saveDB({ notis: (db.notis || []).map(n => n.empId === u?.id ? { ...n, deleted: true, leido: true } : n) })
    try { if ('clearAppBadge' in navigator) navigator.clearAppBadge() } catch {}
  }
  return (
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <h2 style={{ margin:0, fontSize:17, fontWeight:800, color:colors.text[900] }}>🔔 Notificaciones</h2>
          <div style={{ display:'flex', gap:6, alignItems:'center' }}>
            {notis.some(n => !n.leido) && <button onClick={markRead} style={{ background:'none', border:'none', color:colors.primary.light, fontSize:11, fontWeight:700, cursor:'pointer', padding:'2px 6px', fontFamily:'inherit' }}>Marcar leídas</button>}
            {notis.length > 0 && <button onClick={clearAll} style={{ background:'none', border:'none', color:colors.semantic.red, fontSize:11, fontWeight:700, cursor:'pointer', padding:'2px 6px', fontFamily:'inherit' }}>Borrar todo</button>}
            <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', lineHeight:1, fontFamily:'inherit' }}>×</button>
          </div>
        </div>
        <input
          type="search"
          placeholder="Buscar notificaciones…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Buscar notificaciones"
          style={{ width:'100%', padding:'8px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[600], color:colors.text[900], fontSize:13, fontFamily:'inherit', outline:'none', marginBottom:10, boxSizing:'border-box' }}
        />
        <div style={{ display:'flex', flexDirection:'column', gap:8, maxHeight:'60vh', overflowY:'auto' }}>
          {mensajes.map(m => (
            <div key={'msg-'+m.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:colors.bg[600], border:`1px solid ${colors.primary.base}30`, borderLeft:`3px solid ${colors.primary.base}`, borderRadius:radius.lg }}>
              <div style={{ width:36, height:36, borderRadius:radius.md, background:colors.primary.dim, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>📢</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:colors.primary.light, marginBottom:2 }}>{m.title}</div>
                <div style={{ fontSize:12, color:colors.text[700], lineHeight:1.45 }}>{m.body}</div>
                <div style={{ fontSize:10, color:colors.text[300], marginTop:4 }}>Administración · {m.ts ? new Date(m.ts).toLocaleString('es-ES') : ''}</div>
              </div>
            </div>
          ))}
          {!notis.length && !mensajes.length ? (
            <div style={{ textAlign:'center', padding:'32px 0', color:colors.text[300], fontSize:13 }}>Sin notificaciones</div>
          ) : notis.map(n => (
            <div key={n.id} style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'12px 14px', background:n.leido ? colors.bg[600] : `${colors.primary.base}08`, border:`1px solid ${n.leido ? colors.border.subtle : colors.primary.base+'25'}`, borderRadius:radius.lg, position:'relative' }}>
              <div style={{ width:36, height:36, borderRadius:radius.md, background:'rgba(108,99,255,.1)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#6c63ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:n.leido ? 600 : 800, color:colors.text[900], marginBottom:2 }}>{n.action || n.title || 'Notificación'}</div>
                <div style={{ fontSize:12, color:colors.text[500], lineHeight:1.45 }}>{n.detail || n.body || ''}</div>
                <div style={{ fontSize:10, color:colors.text[300], marginTop:4 }}>{n.ts ? new Date(n.ts).toLocaleString('es-ES') : ''}</div>
              </div>
              <button onClick={() => delNoti(n.id)} style={{ position:'absolute', top:8, right:8, background:'none', border:'none', color:colors.text[300], fontSize:16, cursor:'pointer', lineHeight:1, padding:'2px 5px', borderRadius:4, fontFamily:'inherit' }} title="Eliminar">×</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
