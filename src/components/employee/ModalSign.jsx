import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'

export function ModalSign({ visible, db, u, onClose, toast, saveDB }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [mode, setMode] = useState('view')

  const existingFirma = db.firmas?.[u?.id]?.main

  useEffect(() => { if (visible) setMode(existingFirma ? 'view' : 'draw') }, [visible])
  useEffect(() => { if (mode === 'draw') initCanvas() }, [mode])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null

  const save = () => {
    const data = getSignatureData()
    if (!data) { toast('Dibuja tu firma antes de guardar'); return }
    if (data.length > 200000) { toast('Firma muy grande, simplifica los trazos'); return }
    const firmas = { ...(db.firmas || {}), [u.id]: { ...(db.firmas?.[u.id] || {}), main: { data, updatedAt: new Date().toISOString(), empName: u.name } } }
    saveDB({ firmas })
    toast('Firma guardada correctamente', 3000, 'ok')
    onClose()
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:480, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Firma digital</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>

        {mode === 'view' && existingFirma ? (
          <>
            <div style={{ background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'6px', marginBottom:14 }}>
              <img src={existingFirma.data} alt="Firma guardada" style={{ width:'100%', height:120, objectFit:'contain', borderRadius:8, display:'block' }} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:16 }}>
              Firma guardada — {existingFirma.updatedAt ? new Date(existingFirma.updatedAt).toLocaleDateString('es-ES') : ''}
            </div>
            <div style={{ background:'var(--green-dim)', border:'1px solid rgba(54,178,126,.2)', borderRadius:'var(--r-sm)', padding:'10px 14px', marginBottom:16, fontSize:12, color:'var(--green)' }}>
              Esta firma se aplicará automáticamente al firmar documentos y jornadas mensuales.
            </div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={() => setMode('draw')}>Actualizar firma</button>
              <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom:8 }}>
              <canvas ref={canvasRef} width={640} height={200}
                style={{ width:'100%', height:150, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block' }}
                {...handlers} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)', textAlign:'center', marginBottom:16 }}>Dibuja tu firma con el dedo o ratón</div>
            <div className="modal-btns">
              <button className="btn btn-secondary" onClick={clearCanvas}>Borrar</button>
              {existingFirma
                ? <button className="btn btn-secondary" onClick={() => setMode('view')}>Cancelar</button>
                : <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
              }
              <button className="btn btn-primary" onClick={save}>Guardar firma</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
