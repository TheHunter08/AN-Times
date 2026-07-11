import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { gid, ftime, toDatetimeLocal } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const LBL = { fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6, display:'block' }
const INP = { background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.md, padding:'10px 12px', fontSize:13, color:colors.text[900], fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }

// ─── MODAL CORRECCIÓN ────────────────────────────────────────────────────────
export function ModalCorreccion({ visible, data, db, u, onClose, saveDB, toast }) {
  const rec = data?.rec
  const [inicio, setInicio]   = useState('')
  const [fin, setFin]         = useState('')
  const [motivo, setMotivo]   = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    if (visible && rec) {
      setInicio(toDatetimeLocal(rec.inicio))
      setFin(toDatetimeLocal(rec.fin))
      setMotivo('')
    }
  }, [visible, rec])

  useModalBack(visible, onClose)
  if (!visible || !rec) return null

  const send = () => {
    if (!motivo.trim()) { toast('Añade un motivo para la corrección'); return }
    if (!inicio) { toast('Indica la hora de entrada correcta'); return }
    setSending(true)
    const corr = {
      id: gid(), empId: u.id, empName: u.name, recId: rec.id,
      recInicio: rec.inicio, recFin: rec.fin || null,
      propInicio: new Date(inicio).toISOString(),
      propFin: fin ? new Date(fin).toISOString() : null,
      motivo: motivo.trim(), estado: 'pendiente', ts: Date.now()
    }
    saveDB(freshDb => ({
      correccionesFichaje: [...(freshDb.correccionesFichaje || []), corr],
      audit: auditLog(freshDb, 'correccion_solicitada', `Corrección fichaje ${rec.inicio.slice(0,10)}: ${motivo.trim()}`, u.name).audit
    }))
    queuePush('__admin__', `✏️ Corrección de fichaje`, `${u.name} solicita corregir la jornada del ${rec.inicio.slice(0,10)}.`, 'correccion', '/?go=admin:solicitudes:correcciones')
    toast('Solicitud enviada al administrador', 3000, 'ok')
    setSending(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:130, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:800, color:colors.text[900], marginBottom:4 }}>Solicitar corrección de fichaje</div>
        <div style={{ fontSize:12, color:colors.text[500], marginBottom:20 }}>
          Original: {ftime(rec.inicio)} → {rec.fin ? ftime(rec.fin) : '—'}
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={LBL}>Nueva hora de entrada</label>
          <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} style={INP} />
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={LBL}>Nueva hora de salida</label>
          <input type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} style={INP} />
        </div>
        <div style={{ marginBottom:20 }}>
          <label style={LBL}>Motivo de la corrección *</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Me olvidé de fichar la salida…" style={INP} />
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={send} disabled={sending}>{sending ? 'Enviando…' : 'Enviar solicitud'}</button>
        </div>
      </div>
    </div>
  )
}
