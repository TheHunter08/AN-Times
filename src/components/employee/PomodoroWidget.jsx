import { useState, useEffect } from 'react'

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

  useEffect(() => {
    _save({ active, phase, secs, count })
  }, [active, phase, secs, count])

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
    <button className="v3-pomodoro-toggle" onClick={() => setOpen(true)}>
      🍅 <span>Modo Pomodoro</span>
    </button>
  )

  const total = phase === 'work' ? WS : BS
  const R = 28, C2PI = 2 * Math.PI * R
  const offset = C2PI * (1 - (total - secs) / total)
  const mm = Math.floor(secs / 60), ss = secs % 60

  return (
    <div className={`v3-pomodoro-card${phase === 'break' ? ' break' : ''}`}>
      <div className="v3-pomodoro-header">
        <span>{phase === 'work' ? '🍅 Trabajo · 25 min' : '☕ Descanso · 5 min'}</span>
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          {count > 0 && <span className="v3-pomodoro-count">×{count}</span>}
          <button className="v3-pomodoro-close" onClick={() => { reset(); setOpen(false) }}>×</button>
        </div>
      </div>
      <div className="v3-pomodoro-body">
        <div style={{ position:'relative', width:64, height:64, flexShrink:0 }}>
          <svg viewBox="0 0 64 64" width="64" height="64">
            <circle cx="32" cy="32" r={R} fill="none" stroke="var(--border2)" strokeWidth="4.5" />
            <circle cx="32" cy="32" r={R} fill="none"
              stroke={phase === 'work' ? 'var(--primary)' : 'var(--green)'}
              strokeWidth="4.5" strokeLinecap="round"
              strokeDasharray={C2PI} strokeDashoffset={offset}
              transform="rotate(-90 32 32)" />
          </svg>
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
            {String(mm).padStart(2,'0')}:{String(ss).padStart(2,'0')}
          </div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className={`v3-pomodoro-btn${active ? ' active' : ''}`} onClick={() => setActive(a => !a)}>
            {active ? '⏸' : '▶'}
          </button>
          <button className="v3-pomodoro-reset" onClick={reset} title="Reiniciar">↺</button>
        </div>
      </div>
    </div>
  )
}
