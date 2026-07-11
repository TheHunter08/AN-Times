import { useModalBack } from '../../hooks/useModalBack.js'
import { applyBrandColor, removeBrandColor } from '../../utils/webauthn.js'
import { colors } from '../../ui-v2/design-system/colors.js'
import { radius } from '../../ui-v2/design-system/radius.js'

const ACCENT_PRESETS = ['#5E6AD2','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316','#0EA5E9','#84CC16']

// ─── ModalTemas ────────────────────────────────────────────────────────────────
export function ModalTemas({ visible, db, u, onClose, saveDB }) {
  useModalBack(visible, onClose)
  if (!visible) return null
  const saveAccentColor = (color) => {
    const emps2 = (db.employees || []).map(e => e.id === u.id ? { ...e, accentColor: color || undefined } : e)
    saveDB({ employees: emps2 })
    if (color) applyBrandColor(color); else removeBrandColor()
  }
  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', flexDirection:'column', background:colors.bg[800] }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'16px 16px 12px', borderBottom:`1px solid ${colors.border.default}`, flexShrink:0 }}>
        <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], cursor:'pointer', padding:4, display:'flex' }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ fontSize:16, fontWeight:800, color:colors.text[900] }}>Temas</div>
      </div>
      <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch', padding:'20px 16px' }}>
        <div style={{ fontSize:12, color:colors.text[500], marginBottom:24 }}>Personaliza el aspecto de la app</div>

        <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.default}`, borderRadius:radius.lg, padding:'18px' }}>
          <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginBottom:4 }}>Mi color personal</div>
          <div style={{ fontSize:11, color:colors.text[500], marginBottom:18 }}>Se aplica en botones, iconos y acentos de toda la app</div>
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
            {ACCENT_PRESETS.map(c => (
              <div key={c} onClick={() => saveAccentColor(u.accentColor === c ? null : c)}
                style={{ width:36, height:36, borderRadius:'50%', background:c, cursor:'pointer', flexShrink:0,
                  border: u.accentColor === c ? `3px solid ${colors.text[900]}` : '3px solid transparent',
                  transform: u.accentColor === c ? 'scale(1.2)' : 'scale(1)',
                  transition:'transform .15s, border-color .15s',
                  boxShadow: u.accentColor === c ? `0 0 0 2px ${colors.bg[700]}, 0 0 12px ${c}80` : 'none' }} />
            ))}
            <label style={{ width:36, height:36, borderRadius:'50%', overflow:'hidden', cursor:'pointer', flexShrink:0,
              border:`2px dashed ${colors.border.subtle}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}
              title="Color personalizado">
              🎨
              <input type="color" value={u.accentColor||'#5E6AD2'} onChange={e => saveAccentColor(e.target.value)}
                style={{ opacity:0, position:'absolute', width:1, height:1 }} />
            </label>
          </div>
          {u.accentColor && (
            <button onClick={() => saveAccentColor(null)}
              style={{ marginTop:16, fontSize:12, color:colors.text[300], background:'none', border:'none', cursor:'pointer', padding:0 }}>
              ↩ Restaurar color por defecto
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
