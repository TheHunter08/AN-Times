import { useState, useEffect } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { vacData, gid, fds } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'

export function ModalVacForm({ visible, db, u, onClose, toast, saveDB }) {
  const [fi, setFi] = useState('')
  const [ff, setFf] = useState('')
  const [motivo, setMotivo] = useState('')
  useEffect(() => { if (!visible) { setFi(''); setFf(''); setMotivo('') } }, [visible])
  useModalBack(visible, onClose)
  if (!visible) return null

  const submit = () => {
    if (!fi || !ff) { toast('Selecciona fechas'); return }
    const s = new Date(fi + 'T00:00:00'), e = new Date(ff + 'T00:00:00')
    if (s > e) { toast('Fecha fin debe ser posterior'); return }
    const days = Math.round((e - s) / 86400000) + 1  // días naturales (inclusivo)
    const availDays = vacData(u.id, db).available
    if (days > availDays) { toast(`Solo tienes ${availDays} día${availDays !== 1 ? 's' : ''} disponibles`, 4000, 'warn'); return }
    const vac = { id: gid(), empId: u.id, empName: u.name, fechaInicio: fi, fechaFin: ff, dias: days, motivo: motivo || 'Vacaciones', estado: 'pendiente', ts: new Date().toISOString() }
    const noti = { id: gid(), empId: '__admin__', action: 'Nueva solicitud de vacaciones', detail: `${u.name}: ${fds(fi)} → ${fds(ff)}`, ts: new Date().toISOString(), leido: false }
    saveDB({ vacaciones: [...(db.vacaciones||[]), vac], notis: [...(db.notis||[]), noti] })
    queuePush('__admin__', noti.action, noti.detail, 'times-vac', '/?go=admin:solicitudes')
    toast('Solicitud enviada', 3000, 'ok')
    onClose()
    setFi(''); setFf(''); setMotivo('')
  }

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-drag" />
        <h2>🌴 Solicitar vacaciones</h2>
        <div className="field-row">
          <div className="field"><label>Desde</label><input type="date" value={fi} onChange={e => setFi(e.target.value)} /></div>
          <div className="field"><label>Hasta</label><input type="date" value={ff} onChange={e => setFf(e.target.value)} /></div>
        </div>
        {fi && ff && new Date(fi+'T00:00:00') <= new Date(ff+'T00:00:00') && (
          <div style={{ background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', borderRadius:'var(--r)', padding:'10px 14px', fontSize:13, fontWeight:600, color:'var(--primary-light)', marginBottom:4 }}>
            🗓 {Math.round((new Date(ff+'T00:00:00') - new Date(fi+'T00:00:00')) / 86400000) + 1} días naturales
          </div>
        )}
        <div className="field"><label>Motivo (opcional)</label><input type="text" placeholder="Vacaciones, viaje..." value={motivo} onChange={e => setMotivo(e.target.value)} /></div>
        <div className="modal-btns">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={submit}>Solicitar</button>
        </div>
      </div>
    </div>
  )
}
