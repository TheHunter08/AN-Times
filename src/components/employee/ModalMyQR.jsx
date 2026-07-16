import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:340, textAlign:'center' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 16px' }

// Muestra el QR personal del empleado — el mismo formato que ya genera
// PanelEmpleados.jsx para el admin (URL con ?emp=<id>), pero accesible
// desde el propio perfil para que el empleado se lo enseñe a su jefe de
// obra o encargado y le fichen la entrada.
export function ModalMyQR({ visible, u, onClose }) {
  const canvasRef = useRef(null)
  useModalBack(visible, onClose)
  const dialogRef = useDialogA11y(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)

  useEffect(() => {
    if (!visible || !canvasRef.current || !u?.id) return
    const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(u.id)}`
    QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 2, color: { dark: '#0d0d18', light: '#ffffff' } }).catch(() => {})
  }, [visible, u?.id])

  if (!visible) return null

  return (
    <div style={OV} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="my-qr-dialog-title" style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <h2 id="my-qr-dialog-title" style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900] }}>Mi código QR</h2>
          <button onClick={onClose} aria-label="Cerrar código QR" style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', fontFamily:'inherit' }}>×</button>
        </div>
        <div style={{ background:'#fff', borderRadius:radius.xl, padding:12, display:'inline-block' }}>
          <canvas ref={canvasRef} />
        </div>
        <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginTop:14 }}>{u?.name}</div>
        <div style={{ fontSize:12, color:colors.text[500], marginTop:6 }}>
          Muéstraselo a tu jefe de obra o encargado para que te fichen la entrada.
        </div>
      </div>
    </div>
  )
}
