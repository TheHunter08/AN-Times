import { useState } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { useAppStore } from '../../store/appStore.js'
import { getCfg, setCfg, toggleTheme } from '../../utils/userConfig.js'
import { queuePush, pushSubscribe } from '../../services/dataService.js'
import { VAPID_PUB } from '../../config/constants.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 40px', width:'100%', maxWidth:400, maxHeight:'92vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 20px' }
const SEP  = `1px solid ${colors.border.subtle}`
const btnPrimary = { width:'100%', padding:'12px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', marginTop:8, boxShadow:`0 4px 14px ${colors.primary.glow}` }
const inpStyle = { padding:'8px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[600], color:colors.text[900], fontSize:14, fontFamily:'inherit', outline:'none' }

export function ModalConfiguracion({ visible, u, db, onClose, toast, saveDB }) {
  const syncStatus = useAppStore(s => s.syncStatus)
  const realtimeStatus = useAppStore(s => s.realtimeStatus)
  const offlinePending = useAppStore(s => s.offlinePending)
  const lastSyncTime = useAppStore(s => s.lastSyncTime)
  const [notiFichaje, setNotiFichaje] = useState(() => getCfg('notiFichaje', true))
  const [notiSalida, setNotiSalida] = useState(() => getCfg('notiSalida', true))
  const [gpsAuto, setGpsAuto] = useState(() => getCfg('gpsAuto', true))
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))
  const [salidaTime, setSalidaTime] = useState(() => getCfg('salidaTime', '21:00'))
  const [idioma, setIdioma] = useState(() => getCfg('idioma', 'es'))
  const [formato, setFormato] = useState(() => getCfg('formato', '24h'))
  const [isLight, setIsLight] = useState(() => document.documentElement.getAttribute('data-theme') === 'light')

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null

  const save = () => {
    setCfg('notiFichaje', notiFichaje); setCfg('notiSalida', notiSalida)
    setCfg('gpsAuto', gpsAuto); setCfg('reminderTime', reminderTime)
    setCfg('salidaTime', salidaTime); setCfg('idioma', idioma); setCfg('formato', formato)
    if (u?.id && saveDB && db) {
      const updEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, reminderTime } : e)
      saveDB({ employees: updEmps })
    }
    toast('Configuración guardada')
    onClose()
  }

  const Toggle = ({ label, value, onChange }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:SEP }}>
      <span style={{ fontSize:14, color:colors.text[900] }}>{label}</span>
      <div onClick={() => onChange(!value)} style={{ width:44, height:24, borderRadius:12, background: value ? colors.primary.base : colors.bg[600], cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
        <div style={{ position:'absolute', top:3, left: value ? 23 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
      </div>
    </div>
  )

  const perm = typeof Notification !== 'undefined' ? Notification.permission : 'granted'
  const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection
  const netLabel = !navigator.onLine ? 'Sin conexión'
    : connection?.effectiveType ? `${connection.effectiveType.toUpperCase()}${connection.downlink ? ` · ${connection.downlink} Mb/s` : ''}`
    : 'Con conexión'
  const swReady = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller

  return (
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
          <h2 style={{ margin:0, fontSize:18, fontWeight:800, color:colors.text[900] }}>Configuración</h2>
          <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', fontFamily:'inherit' }}>×</button>
        </div>

        {/* System notifications */}
        {perm === 'denied' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:SEP }}>
            <span style={{ fontSize:14, color:colors.text[900] }}>Notificaciones del sistema</span>
            <span style={{ fontSize:11, color:colors.semantic.red, fontWeight:600 }}>Bloqueadas — activa en ajustes del navegador</span>
          </div>
        )}
        {perm === 'granted' && (
          <>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:SEP }}>
              <span style={{ fontSize:14, color:colors.text[900] }}>Notificaciones del sistema</span>
              <span style={{ fontSize:11, color:colors.semantic.green, fontWeight:600 }}>✓ Activadas</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:SEP }}>
              <div style={{ minWidth:0, flex:1 }}>
                <div style={{ fontSize:14, color:colors.text[900] }}>Probar notificación</div>
                <div style={{ fontSize:11, color:colors.text[500], marginTop:2 }}>Envía un push a este dispositivo</div>
              </div>
              <button onClick={async () => {
                try {
                  const r = await pushSubscribe(u.id, VAPID_PUB)
                  if (!r?.ok) { toast(r?.error || r?.reason || 'No se pudo suscribir', 7000, 'err'); return }
                  const res = await queuePush(u.id, '🔔 Prueba de notificación', 'Si ves esto, el sistema funciona correctamente.', 'test-' + Date.now(), '/')
                  if (res?.ok) toast('Push enviado — revisa la barra de estado', 4000, 'ok')
                  else toast('Push falló: ' + (res?.error || res?.status || 'desconocido'), 7000, 'err')
                } catch (e) { toast('Error: ' + e.message, 6000, 'err') }
              }} style={{ background:colors.primary.base, color:'#fff', border:'none', borderRadius:radius.md, padding:'6px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', flexShrink:0 }}>Probar</button>
            </div>
          </>
        )}
        {perm === 'default' && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 0', borderBottom:SEP }}>
            <span style={{ fontSize:14, color:colors.text[900] }}>Notificaciones del sistema</span>
            <button onClick={async () => {
              try {
                const p = await Notification.requestPermission()
                if (p === 'granted') { toast('Notificaciones activadas', 3000, 'ok'); onClose() }
                else toast('Permiso denegado', 3000, 'err')
              } catch { toast('No soportado en este dispositivo', 3000) }
            }} style={{ background:colors.primary.base, color:'#fff', border:'none', borderRadius:radius.md, padding:'5px 12px', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>Activar</button>
          </div>
        )}

        <Toggle label="Notificaciones de fichaje" value={notiFichaje} onChange={setNotiFichaje} />
        <Toggle label="Recordatorio de salida" value={notiSalida} onChange={setNotiSalida} />
        <Toggle label="GPS automático" value={gpsAuto} onChange={setGpsAuto} />
        <Toggle label="Modo claro" value={isLight} onChange={() => { toggleTheme(); setIsLight(l => !l); toast(isLight ? 'Modo oscuro activado' : 'Modo claro activado') }} />

        <div style={{ padding:'14px 0', borderBottom:SEP }}>
          <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginBottom:10 }}>Diagnóstico de la aplicación</div>
          {[
            ['Red', netLabel, navigator.onLine],
            ['Modo offline', swReady ? 'Preparado' : 'Inicializando', swReady],
            ['Sincronización', offlinePending ? 'Cambios pendientes' : syncStatus === 'synced' ? 'Actualizada' : syncStatus, !offlinePending && syncStatus !== 'error'],
            ['Tiempo real', realtimeStatus === 'SUBSCRIBED' ? 'Activo' : 'Reconectando', realtimeStatus === 'SUBSCRIBED'],
            ['Última copia', lastSyncTime ? new Date(lastSyncTime).toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' }) : 'Aún no disponible', !!lastSyncTime],
          ].map(([label, value, ok]) => (
            <div key={label} style={{ display:'flex', justifyContent:'space-between', gap:12, padding:'5px 0', fontSize:12 }}>
              <span style={{ color:colors.text[500] }}>{label}</span>
              <span style={{ color:ok ? colors.semantic.green : colors.semantic.orange, fontWeight:650, textAlign:'right' }}>{value}</span>
            </div>
          ))}
          <div style={{ fontSize:10.5, lineHeight:1.45, color:colors.text[400], marginTop:7 }}>
            Los fichajes se guardan primero en el dispositivo. Si hay señal débil, quedan pendientes y se reintentan automáticamente.
          </div>
        </div>

        <div style={{ padding:'14px 0', borderBottom:SEP }}>
          <div style={{ fontSize:14, color:colors.text[900], marginBottom:4 }}>Recordatorio de fichaje</div>
          <div style={{ fontSize:11, color:colors.text[500], marginBottom:8 }}>Te avisa si no has fichado entrada a esta hora</div>
          <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)} style={inpStyle} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:SEP }}>
          <div style={{ fontSize:14, color:colors.text[900], marginBottom:4 }}>Recordatorio de salida</div>
          <div style={{ fontSize:11, color:colors.text[500], marginBottom:8 }}>Avisa si tienes jornada abierta a esta hora</div>
          <input type="time" value={salidaTime} onChange={e => setSalidaTime(e.target.value)} style={inpStyle} />
        </div>
        <div style={{ padding:'14px 0', borderBottom:SEP }}>
          <div style={{ fontSize:14, color:colors.text[900], marginBottom:8 }}>Idioma</div>
          <select value={idioma} onChange={e => setIdioma(e.target.value)} style={{ ...inpStyle, width:'100%' }}>
            <option value="es">Español</option>
            <option value="en">English</option>
            <option value="pt">Português</option>
          </select>
        </div>
        <div style={{ padding:'14px 0' }}>
          <div style={{ fontSize:14, color:colors.text[900], marginBottom:8 }}>Formato de hora</div>
          <select value={formato} onChange={e => setFormato(e.target.value)} style={{ ...inpStyle, width:'100%' }}>
            <option value="24h">24 horas</option>
            <option value="12h">12 horas (AM/PM)</option>
          </select>
        </div>
        <button style={btnPrimary} onClick={save}>Guardar</button>
      </div>
    </div>
  )
}
