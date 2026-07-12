import { useState, useEffect, useRef } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { useSwipeDismiss } from '../../hooks/useSwipeDismiss.js'
import { aiAnswer, buildAIContext, AI_CHIPS } from '../../utils/aiAssistant.js'
import { isWebGPUSupported, hasLocalAIConsent, setLocalAIConsent, loadLocalModel, isLocalModelReady, askLocalModel } from '../../utils/localAI.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

const OV   = { position:'fixed', inset:0, background:'rgba(0,0,0,.65)', backdropFilter:'blur(8px)', WebkitBackdropFilter:'blur(8px)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }
const MOD  = { background:colors.bg[700], borderRadius:`${radius['2xl']} ${radius['2xl']} 0 0`, padding:'20px 18px 36px', width:'100%', maxWidth:480, maxHeight:'92vh', overflowY:'auto' }
const DRAG = { width:36, height:4, borderRadius:2, background:colors.border.default, margin:'0 auto 18px' }
const btnSm = { padding:'6px 12px', borderRadius:radius.md, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontWeight:600, fontSize:11, fontFamily:'inherit', cursor:'pointer', flexShrink:0 }

export function ModalAI({ visible, db, u, onClose }) {
  const [msgs, setMsgs] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const chatRef = useRef(null)

  const [localAIState, setLocalAIState] = useState(() =>
    isLocalModelReady() ? 'ready' : (hasLocalAIConsent() && isWebGPUSupported() ? 'idle' : 'off'))
  const [localAIProgress, setLocalAIProgress] = useState({ progress: 0, text: '' })
  const [localAIError, setLocalAIError] = useState('')
  const webgpuOk = isWebGPUSupported()

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [msgs, thinking])

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

  const fmt = (t) => t.split('**').map((part, i) => i % 2 === 1
    ? <strong key={i} style={{ color: colors.primary.light }}>{part}</strong>
    : <span key={i}>{part}</span>)

  return (
    <div style={OV} onClick={onClose}>
      <div style={{ ...MOD, ...modalStyle }} onClick={e => e.stopPropagation()}>
        <div style={DRAG} {...dragHandlers} />

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
          <div style={{ width:40, height:40, borderRadius:radius.lg, background:'linear-gradient(135deg,#B18A52,#8D672E)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0, boxShadow:'0 4px 14px rgba(177,138,82,.4)' }}>✨</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:15, fontWeight:800, letterSpacing:'-.3px', display:'flex', alignItems:'center', gap:6, color:colors.text[900] }}>
              Times AI
              {localAIState === 'ready' && (
                <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:`${colors.semantic.green}18`, color:colors.semantic.green, border:`1px solid ${colors.semantic.green}30` }}>IA OFFLINE</span>
              )}
            </div>
            <div style={{ fontSize:11, color:colors.text[500] }}>Asistente de jornada · datos en vivo</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:colors.text[500], fontSize:22, cursor:'pointer', lineHeight:1, fontFamily:'inherit' }} aria-label="Cerrar">×</button>
        </div>

        {/* Local AI: invite / progress */}
        {localAIState === 'off' && webgpuOk && (
          <div style={{ display:'flex', alignItems:'center', gap:10, background:colors.bg[600], border:`1px solid ${colors.border.default}`, borderRadius:radius.lg, padding:'10px 12px', marginBottom:12 }}>
            <span style={{ fontSize:18 }}>🧠</span>
            <div style={{ flex:1, fontSize:11, color:colors.text[500], lineHeight:1.5 }}>
              Activa <strong style={{ color:colors.text[700] }}>IA avanzada offline</strong>: un modelo real en tu móvil, funciona sin conexión tras descargarlo una vez (~400MB, recomendado con wifi).
            </div>
            <button style={btnSm} onClick={startLocalAI}>Activar</button>
          </div>
        )}
        {localAIState === 'loading' && (
          <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.default}`, borderRadius:radius.lg, padding:'10px 12px', marginBottom:12 }}>
            <div style={{ fontSize:11, color:colors.text[500], marginBottom:6 }}>
              {localAIProgress.text || 'Preparando IA local…'} {localAIProgress.progress > 0 ? `${Math.round(localAIProgress.progress * 100)}%` : ''}
            </div>
            <div style={{ height:4, background:colors.bg[400], borderRadius:2, overflow:'hidden' }}>
              <div style={{ height:'100%', background:colors.primary.base, width:`${Math.max(3, Math.round((localAIProgress.progress || 0) * 100))}%`, transition:'width .3s ease-out' }} />
            </div>
          </div>
        )}
        {localAIState === 'error' && (
          <div style={{ background:`${colors.semantic.orange}10`, border:`1px solid ${colors.semantic.orange}30`, borderRadius:radius.lg, padding:'10px 12px', marginBottom:12 }}>
            <div style={{ fontSize:11, color:colors.semantic.orange, marginBottom:4 }}>
              No se pudo cargar la IA local. Sigo respondiendo con el asistente estándar mientras tanto.
            </div>
            {localAIError && <div style={{ fontSize:10, color:colors.text[300], marginBottom:8, wordBreak:'break-word' }}>{localAIError}</div>}
            <button style={btnSm} onClick={startLocalAI}>Reintentar</button>
          </div>
        )}

        {/* Chat messages */}
        <div ref={chatRef} style={{ maxHeight:'42vh', overflowY:'auto', display:'flex', flexDirection:'column', gap:8, marginBottom:12, scrollbarWidth:'none' }}>
          {!msgs.length && (
            <div style={{ background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:`${radius.md} ${radius.xl} ${radius.xl} ${radius.xl}`, padding:'10px 14px', fontSize:13, color:colors.text[700], lineHeight:1.5, whiteSpace:'pre-line', maxWidth:'85%' }}>
              {fmt(`👋 ¡Hola ${u?.name.split(' ')[0] || ''}! Soy **Times AI**. Pregúntame lo que quieras sobre tu jornada o usa una sugerencia.`)}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} style={{ display:'flex', justifyContent:m.role === 'user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                background: m.role === 'user' ? colors.primary.base : colors.bg[600],
                border: m.role === 'user' ? 'none' : `1px solid ${colors.border.subtle}`,
                borderRadius: m.role === 'user' ? `${radius.xl} ${radius.xl} ${radius.md} ${radius.xl}` : `${radius.md} ${radius.xl} ${radius.xl} ${radius.xl}`,
                padding:'10px 14px', fontSize:13, color: m.role === 'user' ? '#fff' : colors.text[700],
                lineHeight:1.5, whiteSpace:'pre-line', maxWidth:'85%',
              }}>
                {m.role === 'user' ? m.text : fmt(m.text)}
              </div>
            </div>
          ))}
          {thinking && (
            <div style={{ display:'flex', gap:4, padding:'10px 14px', background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:`${radius.md} ${radius.xl} ${radius.xl} ${radius.xl}`, width:'fit-content' }}>
              <style>{`@keyframes ai-dot{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}`}</style>
              {[0,1,2].map(i => <span key={i} style={{ width:6, height:6, borderRadius:'50%', background:colors.primary.light, display:'inline-block', animation:`ai-dot 1.2s ease-in-out ${i*.15}s infinite` }} />)}
            </div>
          )}
        </div>

        {/* Suggestion chips */}
        <div style={{ display:'flex', flexWrap:'wrap', gap:6, margin:'0 0 12px' }}>
          {AI_CHIPS.map(c => (
            <button key={c} onClick={() => ask(c)} style={{ padding:'6px 12px', borderRadius:radius.pill, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontSize:11, fontWeight:600, fontFamily:'inherit', cursor:'pointer', whiteSpace:'nowrap' }}>{c}</button>
          ))}
        </div>

        {/* Input */}
        <div style={{ display:'flex', gap:8 }}>
          <input
            type="text"
            placeholder="Pregúntame sobre tu jornada…"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && ask()}
            style={{ flex:1, background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:radius.lg, padding:'10px 14px', fontSize:13, color:colors.text[900], fontFamily:'inherit', outline:'none' }}
          />
          <button onClick={() => ask()} style={{ width:44, height:44, borderRadius:radius.lg, border:'none', background:colors.primary.base, color:'#fff', fontSize:18, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, boxShadow:`0 4px 14px ${colors.primary.glow}` }} aria-label="Enviar">↑</button>
        </div>
      </div>
    </div>
  )
}
