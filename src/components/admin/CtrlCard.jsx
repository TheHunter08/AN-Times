import { useState, useEffect } from 'react'
import { calcSecs, mhm, ftime } from '../../utils/time.js'
import { WK } from '../../config/constants.js'

// Celda de tiempo con tick propio (tabla de control live)
export function LiveTimerCell({ rec }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!rec) return
    const iv = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(iv)
  }, [rec?.id])
  if (!rec) return <>—</>
  const t = calcSecs(rec)
  return <>{mhm(Math.floor(t.work / 60))}</>
}

// Componente de tarjeta con su propio tick — evita re-render de toda la grid cada 5s
export function CtrlCard({ e, live, todayMin, wdMin, force, startJornada, toggleDescanso }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 5000)
    return () => clearInterval(iv)
  }, [])
  const t = live ? calcSecs(live) : null
  const isWorking = live && !live.enDescanso
  const isBreak = live && live.enDescanso
  const elapsedMin = live ? Math.floor((Date.now() - new Date(live.inicio).getTime()) / 60000) : 0
  const hasBreak = live?.breaks?.length > 0
  const fatiguaAlert = isWorking && elapsedMin >= 600 && !hasBreak
  // e.horasSemanales llega en HORAS; WK y wdMin ya están en MINUTOS — antes el
  // fallback mezclaba unidades y daba un objetivo diario absurdo (~480h) cuando
  // el empleado no tenía horasSemanales seteado (pct siempre ~0%, over nunca saltaba).
  const dailyTarget = e.horasSemanales ? (e.horasSemanales * 60) / 5 : (wdMin || WK / 5)
  const workedMin = t ? Math.floor(t.work / 60) : todayMin
  const pct = workedMin ? Math.min(100, Math.round(workedMin / dailyTarget * 100)) : 0
  const over = workedMin > dailyTarget

  return (
    <div className={`ctrl-card${isWorking ? ' working' : isBreak ? ' on-break' : ''}`}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14 }}>
        <div className="ctrl-avatar" style={{ background:e.color||'var(--primary)' }}>
          {(e.initials||e.name.slice(0,2)).toUpperCase()}
          <div className="ctrl-dot" style={{ background: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--bg-500)', boxShadow: isWorking?'0 0 8px var(--green)':isBreak?'0 0 8px var(--orange)':'none' }} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
          <div style={{ fontSize:11, color:'var(--text3)', marginTop:1, display:'flex', alignItems:'center', gap:5 }}>
            <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{live?.centro || e.centroTrabajo || '—'}</span>
            {live?.locInicio && (
              <span title={`GPS: ${live.locInicio.lat?.toFixed(4)}, ${live.locInicio.lng?.toFixed(4)}`}
                style={{ flexShrink:0, fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:8, background:'rgba(6,182,212,.12)', color:'var(--teal)', border:'1px solid rgba(6,182,212,.25)' }}>
                GPS ✓
              </span>
            )}
            {fatiguaAlert && (
              <span style={{ flexShrink:0, fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:8, background:'rgba(239,68,68,.15)', color:'var(--danger)', border:'1px solid rgba(239,68,68,.3)' }}>
                ⚠️ +10h sin pausa
              </span>
            )}
          </div>
        </div>
      </div>
      <div style={{ textAlign:'center', marginBottom:12 }}>
        <div className="counter-val" style={{ fontSize:30, fontWeight:800, letterSpacing:'-1px', color: isWorking?'var(--green)':isBreak?'var(--orange)':'var(--text3)' }}>
          {t ? mhm(Math.floor(t.work/60)) : '—'}
        </div>
        <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
          {isWorking ? `Entrada: ${ftime(live.inicio)}` : isBreak ? 'En descanso' : todayMin>0 ? `Hoy: ${mhm(todayMin)}` : 'Sin jornada hoy'}
        </div>
        {workedMin > 0 && (
          <div style={{ marginTop:8 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--text4)', marginBottom:3 }}>
              <span>Jornada diaria</span>
              <span style={{ color: over ? 'var(--orange)' : 'var(--text3)', fontWeight:700 }}>{pct}%{over ? ' ↑extra' : ''}</span>
            </div>
            <div style={{ height:4, background:'var(--bg-400)', borderRadius:2 }}>
              <div style={{ height:'100%', borderRadius:2, background: over ? 'var(--orange)' : 'var(--green)', width: pct + '%', transition:'width .6s' }} />
            </div>
          </div>
        )}
      </div>
      {live ? (
        <div style={{ display:'flex', gap:6 }}>
          <button className="btn btn-sm btn-secondary" style={{ flex:1, fontSize:11 }} onClick={() => toggleDescanso(live)}>
            {live.enDescanso ? '▶ Continuar' : '⏸ Pausa'}
          </button>
          <button className="btn btn-sm btn-danger" style={{ flex:1, fontSize:11 }} onClick={() => force(live)}>■ Fin</button>
        </div>
      ) : (
        <button className="btn btn-sm btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => startJornada(e)}>
          ▶ Iniciar jornada
        </button>
      )}
    </div>
  )
}
