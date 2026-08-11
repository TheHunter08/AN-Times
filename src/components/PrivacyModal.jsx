import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore.js'
import { auditLog } from '../services/dataService.js'
import { persistLegalAcknowledgement, syncPendingLegalAcknowledgements } from '../services/legalEvidenceService.js'
import { buildLegalAcknowledgement, getLegalConfig, hasCurrentLegalAcknowledgement, LEGAL_NOTICE_VERSION } from '../utils/legalCompliance.js'
import { useConnectivity } from '../hooks/useConnectivity.js'

const colors = {
  bg: { 600:'var(--bg-card)', 400:'var(--bg-card-hover)' },
  primary: { base:'var(--brand-500)', light:'var(--brand-400)', dim:'color-mix(in srgb, var(--brand-500) 13%, transparent)', glow:'rgba(53,104,255,.25)' },
  text: { 900:'var(--text-primary)', 700:'var(--text-secondary)', 500:'var(--text-tertiary)', 300:'var(--text-disabled)' },
  border: { subtle:'var(--border-subtle)', default:'var(--border-default)' },
}
const radius = { md:'var(--radius-md)', '2xl':'var(--radius-2xl)' }

export function usePrivacyAccepted(db, employeeId) {
  return hasCurrentLegalAcknowledgement(db, employeeId)
}

