import { useState, useEffect } from 'react'
import { useSignatureCanvas } from '../../hooks/useSignatureCanvas.js'
import { getCfg } from '../../utils/userConfig.js'
import { pushSubscribe } from '../../services/dataService.js'
import { VAPID_PUB } from '../../config/constants.js'

// ─── ONBOARDING (primer login empleado) ────────────────────────────────────────
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
    if (perm === 'granted' && u?.id) {
      pushSubscribe(u.id, VAPID_PUB).catch(() => {})
    }
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
    <div className="modal-ov center" style={{ zIndex:1100 }}>
      <div className="modal center-modal" style={{ maxWidth:400, width:'calc(100% - 32px)' }}>
        {/* Header */}
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ fontSize:36, marginBottom:8 }}>👋</div>
          <div style={{ fontSize:17, fontWeight:800, color:'var(--text)' }}>Bienvenido, {u.name.split(' ')[0]}</div>
          <div style={{ fontSize:12, color:'var(--text3)', marginTop:3 }}>Configura tu cuenta en {STEPS.length} pasos rápidos</div>
        </div>

        {/* Step indicator */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:0, marginBottom:24 }}>
          {STEPS.map((s, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center' }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                <div style={{ width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, transition:'all .25s',
                  background: i < step ? 'var(--green)' : i === step ? 'var(--primary)' : 'var(--bg-500)',
                  color: i <= step ? '#fff' : 'var(--text4)', boxShadow: i === step ? '0 0 0 3px var(--primary-glow)' : 'none' }}>
                  {i < step ? '✓' : i + 1}
                </div>
                <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', color: i===step?'var(--primary-light)':'var(--text4)', whiteSpace:'nowrap' }}>{s}</div>
              </div>
              {i < STEPS.length - 1 && <div style={{ width:28, height:2, background: i < step ? 'var(--green)' : 'var(--bg-400)', margin:'0 4px', transition:'all .25s', marginBottom:16 }} />}
            </div>
          ))}
        </div>

        {/* Step 0: Notifications */}
        {step === 0 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>🔔</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Activar notificaciones</div>
              <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>Recibe alertas de jornadas largas, vacaciones aprobadas y comunicados del administrador.</div>
            </div>
            {notifGranted ? (
              <div style={{ background:'var(--green-dim)', border:'1px solid rgba(16,185,129,.2)', borderRadius:'var(--r)', padding:'12px 16px', display:'flex', alignItems:'center', gap:10, marginBottom:16 }}>
                <span style={{ fontSize:20 }}>✅</span>
                <span style={{ fontSize:13, color:'var(--green)', fontWeight:600 }}>Notificaciones activadas</span>
              </div>
            ) : (
              <button className="btn btn-primary" style={{ width:'100%', marginBottom:10 }} onClick={requestNotif}>
                🔔 Activar notificaciones
              </button>
            )}
            <button className="btn btn-secondary" style={{ width:'100%' }} onClick={() => setStep(1)}>
              {notifGranted ? 'Continuar →' : 'Omitir por ahora →'}
            </button>
          </div>
        )}

        {/* Step 1: Signature */}
        {step === 1 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:14 }}>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>Dibuja tu firma</div>
              <div style={{ fontSize:12, color:'var(--text3)' }}>Se usará para firmar documentos y cierres mensuales</div>
            </div>
            <canvas ref={canvasRef} width={640} height={180}
              style={{ width:'100%', height:120, borderRadius:'var(--r)', background:'#0D1218', cursor:'crosshair', touchAction:'none', border:'1px solid var(--border2)', display:'block', marginBottom:8 }}
              {...handlers} />
            <div style={{ display:'flex', gap:8, marginBottom:4 }}>
              <button className="btn btn-secondary btn-sm" onClick={clearCanvas}>Borrar</button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => setStep(2)}>Omitir →</button>
              <button className="btn btn-primary" onClick={() => setStep(2)}>Guardar →</button>
            </div>
          </div>
        )}

        {/* Step 2: Reminder */}
        {step === 2 && (
          <div>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:10 }}>⏰</div>
              <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Recordatorio diario</div>
              <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.7 }}>Te avisaremos a esta hora si no has fichado entrada hoy. Podrás cambiarlo desde Configuración.</div>
            </div>
            <div className="field" style={{ marginBottom:20 }}>
              <label>Hora del recordatorio</label>
              <input type="time" value={reminderTime} onChange={e => setReminderTime(e.target.value)}
                style={{ fontSize:20, fontWeight:700, textAlign:'center', letterSpacing:2 }} />
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={finish}>
              ✅ Finalizar — Empezar a usar la app
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
