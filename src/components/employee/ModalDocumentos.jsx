import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { DocPreview } from '../DocPreview.jsx'
import { makePrintableSignature, stampSignatureOnPdf, stampSignatureOnImage } from '../../utils/pdfSign.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { createNotification } from '../../utils/notifications.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:560, maxHeight:'92vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 18px' }
const btnPrimary = { padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }
const btnSm = { display:'flex', alignItems:'center', gap:4, padding:'6px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:11, fontFamily:'inherit', cursor:'pointer' }
const btnSmPrimary = { padding:'6px 12px', borderRadius:radius.md, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:11, fontFamily:'inherit', cursor:'pointer' }

const TIPO_COLORS = { nomina:colors.primary.light, contrato:colors.secondary.base, jornada:colors.semantic.orange }
const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }

export function ModalDocumentos({ visible, db, u, onClose, toast, saveDB }) {
  const [signing, setSigning] = useState(null)
  const [stamping, setStamping] = useState(false)
  const [viewing, setViewing] = useState(null)
  const closeDocumentModal = () => {
    if (viewing || signing) { setViewing(null); setSigning(null) }
    else onClose()
  }
  useModalBack(visible, closeDocumentModal)
  const { dragHandlers, modalStyle } = useSwipeDismiss(closeDocumentModal)
  const dialogRef = useDialogA11y(visible, closeDocumentModal)
  if (!visible) return null

  const myDocs = (db.documentos || []).filter(d => d.empId === u?.id)
  const pendientes = myDocs.filter(d => !d.firma)
  const firmados = myDocs.filter(d => d.firma)
  const myFirma = db.firmas?.[u?.id]?.main

  const firmarDoc = async (doc) => {
    if (!myFirma) { toast('Necesitas guardar tu firma primero en Perfil → Firma digital'); return }
    setStamping(true)
    const firmadoAt = new Date().toISOString()
    let fileData = doc.fileData
    try {
      const printable = await makePrintableSignature(myFirma.data)
      const label = `Firmado digitalmente por ${u.name} · ${new Date(firmadoAt).toLocaleString('es-ES')}`
      if (doc.fileData?.startsWith('data:application/pdf')) {
        fileData = await stampSignatureOnPdf(doc.fileData, printable, label)
      } else if (doc.fileData?.startsWith('data:image')) {
        fileData = await stampSignatureOnImage(doc.fileData, printable, label)
      }
    } catch (e) {
      console.warn('[FIRMA] No se pudo estampar la firma en el archivo:', e)
      toast('⚠️ No se pudo insertar la firma en el archivo, se guardó solo el registro')
    }
    const notiAction = 'Documento firmado'
    const notiDetail = `${u.name} firmó "${doc.titulo}"`
    // try/finally: antes, si saveDB/createNotification/auditLog lanzaban un
    // error inesperado, setStamping(false) nunca se ejecutaba y los botones
    // "Cancelar"/"Confirmar y firmar" quedaban bloqueados para siempre, sin
    // ningún aviso — solo se podía escapar cerrando el modal entero.
    try {
      saveDB(fresh => {
        const updated = (fresh.documentos || []).map(d => d.id === doc.id ? {
          ...d, fileData, firma: { firmadoAt, signatureData: myFirma.data, empName: u.name }
        } : d)
        const noti = createNotification({ empId:'__admin__', action:notiAction, detail:notiDetail, dedupeKey:`documento:${doc.id}:firma:${u.id}`, ts:firmadoAt })
        const withAudit = auditLog(fresh, notiAction, `${u.name}: "${doc.titulo}"`, u.name)
        return { documentos: updated, notis: [...(fresh.notis || []), noti], audit: withAudit.audit }
      })
      queuePush('__admin__', notiAction, notiDetail, 'times-doc', '/?go=admin:documentos', `documento:${doc.id}:firma:${u.id}`)
      toast('Documento firmado correctamente', 3000, 'ok')
      setSigning(null)
    } catch (e) {
      console.error('[FIRMA] No se pudo guardar la firma:', e)
      toast('⚠️ No se pudo guardar la firma. Inténtalo de nuevo.', 5000, 'warn')
    } finally {
      setStamping(false)
    }
  }

  const DocCard = ({ d }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl, marginBottom:8 }}>
      <div style={{ width:38, height:38, borderRadius:radius.md, background:colors.bg[500], display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={TIPO_COLORS[d.tipo]||colors.text[500]} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700, color:colors.text[900] }}>{d.titulo}</div>
        <div style={{ fontSize:11, color:colors.text[500], marginTop:2 }}>
          <span style={{ color:TIPO_COLORS[d.tipo]||colors.text[500], fontWeight:600 }}>{TIPO_LABELS[d.tipo]||d.tipo}</span>
          {d.mes && ` · ${d.mes}`}
          {d.firma && <span style={{ color:colors.semantic.green, marginLeft:6 }}>· Firmado {new Date(d.firma.firmadoAt).toLocaleDateString('es-ES')}</span>}
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <button style={btnSm} onClick={() => setViewing(d)}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver
        </button>
        {!d.firma && <button style={btnSmPrimary} onClick={() => setSigning(d)}>Firmar</button>}
        {d.firma && d.firma.signatureData && <img src={d.firma.signatureData} alt="firma" style={{ height:28, borderRadius:4, border:`1px solid ${colors.border.default}`, background:colors.bg[500] }} />}
      </div>
    </div>
  )

  return (
    <div style={OV} onClick={(signing || viewing) ? undefined : onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Documentos" tabIndex={-1} style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
          {(viewing || signing) && (
            <button onClick={() => { setViewing(null); setSigning(null) }} style={{ background:colors.bg[500], border:`1px solid ${colors.border.default}`, color:colors.text[700], width:32, height:32, borderRadius:radius.md, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900], flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewing ? viewing.titulo : signing ? signing.titulo : 'Mis documentos'}</h2>
          <button onClick={() => { setViewing(null); setSigning(null); onClose() }} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', flexShrink:0, fontFamily:'inherit' }}>×</button>
        </div>

        {/* Read-only viewer */}
        {viewing && !signing && (
          <div style={{ marginBottom:16 }}>
            <DocPreview d={viewing} db={db} empId={u.id} />
            <div style={{ display:'flex', gap:8, marginTop:12 }}>
              {!viewing.firma && <button style={btnPrimary} onClick={() => { setSigning(viewing); setViewing(null) }}>Firmar</button>}
            </div>
          </div>
        )}

        {/* Confirm signing */}
        {signing && (
          <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl, padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color:colors.text[900], marginBottom:8 }}>{signing.titulo}</div>
            <div style={{ marginBottom:12 }}><DocPreview d={signing} db={db} empId={u.id} /></div>
            {myFirma ? (
              <>
                <div style={{ fontSize:11, color:colors.text[500], marginBottom:6 }}>Tu firma guardada:</div>
                <img src={myFirma.data} alt="tu firma" style={{ width:'100%', height:80, objectFit:'contain', background:'#0D1218', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, marginBottom:12 }} />
                <div style={{ fontSize:11, color:colors.text[500], marginBottom:12 }}>Al confirmar, esta firma se insertará en el documento de forma permanente.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button style={btnSecondary} disabled={stamping} onClick={() => setSigning(null)}>Cancelar</button>
                  <button style={btnPrimary} disabled={stamping} onClick={() => firmarDoc(signing)}>{stamping ? 'Firmando…' : 'Confirmar y firmar'}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:12, color:colors.semantic.orange, marginBottom:12 }}>No tienes una firma guardada. Ve a Perfil → Firma digital para crearla.</div>
                <button style={btnSecondary} onClick={() => setSigning(null)}>Cerrar</button>
              </>
            )}
          </div>
        )}

        {!signing && !viewing && (
          <>
            {pendientes.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:colors.semantic.orange, textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:colors.semantic.orange, display:'inline-block' }} />
                  Pendientes de firma ({pendientes.length})
                </div>
                {pendientes.map(d => <DocCard key={d.id} d={d} />)}
              </div>
            )}

            {firmados.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:colors.semantic.green, textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:colors.semantic.green, display:'inline-block' }} />
                  Firmados ({firmados.length})
                </div>
                {firmados.map(d => <DocCard key={d.id} d={d} />)}
              </div>
            )}

            {!myDocs.length && (
              <div style={{ textAlign:'center', padding:'32px 0', color:colors.text[300] }}>
                <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.2" style={{ margin:'0 auto 12px', display:'block', opacity:.3 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                Sin documentos pendientes
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
