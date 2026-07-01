import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { getCfg, setCfg, toggleTheme } from '../../utils/userConfig.js'
import { queuePush, pushSubscribe } from '../../services/dataService.js'
import { VAPID_PUB } from '../../config/constants.js'

export function ModalConfiguracion({ visible, u, db, onClose, toast, saveDB }) {
  const [notiFichaje, setNotiFichaje] = useState(() => getCfg('notiFichaje', true))
  const [notiSalida, setNotiSalida] = useState(() => getCfg('notiSalida', true))
  const [gpsAuto, setGpsAuto] = useState(() => getCfg('gpsAuto', true))
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))
  const [salidaTime, setSalidaTime] = useState(() => getCfg('salidaTime', '21:00'))
  const [idioma, setIdioma] = useState(() => getCfg('idioma', 'es'))
  const [formato, setFormato] = useState(() => getCfg('formato', '24h'))
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')

  useModalBack(visible, onClose)
  if (!visible) return null

  const save = () => {
    setCfg('notiFichaje', notiFichaje)
    setCfg('notiSalida', notiSalida)
    setCfg('gpsAuto', gpsAuto)
    setCfg('reminderTime', reminderTime)
    setCfg('salidaTime', salidaTime)
    setCfg('idioma', idioma)
    setCfg('formato', formato)
    if (u?.id && saveDB && db) {
      const updEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime } : e)
      saveDB({ employees: updEmps })
    }
    toast('Configuración guardada')
    onClose()
  }

  const toggle = (label, value, onChange) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
      <span style={{ fontSize:14, color:'var(--text)' }}>{label}</span>
      <div
        onClick={() => onChange(!value)}
        style={{ width:44, height:24, borderRadius:12, background: value ? 'var(--primary)' : 'var(--bg-600)', cursor:'pointer', position:'relative', transition:'background .2s' }}
      >
        <div style={{ position:'absolute', top:3, left: value ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
      </div>
    </div>
  )

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth:400 }}>
        <div className="modal-drag" />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18 }}>Configuración</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--text3)', fontSize:22, cursor:'pointer' }}>×</button>
        </div>
        {/* Notificaciones del sistema (permiso del navegador) */}
        {(() => {
          const perm = typeof Notification !== 'undefined' ? Notification.permission : 'granted'
          if (perm === 'denied') return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
              <span style={{ fontSize:11, color:'var(--danger)', fontWeight:600 }}>Bloqueadas — activa en ajustes del navegador</span>
            </div>
          )
          if (perm === 'granted') return (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
                <span style={{ fontSize:11, color:'var(--green)', fontWeight:600 }}>✓ Activadas</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ minWidth:0, flex:1 }}>
                  <div style={{ fontSize:14, color:'var(--text)' }}>Probar notificación</div>
                  <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Envía un push a este dispositivo</div>
                </div>
                <button onClick={async () => {
                  try {
                    const r = await pushSubscribe(u.id, VAPID_PUB)
                    if (!r?.ok) { toast(r?.error || r?.reason || 'No se pudo suscribir', 7000, 'err'); return }
                    const res = await queuePush(u.id, '🔔 Prueba de notificación', 'Si ves esto, el sistema funciona correctamente.', 'test-' + Date.now(), '/')
                    if (res?.ok) toast('Push enviado — revisa la barra de estado', 4000, 'ok')
                    else toast('Push falló: ' + (res?.error || res?.status || 'desconocido'), 7000, 'err')
                  } catch (e) { toast('Error: ' + e.message, 6000, 'err') }
                }} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', flexShrink:0 }}>Probar</button>
              </div>
            </>
          )
          return (
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
              <span style={{ fontSize:14, color:'var(--text)' }}>Notificaciones del sistema</span>
              <button onClick={async () => {
                try {
                  const p = await Notification.requestPermission()
                  if (p === 'granted') { toast('Notificaciones activadas', 3000, 'ok'); onClose() }
                  else toast('Permiso denegado', 3000, 'err')
                } catch { toast('No soportado en este dispositivo', 3000) }
              }} style={{ background:'var(--primary)', color:'#fff', border:'none', borderRadius:8, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer' }}>Activar</button>
            </div>
          )
        })()}
        {toggle('Notificaciones de fichaje', notiFichaje, setNotiFichaje)}
        {toggle('Recordatorio de salida', notiSalida, setNotiSalida)}
        {toggle('GPS automático', gpsAuto, setGpsAuto)}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <span style={{ fontSize:14, color:'var(--text)' }}>Modo claro</span>
          <div
            onClick={() => { toggleTheme(); setIsLight(l => !l); toast(isLight ? 'Modo oscuro activado' : 'Modo claro activado') }}
            style={{ width:44, height:24, borderRadius:12, background: isLight ? 'var(--primary)' : 'var(--bg-600)', cursor:'pointer', position:'relative', transition:'background .2s' }}
          >
            <div style={{ position:'absolute', top:3, left: isLight ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
          </div>
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:4 }}>Recordatorio de fichaje</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>Te avisa si no has fichado entrada a esta hora</div>
          <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14 }} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:4 }}>Recordatorio de salida</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginBottom:8 }}>Avisa si tienes jornada abierta a esta hora</div>
          <input type="time" value={salidaTime} onChange={e => setSalidaTime(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14 }} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:8 }}>Idioma</div>
          <select value={idioma} onChange={e => setIdioma(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14, width:'100%' }}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div style={{ padding:'14px 0' }}>
          <div style={{ fontSize:14, color:'var(--text)', marginBottom:8 }}>Formato de hora</div>
          <select value={formato} onChange={e => setFormato(e.target.value)}
            style={{ padding:'8px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-700)', color:'var(--text)', fontSize:14, width:'100%' }}>
            <option value="24h">24 horas</option>
            <option value="12h">12 horas (AM/PM)</option>
          </select>
        </div>
        <button className="btn btn-primary" onClick={save} style={{ width:'100%', marginTop:8 }}>Guardar</button>
      </div>
    </div>
  )
}
