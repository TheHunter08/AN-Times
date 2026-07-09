import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { gid, ftime, toDatetimeLocal } from '../../utils/time.js'
import { auditLog, queuePush } from '../../services/dataService.js'

// ─── MODAL CORRECCIÓN ──────────────────────────────────────────────────────────
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
      id: gid(),
      empId: u.id, empName: u.name,
      recId: rec.id,
      recInicio: rec.inicio, recFin: rec.fin || null,
      propInicio: new Date(inicio).toISOString(),
      propFin: fin ? new Date(fin).toISOString() : null,
      motivo: motivo.trim(),
      estado: 'pendiente',
      ts: Date.now()
    }
    const withAudit = auditLog(db,
      'correccion_solicitada',
      `Corrección fichaje ${rec.inicio.slice(0,10)}: ${motivo.trim()}`,
      u.name
    )
    saveDB({
      correccionesFichaje: [...(db.correccionesFichaje || []), corr],
      audit: withAudit.audit
    })
    queuePush('__admin__', `✏️ Corrección de fichaje`, `${u.name} solicita corregir la jornada del ${rec.inicio.slice(0,10)}.`, 'correccion', '/?go=admin:solicitudes')
    toast('Solicitud enviada al administrador', 3000, 'ok')
    setSending(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:130, background:'rgba(0,0,0,.5)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, background:'var(--bg-700)', borderRadius:'20px 20px 0 0', padding:'24px 20px 28px', border:'1px solid var(--border2)', animation:'slideUp .22s ease' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:'var(--border3)', margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Solicitar corrección de fichaje</div>
        <div style={{ fontSize:12, color:'var(--text3)', marginBottom:20 }}>
          Original: {ftime(rec.inicio)} → {rec.fin ? ftime(rec.fin) : '—'}
        </div>

        <div className="field" style={{ marginBottom:12 }}>
          <label>Nueva hora de entrada</label>
          <input type="datetime-local" value={inicio} onChange={e => setInicio(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom:12 }}>
          <label>Nueva hora de salida</label>
          <input type="datetime-local" value={fin} onChange={e => setFin(e.target.value)} />
        </div>
        <div className="field" style={{ marginBottom:20 }}>
          <label>Motivo de la corrección *</label>
          <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Me olvidé de fichar la salida..." />
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button className="btn btn-secondary" style={{ flex:1 }} onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ flex:1 }} onClick={send} disabled={sending}>
            {sending ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  )
}
