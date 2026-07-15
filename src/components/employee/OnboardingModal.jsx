import { useState, useEffect } from 'react'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { getCfg } from '../../utils/userConfig.js'
import { pushSubscribe } from '../../services/dataService.js'
import { VAPID_PUB } from '../../config/constants.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'
import { TextField } from '../../ui-v2/components/FormField.js'

const btnPrimary = { padding:'12px', borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontWeight:700, fontSize:14, fontFamily:'inherit', cursor:'pointer', boxShadow:`0 4px 14px ${colors.primary.glow}` }
const btnSecondary = { padding:'12px', borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:14, fontFamily:'inherit', cursor:'pointer' }
const btnSmSec = { padding:'6px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:11, fontFamily:'inherit', cursor:'pointer' }

// ─── ONBOARDING (primer login empleado) ─────────────────────────────────────
export function OnboardingModal({ visible, u, db, saveDB, toast }) {
  const { canvasRef, handlers, clearCanvas, initCanvas, getSignatureData } = useSignatureCanvas()
  const [step, setStep] = useState(0)
  const [done, setDone] = useState(false)
  const [notifGranted, setNotifGranted] = useState(() => typeof Notification !== 'undefined' && Notification.permission === 'granted')
  const [reminderTime, setReminderTime] = useState(() => getCfg('reminderTime', '20:00'))

  useEffect(() => { if (step === 1) initCanvas() }, [step])

  if (!visible || done) return null

  const requestNotif = async () => {
    if (!('Notification' in window)) return
    const perm = await Notification.requestPermission()
    setNotifGranted(perm === 'granted')
    if (perm === 'granted' && u?.id) pushSubscribe(u.id, VAPID_PUB).catch(() => {})
  }

  const finish = () => {
    const signatureData = getSignatureData()
    const firma = signatureData ? { data: signatureData, ts: new Date().toISOString() } : null
    const updatedEmps = (db.employees || []).map(e => e.id === u.id ? { ...e, onboardingDone: true, reminderTime } : e)
    const updatedFirmas = firma ? { ...(db.firmas || {}), [u.id]: { main: firma } } : (db.firmas || {})
    saveDB({ employees: updatedEmps, firmas: updatedFirmas })
    try { localStorage.setItem('cfg_reminderTime', reminderTime) } catch {}
    setDone(true)
    toast('¡Configuración lista! Ya puedes usar la app.', 3000, 'ok')
  }

  const STEPS = ['Notificaciones', 'Tu firma', 'Recordatorio']

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1100, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:colors.bg[700], border:`1px solid ${colors.border.subtle}`, borderRadius:radius['2xl'], padding:'24px 20px', width:'100%', maxWidth:400, boxShadow:'0 24px 80px rgba(0,0,0,.5)' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>👋</div>
          <div style={{ fontSize:17, fontWeight:800, color:colors.text[900] }}>Bienvenido, {u.name.split(' ')[0]}</div>
          <div style={{ fontSize:12, color:colors.text[500], marginTop:3 }}>Configura tu cuenta en {STEPS.length} pasos rápidos</div>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', marginBottom:24 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, transition:'all .25s',
                  background: i < step ? colors.semantic.green : i === step ? colors.primary.base : colors.bg[500],
                  color: i <= step ? '#fff' : colors.text[300],
                  boxShadow: i === step ? `0 0 0 3px ${colors.primary.glow}` : 'none' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color: i===step ? colors.primary.light : colors.text[300], whiteSpace:'nowrap' }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ width:28, height:2, background: i < step ? colors.semantic.green : colors.bg[400], margin:'0 4px', transition:'all .25s', marginBottom:16 }} />}
            </div>
          ))}
        </div>

        {/* Step 0: Notifications */}
        {step === 0 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🔔</div>
              <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginBottom:6 }}>Activar notificaciones</div>
              <div style={{ fontSize:12, color:colors.text[500], lineHeight:1.7 }}>Recibe alertas de jornadas largas, vacaciones aprobadas y comunicados del administrador.</div>
            </div>
            {notifGranted ? (
              <div style={{ background:`color-mix(in srgb, ${colors.semantic.green} 7%, transparent)`, border:`1px solid color-mix(in srgb, ${colors.semantic.green} 15%, transparent)`, borderRadius:radius.lg, padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <span style={{ fontSize:20 }}>✅</span>
                <span style={{ fontSize:13, color:colors.semantic.green, fontWeight:600 }}>Notificaciones activadas</span>
              </div>
            ) : (
              <button style={{ ...btnPrimary, width:'100%', marginBottom:10 }} onClick={requestNotif}>🔔 Activar notificaciones</button>
            )}
            <button style={{ ...btnSecondary, width:'100%' }} onClick={() => setStep(1)}>
              {notifGranted ? 'Continuar →' : 'Omitir por ahora →'}
            </button>
          </div>
        )}

        {/* Step 1: Signature */}
        {step === 1 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginBottom:4 }}>Dibuja tu firma</div>
              <div style={{ fontSize:12, color:colors.text[500] }}>Se usará para firmar documentos y cierres mensuales</div>
            </div>
            <canvas ref={canvasRef} width={640} height={180}
              style={{ width:'100%', height:120, borderRadius:radius.lg, background:'#0D1218', cursor:'crosshair', touchAction:'none', border:`1px solid ${colors.border.subtle}`, display:'block', marginBottom:8 }}
              {...handlers} />
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              <button style={btnSmSec} onClick={clearCanvas}>Borrar</button>
              <button style={{ ...btnSecondary, flex:1 }} onClick={() => setStep(2)}>Omitir →</button>
              <button style={btnPrimary} onClick={() => setStep(2)}>Guardar →</button>
            </div>
          </div>
        )}

        {/* Step 2: Reminder */}
        {step === 2 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>⏰</div>
              <div style={{ fontSize:14, fontWeight:700, color:colors.text[900], marginBottom:6 }}>Recordatorio diario</div>
              <div style={{ fontSize:12, color:colors.text[500], lineHeight:1.7 }}>Te avisaremos a esta hora si no has fichado entrada hoy. Podrás cambiarlo desde Configuración.</div>
            </div>
            <TextField
              label="Hora del recordatorio" type="time" value={reminderTime}
              onChange={e => setReminderTime(e.target.value)}
              style={{ fontSize:20, fontWeight:700, textAlign:'center', letterSpacing:2 }}
            />
            <button style={{ ...btnPrimary, width:'100%' }} onClick={finish}>
              ✅ Finalizar — Empezar a usar la app
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
