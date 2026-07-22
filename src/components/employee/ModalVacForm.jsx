import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useDialogA11y } from '../../hooks/useDialogA11y.js'
import { vacData, gid, fds } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { createNotification } from '../../utils/notifications.js'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxHeight:'90vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }
const LBL  = { fontSize:11, fontWeight:700, color:colors.text[500], textTransform:'uppercase', letterSpacing:'.5px', marginBottom:6, display:'block' }
const INP  = { background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.md, padding:'10px 12px', fontSize:13, color:colors.text[900], fontFamily:'inherit', outline:'none', width:'100%', boxSizing:'border-box' }
const BTN_ROW = { display:'flex', gap:8, marginTop:20 }
const btnPrimary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { flex:1, padding:'12px 20px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }

export function ModalVacForm({ visible, db, u, onClose, toast, saveDB }) {
  const [fi, setFi] = useState('')
  const [ff, setFf] = useState('')
  const [motivo, setMotivo] = useState('')
  const [sending, setSending] = useState(false)
  useEffect(() => { if (!visible) { setFi(''); setFf(''); setMotivo(''); setSending(false) } }, [visible])
  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  const dialogRef = useDialogA11y(visible, onClose)
  if (!visible) return null

  const submit = () => {
    // Sin este guard, un doble toque antes de que se cierre el modal envía
    // dos solicitudes idénticas — si ambas quedaran aprobadas, vacData()
    // descontaría los días dos veces del saldo real del empleado.
    if (sending) return
    if (!fi || !ff) { toast('Selecciona fechas'); return }
    const s = new Date(fi + 'T00:00:00'), e = new Date(ff + 'T00:00:00')
    if (s > e) { toast('Fecha fin debe ser posterior'); return }
    const days = Math.round((e - s) / 86400000) + 1
    const availDays = vacData(u.id, db).available
    if (days > availDays) { toast(`Solo tienes ${availDays} día${availDays !== 1 ? 's' : ''} disponibles`, 4000, 'warn'); return }
    setSending(true)
    const nowIso = new Date().toISOString()
    const vac = { id: gid(), empId: u.id, empName: u.name, fechaInicio: fi, fechaFin: ff, dias: days, motivo: motivo || 'Vacaciones', estado: 'pendiente', ts: nowIso, _upd: nowIso }
    const noti = createNotification({ empId:'__admin__', action:'Nueva solicitud de vacaciones', detail:`${u.name}: ${fds(fi)} → ${fds(ff)}`, dedupeKey:`vac:${vac.id}:solicitud`, ts:nowIso })
    saveDB(fresh => ({ vacaciones:[...(fresh.vacaciones || []), vac], notis:[...(fresh.notis || []), noti] }))
    queuePush('__admin__', noti.action, noti.detail, 'times-vac', '/?go=admin:solicitudes', `vac:${vac.id}:solicitud`)
    toast('Solicitud enviada', 3000, 'ok')
    onClose()
    setFi(''); setFf(''); setMotivo('')
  }

  return (
    <div style={OV} onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Solicitar vacaciones" tabIndex={-1} style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <h2 style={{ margin:'0 0 20px', fontSize:18, fontWeight:800, color:colors.text[900] }}>🌴 Solicitar vacaciones</h2>
        <div style={{ display:'flex', gap:12, marginBottom:14 }}>
          <div style={{ flex:1 }}>
            <label style={LBL}>Desde</label>
            <input type="date" value={fi} onChange={e => setFi(e.target.value)} style={INP} />
          </div>
          <div style={{ flex:1 }}>
            <label style={LBL}>Hasta</label>
            <input type="date" value={ff} onChange={e => setFf(e.target.value)} style={INP} />
          </div>
        </div>
        {fi && ff && new Date(fi+'T00:00:00') <= new Date(ff+'T00:00:00') && (
          <div style={{ background:colors.primary.dim, border:`1px solid ${colors.primary.glow}`, borderRadius:radius.lg, padding:'10px 14px', fontSize:13, fontWeight:600, color:colors.primary.light, marginBottom:14 }}>
            🗓 {Math.round((new Date(ff+'T00:00:00') - new Date(fi+'T00:00:00')) / 86400000) + 1} días naturales
          </div>
        )}
        <div style={{ marginBottom:6 }}>
          <label style={LBL}>Motivo (opcional)</label>
          <input type="text" placeholder="Vacaciones, viaje…" value={motivo} onChange={e => setMotivo(e.target.value)} style={INP} />
        </div>
        <div style={BTN_ROW}>
          <button style={btnSecondary} onClick={onClose}>Cancelar</button>
          <button style={{ ...btnPrimary, opacity: sending ? 0.7 : 1, cursor: sending ? 'not-allowed' : 'pointer' }} onClick={submit} disabled={sending}>{sending ? 'Enviando…' : 'Solicitar'}</button>
        </div>
      </div>
    </div>
  )
}
