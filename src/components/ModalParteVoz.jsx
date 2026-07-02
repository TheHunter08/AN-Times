import { useState, useRef, useEffect } from 'react'
import { useModalBack } from '../hooks/useModalBack.js'
import { useSwipeDismiss } from '../hooks/useSwipeDismiss.js'
import { buildParte } from '../utils/parteTrabajo.js'
import { fds } from '../utils/time.js'

function getSpeechRecognition() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

// Dictado por voz → parte de trabajo estructurado. El encargado/JO habla en
// lenguaje natural al terminar el día y esto lo convierte en incidencias,
// ausencias y un resumen, cruzándolo con los fichajes reales para pillar
// discrepancias (p.ej. "fulano faltó" pero sí tiene fichaje ese día).
export function ModalParteVoz({ visible, db, autor, saveDB, toast, onClose }) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [preview, setPreview] = useState(null)
  const recRef = useRef(null)
  const baseTextRef = useRef('')

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)

  const speechOk = !!getSpeechRecognition()

  useEffect(() => {
    if (!visible) { setText(''); setPreview(null); stopListening() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  useEffect(() => () => stopListening(), [])

  function stopListening() {
    try { recRef.current?.stop() } catch {}
    recRef.current = null
    setListening(false)
  }

  function startListening() {
    if (recRef.current) return // ya hay un reconocimiento activo — un doble-tap rápido no debe duplicarlo
    const SR = getSpeechRecognition()
    if (!SR) { toast('Tu navegador no soporta dictado por voz — escribe el parte a mano', 3500, 'warn'); return }
    baseTextRef.current = text ? text + ' ' : ''
    const rec = new SR()
    rec.lang = 'es-ES'
    rec.continuous = true
    rec.interimResults = true
    rec.onresult = (e) => {
      let finalChunk = '', interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) finalChunk += t + ' '
        else interim += t
      }
      if (finalChunk) baseTextRef.current += finalChunk
      setText(baseTextRef.current + interim)
    }
    rec.onerror = () => stopListening()
    rec.onend = () => setListening(false)
    recRef.current = rec
    try {
      rec.start()
      setListening(true)
      try { navigator.vibrate(10) } catch {}
    } catch {
      // InvalidStateError u otro fallo síncrono al arrancar — no dejar el ref colgado
      recRef.current = null
      setListening(false)
    }
  }

  const generar = () => {
    if (!text.trim()) { toast('Dicta o escribe algo primero', 3000, 'warn'); return }
    stopListening()
    const parte = buildParte({ text: text.trim(), db, autor })
    setPreview(parte)
  }

  const guardar = () => {
    if (!preview) return
    saveDB({ partesTrabajo: [...(db.partesTrabajo || []), preview] })
    toast('✅ Parte de trabajo guardado', 3000, 'ok')
    setText(''); setPreview(null)
    onClose()
  }

  if (!visible) return null

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#F59E0B,#EF4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🎙️</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800 }}>Parte de trabajo</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Dicta el resumen del día — {fds(new Date().toISOString())}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label="Cerrar">×</button>
        </div>

        {!preview ? (
          <>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder='Ej: "Hoy trabajamos en Torre Norte. Juan faltó sin avisar. Se acabó el cemento y llegó tarde. Todo lo demás normal."'
              style={{ width: '100%', minHeight: 120, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-600)', color: 'var(--text)', padding: 12, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              {speechOk && (
                <button
                  onClick={listening ? stopListening : startListening}
                  className={`btn ${listening ? 'btn-danger' : 'btn-secondary'}`}
                  style={{ flex: 1 }}
                >
                  {listening ? '⏹ Detener dictado' : '🎙️ Dictar'}
                </button>
              )}
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={generar}>Generar parte</button>
            </div>
            {listening && (
              <div style={{ marginTop: 8, fontSize: 11, color: 'var(--primary-light)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)', animation: 'pulse 1s ease-in-out infinite' }} />
                Escuchando…
              </div>
            )}
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '55vh', overflowY: 'auto' }}>
            {preview.obraNombre && (
              <div style={{ fontSize: 12, color: 'var(--text3)' }}>📍 Obra detectada: <strong style={{ color: 'var(--text2)' }}>{preview.obraNombre}</strong></div>
            )}
            {preview.resumen && (
              <div style={{ fontSize: 13, color: 'var(--text2)', background: 'var(--bg-600)', borderRadius: 10, padding: 10 }}>{preview.resumen}</div>
            )}
            {preview.ausencias.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 4 }}>AUSENCIAS ({preview.ausencias.length})</div>
                {preview.ausencias.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>• {a.motivo}</div>)}
              </div>
            )}
            {preview.salidasAnticipadas.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 4 }}>SALIDAS ANTICIPADAS ({preview.salidasAnticipadas.length})</div>
                {preview.salidasAnticipadas.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>• {a.motivo}</div>)}
              </div>
            )}
            {preview.incidencias.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', marginBottom: 4 }}>INCIDENCIAS ({preview.incidencias.length})</div>
                {preview.incidencias.map((a, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 2 }}>• {a}</div>)}
              </div>
            )}
            {preview.discrepancias.length > 0 && (
              <div style={{ background: 'var(--orange-dim)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--orange)', marginBottom: 4 }}>⚠️ REVISAR ANTES DE GUARDAR</div>
                {preview.discrepancias.map((d, i) => <div key={i} style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 2 }}>{d}</div>)}
              </div>
            )}
            {!preview.ausencias.length && !preview.incidencias.length && !preview.salidasAnticipadas.length && (
              <div style={{ fontSize: 12, color: 'var(--text4)' }}>Sin ausencias, salidas ni incidencias detectadas.</div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setPreview(null)}>← Editar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={guardar}>Guardar parte</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
