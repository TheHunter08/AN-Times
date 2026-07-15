import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { useClock } from '../../hooks/useClock.js'
import { today, calcSecs, calcMin, recWorkSecs, ftime, mhm, p2, wkStart, monthlyExtras, gid, s2t, localDateStr } from '../../utils/time.js'
import { calcStreak, calcWorkPattern, streakLabel } from '../../utils/streaks.js'
import { WK, WM } from '../../config/constants.js'
import { queuePush } from '../../services/dataService.js'
import { checkPlatformAuth, hasBiometric, registerBiometric, isBioOfferDismissed, dismissBioOffer } from '../../utils/webauthn.js'
import { WeatherCard } from './WeatherCard.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'
import { ModalParteVoz } from '../ModalParteVoz.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function TabInicio({ timer, doStart, doStop, doBreak, openRec, db, u, openModal, gpsStatus, session, vac, saveDB, toast, onOpenQRScan }) {
  const { setEmpTab } = useAppStore()
  const { clockTime, clockDate } = useClock()
  const todayStr = today()
  const [showTip, setShowTip] = useState(() => {
    try { return localStorage.getItem('an_tip_fichar') !== '1' } catch { return false }
  })
  const [bioOfferVisible, setBioOfferVisible] = useState(false)
  const [bioOfferLoading, setBioOfferLoading] = useState(false)
  const [showParteVoz, setShowParteVoz] = useState(false)
  const [burst, setBurst] = useState(null)

  const recs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === todayStr),
    [db.records, u.id, todayStr]
  )
  const realRecs = useMemo(() => recs.filter(r => !r.fin || recWorkSecs(r) >= 30), [recs])
  const o = openRec()
  const pendingDocs = useMemo(
    () => (db.documentos || []).filter(d => d.empId === u.id && !d.firma),
    [db.documentos, u.id]
  )
  const lastAutoClosed = useMemo(() => {
    return (db.records || [])
      .filter(r => r.empId === u.id && r.autoClosedAt)
      .sort((a, b) => b.autoClosedAt.localeCompare(a.autoClosedAt))[0] || null
  }, [db.records, u.id])
  const [autoCloseDismissed, setAutoCloseDismissed] = useState(false)
  const showAutoCloseWarning = !autoCloseDismissed && lastAutoClosed &&
    (Date.now() - new Date(lastAutoClosed.autoClosedAt).getTime()) < 24 * 60 * 60 * 1000

  const streak = useMemo(() => calcStreak(db.records, u.id, todayStr), [db.records, u.id, todayStr])
  const streakNext = streakLabel(streak)
  const workPattern = useMemo(() => calcWorkPattern(db.records, u.id), [db.records, u.id])

  useEffect(() => {
    if (!u?.id) return
    if (hasBiometric(u.id) || isBioOfferDismissed(u.id)) return
    checkPlatformAuth().then(ok => { if (ok) setBioOfferVisible(true) })
  }, [u?.id])

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs  = completedSecs + liveSecs
  const totMin   = Math.floor(totSecs / 60)
  const empWD    = Math.round((u.horasSemanales || WK / 60) / 5 * 60)
  const empWK    = (u.horasSemanales || WK / 60) * 60
  const pct      = Math.min(100, Math.round(totMin / empWD * 100))
  const remainMin = Math.max(0, empWD - totMin)

  const entradaRec = realRecs[0]
  const salidaRec  = [...realRecs].reverse().find(r => r.fin && r.closed)
  const brkMin     = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)

  const now = new Date()
  const ws  = wkStart(now)
  const wsStr = localDateStr(ws)
  const mk  = `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr + 'T00:00:00')
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])

  const weekMin  = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
  const weekPct  = Math.min(100, Math.round(weekMin / empWK * 100))
  const extraMin = Math.max(0, weekMin - WK)

  const lastWeekMin = useMemo(() => {
    const lws = new Date(wsStr + 'T00:00:00'); lws.setDate(lws.getDate() - 7)
    const lwe = new Date(wsStr + 'T00:00:00')
    return (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= lws && new Date(r.inicio) < lwe).reduce((s, r) => s + calcMin(r), 0)
  }, [db.records, u.id, wsStr])

  // localDateStr(new Date(r.inicio)) (no r.inicio?.startsWith(mk)): inicio se guarda en
  // UTC, mk es local — un fichaje nocturno se quedaba fuera del mes correcto.
  const monthRecs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && localDateStr(new Date(r.inicio)).startsWith(mk)),
    [db.records, u.id, mk]
  )
  const monthMin = useMemo(() => monthRecs.reduce((s, r) => s + calcMin(r), 0), [monthRecs])
  const { netExtraMin: monthExtraMin, deficitMin: monthDeficitMin } = useMemo(
    () => monthlyExtras(db.records, u.id, mk),
    [db.records, u.id, mk]
  )
  const monthPct = Math.min(100, Math.round(monthMin / WM * 100))

  const teamData = useMemo(() => {
    if (u.role !== 'encargado' && u.role !== 'jefe_obra') return null
    const isJO = u.role === 'jefe_obra'
    const encCentros = [...new Set([...(u.obrasAsignadas || []), ...(u.centroTrabajo ? [u.centroTrabajo] : [])])]
    const teamEmps = (db.employees || []).filter(e =>
      !e.isAdmin && !e.baja && e.id !== u.id &&
      (isJO || !encCentros.length || !e.centroTrabajo ||
        encCentros.includes(e.centroTrabajo) ||
        (e.obrasAsignadas || []).some(o => encCentros.includes(o)))
    )
    if (!teamEmps.length) return null
    const todayRecords = (db.records || []).filter(r => r.inicio && localDateStr(new Date(r.inicio)) === todayStr)
    const liveIds  = new Set(todayRecords.filter(r => !r.fin).map(r => r.empId))
    const doneIds  = new Set(todayRecords.filter(r => r.fin && !liveIds.has(r.empId)).map(r => r.empId))
    const minByEmp = {}
    todayRecords.filter(r => r.fin).forEach(r => { minByEmp[r.empId] = (minByEmp[r.empId] || 0) + calcMin(r) })
    return { teamEmps, liveIds, doneIds, minByEmp }
  }, [u.role, u.id, u.obrasAsignadas, db.employees, db.records, todayStr])

  const triggerBurst = (kind, pattern) => {
    try { navigator.vibrate(pattern) } catch {}
    setBurst(kind)
    setTimeout(() => setBurst(null), 650)
  }
  const handleMainBtn = () => {
    if (timer.state === 'idle') { triggerBurst('start', [18, 40, 18]); doStart() }
    else { triggerBurst('stop', [22, 60, 22, 60, 45]); doStop() }
  }
  const handleBreakBtn = () => {
    triggerBurst('break', timer.state === 'break' ? [12, 30, 12] : [30])
    doBreak()
  }

  // Button color based on state
  const btnColor = timer.state === 'idle' ? colors.primary.base
    : timer.state === 'break' ? colors.semantic.orange
    : colors.semantic.green
  const btnGlow = timer.state === 'idle' ? colors.primary.glow
    : timer.state === 'break' ? `color-mix(in srgb, ${colors.semantic.orange} 31%, transparent)`
    : `color-mix(in srgb, ${colors.semantic.green} 31%, transparent)`

  if (!db.records) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="skeleton" style={{ height: 280, borderRadius: 20 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
        {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 68, borderRadius: 14 }} />)}
      </div>
      <div className="skeleton" style={{ height: 56, borderRadius: 14 }} />
      <div className="skeleton" style={{ height: 80, borderRadius: 14 }} />
    </div>
  )

  return (
    <PullToRefresh>
      <style>{`
        @keyframes v2-burst { 0%{opacity:.75;transform:translate(-50%,-50%) scale(.8)} 100%{opacity:0;transform:translate(-50%,-50%) scale(1.7)} }
        @keyframes v2-pulse { 0%,100%{opacity:.4;transform:scale(1)} 50%{opacity:.15;transform:scale(1.08)} }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', paddingBottom: 100 }}>

        {/* ── Hero Card ───────────────────────────────────────────── */}
        <div className="v7-clock-hero" style={{
          margin: '16px 16px 0',
          background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
          borderRadius: radius['2xl'], padding: '20px 20px 16px', position: 'relative', overflow: 'hidden',
        }}>
          {/* ambient glow */}
          <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: `radial-gradient(circle, ${btnColor}18 0%, transparent 70%)`, pointerEvents: 'none', transition: 'background .3s' }} />

          {/* Clock + Weather */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
            <div>
              <div className="v7-clock-time" style={{ fontSize: 36, fontWeight: 800, letterSpacing: -2, fontVariantNumeric: 'tabular-nums', color: colors.text[900], lineHeight: 1 }}>
                {clockTime?.slice(0,5) || '--:--'}
                <span style={{ fontSize: 20, fontWeight: 600, color: colors.text[500], marginLeft: 3 }}>{clockTime?.slice(5) || ':--'}</span>
              </div>
              <div style={{ fontSize: 12, color: colors.text[500], marginTop: 4, textTransform: 'capitalize' }}>{clockDate}</div>
            </div>
            <WeatherCard />
          </div>

          {/* Punch button */}
          <div className="v7-punch-orbit" style={{ display: 'flex', justifyContent: 'center', marginBottom: 16, position: 'relative' }}>
            <span className="v7-orbit v7-orbit-a" aria-hidden="true" />
            <span className="v7-orbit v7-orbit-b" aria-hidden="true" />
            <span className="v7-orbit v7-orbit-c" aria-hidden="true" />
            {timer.state !== 'idle' && (
              <div style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 110, height: 110, borderRadius: '50%',
                background: `radial-gradient(circle, ${btnColor}20 0%, transparent 70%)`,
                animation: 'v2-pulse 2s ease-in-out infinite',
                pointerEvents: 'none',
              }} />
            )}
            <button
              className="v7-punch-button"
              onClick={() => {
                if (showTip) { try { localStorage.setItem('an_tip_fichar','1') } catch {}; setShowTip(false) }
                handleMainBtn()
              }}
              style={{
                width: 88, height: 88, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: `radial-gradient(circle at 35% 35%, ${btnColor}dd, ${btnColor})`,
                boxShadow: `0 8px 28px ${btnGlow}, inset 0 1px 0 rgba(255,255,255,0.18)`,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5,
                cursor: 'pointer', color: '#fff', transition: 'all 0.2s ease', position: 'relative',
              }}>
              <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true" style={{ display: 'block' }}>
                {timer.state === 'idle'
                  ? <polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>
                  : <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>}
              </svg>
              <span style={{ maxWidth: 70, textAlign: 'center', fontSize: 8.5, fontWeight: 800, letterSpacing: '.35px', lineHeight: 1.15 }}>
                {timer.state === 'idle' ? 'INICIAR JORNADA' : 'FINALIZAR JORNADA'}
              </span>
              {/* burst ring */}
              {burst && (
                <div style={{
                  position: 'absolute', top: '50%', left: '50%',
                  width: 88, height: 88, borderRadius: '50%',
                  border: `2px solid ${burst === 'break' ? colors.semantic.orange : colors.semantic.green}`,
                  animation: 'v2-burst 0.65s ease-out forwards',
                  pointerEvents: 'none',
                }} />
              )}
            </button>
          </div>

          {/* Tip / live status */}
          {showTip && timer.state === 'idle' ? (
            <div style={{ textAlign: 'center', fontSize: 12, color: colors.text[500], marginBottom: 12 }}>
              👆 Pulsa el círculo para comenzar
            </div>
          ) : timer.state !== 'idle' ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: timer.state === 'break' ? colors.semantic.orange : colors.semantic.green, boxShadow: `0 0 7px ${timer.state === 'break' ? colors.semantic.orange : colors.semantic.green}` }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: timer.state === 'break' ? colors.semantic.orange : colors.semantic.green }}>
                {timer.state === 'break' ? `En descanso · ${brkMin}min` : `Jornada activa · ${s2t(timer.ws)}`}
              </span>
            </div>
          ) : null}

          {/* Break toggle */}
          {timer.state !== 'idle' && (
            <button onClick={handleBreakBtn} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '10px 16px', marginBottom: 8,
              borderRadius: radius.lg, fontFamily: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: timer.state === 'break' ? `color-mix(in srgb, ${colors.semantic.orange} 8%, transparent)` : colors.bg[500],
              border: `1px solid ${timer.state === 'break' ? `color-mix(in srgb, ${colors.semantic.orange} 25%, transparent)` : colors.border.default}`,
              color: timer.state === 'break' ? colors.semantic.orange : colors.text[700],
              transition: 'all .15s',
            }}>
              {timer.state === 'break' ? '▶  Reanudar trabajo' : '⏸  Iniciar descanso'}
            </button>
          )}

          {/* QR buttons */}
          {[
            { show: true, label: 'Mostrar mi QR', onClick: () => openModal('miQR'), icon: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px' }}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" fill="currentColor" stroke="none"/></svg> },
            { show: !!(onOpenQRScan && (u.role === 'jefe_obra' || u.role === 'encargado')), label: 'Fichar a un empleado', onClick: onOpenQRScan, icon: <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px' }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> },
          ].filter(b => b.show).map((b, i) => (
            <button key={i} onClick={b.onClick} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '10px 16px', marginBottom: 8,
              borderRadius: radius.lg, fontFamily: 'inherit', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: colors.bg[500], border: `1px solid ${colors.border.default}`,
              color: colors.text[700],
            }}>
              {b.icon}{b.label}
            </button>
          ))}

          {/* Break warn chip */}
          {timer.state === 'break' && brkMin > 20 && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 12px', marginBottom: 8, borderRadius: radius.pill, background: `color-mix(in srgb, ${colors.semantic.orange} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${colors.semantic.orange} 19%, transparent)`, fontSize: 12, fontWeight: 700, color: colors.semantic.orange }}>
              ⚠ {brkMin}min de descanso
            </div>
          )}

          {/* Divider */}
          <div style={{ height: 1, background: colors.border.subtle, margin: '4px 0 12px' }} />

          {/* Stats row */}
          <div style={{ display: 'flex', gap: 0 }}>
            {[
              { lbl: 'Trabajado', val: `${Math.floor(totMin/60)}h ${p2(totMin%60)}m`, color: colors.text[900] },
              { lbl: 'Restante',  val: `${Math.floor(remainMin/60)}h ${p2(remainMin%60)}m`, color: colors.text[900] },
              { lbl: 'Jornada',   val: `${pct}%`, color: colors.primary.light },
            ].map(({ lbl, val, color }, i) => (
              <div key={lbl} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', borderLeft: i > 0 ? `1px solid ${colors.border.subtle}` : 'none' }}>
                <div style={{ fontSize: 16, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
                <div style={{ fontSize: 10, color: colors.text[300], fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 2 }}>{lbl}</div>
              </div>
            ))}
          </div>

          {/* Progress bar */}
          <div style={{ height: 5, background: colors.bg[400], borderRadius: radius.pill, overflow: 'hidden', margin: '12px 0 6px' }}>
            <div style={{ height: '100%', borderRadius: radius.pill, background: `linear-gradient(90deg, ${btnColor}cc, ${btnColor})`, width: `${pct}%`, transition: 'width .4s ease', boxShadow: `0 0 8px ${btnGlow}` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.text[500] }}>
            <span>{o?.centro || 'Sin obra asignada'}</span>
            {timer.state !== 'idle' && extraMin > 0 && (
              <span style={{ color: colors.semantic.green, fontWeight: 600 }}>+{Math.floor(extraMin/60)}h {p2(extraMin%60)}m extra</span>
            )}
          </div>
        </div>

        {/* ── 4-stat mini grid ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '0 16px' }}>
          {[
            { lbl: 'Entrada', val: entradaRec ? ftime(entradaRec.inicio) : '--:--', color: colors.primary.light },
            { lbl: 'Salida',  val: o ? '--:--' : salidaRec ? ftime(salidaRec.fin) : '--:--', color: colors.semantic.green },
            { lbl: 'Pausa',   val: brkMin > 0 ? `${Math.floor(brkMin/60).toString().padStart(2,'0')}:${p2(brkMin%60)}` : '00:00', color: colors.semantic.orange },
            { lbl: 'Total',   val: totMin > 0 ? `${Math.floor(totMin/60)}h ${p2(totMin%60)}m` : '0h 00m', color: colors.secondary.base },
          ].map(({ lbl, val, color }) => (
            <div key={lbl} style={{ background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '10px 6px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: colors.text[300], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>{lbl}</div>
              <div style={{ fontSize: 13, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>{val}</div>
            </div>
          ))}
        </div>

        {/* ── Week progress ────────────────────────────────────────── */}
        <div style={{ margin: '0 16px', background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>Semana</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: weekPct >= 100 ? colors.semantic.green : colors.text[700] }}>{mhm(weekMin)} / 40h</div>
          </div>
          <div style={{ height: 5, background: colors.bg[400], borderRadius: radius.pill, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', borderRadius: radius.pill, background: weekPct >= 100 ? colors.semantic.green : colors.primary.base, width: `${Math.min(weekPct, 100)}%`, transition: 'width .4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.text[500] }}>
            <span>Lun · {new Date(ws).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</span>
            <span style={{ color: weekPct >= 100 ? colors.semantic.green : undefined }}>{weekPct >= 100 ? '✓ 40h completadas' : `${100 - weekPct}% restante`}</span>
          </div>
        </div>

        {/* ── Month progress ───────────────────────────────────────── */}
        <div style={{ margin: '0 16px', background: colors.bg[600], border: `1px solid ${colors.border.subtle}`, borderRadius: radius.xl, padding: '14px 18px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>Este mes</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: monthPct >= 100 ? colors.semantic.green : colors.text[700] }}>{mhm(monthMin)} / 160h</div>
          </div>
          <div style={{ height: 5, background: colors.bg[400], borderRadius: radius.pill, overflow: 'hidden', marginBottom: 6 }}>
            <div style={{ height: '100%', borderRadius: radius.pill, background: monthPct >= 100 ? colors.semantic.green : monthDeficitMin > 0 ? colors.semantic.orange : colors.primary.base, width: `${Math.min(monthPct, 100)}%`, transition: 'width .4s ease' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: colors.text[500] }}>
            <span>{now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}</span>
            {monthExtraMin > 0 ? (
              <span style={{ color: colors.semantic.green, fontWeight: 700 }}>+{mhm(monthExtraMin)} extra</span>
            ) : monthDeficitMin > 0 ? (
              <span style={{ color: colors.semantic.orange }}>−{mhm(monthDeficitMin)} déficit</span>
            ) : (
              <span style={{ color: monthPct >= 100 ? colors.semantic.green : undefined }}>{monthPct >= 100 ? '✓ 160h alcanzadas' : `${100 - monthPct}% restante`}</span>
            )}
          </div>
        </div>

        {/* ── Streak + IA row ──────────────────────────────────────── */}
        {(streak > 0 || workPattern) && (
          <div style={{ display: 'flex', gap: 10, padding: '0 16px' }}>
            {streak > 0 && (
              <div style={{
                flex: 1, background: colors.bg[600], border: `1px solid ${streak >= 7 ? `color-mix(in srgb, ${colors.semantic.orange} 19%, transparent)` : colors.border.subtle}`,
                borderRadius: radius.xl, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 36, height: 36, borderRadius: radius.sm, background: streak >= 30 ? 'rgba(251,191,36,.15)' : streak >= 7 ? `color-mix(in srgb, ${colors.semantic.orange} 13%, transparent)` : `color-mix(in srgb, ${colors.semantic.green} 8%, transparent)`, border: `1px solid ${streak >= 30 ? 'rgba(251,191,36,.3)' : streak >= 7 ? `color-mix(in srgb, ${colors.semantic.orange} 25%, transparent)` : `color-mix(in srgb, ${colors.semantic.green} 19%, transparent)`}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {streak >= 30
                    ? <svg viewBox="0 0 24 24" fill="none" stroke="#FBBF24" strokeWidth="2" width="18" height="18"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    : streak >= 7
                    ? <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.orange} strokeWidth="2" width="18" height="18"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    : <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.green} strokeWidth="2.5" width="16" height="16"><polyline points="20 6 9 17 4 12"/></svg>
                  }
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: streak >= 7 ? colors.semantic.orange : colors.text[900], lineHeight: 1 }}>
                    {streak} <span style={{ fontSize: 12, fontWeight: 500, color: colors.text[500] }}>día{streak !== 1 ? 's' : ''}</span>
                  </div>
                  <div style={{ fontSize: 10, color: colors.text[500], fontWeight: 600 }}>racha activa</div>
                  {streakNext && <div style={{ fontSize: 10, color: colors.primary.light, marginTop: 2 }}>{streakNext}</div>}
                </div>
              </div>
            )}
            {workPattern && (
              <div style={{
                flex: 1, background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
                borderRadius: radius.xl, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10,
              }}>
                <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke={colors.primary.light} strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 10, color: colors.text[500], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px' }}>Tu horario habitual</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], marginTop: 1 }}>{workPattern.earlyStr} – {workPattern.lateStr}</div>
                  {(() => {
                    if (!entradaRec) return <div style={{ fontSize: 10, color: colors.text[300], marginTop: 2 }}>basado en {workPattern.sampleSize} días</div>
                    const d = new Date(entradaRec.inicio)
                    const entMin = d.getHours() * 60 + d.getMinutes()
                    const diff = entMin - workPattern.avgMin
                    const abs = Math.abs(diff)
                    if (abs < 6) return <div style={{ fontSize: 10, color: colors.semantic.green, marginTop: 2 }}>✓ Llegaste a tu hora habitual</div>
                    const fm = m => `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'min' : ''}`.trim()
                    return <div style={{ fontSize: 10, color: diff < 0 ? colors.semantic.green : colors.semantic.orange, marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>{diff < 0 ? <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="10" height="10"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>{fm(abs)} antes</> : `+${fm(abs)} más tarde`}</div>
                  })()}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Biometric offer ──────────────────────────────────────── */}
        {bioOfferVisible && (
          <div style={{ margin: '0 16px', background: colors.bg[600], border: `1px solid color-mix(in srgb, ${colors.primary.base} 19%, transparent)`, borderRadius: radius.xl, padding: '16px 18px', display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: radius.lg, background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={colors.primary.light} strokeWidth="1.6" width="22" height="22">
                <path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0 0 8 11a4 4 0 1 1 8 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0 0 15.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 0 0 8 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: colors.text[900], marginBottom: 4 }}>Activa el acceso rápido</div>
              <div style={{ fontSize: 12, color: colors.text[500], marginBottom: 12, lineHeight: 1.5 }}>Entra con tu huella o Face ID la próxima vez, sin introducir el PIN.</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={bioOfferLoading} onClick={async () => {
                  setBioOfferLoading(true)
                  try {
                    await registerBiometric(u.id, u.name)
                    setBioOfferVisible(false); dismissBioOffer(u.id)
                    toast('¡Huella registrada! Ya puedes entrar sin PIN 🔓')
                  } catch {
                    toast('No se pudo registrar. Inténtalo desde la pantalla de login.')
                    setBioOfferVisible(false); dismissBioOffer(u.id)
                  }
                  setBioOfferLoading(false)
                }} style={{ padding: '8px 16px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: bioOfferLoading ? .7 : 1 }}>
                  {bioOfferLoading ? 'Registrando…' : 'Activar'}
                </button>
                <button onClick={() => { setBioOfferVisible(false); dismissBioOffer(u.id) }} style={{ padding: '8px 16px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: 'transparent', color: colors.text[500], fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                  Ahora no
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Pending docs ─────────────────────────────────────────── */}
        {pendingDocs.length > 0 && (
          <div onClick={() => openModal('documentos')} style={{ margin: '0 16px', padding: '12px 14px', background: `color-mix(in srgb, ${colors.semantic.orange} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${colors.semantic.orange} 19%, transparent)`, borderRadius: radius.lg, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `color-mix(in srgb, ${colors.semantic.orange} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${colors.semantic.orange} 19%, transparent)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.orange} strokeWidth="2" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.semantic.orange }}>
                {pendingDocs.length === 1 ? 'Tienes 1 documento pendiente' : `Tienes ${pendingDocs.length} documentos pendientes`} de firma
              </div>
              <div style={{ fontSize: 11, color: colors.text[500], marginTop: 2 }}>Toca para revisarlos y firmar</div>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={colors.semantic.orange} strokeWidth="2.5" style={{ flexShrink: 0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}

        {/* ── Auto-close warning ───────────────────────────────────── */}
        {showAutoCloseWarning && (
          <div style={{ margin: '0 16px', padding: '12px 14px', background: `color-mix(in srgb, ${colors.semantic.orange} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${colors.semantic.orange} 19%, transparent)`, borderRadius: radius.lg, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>⚠️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.semantic.orange, marginBottom: 3 }}>Jornada cerrada automáticamente</div>
              <div style={{ fontSize: 11, color: colors.text[500], lineHeight: 1.5 }}>
                Tu jornada del {new Date(lastAutoClosed.inicio).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' })} fue cerrada automáticamente por inactividad ({mhm(Math.floor((lastAutoClosed.workSecs||0)/60))}).
              </div>
            </div>
            <button onClick={() => setAutoCloseDismissed(true)} style={{ background: 'none', border: 'none', color: colors.text[500], fontSize: 18, cursor: 'pointer', padding: 0, flexShrink: 0, lineHeight: 1 }}>×</button>
          </div>
        )}

        {/* ── GPS card ─────────────────────────────────────────────── */}
        {o && (
          <div style={{
            margin: '0 16px',
            padding: '12px 16px', borderRadius: radius.lg,
            background: o.geoAlert ? `color-mix(in srgb, ${colors.semantic.red} 6%, transparent)` : gpsStatus === 'pending' ? `color-mix(in srgb, ${colors.primary.base} 6%, transparent)` : `color-mix(in srgb, ${colors.semantic.green} 6%, transparent)`,
            border: `1px solid ${o.geoAlert ? `color-mix(in srgb, ${colors.semantic.red} 19%, transparent)` : gpsStatus === 'pending' ? `color-mix(in srgb, ${colors.primary.base} 13%, transparent)` : `color-mix(in srgb, ${colors.semantic.green} 15%, transparent)`}`,
            display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={o.geoAlert ? colors.semantic.red : colors.semantic.green} strokeWidth="1.8">
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[900], marginBottom: 2 }}>{o.centro || u.centroTrabajo || 'Sin centro'}</div>
              <div style={{ fontSize: 11, color: o.geoAlert ? colors.semantic.red : gpsStatus === 'fail' ? colors.semantic.red : gpsStatus === 'pending' ? colors.primary.light : colors.semantic.green }}>
                {o?.locInicio ? '✓ GPS verificado' : gpsStatus === 'pending' ? 'Capturando ubicación…' : gpsStatus === 'fail' ? '⚠ Sin GPS — ubicación no registrada' : 'Sin GPS'}
              </div>
              {o.geoAlert && (
                <div style={{ fontSize: 11, color: colors.semantic.red, marginTop: 2, fontWeight: 600 }}>
                  ⚠ Fuera de zona · +{o.geoAlert.dist}m del radio ({o.geoAlert.radio}m)
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Mi equipo ────────────────────────────────────────────── */}
        {teamData && (() => {
          const { teamEmps, liveIds, doneIds, minByEmp } = teamData
          const liveCount = teamEmps.filter(e => liveIds.has(e.id)).length
          const allRecs = db.records || []

          const teamStartJornada = (e) => {
            if (liveIds.has(e.id)) { toast('Ya tiene jornada abierta', 2500, 'warn'); return }
            const newRec = { id: gid(), operationId: globalThis.crypto?.randomUUID?.() ?? null, _rev: 1, empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || '', breaks: [], workSecs: 0, creadoPor: u.name, _upd: new Date().toISOString() }
            saveDB(freshDb => ({ records: [...(freshDb.records || []), newRec] }))
            queuePush(e.id, '▶ Jornada iniciada', `${u.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
            toast('Jornada iniciada', 2500, 'ok')
          }
          const teamToggleDescanso = (rec) => {
            const now = new Date().toISOString()
            let updated
            if (rec.enDescanso) {
              const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
              updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk, _upd: now }
              queuePush(rec.empId, '▶ Descanso finalizado', `${u.name} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
              toast('Jornada reanudada', 2500, 'ok')
            } else {
              updated = { ...rec, enDescanso: true, bStartTs: now, _upd: now }
              queuePush(rec.empId, '⏸ Descanso iniciado', `${u.name} ha pausado tu jornada.`, 'jornada', '/?tab=inicio')
              toast('Descanso iniciado', 2500, 'ok')
            }
            saveDB(freshDb => ({ records: (freshDb.records || []).map(r => r.id === rec.id ? updated : r) }))
          }
          const teamForceClose = (rec) => {
            const empName = teamEmps.find(e => e.id === rec.empId)?.name || rec.empName
            if (!window.confirm(`¿Finalizar jornada de ${empName}?`)) return
            const now = new Date().toISOString()
            const breaks = [...(rec.breaks || [])]
            if (rec.enDescanso && rec.bStartTs) breaks.push({ start: rec.bStartTs, end: now })
            const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true, operationId: globalThis.crypto?.randomUUID?.() ?? rec.operationId ?? null, _rev: (rec._rev || 0) + 1, _upd: now }
            const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
            saveDB(freshDb => ({ records: (freshDb.records || []).map(r => r.id === rec.id ? closed : r) }))
            queuePush(rec.empId, '⏹ Jornada finalizada', `${u.name} ha finalizado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
            toast('Jornada finalizada', 2500, 'ok')
          }

          return (
            <div style={{ margin: '0 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>Mi equipo hoy</span>
                  <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 10, background: `color-mix(in srgb, ${colors.semantic.green} 8%, transparent)`, color: colors.semantic.green, border: `1px solid color-mix(in srgb, ${colors.semantic.green} 15%, transparent)` }}>
                    {liveCount} activo{liveCount !== 1 ? 's' : ''}
                  </span>
                </div>
                <button onClick={() => setShowParteVoz(true)} style={{ fontSize: 11, fontWeight: 700, color: colors.semantic.red, background: `color-mix(in srgb, ${colors.semantic.red} 6%, transparent)`, border: `1px solid color-mix(in srgb, ${colors.semantic.red} 15%, transparent)`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit' }}>
                  🎙️ Parte de trabajo
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {teamEmps.map(e => {
                  const isWorking = liveIds.has(e.id)
                  const isDone    = !isWorking && doneIds.has(e.id)
                  const openRec2  = isWorking ? allRecs.find(r => r.empId === e.id && !r.fin) : null
                  const totalMin  = isDone ? (minByEmp[e.id] || 0) : 0
                  const dotColor  = isWorking ? colors.semantic.green : isDone ? colors.primary.light : colors.text[300]
                  const statusTxt = isWorking
                    ? (openRec2?.enDescanso ? `En descanso desde ${ftime(openRec2?.bStartTs || openRec2?.inicio)}` : `Activo desde ${ftime(openRec2?.inicio)}`)
                    : isDone ? `${mhm(totalMin)} · Finalizado` : 'Sin fichar hoy'
                  const avatarColor = colors.avatarPalette[(e.name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.avatarPalette.length]
                  return (
                    <div key={e.id} style={{
                      background: colors.bg[600], border: `1px solid ${isWorking ? (openRec2?.enDescanso ? `color-mix(in srgb, ${colors.semantic.orange} 15%, transparent)` : `color-mix(in srgb, ${colors.semantic.green} 13%, transparent)`) : colors.border.subtle}`,
                      borderRadius: radius.xl, padding: '12px 14px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: saveDB && (isWorking || !isDone) ? 10 : 0 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0, boxShadow: isWorking ? `0 0 7px ${dotColor}` : 'none' }} />
                        <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                          {e.initials || e.name.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: colors.text[900], overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name.split(' ')[0]} {e.name.split(' ')[1] || ''}</div>
                          <div style={{ fontSize: 10, color: isWorking ? (openRec2?.enDescanso ? colors.semantic.orange : colors.semantic.green) : isDone ? colors.text[500] : colors.text[300], marginTop: 1 }}>{statusTxt}</div>
                        </div>
                      </div>
                      {saveDB && (
                        isWorking ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => teamToggleDescanso(openRec2)} style={{ flex: 1, padding: '7px 12px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`, background: colors.bg[500], color: colors.text[700], fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              {openRec2?.enDescanso ? '▶ Reanudar' : '⏸ Pausa'}
                            </button>
                            <button onClick={() => teamForceClose(openRec2)} style={{ flex: 1, padding: '7px 12px', borderRadius: radius.md, border: `1px solid color-mix(in srgb, ${colors.semantic.red} 19%, transparent)`, background: `color-mix(in srgb, ${colors.semantic.red} 6%, transparent)`, color: colors.semantic.red, fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                              ■ Finalizar
                            </button>
                          </div>
                        ) : !isDone ? (
                          <button onClick={() => teamStartJornada(e)} style={{ width: '100%', padding: '7px 12px', borderRadius: radius.md, border: 'none', background: colors.primary.base, color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: `0 2px 10px ${colors.primary.glow}` }}>
                            ▶ Iniciar jornada
                          </button>
                        ) : null
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

        <div style={{ height: 4 }} />
      </div>
      <ModalParteVoz visible={showParteVoz} db={db} autor={u.name} saveDB={saveDB} toast={toast} onClose={() => setShowParteVoz(false)} />
    </PullToRefresh>
  )
}
