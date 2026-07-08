import { useState, useEffect, useMemo } from 'react'
import { useAppStore } from '../../store/appStore.js'
import { useClock } from '../../hooks/useClock.js'
import { today, calcSecs, calcMin, recWorkSecs, ftime, mhm, p2, wkStart, monthlyExtras, gid, s2t } from '../../utils/time.js'
import { calcStreak, calcWorkPattern, streakLabel } from '../../utils/streaks.js'
import { WK, WM } from '../../config/constants.js'
import { queuePush } from '../../services/dataService.js'
import { checkPlatformAuth, hasBiometric, registerBiometric, isBioOfferDismissed, dismissBioOffer } from '../../utils/webauthn.js'
import { WeatherCard } from './WeatherCard.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'
import { ModalParteVoz } from '../ModalParteVoz.jsx'

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
  const [burst, setBurst] = useState(null) // 'start' | 'stop' | 'break' | null
  // Memo: TabInicio re-renderiza cada segundo via timer; evitar refiltrar listas grandes
  const recs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(todayStr)),
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

  // Racha de asistencia (se actualiza cuando cambian los records, no cada segundo)
  const streak = useMemo(() => calcStreak(db.records, u.id, todayStr), [db.records, u.id, todayStr])
  const streakNext = streakLabel(streak)

  // IA horaria: patrón de entrada de los últimos 30 días
  const workPattern = useMemo(() => calcWorkPattern(db.records, u.id), [db.records, u.id])

  // Oferta biométrica — mostrar solo una vez si el dispositivo lo soporta y no está registrado
  useEffect(() => {
    if (!u?.id) return
    if (hasBiometric(u.id) || isBioOfferDismissed(u.id)) return
    checkPlatformAuth().then(ok => { if (ok) setBioOfferVisible(true) })
  }, [u?.id])

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs = completedSecs + liveSecs
  const totMin = Math.floor(totSecs / 60)
  const empWD = Math.round((u.horasSemanales || WK / 60) / 5 * 60)  // minutos/día según contrato
  const empWK = (u.horasSemanales || WK / 60) * 60                  // minutos/semana
  const pct = Math.min(100, Math.round(totMin / empWD * 100))
  const remainMin = Math.max(0, empWD - totMin)

  const entradaRec = realRecs[0]
  const salidaRec = [...realRecs].reverse().find(r => r.fin && r.closed)
  const brkMin = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)

  const now = new Date()
  const ws = wkStart(now)
  const wsStr = ws.toISOString().slice(0, 10)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr)
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
  const weekPct = Math.min(100, Math.round(weekMin / empWK * 100))
  // Horas extra reales: solo cuentan al superar 40h/semana (Estatuto de los Trabajadores),
  // no por pasar de la jornada diaria — antes se marcaba "extra" solo por hacer >8h en un día.
  const extraMin = Math.max(0, weekMin - WK)
  const lastWeekMin = useMemo(() => {
    const lws = new Date(wsStr); lws.setDate(lws.getDate() - 7)
    const lwe = new Date(wsStr)
    return (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= lws && new Date(r.inicio) < lwe).reduce((s, r) => s + calcMin(r), 0)
  }, [db.records, u.id, wsStr])
  const monthRecs = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)),
    [db.records, u.id, mk]
  )
  const monthMin = useMemo(() => monthRecs.reduce((s, r) => s + calcMin(r), 0), [monthRecs])
  const { netExtraMin: monthExtraMin, deficitMin: monthDeficitMin } = useMemo(
    () => monthlyExtras(db.records, u.id, mk),
    [db.records, u.id, mk]
  )
  const monthPct = Math.min(100, Math.round(monthMin / WM * 100))

  // "Mi equipo" data — precomputado para evitar O(n²) cada segundo en encargados
  const teamData = useMemo(() => {
    if (u.role !== 'encargado' && u.role !== 'jefe_obra') return null
    const isJO = u.role === 'jefe_obra'
    const encCentros = u.obrasAsignadas || []
    const teamEmps = (db.employees || []).filter(e =>
      !e.isAdmin && !e.baja && e.id !== u.id &&
      (isJO || !encCentros.length ||
        encCentros.includes(e.centroTrabajo) ||
        (e.obrasAsignadas || []).some(o => encCentros.includes(o)))
    )
    if (!teamEmps.length) return null
    const todayRecords = (db.records || []).filter(r => r.inicio?.startsWith(todayStr))
    const liveIds  = new Set(todayRecords.filter(r => !r.fin).map(r => r.empId))
    const doneIds  = new Set(todayRecords.filter(r => r.fin && !liveIds.has(r.empId)).map(r => r.empId))
    const minByEmp = {}
    todayRecords.filter(r => r.fin).forEach(r => { minByEmp[r.empId] = (minByEmp[r.empId] || 0) + calcMin(r) })
    return { teamEmps, liveIds, doneIds, minByEmp }
  }, [u.role, u.id, u.obrasAsignadas, db.employees, db.records, todayStr])

  // SVG arc
  const ARC_R = 50
  const ARC_C = 2 * Math.PI * ARC_R
  const arcOffset = ARC_C * (1 - pct / 100)

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

  const statusClass = timer.state === 'idle' ? 'idle' : timer.state === 'break' ? 'break' : ''

  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:280, borderRadius:20 }} />
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
          {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height:68, borderRadius:14 }} />)}
        </div>
        <div className="skeleton" style={{ height:56, borderRadius:14 }} />
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
      </div>
    </div>
  )

  return (
    <PullToRefresh>
      <div className="ini-wrap">

        {/* ── TIMES INC 3.0 — Hero Card ──────────────────────────── */}
        <div className="v30-hero-card">

          {/* Clock row */}
          <div className="v30-hc-top">
            <div className="v30-hc-clock-block">
              <div className="v30-hc-clock">
                <span className="v30-hc-hm">{clockTime?.slice(0,5) || '--:--'}</span>
                <span className="v30-hc-sec">{clockTime?.slice(5) || ':--'}</span>
              </div>
              <div className="v30-hc-date">{clockDate}</div>
            </div>
            <div className="v30-hc-weather"><WeatherCard /></div>
          </div>

          {/* Button zone */}
          <div className="v30-hc-btn-area">
            {/* Outer glow ring — separate layer, won't overlap stats */}
            <div className={`v30-hc-glow${timer.state === 'break' ? ' brk' : timer.state !== 'idle' ? ' live' : ''}`}/>
            <button
              className={`v30-hc-btn${timer.state === 'break' ? ' brk' : timer.state !== 'idle' ? ' live' : ''}`}
              onClick={() => {
                if (showTip) { try { localStorage.setItem('an_tip_fichar','1') } catch {}; setShowTip(false) }
                handleMainBtn()
              }}
            >
              <svg viewBox="0 0 24 24" className="v30-hc-btn-ico" aria-hidden="true">
                {timer.state === 'idle'
                  ? <polygon points="6 3 20 12 6 21 6 3" fill="currentColor"/>
                  : <rect x="5" y="5" width="14" height="14" rx="2" fill="currentColor"/>}
              </svg>
              <span className="v30-hc-btn-lbl">
                {timer.state === 'idle' ? 'INICIAR' : timer.state === 'break' ? 'PAUSADO' : 'PARAR'}
              </span>
            </button>
            {burst && (
              <div className={`v30-burst${burst === 'break' ? ' brk' : ''}`}>
                <div className="v30-burst-ring" />
                <div className="v30-burst-check-wrap">
                  <svg viewBox="0 0 24 24" className="v30-burst-check" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12.5 L9.5 18 L20 5" />
                  </svg>
                </div>
              </div>
            )}
          </div>

          {/* Tip / live status — just below button, above stats */}
          {showTip && timer.state === 'idle' ? (
            <div className="v30-hc-tip-text">👆 Pulsa el círculo para comenzar</div>
          ) : timer.state !== 'idle' ? (
            <div className="v30-hc-live-row">
              <span className="v30-dot on"/>
              <span className="v30-hc-live-txt">
                {timer.state === 'break' ? `En descanso · ${brkMin}min` : `Jornada activa · ${s2t(timer.ws)}`}
              </span>
            </div>
          ) : null}

          {/* Break toggle — when active */}
          {timer.state !== 'idle' && (
            <button className={`v30-break-btn${timer.state === 'break' ? ' brk' : ''}`} onClick={handleBreakBtn}>
              {timer.state === 'break' ? '▶  Reanudar trabajo' : '⏸  Iniciar descanso'}
            </button>
          )}

          {/* Mostrar mi QR — el empleado muestra su QR personal para que
              el encargado/admin lo escanee desde PanelControl o PanelMiObra. */}
          <button className="v30-break-btn" onClick={() => openModal('miQR')} style={{ marginTop: timer.state !== 'idle' ? 8 : 0 }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM19 14h2v2h-2zM14 19h2v2h-2zM19 19h2v2h-2z" fill="currentColor" stroke="none" />
            </svg>
            Mostrar mi QR
          </button>

          {/* Botón dedicado y visible para que un jefe de obra o encargado
              fiche a un empleado de su equipo escaneando su QR personal,
              estando físicamente donde ese empleado esté (no depende del
              centro/obra del que ficha). Antes compartía botón con "Fichar
              con QR" y quedaba escondido; ahora es su propia acción, clara
              desde el primer vistazo. Misma lógica de destino
              (handleQRScan en EmployeePage.jsx) — solo cambia la entrada. */}
          {onOpenQRScan && (u.role === 'jefe_obra' || u.role === 'encargado') && (
            <button className="v30-break-btn" onClick={onOpenQRScan} style={{ marginTop: 8 }}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              Fichar a un empleado
            </button>
          )}

          {/* Break warn chip */}
          {(timer.state === 'break' && brkMin > 20) && (
            <div className="v30-chip v30-chip-warn">⚠ {brkMin}min de descanso</div>
          )}

          {/* Divider */}
          <div className="v30-hc-sep"/>

          {/* Stats row */}
          <div className="v30-hc-stats">
            <div className="v30-hc-stat">
              <div className="v30-hc-stat-num">{Math.floor(totMin/60)}h {p2(totMin%60)}m</div>
              <div className="v30-hc-stat-lbl">Trabajado</div>
            </div>
            <div className="v30-hc-divider"/>
            <div className="v30-hc-stat">
              <div className="v30-hc-stat-num">{Math.floor(remainMin/60)}h {p2(remainMin%60)}m</div>
              <div className="v30-hc-stat-lbl">Restante</div>
            </div>
            <div className="v30-hc-divider"/>
            <div className="v30-hc-stat">
              <div className="v30-hc-stat-num" style={{ color:'#818cf8' }}>{pct}%</div>
              <div className="v30-hc-stat-lbl">Jornada</div>
            </div>
          </div>

          {/* Progress bar */}
          <div className="v30-hc-progress">
            <div className="v30-hc-progress-fill" style={{ width:`${pct}%` }}/>
          </div>
          <div className="v30-hc-progress-labels">
            <span>{o?.centro || 'Sin obra asignada'}</span>
            {timer.state !== 'idle' && extraMin > 0 && (
              <span style={{ color:'#34d399', fontWeight:600 }}>
                +{Math.floor(extraMin/60)}h {p2(extraMin%60)}m extra
              </span>
            )}
          </div>

        </div>

        {/* Stats grid */}
        <div className="stat-mini-grid">
          {[
            { lbl: 'Entrada', val: entradaRec ? ftime(entradaRec.inicio) : '- -:- -', color: 'var(--primary-light)', bg: 'rgba(59,91,255,.12)' },
            { lbl: 'Salida',  val: o ? '- -:- -' : salidaRec ? ftime(salidaRec.fin) : '- -:- -', color: 'var(--green)', bg: 'var(--green-dim)' },
            { lbl: 'Pausa',   val: brkMin > 0 ? `${Math.floor(brkMin / 60).toString().padStart(2, '0')}:${p2(brkMin % 60)}` : '00:00', color: 'var(--orange)', bg: 'var(--orange-dim)' },
            { lbl: 'Total',   val: totMin > 0 ? `${Math.floor(totMin / 60)}h ${p2(totMin % 60)}m` : '0h 00m', color: 'var(--secondary)', bg: 'rgba(6,182,212,.1)' },
          ].map(({ lbl, val, color, bg }) => (
            <div key={lbl} className="stat-card-premium v3-stat-card" style={{ textAlign: 'center' }}>
              <div className="stat-lbl v3-stat-label">{lbl}</div>
              <div className="stat-val v3-stat-value" style={{ color, fontSize: 14 }}>{val}</div>
            </div>
          ))}
        </div>

        {/* Weekly progress bar */}
        <div className="v30-prog-block">
          <div className="v30-prog-row">
            <div className="v30-prog-label">Semana</div>
            <div className={`v30-prog-val${weekPct >= 100 ? ' green' : ''}`}>{mhm(weekMin)} / 40h</div>
          </div>
          <div className="v30-prog-track">
            <div className={`v30-prog-fill${weekPct >= 100 ? ' green' : ''}`} style={{ width:`${Math.min(weekPct, 100)}%` }} />
          </div>
          <div className="v30-prog-footer">
            <span>Lun · {new Date(ws).toLocaleDateString('es-ES', { day:'numeric', month:'short' })}</span>
            <span style={{ color: weekPct >= 100 ? '#34d399' : undefined }}>{weekPct >= 100 ? '✓ 40h completadas' : `${100 - weekPct}% restante`}</span>
          </div>
        </div>

        {/* Monthly progress bar */}
        <div className="v30-prog-block">
          <div className="v30-prog-row">
            <div className="v30-prog-label">Este mes</div>
            <div className={`v30-prog-val${monthPct >= 100 ? ' green' : ''}`}>{mhm(monthMin)} / 160h</div>
          </div>
          <div className="v30-prog-track">
            <div className={`v30-prog-fill${monthPct >= 100 ? ' green' : monthDeficitMin > 0 ? ' orange' : ''}`} style={{ width:`${Math.min(monthPct, 100)}%` }} />
          </div>
          <div className="v30-prog-footer">
            <span>{now.toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</span>
            {monthExtraMin > 0 ? (
              <span style={{ color:'#34d399', fontWeight:700 }}>+{mhm(monthExtraMin)} extra</span>
            ) : monthDeficitMin > 0 ? (
              <span style={{ color:'#fbbf24' }}>−{mhm(monthDeficitMin)} déficit</span>
            ) : (
              <span style={{ color: monthPct >= 100 ? '#34d399' : undefined }}>{monthPct >= 100 ? '✓ 160h alcanzadas' : `${100 - monthPct}% restante`}</span>
            )}
          </div>
        </div>

        {/* ─── Streak + IA pattern row ─────────────────────────────────────────── */}
        <div className="v3-insights-row">

          {/* Racha de asistencia */}
          {streak > 0 && (
            <div className={`v3-streak-card${streak >= 7 ? ' hot' : ''}`}>
              <div className="v3-streak-fire">{streak >= 30 ? '🌟' : streak >= 7 ? '🔥' : '✅'}</div>
              <div className="v3-streak-body">
                <div className="v3-streak-count">{streak} <span>día{streak !== 1 ? 's' : ''}</span></div>
                <div className="v3-streak-label">racha activa</div>
                {streakNext && <div className="v3-streak-next">{streakNext}</div>}
              </div>
            </div>
          )}

          {/* IA horaria offline — predicción de entrada */}
          {workPattern && (
            <div className="v3-pattern-card">
              <div className="v3-pattern-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div className="v3-pattern-body">
                <div className="v3-pattern-title">Tu horario habitual</div>
                <div className="v3-pattern-range">{workPattern.earlyStr} – {workPattern.lateStr}</div>
                {(() => {
                  if (!entradaRec) return <div className="v3-pattern-sub">basado en {workPattern.sampleSize} días</div>
                  const d = new Date(entradaRec.inicio)
                  const entMin = d.getHours() * 60 + d.getMinutes()
                  const diff = entMin - workPattern.avgMin
                  const abs = Math.abs(diff)
                  if (abs < 6) return <div className="v3-pattern-sub" style={{ color:'var(--green)' }}>✓ Llegaste a tu hora habitual</div>
                  const fm = m => `${Math.floor(m / 60)}h ${m % 60 ? (m % 60) + 'min' : ''}`.trim()
                  return (
                    <div className="v3-pattern-sub" style={{ color: diff < 0 ? 'var(--green)' : 'var(--orange)' }}>
                      {diff < 0 ? `⚡ ${fm(abs)} antes de lo habitual` : `+${fm(abs)} más tarde de lo habitual`}
                    </div>
                  )
                })()}
              </div>
            </div>
          )}

        </div>

        {/* Biometric offer bottom sheet */}
        {bioOfferVisible && (
          <div className="v3-bio-offer">
            <div className="v3-bio-offer-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" width="28" height="28"><path d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 0 0 8 11a4 4 0 1 1 8 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0 0 15.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 0 0 8 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"/></svg>
            </div>
            <div className="v3-bio-offer-text">
              <div className="v3-bio-offer-title">Activa el acceso rápido</div>
              <div className="v3-bio-offer-sub">Entra con tu huella o Face ID la próxima vez, sin introducir el PIN.</div>
            </div>
            <div className="v3-bio-offer-actions">
              <button className="v3-bio-offer-btn primary" disabled={bioOfferLoading}
                onClick={async () => {
                  setBioOfferLoading(true)
                  try {
                    await registerBiometric(u.id, u.name)
                    setBioOfferVisible(false)
                    dismissBioOffer(u.id)
                    toast('¡Huella registrada! Ya puedes entrar sin PIN 🔓')
                  } catch {
                    toast('No se pudo registrar. Inténtalo desde la pantalla de login.')
                    setBioOfferVisible(false)
                    dismissBioOffer(u.id)
                  }
                  setBioOfferLoading(false)
                }}>
                {bioOfferLoading ? 'Registrando…' : 'Activar'}
              </button>
              <button className="v3-bio-offer-btn secondary"
                onClick={() => { setBioOfferVisible(false); dismissBioOffer(u.id) }}>
                Ahora no
              </button>
            </div>
          </div>
        )}


        {/* Documentos pendientes de firma */}
        {pendingDocs.length > 0 && (
          <div onClick={() => openModal('documentos')} style={{ margin:'-4px 16px 0', padding:'12px 14px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.3)', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', WebkitTapHighlightColor:'transparent' }}>
            <span style={{ fontSize:20, flexShrink:0 }}>📄</span>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--orange)' }}>
                {pendingDocs.length === 1 ? 'Tienes 1 documento pendiente' : `Tienes ${pendingDocs.length} documentos pendientes`} de firma
              </div>
              <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>Toca para revisarlos y firmar</div>
            </div>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="var(--orange)" strokeWidth="2.5" style={{ flexShrink:0 }}><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        )}

        {/* Auto-close warning banner */}
        {showAutoCloseWarning && (
          <div className="v3-autoclose-warn">
            <span className="v3-autoclose-warn-icon">⚠️</span>
            <div className="v3-autoclose-warn-text">
              <div className="v3-autoclose-warn-title">Jornada cerrada automáticamente</div>
              <div className="v3-autoclose-warn-sub">
                Tu jornada del {new Date(lastAutoClosed.inicio).toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' })} fue cerrada automáticamente por inactividad ({mhm(Math.floor((lastAutoClosed.workSecs||0)/60))}).
              </div>
            </div>
            <button className="v3-autoclose-warn-close" onClick={() => setAutoCloseDismissed(true)}>×</button>
          </div>
        )}

        {/* GPS card */}
        {o && (
          <div className={`gps-card${gpsStatus === 'pending' ? ' capturing' : ''}${o.geoAlert ? ' geo-alert' : ''}`}>
            <div className="gps-ico">
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" /></svg>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div className="gps-name">{o.centro || u.centroTrabajo || 'Sin centro'}</div>
              <div className={`gps-status${gpsStatus === 'pending' ? ' pending' : gpsStatus === 'fail' ? ' fail' : ''}`}>
                {o?.locInicio ? '✓ GPS verificado'
                  : gpsStatus === 'pending' ? 'Capturando ubicación…'
                  : gpsStatus === 'fail' ? '⚠ Sin GPS — ubicación no registrada'
                  : 'Sin GPS'}
              </div>
              {o.geoAlert && (
                <div className="gps-alert-tag">⚠ Fuera de zona · +{o.geoAlert.dist}m del radio ({o.geoAlert.radio}m)</div>
              )}
            </div>
          </div>
        )}

        {/* Mi equipo — solo para encargados y jefes de obra */}
        {teamData && (() => {
          const { teamEmps, liveIds, doneIds, minByEmp } = teamData
          const liveCount = teamEmps.filter(e => liveIds.has(e.id)).length
          const recs = db.records || []

          const teamStartJornada = (e) => {
            if (liveIds.has(e.id)) { toast('Ya tiene jornada abierta', 2500, 'warn'); return }
            const newRec = { id: gid(), empId: e.id, empName: e.name, inicio: new Date().toISOString(), fin: null, centro: e.centroTrabajo || '', breaks: [], workSecs: 0, creadoPor: u.name }
            saveDB(freshDb => ({ records: [...(freshDb.records || []), newRec] }))
            queuePush(e.id, '▶ Jornada iniciada', `${u.name} ha iniciado tu jornada laboral.`, 'jornada', '/?tab=inicio')
            toast('Jornada iniciada', 2500, 'ok')
          }

          const teamToggleDescanso = (rec) => {
            const now = new Date().toISOString()
            let updated
            if (rec.enDescanso) {
              const breaks = [...(rec.breaks || []), { start: rec.bStartTs, end: now }]
              updated = { ...rec, enDescanso: false, bStartTs: null, breaks, breakSecs: calcSecs({ ...rec, enDescanso: false, breaks }).brk }
              queuePush(rec.empId, '▶ Descanso finalizado', `${u.name} ha reanudado tu jornada.`, 'jornada', '/?tab=inicio')
              toast('Jornada reanudada', 2500, 'ok')
            } else {
              updated = { ...rec, enDescanso: true, bStartTs: now }
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
            const closed = { ...rec, fin: now, breaks, enDescanso: false, bStartTs: null, closed: true }
            const t = calcSecs(closed); closed.workSecs = t.work; closed.breakSecs = t.brk
            saveDB(freshDb => ({ records: (freshDb.records || []).map(r => r.id === rec.id ? closed : r) }))
            queuePush(rec.empId, '⏹ Jornada finalizada', `${u.name} ha finalizado tu jornada (${mhm(Math.floor(t.work/60))}).`, 'jornada', '/?tab=jornada')
            toast('Jornada finalizada', 2500, 'ok')
          }

          return (
            <div style={{ padding:'0 16px 12px' }}>
              <div className="sec-label" style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <span style={{ display:'flex', alignItems:'center', gap:6 }}>
                  Mi equipo hoy
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:10, background:'var(--green-dim)', color:'var(--green)', border:'1px solid rgba(16,185,129,.2)', textTransform:'none', letterSpacing:0 }}>
                    {liveCount} activo{liveCount !== 1 ? 's' : ''}
                  </span>
                </span>
                <button onClick={() => setShowParteVoz(true)} style={{ fontSize:10, fontWeight:700, color:'#EF4444', background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', borderRadius:20, padding:'4px 10px', cursor:'pointer', display:'flex', alignItems:'center', gap:4, textTransform:'none', letterSpacing:0 }}>
                  🎙️ Parte de trabajo
                </button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {teamEmps.map(e => {
                  const isWorking = liveIds.has(e.id)
                  const isDone    = !isWorking && doneIds.has(e.id)
                  const openRec2  = isWorking ? recs.find(r => r.empId === e.id && !r.fin) : null
                  const totalMin  = isDone ? (minByEmp[e.id] || 0) : 0
                  const dotColor  = isWorking ? 'var(--green)' : isDone ? 'var(--primary-light)' : 'var(--text4)'
                  const statusTxt = isWorking
                    ? (openRec2?.enDescanso ? `En descanso desde ${ftime(openRec2?.bStartTs || openRec2?.inicio)}` : `Activo desde ${ftime(openRec2?.inicio)}`)
                    : isDone ? `${mhm(totalMin)} · Finalizado`
                    : 'Sin fichar hoy'
                  return (
                    <div key={e.id} className={`v3-team-card${isWorking ? (openRec2?.enDescanso ? ' paused' : ' working') : ''}`}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:dotColor, flexShrink:0, boxShadow: isWorking ? `0 0 7px ${dotColor}` : 'none' }} />
                        <div style={{ width:32, height:32, borderRadius:9, background: e.color || 'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'#fff', flexShrink:0 }}>
                          {e.initials || e.name.slice(0,2).toUpperCase()}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]} {e.name.split(' ')[1] || ''}</div>
                          <div style={{ fontSize:10, color: isWorking ? (openRec2?.enDescanso ? 'var(--orange)' : 'var(--green)') : isDone ? 'var(--text3)' : 'var(--text4)', marginTop:1 }}>{statusTxt}</div>
                        </div>
                      </div>
                      {/* Botones de control — solo si saveDB disponible */}
                      {saveDB && (
                        isWorking ? (
                          <div className="v3-team-card-actions">
                            <button onClick={() => teamToggleDescanso(openRec2)} className="v3-team-btn">
                              {openRec2?.enDescanso ? '▶ Reanudar' : '⏸ Pausa'}
                            </button>
                            <button onClick={() => teamForceClose(openRec2)} className="v3-team-btn danger">
                              ■ Finalizar
                            </button>
                          </div>
                        ) : !isDone ? (
                          <div className="v3-team-card-actions">
                            <button onClick={() => teamStartJornada(e)} className="v3-team-btn primary" style={{ flex:'none', width:'100%' }}>
                              ▶ Iniciar jornada
                            </button>
                          </div>
                        ) : null
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })()}

      </div>
      <ModalParteVoz visible={showParteVoz} db={db} autor={u.name} saveDB={saveDB} toast={toast} onClose={() => setShowParteVoz(false)} />
    </PullToRefresh>
  )
}
