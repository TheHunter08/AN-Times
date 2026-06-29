import { useState } from 'react'
import { callSendPushAll, showPushToast } from './shared.js'

export default function PushNotifWidget({ db, toast }) {
  const [open, setOpen]       = useState(false)
  const [target, setTarget]   = useState('all')
  const [title, setTitle]     = useState('')
  const [body, setBody]       = useState('')
  const [sending, setSending] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const permStatus = 'Notification' in window ? Notification.permission : 'unsupported'

  const send = async () => {
    if (!title.trim() || !body.trim()) { toast('Completa título y mensaje'); return }
    setSending(true)
    setLastResult(null)
    try {
      const json = await callSendPushAll(title.trim(), body.trim(), target)
      setLastResult(json)
      showPushToast(json, toast)
      if (json.ok) { setTitle(''); setBody(''); setOpen(false) }
    } catch(e) {
      setLastResult({ ok: false, error: e.message })
      toast('Error de red al enviar push', 3000, 'error')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="dash-widget card-lift" style={{ marginTop:12 }}>
      <div className="dash-widget-header">
        <div className="dash-widget-title">📢 Push Masivo</div>
        <button className="btn btn-primary btn-sm" onClick={() => setOpen(o => !o)}>
          {open ? 'Cancelar' : '+ Enviar'}
        </button>
      </div>
      {!open && (
        <div style={{ fontSize:11, color:'var(--text4)', marginTop:4, display:'flex', flexDirection:'column', gap:3 }}>
          <span>Notificación masiva — llega al móvil aunque esté bloqueado</span>
          <span style={{ color: permStatus === 'granted' ? 'var(--green)' : permStatus === 'denied' ? 'var(--danger)' : 'var(--orange)' }}>
            Este dispositivo: {permStatus === 'granted' ? '✓ Push activado' : permStatus === 'denied' ? '✗ Push bloqueado — actívalo en ajustes del navegador' : '⚠ Push no solicitado'}
          </span>
          {lastResult && (
            <span style={{ color: lastResult.ok ? 'var(--green)' : 'var(--danger)' }}>
              Último envío: {lastResult.ok
                ? `✓ ${lastResult.sent ?? 0} enviados${lastResult.failed > 0 ? `, ${lastResult.failed} fallaron` : ''}${lastResult.noSub > 0 ? `, ${lastResult.noSub} sin suscripción` : ''}`
                : `✗ ${lastResult.error || 'error'}`}
            </span>
          )}
        </div>
      )}
      {open && (
        <div style={{ marginTop:12, display:'flex', flexDirection:'column', gap:8 }}>
          <select value={target} onChange={e => setTarget(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }}>
            <option value="all">Todos los empleados</option>
            <option value="activos">Activos ahora (fichados)</option>
            <option value="jefe_obra">Solo jefes de obra</option>
            <option value="encargado">Solo encargados</option>
            <option value="empleado">Solo empleados base</option>
          </select>
          <input placeholder="Título (máx 80 caracteres)…" maxLength={80} value={title} onChange={e => setTitle(e.target.value)}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13 }} />
          <textarea placeholder="Mensaje (máx 200 caracteres)…" maxLength={200} value={body} onChange={e => setBody(e.target.value)} rows={2}
            style={{ borderRadius:8, border:'1px solid var(--border)', background:'var(--bg-600)', color:'var(--text)', padding:'8px 12px', fontSize:13, resize:'none', fontFamily:'inherit' }} />
          <div style={{ fontSize:10, color:'var(--text4)', textAlign:'right' }}>
            {title.length}/80 · {body.length}/200
          </div>
          <button className="btn btn-primary btn-sm" disabled={sending || !title.trim() || !body.trim()} onClick={send}>
            {sending ? 'Enviando…' : '📢 Enviar notificación masiva'}
          </button>
          <div style={{ fontSize:10, color:'var(--text4)', lineHeight:1.5 }}>
            Solo llega a empleados con la app abierta alguna vez y permisos concedidos.
          </div>
        </div>
      )}
    </div>
  )
}
