import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { gid, mhm } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'
import { buildCierreIndividualPDF } from '../../utils/cierrePdf.js'

// ─── FIRMA DE CIERRE MENSUAL (empleado) ────────────────────────────────────────
export function ModalCierreSign({ visible, db, u, onClose, toast, saveDB }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [selIdx, setSelIdx] = useState(0)
  const [firmando, setFirmando] = useState(false)
  const pendingCierres = (db.cierres || []).filter(c => c.empId === u?.id && c.estado === 'pendiente')
  const selCierre = pendingCierres[selIdx] || null

  useEffect(() => { if (visible && selCierre) initCanvas() }, [visible, selCierre])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible || !selCierre) return null

  const firmar = async () => {
    const signatureData = getSignatureData()
    if (!signatureData) { toast('Dibuja tu firma antes de confirmar'); return }
    setFirmando(true)
    const firmadoAt = new Date().toISOString()
    const firmado = { ...selCierre, estado:'firmado', firma:{ signatureData, firmadoAt, empName:u.name } }
    let pdfData = null
    try {
      const { dataUrl } = await buildCierreIndividualPDF({ cierre: firmado, empresa: u.empresa })
      pdfData = dataUrl
    } catch (e) {
      console.warn('[cierre] No se pudo generar el PDF firmado:', e)
    }
    const cierreFinal = pdfData ? { ...firmado, pdfData } : firmado
    const updatedCierres = (db.cierres || []).map(ci => ci.id === selCierre.id ? cierreFinal : ci)
    const noti = { id: gid(), empId:'__admin__', action:'Cierre firmado', detail:`${u.name} firmó el cierre de ${selCierre.mes}`, ts: firmadoAt, leido:false }
    saveDB({ cierres: updatedCierres, notis:[...(db.notis||[]), noti] })
    queuePush('__admin__', noti.action, noti.detail, 'cierre', '/?go=admin:informes')
    toast('Cierre mensual firmado correctamente', 3000, 'ok')
    setFirmando(false)
    onClose()
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={modalStyle}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h2 style={{ margin:0, fontSize:16 }}>📋 Cierre mensual · {selCierre.mes}</h2>
          {pendingCierres.length > 1 && (
            <div style={{ display:'flex', gap:4 }}>
              {pendingCierres.map((_, i) => (
                <button key={i} onClick={() => setSelIdx(i)} style={{ width:8, height:8, borderRadius:'50%', border:'none', cursor:'pointer', background: i===selIdx?'var(--primary)':'var(--bg-400)', padding:0 }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12 }}>
          Generado por {selCierre.generadoPor} · {selCierre.dias} días trabajados · {mhm(selCierre.totalMin)}
        </div>

        {/* Records snapshot */}
        <div style={{ background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:'10px 12px', marginBottom:14, maxHeight:160, overflowY:'auto' }}>
          {(selCierre.records_snapshot || []).map((r, i) => {
            const d = new Date(r.inicio)
            return (
              <div key={i} style={{ display:'flex', gap:8, fontSize:12, color:'var(--text2)', padding:'3px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ width:90, flexShrink:0, color:'var(--text3)' }}>{d.toLocaleDateString('es-ES',{day:'numeric',month:'short',weekday:'short'})}</span>
                <span style={{ flex:1, color:'var(--text3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.centro||'—'}</span>
                <span style={{ fontWeight:700, color:'var(--primary-light)', flexShrink:0 }}>{mhm(Math.floor((r.workSecs||0)/60))}</span>
              </div>
            )
          })}
        </div>

        <div style={{ fontSize:12, fontWeight:700, marginBottom:6, color:'var(--text2)' }}>Firma digital</div>
        <canvas ref={canvasRef} width={640} height={180}
          style={{ width:'100%', height:120, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block', marginBottom:6 }}
          {...handlers} />
        <button className="btn btn-secondary btn-sm" onClick={clearCanvas} style={{ marginBottom:14 }}>Borrar</button>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose} disabled={firmando}>Cancelar</button>
          <button className="btn btn-primary" onClick={firmar} disabled={firmando}>{firmando ? 'Generando PDF…' : '✅ Firmar y enviar'}</button>
        </div>
      </div>
    </div>
  )
}