export default function PrivacyModal() {
  const db = useAppStore(state => state.db)
  const session = useAppStore(state => state.session)
  const saveDB = useAppStore(state => state.saveDB)
  const [read, setRead] = useState(false)
  const [saving, setSaving] = useState(false)
  const { online } = useConnectivity()
  const employee = session?.user
  const visible = Boolean(employee?.id && !hasCurrentLegalAcknowledgement(db, employee.id))
  const legal = getLegalConfig(db)

  useEffect(() => { if (visible) setRead(false) }, [visible, employee?.id])

  useEffect(() => {
    const authId = employee?.authId || employee?.auth_id
    if (!online || !employee?.id || !authId) return
    let cancelled = false
    syncPendingLegalAcknowledgements(db.legalAcknowledgements, { empId:employee.id, authId }).then(result => {
      if (cancelled || !result.confirmedIds.length) return
      const confirmed = new Set(result.confirmedIds)
      saveDB(fresh => ({
        legalAcknowledgements:(fresh.legalAcknowledgements || []).map(item => confirmed.has(item.id)
          ? { ...item, serverConfirmed:true, evidenceState:'confirmed', _upd:new Date().toISOString() }
          : item),
      }))
    }).catch(() => {})
    return () => { cancelled = true }
  }, [online, employee?.id, employee?.authId, employee?.auth_id, db.legalAcknowledgements, saveDB])

  const acknowledge = async () => {
    if (!employee?.id || !read || saving) return
    setSaving(true)
    const draft = buildLegalAcknowledgement(employee, employee.authId || employee.auth_id)
    const confirmation = await persistLegalAcknowledgement(draft)
    const item = { ...draft, serverConfirmed:confirmation.ok, evidenceState:confirmation.ok ? 'confirmed' : 'pending_sync' }
    saveDB(fresh => {
      const previous = (fresh.legalAcknowledgements || []).filter(entry => entry.id !== item.id)
      const withAudit = auditLog(fresh, 'Información de privacidad recibida', `Versión ${LEGAL_NOTICE_VERSION}`, employee.name || employee.id, {
        category:'seguridad', entityType:'legal_notice', entityId:item.id,
        after:{ empId:employee.id, noticeVersion:LEGAL_NOTICE_VERSION, acknowledgedAt:item.acknowledgedAt },
      })
      return { legalAcknowledgements:[...previous, item], audit:withAudit.audit }
    })
    setSaving(false)
  }

  if (!visible) return null
  const controller = [legal.controllerName || 'La empresa empleadora', legal.taxId, legal.address].filter(Boolean).join(' · ')
  const rightsContact = legal.privacyEmail || 'el contacto de administración designado por la empresa'

  return (
    <div style={{ position:'fixed', inset:0, zIndex:99999, background:'rgba(0,0,0,.72)', backdropFilter:'blur(6px)', WebkitBackdropFilter:'blur(6px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="privacy-title" style={{ width:'100%', maxWidth:560, background:colors.bg[600], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, border:`1px solid ${colors.border.default}`, boxShadow:'0 -12px 48px rgba(0,0,0,.6)', padding:'0 0 30px' }}>
        <div style={{ padding:'14px 20px 0', textAlign:'center' }}><div style={{ width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 16px' }}/></div>
        <div style={{ padding:'0 20px 12px', display:'flex', alignItems:'center', gap:12, borderBottom:`1px solid ${colors.border.subtle}` }}>
          <div style={{ width:40, height:40, borderRadius:radius.md, background:colors.primary.dim, border:`1px solid ${colors.primary.glow}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke={colors.primary.light} strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
          </div>
          <div><div id="privacy-title" style={{ fontSize:15, fontWeight:800, color:colors.text[900] }}>Información sobre privacidad y registro horario</div><div style={{ fontSize:11.5, color:colors.text[500] }}>RGPD · LOPDGDD · Art. 34.9 ET</div></div>
        </div>

        <div style={{ maxHeight:'44vh', overflowY:'auto', padding:'14px 20px', fontSize:12.5, color:colors.text[500], lineHeight:1.65, WebkitOverflowScrolling:'touch' }}>
          <p><strong style={{ color:colors.text[700] }}>Responsable:</strong> {controller}.</p>
          <p><strong style={{ color:colors.text[700] }}>Finalidades:</strong> registrar la jornada, organizar el trabajo, gestionar ausencias, gastos, documentos laborales y acreditar las actuaciones realizadas en la aplicación.</p>
          <p><strong style={{ color:colors.text[700] }}>Base jurídica:</strong> cumplimiento de obligaciones legales y laborales de la empresa y, para la organización y control proporcionado del trabajo, la relación laboral. Esta pantalla informa; no solicita un consentimiento revocable para registrar la jornada.</p>
          <p><strong style={{ color:colors.text[700] }}>Datos tratados:</strong> identidad profesional, entradas y salidas, pausas, obra o centro, solicitudes, documentos, firma electrónica simple, datos técnicos de seguridad y, cuando el fichaje lo requiera, ubicación del dispositivo.</p>
          <p><strong style={{ color:colors.text[700] }}>Geolocalización:</strong> se obtiene únicamente al realizar una acción de fichaje para comprobar el centro u obra. TIMES INC no debe utilizarse para seguimiento continuo. La empresa debe informar previamente de esta medida y aplicarla de forma necesaria y proporcionada.</p>
          <p><strong style={{ color:colors.text[700] }}>Destinatarios:</strong> personal autorizado de la empresa, proveedores tecnológicos que actúen por cuenta de esta y autoridades, Inspección de Trabajo, órganos judiciales o representantes de los trabajadores cuando exista obligación legal.</p>
          <p><strong style={{ color:colors.text[700] }}>Conservación:</strong> los registros de jornada se conservarán al menos cuatro años. El resto de datos se conservará durante los plazos necesarios para su finalidad y para atender responsabilidades legales.</p>
          <p><strong style={{ color:colors.text[700] }}>Derechos:</strong> puedes solicitar acceso, rectificación, limitación u oposición cuando proceda. La supresión puede quedar limitada mientras exista obligación legal de conservación. Contacto: <strong style={{ color:colors.text[700] }}>{rightsContact}</strong>. También puedes reclamar ante la Agencia Española de Protección de Datos.</p>
          <p><strong style={{ color:colors.text[700] }}>Firma:</strong> la firma dibujada en TIMES INC es una firma electrónica simple acompañada de trazabilidad técnica; no se presenta como firma electrónica cualificada.</p>
          <p style={{ color:colors.text[300], fontSize:10.5 }}>Versión de la información: {LEGAL_NOTICE_VERSION}. La aplicación guardará fecha, usuario y versión recibida como evidencia de entrega.</p>
        </div>

        <div style={{ padding:'12px 20px 0' }}>
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, cursor:'pointer', marginBottom:14 }}>
            <input type="checkbox" checked={read} onChange={event => setRead(event.target.checked)} style={{ width:18, height:18, marginTop:1, flexShrink:0, accentColor:colors.primary.base }}/>
            <span style={{ fontSize:13, color:colors.text[700], lineHeight:1.5 }}>He recibido y leído esta información. Entiendo que no equivale a prestar consentimiento para una obligación legal.</span>
          </label>
          <button disabled={!read || saving} onClick={acknowledge} style={{ width:'100%', padding:'14px', borderRadius:radius.md, background:read ? 'var(--gradient-brand)' : colors.bg[400], color:read ? '#fff' : colors.text[300], border:read ? 'none' : `1px solid ${colors.border.default}`, fontWeight:700, fontSize:14, cursor:read && !saving ? 'pointer' : 'not-allowed', fontFamily:'inherit' }}>
            {saving ? 'Guardando evidencia…' : read ? 'Confirmar recepción' : 'Lee y marca la casilla para continuar'}
          </button>
        </div>
      </div>
    </div>
  )
}
