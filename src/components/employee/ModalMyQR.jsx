import { useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'

// Muestra el QR personal del empleado — el mismo formato que ya genera
// PanelEmpleados.jsx para el admin (URL con ?emp=<id>), pero accesible
// desde el propio perfil para que el empleado se lo enseñe a su jefe de
// obra o encargado y le fichen la entrada.
export function ModalMyQR({ visible, u, onClose }) {
  const canvasRef = useRef(null)
  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)

  useEffect(() => {
    if (!visible || !canvasRef.current || !u?.id) return
    const url = `${window.location.origin}${window.location.pathname}?emp=${encodeURIComponent(u.id)}`
    QRCode.toCanvas(canvasRef.current, url, { width: 240, margin: 2, color: { dark: '#0d0d18', light: '#ffffff' } }).catch(() => {})
  }, [visible, u?.id])

  if (!visible) return null

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 340, textAlign: 'center', ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Mi código QR</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ background: '#fff', borderRadius: 'var(--r)', padding: 12, display: 'inline-block' }}>
          <canvas ref={canvasRef} />
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, marginTop: 14 }}>{u?.name}</div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 6 }}>
          Muéstraselo a tu jefe de obra o encargado para que te fichen la entrada.
        </div>
      </div>
    </div>
  )
}
