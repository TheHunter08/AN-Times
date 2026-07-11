import { useState, useEffect } from 'react'
import { colors } from '../../ui-v2/design-system/colors.js'
import { radius } from '../../ui-v2/design-system/radius.js'

export function PomodoroWidget() {
  const [open, setOpen] = useState(false)
  const WS = 25 * 60, BS = 5 * 60
  const _pkey = 'an_pomodoro'
  const _load = () => { try { return JSON.parse(localStorage.getItem(_pkey) || 'null') } catch { return null } }
  const _save = s => { try { localStorage.setItem(_pkey, JSON.stringify(s)) } catch {} }
  const _init = _load() || { active: false, phase: 'work', secs: WS, count: 0 }
  const [active, setActive] = useState(_init.active)
  const [phase, setPhase] = useState(_init.phase)
  const [secs, setSecs] = useState(_init.secs)
  const [count, setCount] = useState(_init.count)

  useEffect(() => { _save({ active, phase, secs, count }) }, [active, phase, secs, count])

  useEffect(() => {
    if (!active) return
    const id = setInterval(() => {
      setSecs(s => {
        if (s > 1) return s - 1
        if (phase === 'work') {
          setPhase('break'); setSecs(BS); setCount(c => c + 1)
          try { new Notification('🍅 ¡Pomodoro completado!', { body: '5 min de descanso.' }) } catch {}
        } else {
          setPhase('work'); setSecs(WS)
          try { new Notification('⏱️ ¡Vuelve al trabajo!', { body: 'Empieza el siguiente pomodoro.' }) } catch {}
        }
        try { navigator.vibrate?.([150, 80, 150]) } catch {}
        return s
      })
    }, 1000)
    return () => clearInterval(id)
  }, [active, phase])

  const reset = () => { setActive(false); setPhase('work'); setSecs(WS) }

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{
      display:'flex', alignItems:'center', gap:6, padding:'8px 14px',
      background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl,
      color:colors.text[700], fontSize:12, fontWeight:600, fontFamily:'inherit', cursor:'pointer',
      width:'100%', justifyContent:'center',
    }}>
      🍅 <span>Modo Pomodoro</span>
    </button>
  )

  const total = phase === 'work' ? WS : BS
  const R = 28, C2PI = 2 * Math.PI * R
  const offset = C2PI * (1 - (total - secs) / total)
  const mm = Math.floor(secs / 60), ss = secs % 60
  const ringColor = phase === 'work' ? colors.primary.base : colors.semantic.green
  const isBreak = phase === 'break'

  return (
    <div style={{
      background: isBreak ? `${colors.semantic.green}08` : colors.bg[600],
      border:`1px solid ${isBreak ? colors.semantic.green+'25' : colors.border.subtle}`,
      borderRadius:radius.xl, padding:'12px 14px',
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
        <span style={{ fontSize:12, fontWeight:700, color: isBreak ? colors.semantic.green : colors.text[700] }}>
          {isBreak ? '☕ Descanso · 5 min' : '🍅 Trabajo · 25 min'}
        </span>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {count > 0 && (
            <span style={{ fontSize:10, fontWeight:800, padding:'2px 7px', borderRadius:10, background:`${colors.primary.base}15`, color:colors.primary.light, border:`1px solid ${colors.primary.base}25` }}>×{count}</span>
          )}
          <button onClick={() => { reset(); setOpen(false) }} style={{ background:'none', border:'none', color:colors.text[500], fontSize:18, cursor:'pointer', lineHeight:1, padding:'2px 4px', fontFamily:'inherit' }}>×</button>
        </div>
      </div>
      {/* Body */}
      <div style={{ display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ position:'relative', width:64, height:64, flexShrink:0 }}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r={R} fill="none" stroke={colors.border.subtle} strokeWidth="4.5" />
            <circle cx="32" cy="32" r={R} fill="none"
              stroke={ringColor} strokeWidth="4.5" strokeLinecap="round"
              strokeDasharray={C2PI} strokeDashoffset={offset}
              transform="rotate(-90 32 32)" />
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, fontVariantNumeric:'tabular-nums', color:colors.text[900] }}>
            {String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => setActive(a => !a)} style={{
            width:40, height:40, borderRadius:radius.lg, border:'none', fontFamily:'inherit', cursor:'pointer', fontSize:16,
            background: active ? `${ringColor}20` : ringColor,
            color: active ? ringColor : '#fff',
            display:'flex', alignItems:'center', justifyContent:'center',
            boxShadow: active ? 'none' : `0 4px 12px ${ringColor}50`,
          }}>
            {active ? '⏸' : '▶'}
          </button>
          <button onClick={reset} title="Reiniciar" style={{ width:40, height:40, borderRadius:radius.lg, border:`1px solid ${colors.border.default}`, background:colors.bg[500], color:colors.text[700], fontSize:16, cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', justifyContent:'center' }}>↺</button>
        </div>
      </div>
    </div>
  )
}
