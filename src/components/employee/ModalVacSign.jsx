import { useState, useEffect } from 'react'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { authSupabase } from '../../services/authService.js'
import { queuePush } from '../../services/dataService.js'
import { buildVacacionPDF } from '../../utils/vacacionPdf.js'
import { VACACIONES_PDF_BUCKET } from '../../config/constants.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { createNotification } from '../../utils/notifications.js'
import { gid } from '../../utils/time.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.7)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1100 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxHeight:'92vh', overflowY:'auto' }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSmSec = { padding:'6px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:11, fontFamily:'inherit', cursor:'pointer' }

const fmtDate = (ds) => ds ? new Date(ds + 'T00:00:00').toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' }) : '—'

// Firma OBLIGATORIA del documento de vacaciones aprobadas, antes de enviarlo
// al jefe de obra. A diferencia de ModalCierreSign (que es un recordatorio
// descartable), este modal no tiene botón de cancelar/cerrar: se muestra
// mientras exista alguna vacación aprobada sin firmar (ver EmployeePage.jsx).
export function ModalVacSign({ visible, db, u, toast, saveDB }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [selIdx, setSelIdx] = useState(0)
  const [firmando, setFirmando] = useState(false)
  const pendingVacs = (db.vacaciones || []).filter(v => v.empId === u?.id && v.estado === 'aprobada' && !v.firmaEmp)
  const selVac = pendingVacs[Math.min(selIdx, pendingVacs.length - 1)] || null

  useEffect(() => { if (visible && selVac) initCanvas() }, [visible, selVac?.id])

  if (!visible || !selVac) return null

  const firmar = async () => {
    const signatureData = getSignatureData()
    if (!signatureData) { toast('Dibuja tu firma antes de confirmar'); return }
    setFirmando(true)
    // try/finally: sin esto, cualquier excepción no prevista (p.ej. saveDB
    // lanzando por cuota de localStorage) dejaba el botón en "Generando
    // PDF…" deshabilitado para siempre — este modal no tiene botón de
    // cerrar/cancelar (firma obligatoria), así que el empleado se quedaba
    // sin forma de salir ni de reintentar.
    try {
      const firmadoAt = new Date().toISOString()
      const vacFirmada = { ...selVac, firma:{ signatureData, firmadoAt, empName:u.name }, firmaEmp:true, _upd:firmadoAt }
      let documentoId = null
      let pdfData = null
      let pdfFailed = false
      try {
        const { dataUrl, blob } = await buildVacacionPDF({ vac:vacFirmada, empresa:u.empresa })
        // Mismo criterio que el PDF de cierre mensual: preferir Storage (cuota
        // separada) sobre guardar el base64 en la fila de `vacaciones`. Si falla
        // la subida (sin conexión, bucket no configurado) se cae a guardar el
        // PDF inline para no bloquear la firma por un problema de red.
        if (authSupabase) {
          try {
            const path = `${vacFirmada.empId}/${vacFirmada.id}.pdf`
            const { error } = await authSupabase.storage.from(VACACIONES_PDF_BUCKET).upload(path, blob, { contentType:'application/pdf', upsert:true })
            if (!error) documentoId = path
            else console.warn('[vacaciones] No se pudo subir el PDF a Storage, se guarda localmente:', error.message)
          } catch (uploadErr) {
            console.warn('[vacaciones] Error al subir el PDF a Storage, se guarda localmente:', uploadErr.message)
          }
        }
        if (!documentoId) pdfData = dataUrl
      } catch (e) {
        console.warn('[vacaciones] No se pudo generar el PDF firmado:', e)
        pdfFailed = true
      }
      // Sin ningún artefacto (ni en Storage ni inline) no hay nada que
      // firmar de verdad: seguir adelante marcaba firmaEmp=true, creaba un
      // documento vacío e irrecuperable en `documentos` (no hay origen desde
      // el que regenerarlo, a diferencia de un cierre mensual) y notificaba
      // al jefe de obra "vacaciones firmadas" aunque no existiera ningún
      // PDF. Se corta aquí para que el empleado pueda reintentar.
      if (pdfFailed || (!documentoId && !pdfData)) {
        toast('No se pudo generar el PDF de tus vacaciones. Comprueba tu conexión e inténtalo de nuevo.', 5000, 'err')
        return
      }
      const vacFinal = { ...vacFirmada, documentoId, pdfData }
      // El documento firmado se añade también a `documentos` para que sea
      // visible/descargable desde el panel de administración (Documentos) —
      // el jefe de obra ya tiene acceso completo a ese panel, así que no hace
      // falta un canal de entrega aparte.
      // fileData/signedStoragePath (no `data`): son los campos que
      // hasSignedDocumentArtifact/documentInlineArtifact (documentSigning.js)
      // reconocen como el artefacto YA firmado — este PDF nace firmado (la
      // firma se dibuja al generarlo), a diferencia del flujo de ModalDocumentos
      // donde `data` guarda el original sin firmar pendiente de estampar.
      const doc = {
        id: gid(), empId: u.id, empName: u.name, tipo: 'vacaciones',
        nombre: `Vacaciones firmadas ${fmtDate(selVac.fechaInicio)} - ${fmtDate(selVac.fechaFin)}`,
        firma: vacFinal.firma,
        signedStoragePath: documentoId || null,
        fileData: documentoId ? null : pdfData,
        createdAt: firmadoAt, _upd: firmadoAt,
      }
      const noti = createNotification({
        empId:'__admin__', action:'Vacaciones firmadas',
        detail:`${u.name} firmó sus vacaciones del ${fmtDate(selVac.fechaInicio)} al ${fmtDate(selVac.fechaFin)} — enviado al jefe de obra`,
        dedupeKey:`vac:${selVac.id}:firma`, ts:firmadoAt,
      })
      saveDB(fresh => ({
        vacaciones:(fresh.vacaciones || []).map(v => v.id === selVac.id ? { ...v, ...vacFinal } : v),
        documentos:[...(fresh.documentos || []), doc],
        notis:[...(fresh.notis || []), noti],
      }))
      queuePush('__admin__', noti.action, noti.detail, 'times-vac', '/?go=admin:documentos', `vac:${selVac.id}:firma`)
      toast('Vacaciones firmadas y enviadas al jefe de obra', 3500, 'ok')
      setSelIdx(0)
    } finally {
      setFirmando(false)
    }
  }

  return (
    <div style={OV}>
      <div role="dialog" aria-modal="true" aria-label="Firma obligatoria de vacaciones" style={MOD}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
          <h2 style={{ margin:0, fontSize:16, fontWeight:800, color:colors.text[900] }}>🌴 Firma tus vacaciones</h2>
          {pendingVacs.length > 1 && (
            <div style={{ display:'flex', gap:4 }}>
              {pendingVacs.map((_, i) => (
                <button key={i} onClick={() => setSelIdx(i)} style={{ width:8, height:8, borderRadius:'50%', border:'none', cursor:'pointer', background: i===selIdx ? colors.primary.base : colors.bg[400], padding:0 }} />
              ))}
            </div>
          )}
        </div>
        <div style={{ fontSize:12, color:colors.text[500], marginBottom:14 }}>
          Tus vacaciones ya fueron aprobadas. Firma este documento para enviarlo al jefe de obra — es un paso obligatorio antes de seguir usando la app.
        </div>

        <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.lg, padding:'14px 16px', marginBottom:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.4px', marginBottom:6 }}>Período</div>
          <div style={{ fontSize:15, fontWeight:800, color:colors.text[900] }}>{fmtDate(selVac.fechaInicio)} → {fmtDate(selVac.fechaFin)}</div>
          <div style={{ fontSize:12, color:colors.text[500], marginTop:4 }}>{selVac.dias || 0} día{selVac.dias === 1 ? '' : 's'} natural{selVac.dias === 1 ? '' : 'es'}{selVac.motivo ? ` · ${selVac.motivo}` : ''}</div>
        </div>

        <div style={{ fontSize:12, fontWeight:700, marginBottom:6, color:colors.text[700] }}>Firma digital</div>
        <canvas ref={canvasRef} width={640} height={180}
          style={{ width:'100%', height:120, borderRadius:radius.lg, background:'#0D1218', cursor:'crosshair', touchAction:'none', border:`1px solid ${colors.border.subtle}`, display:'block', marginBottom:8 }}
          {...handlers} />
        <button style={{ ...btnSmSec, marginBottom:16 }} onClick={clearCanvas}>Borrar</button>
        <button style={btnPrimary} onClick={firmar} disabled={firmando}>{firmando ? 'Generando PDF…' : '✅ Firmar y enviar al jefe de obra'}</button>
      </div>
    </div>
  )
}
