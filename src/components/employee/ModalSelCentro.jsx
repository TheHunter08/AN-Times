import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { colors } from '../../ui-v2/design-system/colors.js'
import { radius } from '../../ui-v2/design-system/radius.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxHeight:'90vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }
const LBL  = { fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6, display:'block' }
const SEL  = { background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.md, padding:'10px 12px', fontSize:13, color:colors.text[900], fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }
const BTN_ROW = { display:'flex', gap:8, marginTop:20 }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }

export function ModalSelCentro({ visible, data, onConfirm, onClose }) {
  const [sel, setSel] = useState('')
  useEffect(() => { if (data?.current) setSel(data.current) }, [data])
  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null
  return (
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <h2 style={{ margin:'0 0 20px', fontSize:18, fontWeight:800, color:colors.text[900] }}>📍 Seleccionar centro de trabajo</h2>
        <div style={{ marginBottom:6 }}>
          <label style={LBL}>Centro</label>
          <select value={sel} onChange={e => setSel(e.target.value)} style={SEL}>
            <option value="">— Selecciona —</option>
            {(data?.centros || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={BTN_ROW}>
          <button style={btnSecondary} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={() => onConfirm(sel)}>Iniciar jornada</button>
        </div>
      </div>
    </div>
  )
}
