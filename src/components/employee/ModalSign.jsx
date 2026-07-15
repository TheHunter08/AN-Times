import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:480, maxHeight:'90vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }
const BTN_ROW = { display:'flex', gap:8, marginTop:20 }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }

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
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900] }}>Firma digital</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', fontFamily:'inherit' }}>×</button>
        </div>

        {mode === 'view' && existingFirma ? (
          <>
            <div style={{ background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.xl, padding:6, marginBottom:14 }}>
              <img src={existingFirma.data} alt="Firma guardada" style={{ width:'100%', height:120, objectFit:'contain', borderRadius:radius.md, display:'block' }} />
            </div>
            <div style={{ fontSize:11, color:colors.text[500], textAlign:'center', marginBottom:16 }}>
              Firma guardada — {existingFirma.updatedAt ? new Date(existingFirma.updatedAt).toLocaleDateString('es-ES') : ''}
            </div>
            <div style={{ background:`color-mix(in srgb, ${colors.semantic.green} 8%, transparent)`, border:`1px solid color-mix(in srgb, ${colors.semantic.green} 19%, transparent)`, borderRadius:radius.md, padding:'10px 14px', marginBottom:16, fontSize:12, color:colors.semantic.green }}>
              Esta firma se aplicará automáticamente al firmar documentos y jornadas mensuales.
            </div>
            <div style={BTN_ROW}>
              <button style={btnSecondary} onClick={() => setMode('draw')}>Actualizar firma</button>
              <button style={btnPrimary} onClick={onClose}>Cerrar</button>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom:8 }}>
              <canvas ref={canvasRef} width={640} height={200}
                style={{ width:'100%', height:150, borderRadius:radius.lg, background:'#0D1218', cursor:'crosshair', touchAction:'none', border:`1px solid ${colors.border.subtle}`, display:'block' }}
                {...handlers} />
            </div>
            <div style={{ fontSize:11, color:colors.text[500], textAlign:'center', marginBottom:16 }}>Dibuja tu firma con el dedo o ratón</div>
            <div style={BTN_ROW}>
              <button style={btnSecondary} onClick={clearCanvas}>Borrar</button>
              {existingFirma
                ? <button style={btnSecondary} onClick={() => setMode('view')}>Cancelar</button>
                : <button style={btnSecondary} onClick={onClose}>Cerrar</button>
              }
              <button style={btnPrimary} onClick={save}>Guardar firma</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
