import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { gid } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { DocPreview } from '../DocPreview.jsx'
import { makePrintableSignature, stampSignatureOnPdf, stampSignatureOnImage } from '../../utils/pdfSign.js'

export function ModalDocumentos({ visible, db, u, onClose, toast, saveDB }) {
  const [signing, setSigning] = useState(null) // doc being signed
  const [stamping, setStamping] = useState(false)
  const [viewing, setViewing] = useState(null) // doc being previewed (read-only)
  // Cuando hay sub-vista (ver/firmar), el botón atrás cierra la sub-vista,
  // no el modal completo. closeRef en useModalBack se actualiza cada render
  // por lo que siempre captura el estado actual de viewing/signing.
  useModalBack(visible, () => {
    if (viewing || signing) { setViewing(null); setSigning(null) }
    else onClose()
  })
  const { dragHandlers, modalStyle } = useSwipeDismiss(() => {
    if (viewing || signing) { setViewing(null); setSigning(null) }
    else onClose()
  })
  if (!visible) return null

  const myDocs = (db.documentos || []).filter(d => d.empId === u?.id)
  const pendientes = myDocs.filter(d => !d.firma)
  const firmados = myDocs.filter(d => d.firma)
  const myFirma = db.firmas?.[u?.id]?.main

  const TIPO_LABELS = { nomina:'Nómina', contrato:'Contrato', jornada:'Jornada mensual' }
  const TIPO_COLORS = { nomina:'var(--primary-light)', contrato:'var(--teal)', jornada:'var(--orange)' }

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
    const updated = (db.documentos || []).map(d => d.id === doc.id ? {
      ...d, fileData, firma: { firmadoAt, signatureData: myFirma.data, empName: u.name }
    } : d)
    const noti = { id: gid(), empId: '__admin__', action: 'Documento firmado', detail: `${u.name} firmó "${doc.titulo}"`, ts: firmadoAt, leido: false }
    const withAudit = auditLog(db, 'Documento firmado', `${u.name}: "${doc.titulo}"`, u.name)
    saveDB({ documentos: updated, notis: [...(db.notis || []), noti], audit: withAudit.audit })
    queuePush('__admin__', noti.action, noti.detail, 'times-doc', '/?go=admin:documentos')
    setStamping(false)
    toast('Documento firmado correctamente', 3000, 'ok')
    setSigning(null)
  }

  const DocCard = ({ d }) => (
    <div style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', marginBottom:8 }}>
      <div style={{ width:38, height:38, borderRadius:10, background:'var(--bg-500)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={TIPO_COLORS[d.tipo]||'var(--text3)'} strokeWidth="1.8" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:13, fontWeight:700 }}>{d.titulo}</div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
          <span style={{ color:TIPO_COLORS[d.tipo]||'var(--text3)', fontWeight:600 }}>{TIPO_LABELS[d.tipo]||d.tipo}</span>
          {d.mes && ` · ${d.mes}`}
          {d.firma && <span style={{ color:'var(--green)', marginLeft:6 }}>· Firmado {new Date(d.firma.firmadoAt).toLocaleDateString('es-ES')}</span>}
        </div>
      </div>
      <div style={{ display:'flex', gap:6, flexShrink:0 }}>
        <button className="btn btn-sm btn-secondary" onClick={() => setViewing(d)}>
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:3 }}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          Ver
        </button>
        {!d.firma && <button className="btn btn-sm btn-primary" onClick={() => setSigning(d)}>Firmar</button>}
        {d.firma && d.firma.signatureData && <img src={d.firma.signatureData} alt="firma" style={{ height:28, borderRadius:4, border:'1px solid var(--border)', background:'var(--bg-500)' }} />}
      </div>
    </div>
  )

  return (
    <div className="modal-ov" onClick={(signing || viewing) ? undefined : onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:560, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20 }}>
          {(viewing || signing) && (
            <button onClick={() => { setViewing(null); setSigning(null) }} style={{ background:'var(--bg-500)', border:'1px solid var(--border)', color:'var(--text2)', width:32, height:32, borderRadius:10, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
          )}
          <h2 style={{ margin:0, fontSize:18, flex:1, minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{viewing ? viewing.titulo : signing ? signing.titulo : 'Mis documentos'}</h2>
          <button onClick={() => { setViewing(null); setSigning(null); onClose() }} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer', flexShrink:0 }}>×</button>
        </div>

        {/* Read-only viewer */}
        {viewing && !signing && (
          <div style={{ marginBottom:16 }}>
            <DocPreview d={viewing} db={db} empId={u.id} />
            <div className="modal-btns" style={{ marginTop:12 }}>
              {!viewing.firma && <button className="btn btn-primary" onClick={() => { setSigning(viewing); setViewing(null) }}>Firmar</button>}
            </div>
          </div>
        )}

        {/* Confirm signing */}
        {signing && (
          <div style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16, marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:8 }}>{signing.titulo}</div>
            <div style={{ marginBottom:12 }}><DocPreview d={signing} db={db} empId={u.id} /></div>
            {myFirma ? (
              <>
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:6 }}>Tu firma guardada:</div>
                <img src={myFirma.data} alt="tu firma" style={{ width:'100%', height:80, objectFit:'contain', background:'#0D1218', borderRadius:8, border:'1px solid var(--border)', marginBottom:12 }} />
                <div style={{ fontSize:11, color:'var(--text3)', marginBottom:12 }}>Al confirmar, esta firma se insertará en el documento de forma permanente.</div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-secondary" disabled={stamping} onClick={() => setSigning(null)}>Cancelar</button>
                  <button className="btn btn-primary" disabled={stamping} onClick={() => firmarDoc(signing)}>{stamping ? 'Firmando…' : 'Confirmar y firmar'}</button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:12, color:'var(--orange)', marginBottom:12 }}>No tienes una firma guardada. Ve a Perfil → Firma digital para crearla.</div>
                <button className="btn btn-secondary" onClick={() => setSigning(null)}>Cerrar</button>
              </>
            )}
          </div>
        )}

        {!signing && !viewing && (
          <>
            {/* Pending */}
            {pendientes.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--orange)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--orange)' }} />
                  Pendientes de firma ({pendientes.length})
                </div>
                {pendientes.map(d => <DocCard key={d.id} d={d} />)}
              </div>
            )}

            {/* Signed */}
            {firmados.length > 0 && (
              <div>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--green)', textTransform:'uppercase', letterSpacing:'.7px', marginBottom:10, display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--green)' }} />
                  Firmados ({firmados.length})
                </div>
                {firmados.map(d => <DocCard key={d.id} d={d} />)}
              </div>
            )}

            {!myDocs.length && (
              <div style={{ textAlign:'center', padding:'30px 0', color:'var(--text3)' }}>
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
