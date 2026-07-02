import { useState, useEffect, useRef } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { aiAnswer, buildAIContext, AI_CHIPS } from '../../utils/aiAssistant.js'
import { isWebGPUSupported, hasLocalAIConsent, setLocalAIConsent, loadLocalModel, isLocalModelReady, askLocalModel } from '../../utils/localAI.js'

export function ModalAI({ visible, db, u, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatRef = useRef(null)

  // Estado de la IA local (offline real): 'off' | 'consent' | 'loading' | 'ready' | 'error'
  const [localAIState, setLocalAIState] = useState(() =>
    isLocalModelReady() ? 'ready' : (hasLocalAIConsent() && isWebGPUSupported() ? 'idle' : 'off'))
  const [localAIProgress, setLocalAIProgress] = useState({ progress: 0, text: '' })
  const [localAIError, setLocalAIError] = useState('')
  const webgpuOk = isWebGPUSupported()

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs, thinking])

  // Si el usuario ya dio consentimiento en una sesión anterior, recarga el modelo
  // en silencio (los pesos ya están cacheados por el navegador — es rápido).
  // Antes, un fallo aquí (p.ej. el CSP bloqueando la descarga) volvía a 'off' en
  // silencio sin avisar — parecía que la IA local "no hacía nada". Ahora se
  // muestra el error real y se puede reintentar.
  useEffect(() => {
    if (localAIState !== 'idle') return
    let cancelled = false
    setLocalAIState('loading')
    loadLocalModel(p => { if (!cancelled) setLocalAIProgress(p) })
      .then(() => { if (!cancelled) setLocalAIState('ready') })
      .catch(e => {
        if (cancelled) return
        console.error('[localAI] load error', e)
        setLocalAIError(e?.message || String(e))
        setLocalAIState('error')
      })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null

  const startLocalAI = async () => {
    setLocalAIConsent(true)
    setLocalAIState('loading')
    setLocalAIError('')
    setLocalAIProgress({ progress: 0, text: '' })
    try {
      await loadLocalModel(p => setLocalAIProgress(p))
      setLocalAIState('ready')
    } catch (e) {
      console.error('[localAI] load error', e)
      setLocalAIError(e?.message || String(e))
      setLocalAIState('error')
    }
  }

  const ask = async (q) => {
    const text = (q || input).trim()
    if (!text || thinking) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text }])
    setThinking(true)
    if (localAIState === 'ready') {
      try {
        const ans = await askLocalModel(text, buildAIContext(db, u))
        setThinking(false)
        setMsgs(m => [...m, { role: 'bot', text: ans, local: true }])
        try { navigator.vibrate(6) } catch {}
      } catch (e) {
        console.error('[localAI] chat error', e)
        const ans = aiAnswer(text, db, u)
        setThinking(false)
        setMsgs(m => [...m, { role: 'bot', text: ans }])
      }
      return
    }
    setTimeout(() => {
      const ans = aiAnswer(text, db, u)
      setThinking(false)
      setMsgs(m => [...m, { role: 'bot', text: ans }])
      try { navigator.vibrate(6) } catch {}
    }, 520)
  }

  // Renderiza **negritas** simples
  const fmt = (t) => t.split('**').map((part, i) => i % 2 === 1
    ? <strong key={i} style={{ color: 'var(--primary-light)' }}>{part}</strong>
    : <span key={i}>{part}</span>)

  return (
    <div className="modal-ov" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480, ...modalStyle }}>
        <div className="modal-drag" {...dragHandlers} />

        {/* Header estilo asistente */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 40, height: 40, borderRadius: 14, background: 'linear-gradient(135deg,#2563EB,#8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0, boxShadow: '0 4px 14px rgba(37,99,235,.4)' }}>✨</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.3px', display: 'flex', alignItems: 'center', gap: 6 }}>
              Times AI
              {localAIState === 'ready' && (
                <span title="Modelo IA local activo — funciona sin conexión" style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 8, background: 'rgba(16,185,129,.15)', color: 'var(--green)', border: '1px solid rgba(16,185,129,.3)' }}>IA OFFLINE</span>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Asistente de jornada · datos en vivo</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label="Cerrar">×</button>
        </div>

        {/* IA local: invitación / progreso de descarga */}
        {localAIState === 'off' && webgpuOk && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>🧠</span>
            <div style={{ flex: 1, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
              Activa <strong style={{ color: 'var(--text2)' }}>IA avanzada offline</strong>: un modelo real en tu móvil, funciona sin conexión tras descargarlo una vez (~400MB, recomendado con wifi).
            </div>
            <button className="btn btn-sm btn-secondary" onClick={startLocalAI} style={{ flexShrink: 0 }}>Activar</button>
          </div>
        )}
        {localAIState === 'loading' && (
          <div style={{ background: 'var(--bg-600)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
              {localAIProgress.text || 'Preparando IA local…'} {localAIProgress.progress > 0 ? `${Math.round(localAIProgress.progress * 100)}%` : ''}
            </div>
            <div style={{ height: 4, background: 'var(--bg-400)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ height: '100%', background: 'var(--primary)', width: `${Math.max(3, Math.round((localAIProgress.progress || 0) * 100))}%`, transition: 'width .3s ease-out' }} />
            </div>
          </div>
        )}
        {localAIState === 'error' && (
          <div style={{ background: 'var(--orange-dim)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--orange)', marginBottom: 4 }}>
              No se pudo cargar la IA local. Sigo respondiendo con el asistente estándar mientras tanto.
            </div>
            {localAIError && <div style={{ fontSize: 10, color: 'var(--text4)', marginBottom: 8, wordBreak: 'break-word' }}>{localAIError}</div>}
            <button className="btn btn-sm btn-secondary" onClick={startLocalAI}>Reintentar</button>
          </div>
        )}

        {/* Chat */}
        <div className="ai-chat" ref={chatRef} style={{ maxHeight: '42vh' }}>
          {!msgs.length && (
            <div className="ai-msg-bot" style={{ whiteSpace: 'pre-line' }}>
              {fmt(`👋 ¡Hola ${u?.name.split(' ')[0] || ''}! Soy **Times AI**. Pregúntame lo que quieras sobre tu jornada o usa una sugerencia.`)}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'ai-msg-user' : 'ai-msg-bot'} style={{ whiteSpace: 'pre-line' }}>
              {m.role === 'user' ? m.text : fmt(m.text)}
            </div>
          ))}
          {thinking && (
            <div className="ai-msg-bot ai-typing"><span /><span /><span /></div>
          )}
        </div>

        {/* Chips sugerencias */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '4px 0 12px' }}>
          {AI_CHIPS.map(c => (
            <button key={c} onClick={() => ask(c)} className="ai-chip-btn">{c}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" placeholder="Pregúntame sobre tu jornada…" value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && ask()} />
          <button className="btn btn-primary" onClick={() => ask()} style={{ minWidth: 44 }} aria-label="Enviar">↑</button>
        </div>
      </div>
    </div>
  )
}
