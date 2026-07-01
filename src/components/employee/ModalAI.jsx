import { useState, useEffect, useRef } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { aiAnswer, AI_CHIPS } from '../../utils/aiAssistant.js'

export function ModalAI({ visible, db, u, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatRef = useRef(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs, thinking])

  useModalBack(visible, onClose)
  const { dragHandlers, modalStyle } = useSwipeDismiss(onClose)
  if (!visible) return null

  const ask = (q) => {
    const text = (q || input).trim()
    if (!text || thinking) return
    setInput('')
    setMsgs(m => [...m, { role: 'user', text }])
    setThinking(true)
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
            <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-.3px' }}>Times AI</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>Asistente de jornada · datos en vivo</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }} aria-label="Cerrar">×</button>
        </div>

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
