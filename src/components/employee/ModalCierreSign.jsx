import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { calcSecs, localMonthKey, mhm, recWorkSecs } from '../../utils/time.js'
import { queuePush, supabase } from '../../services/dataService.js'
import { buildCierreIndividualPDF } from '../../utils/cierrePdf.js'
import { canCloseMonth } from '../../utils/adminHelpers.js'
import { CIERRE_PDF_BUCKET } from '../../config/constants.js'
import { monthlyTargetMinutes } from '../../utils/workTargets.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { createNotification } from '../../utils/notifications.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxHeight:'92vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 16px' }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }
const btnSmSec = { padding:'6px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:11, fontFamily:'inherit', cursor:'pointer' }

// ─── FIRMA DE CIERRE MENSUAL (empleado) ─────────────────────────────────────
export function ModalCierreSign({ visible, db, u, onClose, toast, saveDB }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [selIdx, setSelIdx] = useState(0)
  const [firmando, setFirmando] = useState(false)
  const pendingCierres = (db.cierres || []).filter(c => c.empId === u?.id && c.estado === 'pendiente' && !c.desactualizado && canCloseMonth(c.mes) && !(c.firmaAdmin || c.firmaEmp || c.firma))
  const selCierre = pendingCierres[selIdx] || null
  const liveRecords = selCierre
    ? (db.records || []).filter(record => record.empId === u?.id && record.inicio && record.fin && localMonthKey(record.inicio) === selCierre.mes)
    : []
  const snapshotSource = selCierre?.desactualizado ? liveRecords : (liveRecords.length ? liveRecords : (selCierre?.records_snapshot || []))
  const previewSnapshot = snapshotSource.map(record => {
    const totals = calcSecs(record)
    return { ...record, workSecs: totals.work, breakSecs: totals.brk }
  })
  const previewTotalMin = Math.floor(previewSnapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
  const targetMin = selCierre ? (selCierre.targetMin || monthlyTargetMinutes(u, selCierre.mes)) : 0
  const closable = selCierre ? canCloseMonth(selCierre.mes) : false

  useEffect(() => { if (visible && selCierre) initCanvas() }, [visible, selCierre])

  useModalBack(visible, onClose)
  const dialogRef = useDialogA11y(visible && Boolean(selCierre), onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible || !selCierre) return null

  const firmar = async () => {
    if (!closable) { toast('Este mes todavía no ha terminado', 4500, 'warn'); return }
    const signatureData = getSignatureData()
    if (!signatureData) { toast('Dibuja tu firma antes de confirmar'); return }
    setFirmando(true)
    const firmadoAt = new Date().toISOString()
    const records_snapshot = previewSnapshot
    const totalMin = previewTotalMin
    const dias = new Set(records_snapshot.map(record => new Date(record.inicio).toLocaleDateString('es-ES'))).size
    const firmado = { ...selCierre, records_snapshot, totalMin, targetMin, extraMin:Math.max(0, totalMin - targetMin), dias, desactualizado:false, estado: selCierre.firmaAdmin ? 'firmado' : 'pendiente_firma_admin', firma:{ signatureData, firmadoAt, empName:u.name }, firmaEmp:true, _upd:firmadoAt }
    let pdfData = null
    let documentoId = null
    let integrityHash = null
    try {
      const { dataUrl, blob, hash } = await buildCierreIndividualPDF({ cierre: firmado, empresa: u.empresa })
      integrityHash = hash || null
      // Preferimos subir el PDF a Storage (bucket privado) en vez de guardar el
      // base64 dentro de la fila de `cierres` — el base64 infla ~33% el tamaño
      // y se come la cuota gratuita de base de datos en vez de la de Storage.
      // Si no hay conexión o falla la subida, se cae al comportamiento anterior
      // (guardar pdfData) para no bloquear la firma por un problema de red.
      if (supabase) {
        try {
          const path = `${firmado.empId}/${firmado.mes}.pdf`
          const { error } = await supabase.storage.from(CIERRE_PDF_BUCKET).upload(path, blob, { contentType: 'application/pdf', upsert: true })
          if (!error) documentoId = path
          else console.warn('[cierre] No se pudo subir el PDF a Storage, se guarda localmente:', error.message)
        } catch (uploadErr) {
          // Una excepción aquí (red caída, CORS, etc.) no debe perder el PDF
          // entero — sin este catch propio, saltaba al catch exterior sin
          // llegar nunca a la línea de abajo que guarda pdfData de respaldo.
          console.warn('[cierre] Error al subir el PDF a Storage, se guarda localmente:', uploadErr.message)
        }
      }
      if (!documentoId) pdfData = dataUrl
    } catch (e) {
      console.warn('[cierre] No se pudo generar el PDF firmado:', e)
    }
    const cierreFinal = (pdfData || documentoId) ? { ...firmado, pdfData, documentoId, integrityHash } : firmado
    const noti = createNotification({ empId:'__admin__', action:'Cierre firmado', detail:`${u.name} firmó el cierre de ${selCierre.mes}`, dedupeKey:`cierre:${selCierre.id}:firma:${u.id}`, ts:firmadoAt })
    saveDB(fresh => ({
      cierres:(fresh.cierres || []).map(ci => ci.id === selCierre.id ? cierreFinal : ci),
      notis:[...(fresh.notis || []), noti],
    }))
    queuePush('__admin__', noti.action, noti.detail, 'cierre', '/?go=admin:informes', `cierre:${selCierre.id}:firma:${u.id}`)
    toast('Cierre mensual firmado correctamente', 3000, 'ok')
    setFirmando(false)
    onClose()
  }

  return (
    <div style={OV} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Firma de cierre mensual" style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:colors.text[900] }}>📋 Cierre mensual · {selCierre.mes}</h2>
          {pendingCierres.length > 1 && (
            <div style={{ display:'flex', gap:4 }}>
              {pendingCierres.map((_, i) => (
                <button key={i} onClick={() => setSelIdx(i)} style={{ width:8, height:8, borderRadius:'50%', border:'none', cursor:'pointer', background: i===selIdx ? colors.primary.base : colors.bg[400], padding:0 }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize:12, color:colors.text[500], marginBottom:4 }}>
          Generado por {selCierre.generadoPor} · {new Set(previewSnapshot.map(record => new Date(record.inicio).toLocaleDateString('es-ES'))).size} días trabajados · {mhm(previewTotalMin)}
        </div>
        <div style={{ fontSize:12, color: previewTotalMin > targetMin ? colors.primary.light : colors.text[500], marginBottom:14, fontWeight: previewTotalMin > targetMin ? 700 : 400 }}>
          {previewTotalMin > targetMin
            ? `${mhm(previewTotalMin - targetMin)} por encima de tu objetivo contractual (${mhm(targetMin)})`
            : previewTotalMin < targetMin
              ? `${mhm(targetMin - previewTotalMin)} por debajo de tu objetivo contractual (${mhm(targetMin)})`
              : `Coincide exactamente con tu objetivo contractual (${mhm(targetMin)})`}
        </div>

        {/* Records snapshot */}
        <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.lg, padding:'10px 12px', marginBottom:14, maxHeight:160, overflowY:'auto' }}>
          {previewSnapshot.map((r, i) => {
            const d = new Date(r.inicio)
            return (
              <div key={i} style={{ display:'flex', gap:8, fontSize:12, color:colors.text[700], padding:'3px 0', borderBottom:`1px solid ${colors.border.subtle}` }}>
                <span style={{ width:90, flexShrink:0, color:colors.text[500] }}>{d.toLocaleDateString('es-ES',{day:'numeric',month:'short',weekday:'short'})}</span>
                <span style={{ flex:1, color:colors.text[500], overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.centro||'—'}</span>
                <span style={{ fontWeight:700, color:colors.primary.light, flexShrink:0 }}>{mhm(Math.floor(recWorkSecs(r)/60))}</span>
              </div>
            )
          })}
        </div>

        {!closable && (
          <div style={{ background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', borderRadius:radius.lg, padding:'10px 12px', marginBottom:14, fontSize:12, color:colors.semantic.orange, fontWeight:600 }}>
            Este mes aún no ha terminado. Podrás firmarlo cuando comience el mes siguiente.
          </div>
        )}
        <div style={{ fontSize:12, fontWeight:700, marginBottom:6, color:colors.text[700] }}>Firma digital</div>
        <canvas ref={canvasRef} width={640} height={180}
          style={{ width:'100%', height:120, borderRadius:radius.lg, background:'#0D1218', cursor: closable ? 'crosshair' : 'not-allowed', touchAction:'none', border:`1px solid ${colors.border.subtle}`, display:'block', marginBottom:8, opacity: closable ? 1 : .5, pointerEvents: closable ? 'auto' : 'none' }}
          {...handlers} />
        <button style={{ ...btnSmSec, marginBottom:16 }} onClick={clearCanvas} disabled={!closable}>Borrar</button>
        <div style={{ display:'flex', gap:8 }}>
          <button style={btnSecondary} onClick={onClose} disabled={firmando}>Cancelar</button>
          <button style={{ ...btnPrimary, opacity: closable ? 1 : .5, cursor: closable ? 'pointer' : 'not-allowed' }} onClick={firmar} disabled={firmando || !closable}>{firmando ? 'Generando PDF…' : '✅ Firmar y enviar'}</button>
        </div>
      </div>
    </div>
  )
}
