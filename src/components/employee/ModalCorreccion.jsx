import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { gid, ftime, ftimeInput, localDateStr } from '../../utils/time.js'
import { currentDeviceLabel, recordTimesFromClock } from '../../utils/adminHelpers.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { TextField } from '../../ui-v2/components/FormField.js'

const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }

// ─── MODAL CORRECCIÓN ────────────────────────────────────────────────────────
export function ModalCorreccion({ visible, data, db, u, onClose, saveDB, toast }) {
  const rec = data?.rec
  const [inicio, setInicio]   = useState('')
  const [fin, setFin]         = useState('')
  const [motivo, setMotivo]   = useState('')
  const [sending, setSending] = useState(false)
  const [confirmNight, setConfirmNight] = useState(false)

  useEffect(() => {
    if (visible && rec) {
      setInicio(ftimeInput(rec.inicio))
      setFin(ftimeInput(rec.fin))
      setMotivo('')
      setConfirmNight(false)
    }
  }, [visible, rec])

  useModalBack(visible, onClose)
  const dialogRef = useDialogA11y(visible, onClose)
  if (!visible || !rec) return null

  // recordTimesFromClock interpreta una salida <= entrada como turno nocturno
  // que cruza la medianoche y suma un día a `fin` — correcto para guardias
  // reales, pero un simple typo (p.ej. teclear "07:59" en vez de "17:59")
  // generaba silenciosamente una jornada de ~24h sin ningún aviso, que podía
  // llegar así al admin para aprobar. Se pide confirmación explícita cuando
  // la duración resultante es anómala en vez de bloquear turnos nocturnos reales.
  const previewTimes = inicio && fin ? recordTimesFromClock(rec, inicio, fin) : null
  const previewHours = previewTimes ? (previewTimes.fin.getTime() - previewTimes.inicio.getTime()) / 3600000 : 0
  const looksLikeNightShift = previewTimes && previewHours > 16

  const send = () => {
    if (!motivo.trim()) { toast('Añade un motivo para la corrección'); return }
    if (!inicio) { toast('Indica la hora de entrada correcta'); return }
    if (looksLikeNightShift && !confirmNight) {
      toast(`La duración resultante es de ${Math.round(previewHours)}h — marca la casilla para confirmar que es un turno nocturno`, 5000, 'warn')
      return
    }
    setSending(true)
    const times = recordTimesFromClock(rec, inicio, fin || inicio)
    if (!times) { toast('Indica horas válidas'); setSending(false); return }
    const nowIso = new Date().toISOString()
    const corr = {
      id: gid(), empId: u.id, empName: u.name, recId: rec.id,
      recInicio: rec.inicio, recFin: rec.fin || null,
      propInicio: times.inicio.toISOString(),
      propFin: fin ? times.fin.toISOString() : null,
      motivo: motivo.trim(), estado: 'pendiente', ts: Date.now(), requestedDevice: currentDeviceLabel(), _upd: nowIso
    }
    // localDateStr(new Date(rec.inicio)) (no rec.inicio.slice(0,10)): inicio se guarda en
    // UTC — un fichaje nocturno mostraba el día siguiente al real en el mensaje.
    const recDay = localDateStr(new Date(rec.inicio))
    saveDB(freshDb => ({
      correccionesFichaje: [...(freshDb.correccionesFichaje || []), corr],
      audit: auditLog(freshDb, 'correccion_solicitada', `Corrección fichaje ${recDay}: ${motivo.trim()}`, u.name, { category:'jornada', entityType:'record', entityId:rec.id, reason:motivo.trim(), device:corr.requestedDevice, before:{ inicio:rec.inicio, fin:rec.fin }, after:{ inicio:corr.propInicio, fin:corr.propFin } }).audit
    }))
    queuePush('__admin__', `✏️ Corrección de fichaje`, `${u.name} solicita corregir la jornada del ${recDay}.`, 'correccion', '/?go=admin:solicitudes:correcciones')
    toast('Solicitud enviada al administrador', 3000, 'ok')
    setSending(false)
    onClose()
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:130, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Solicitar corrección de fichaje" tabIndex={-1} onClick={e => e.stopPropagation()}
        style={{ width:'100%', maxWidth:480, background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px' }}>
        <div style={{ width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }} />
        <div style={{ fontSize:16, fontWeight:800, color:colors.text[900], marginBottom:4 }}>Solicitar corrección de fichaje</div>
        <div style={{ fontSize:12, color:colors.text[500], marginBottom:20 }}>
          Original: {ftime(rec.inicio)} → {rec.fin ? ftime(rec.fin) : '—'}
        </div>

        <TextField label="Nueva hora de entrada" type="time" value={inicio} onChange={e => setInicio(e.target.value)} />
        <TextField label="Nueva hora de salida" type="time" value={fin} onChange={e => setFin(e.target.value)} />
        {looksLikeNightShift && (
          <label style={{ display:'flex', alignItems:'flex-start', gap:8, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', borderRadius:radius.lg, padding:'10px 12px', marginBottom:14, fontSize:12, color:colors.semantic.orange, cursor:'pointer' }}>
            <input type="checkbox" checked={confirmNight} onChange={e => setConfirmNight(e.target.checked)} style={{ marginTop:2 }} />
            <span>La salida es anterior a la entrada, así que la duración resultante es de <strong>{Math.round(previewHours)}h</strong> (turno que cruza la medianoche). Marca esta casilla para confirmar que es correcto.</span>
          </label>
        )}
        <div style={{ marginBottom: 20 }}>
          <TextField label="Motivo de la corrección *" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Me olvidé de fichar la salida…" />
        </div>

        <div style={{ display:'flex', gap:10 }}>
          <button style={btnSecondary} onClick={onClose}>Cancelar</button>
          <button style={btnPrimary} onClick={send} disabled={sending}>{sending ? 'Enviando…' : 'Enviar solicitud'}</button>
        </div>
      </div>
    </div>
  )
}
