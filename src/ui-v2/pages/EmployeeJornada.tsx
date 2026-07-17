// Página "Jornada" (estadísticas + exportación PDF) — versión ui-v2, puramente
// presentacional. Los datos y la lógica de PDF vienen de useJornadaData /
// useJornadaPdfExport (misma lógica que TabJornada.jsx legacy, relocalizada).
import { today, mhm, ftime, s2t, recWorkSecs, p2 } from '../../utils/time.js'
import { WK } from '../../config/constants.js'
import { PomodoroWidget } from '../../components/employee/PomodoroWidget.jsx'
import { WeeklyBars } from '../../components/employee/WeeklyBars.jsx'
import { HistorialReciente } from '../../components/employee/HistorialReciente.jsx'
import { PullToRefresh } from '../../components/employee/PullToRefresh.jsx'
import { colors, radius, toneSoft } from '../design-system/employeeTokens.js'


function PdfBtn({ onClick, loading, label }: { onClick: () => void; loading: boolean; label: string }) {
  return (
    <button type="button" onClick={onClick} disabled={loading} style={{
      flex: 1, minHeight: 44, padding: '10px', borderRadius: radius.md,
      border: `1px solid ${colors.border.default}`, background: colors.bg[500],
      color: colors.text[700], fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      opacity: loading ? 0.7 : 1,
    }}>
      {loading ? 'Generando…' : label}
    </button>
  )
}

export interface EmployeeJornadaProps {
  db: any; u: any; timer: any
  stats: {
    o: any; totMin: number; brkMin: number; monthMin: number
    weekMin: number; extraMin: number; normMin: number; wdEfectivo: number
    tlItems: Array<{ r: any; isCurrent: boolean }>
    histWithRecs: Array<{ ds: string; recs: any[] }>
    pendingValidation: number
  }
  pdf: {
    informeUrl: string | null; informeBlob: Blob | null; informeHash: string | null; closeInforme: () => void
    generatingPdf: boolean; generatingWeekPdf: boolean; generatingRangePdf: boolean
    showRangeExport: boolean; setShowRangeExport: (v: boolean | ((prev: boolean) => boolean)) => void
    exportFrom: string; setExportFrom: (v: string) => void
    exportTo: string; setExportTo: (v: string) => void
    exportWeekPDF: () => void; exportMonthPDF: () => void; exportRangePDF: () => void
  }
  openModal: (name: string, data?: any) => void
}

export function EmployeeJornada({ db, u, timer, stats, pdf, openModal }: EmployeeJornadaProps) {
  const { o, totMin, brkMin, monthMin, weekMin, extraMin, normMin, wdEfectivo, tlItems, histWithRecs, pendingValidation } = stats
  const now = new Date()

  if (!db.records) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[80, 200, 140].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
      ))}
    </div>
  )

  return (
    <>
      <PullToRefresh>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: 520, margin: '0 auto', padding: 'var(--space-4)', paddingBottom: 'calc(100px + env(safe-area-inset-bottom))' }}>

          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-2) 2px var(--space-1)' }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 'var(--font-heading-xl)', fontWeight: 'var(--font-semibold)', color: colors.text[900], letterSpacing: '-.035em', lineHeight: 'var(--leading-heading)' }}>Mi jornada</h1>
              <div style={{ fontSize: 13, color: colors.text[500], marginTop: 5, textTransform: 'capitalize' }}>
                {now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
            {o ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
                padding: '5px 12px', borderRadius: radius.pill,
                background: 'var(--success-soft)', border: `1px solid ${toneSoft(colors.semantic.green, 28)}`,
                fontSize: 11, fontWeight: 700, color: colors.semantic.green,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: colors.semantic.green, display: 'inline-block', boxShadow: `0 0 8px ${colors.semantic.green}` }} />
                En curso
              </div>
            ) : (
              <div style={{
                padding: '5px 12px', borderRadius: radius.pill, marginTop: 4,
                background: colors.bg[400], border: `1px solid ${colors.border.default}`,
                fontSize: 10, fontWeight: 700, color: colors.text[500],
                textTransform: 'uppercase', letterSpacing: '.5px',
              }}>Hoy</div>
            )}
          </header>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
            {[
              {
                val: mhm(Math.floor(weekMin)), lbl: 'Semana', suffix: weekMin > WK ? ' ↑' : '',
                accent: weekMin > WK ? colors.semantic.orange : colors.primary.base,
                color: weekMin > WK ? colors.semantic.orange : colors.primary.light,
                borderCol: weekMin > WK ? toneSoft(colors.semantic.orange, 26) : colors.border.subtle,
                icon: (c: string) => (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
                  </svg>
                ),
              },
              {
                val: mhm(normMin), lbl: 'Normal', suffix: '',
                accent: colors.semantic.green, color: colors.semantic.green,
                borderCol: toneSoft(colors.semantic.green, 20),
                icon: (c: string) => (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ),
              },
              {
                val: mhm(extraMin), lbl: 'Extra', suffix: '',
                accent: extraMin > 0 ? colors.kpiTone.amber.base : colors.border.default,
                color: extraMin > 0 ? colors.kpiTone.amber.base : colors.text[500],
                borderCol: extraMin > 0 ? toneSoft(colors.kpiTone.amber.base, 22) : colors.border.subtle,
                icon: (c: string) => (
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
            ].map(({ val, lbl, suffix, accent, color, borderCol, icon }) => (
              <div key={lbl} style={{
                background: 'var(--gradient-card), var(--bg-card)', border: `1px solid ${borderCol}`,
                borderRadius: radius.xl, padding: '14px 10px 12px',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                overflow: 'hidden', position: 'relative',
              }}>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: accent, borderRadius: '12px 12px 0 0' }} />
                <div style={{ marginBottom: 2, opacity: 0.9 }}>{icon(color)}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums', lineHeight: 1, letterSpacing: '-1px' }}>{val}</div>
                <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: colors.text[300], textAlign: 'center' }}>{lbl}{suffix}</div>
              </div>
            ))}
          </div>

          <div style={{
            background: `linear-gradient(150deg, ${toneSoft(colors.primary.base, 12)} 0%, var(--bg-card) 58%)`,
            border: `1px solid ${o ? toneSoft(colors.primary.base, 34) : colors.border.subtle}`,
            borderRadius: radius['2xl'], padding: '20px 20px 16px',
            boxShadow: o ? 'var(--shadow-brand)' : 'var(--shadow-sm)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--gradient-brand)', borderRadius: '16px 16px 0 0' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: colors.text[500], fontWeight: 660, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                Total trabajado hoy
              </div>
              <div style={{
                fontSize: 11, fontWeight: 700, color: colors.primary.light,
                background: colors.primary.dim, border: `1px solid ${colors.primary.glow}`,
                padding: '2px 10px', borderRadius: radius.pill,
              }}>
                {Math.round(totMin / (wdEfectivo || 480) * 100)}%
              </div>
            </div>
            <div style={{ fontSize: 'clamp(38px, 12vw, 48px)', fontWeight: 'var(--font-bold)', letterSpacing: '-.045em', color: colors.text[900], fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 16 }}>
              {mhm(totMin)}
            </div>
            <WeeklyBars db={db} u={u} timer={timer} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${colors.border.subtle}`, marginTop: 12 }}>
              {[
                { lbl: 'Descansos hoy', val: mhm(brkMin), color: colors.kpiTone.amber.base },
                { lbl: 'Mes actual', val: mhm(monthMin), color: colors.secondary.base },
              ].map(({ lbl, val, color }) => (
                <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: colors.text[500], fontWeight: 500 }}>{lbl}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <PdfBtn onClick={pdf.exportWeekPDF} loading={pdf.generatingWeekPdf} label="Semanal" />
            <PdfBtn onClick={pdf.exportMonthPDF} loading={pdf.generatingPdf} label="PDF firmado" />
            <button type="button" aria-expanded={pdf.showRangeExport} onClick={() => pdf.setShowRangeExport(v => !v)} style={{
              minHeight: 44, padding: '10px 14px', borderRadius: radius.md,
              border: `1px solid ${pdf.showRangeExport ? colors.primary.base : colors.border.default}`,
              background: pdf.showRangeExport ? colors.primary.dim : colors.bg[500],
              color: pdf.showRangeExport ? colors.primary.light : colors.text[700],
              fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
            }}>Rango</button>
          </div>

          {pdf.showRangeExport && (
            <div style={{
              padding: 16, background: colors.bg[500], borderRadius: radius.xl,
              border: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 12,
            }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: colors.text[700] }}>Exportar por rango de fechas</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                {([['Desde', pdf.exportFrom, pdf.setExportFrom], ['Hasta', pdf.exportTo, pdf.setExportTo]] as const).map(([lbl, val, set]) => (
                  <div key={lbl} style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
                    <label style={{ fontSize: 10, color: colors.text[500], fontWeight: 600 }}>{lbl}</label>
                    <input type="date" value={val} onChange={e => set(e.target.value)} style={{
                      fontSize: 12, padding: '8px 10px', borderRadius: radius.sm,
                      border: `1px solid ${colors.border.default}`, background: colors.bg[600],
                      color: colors.text[900], outline: 'none', fontFamily: 'inherit',
                    }} />
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => pdf.setShowRangeExport(false)} style={{
                  padding: '8px 14px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
                  background: 'transparent', color: colors.text[500], fontSize: 12, fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}>Cancelar</button>
                <button type="button" onClick={pdf.exportRangePDF} disabled={pdf.generatingRangePdf} style={{
                  padding: '8px 16px', borderRadius: radius.md, border: 'none',
                  background: colors.primary.base, color: '#fff', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit', opacity: pdf.generatingRangePdf ? .7 : 1,
                  boxShadow: `0 4px 14px ${colors.primary.glow}`,
                }}>
                  {pdf.generatingRangePdf ? 'Generando…' : 'Exportar PDF'}
                </button>
              </div>
            </div>
          )}

          {o && <PomodoroWidget />}

          <div style={{
            background: colors.bg[600], border: `1px solid ${colors.border.subtle}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 18px 10px', fontSize: 12, fontWeight: 660, color: colors.text[700], textTransform: 'uppercase', letterSpacing: '.5px' }}>
              Actividad de hoy
            </div>
            {!tlItems.length ? (
              <div style={{ padding: '28px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', background: colors.bg[400],
                  display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px',
                }}>
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke={colors.text[500]} strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: colors.text[700], marginBottom: 4 }}>Sin actividad hoy</div>
                <div style={{ fontSize: 11, color: colors.text[500] }}>Inicia tu jornada desde Inicio para ver la actividad aquí</div>
              </div>
            ) : (
              <div style={{ padding: '4px 18px 14px', position: 'relative', paddingLeft: 48 }}>
                <div style={{ position: 'absolute', left: 30, top: 4, bottom: 14, width: 1, background: colors.border.subtle }} />
                {tlItems.map(({ r, isCurrent }) => {
                  const ws2 = isCurrent ? timer.ws : recWorkSecs(r)
                  const bk = isCurrent ? timer.bs : (r.breakSecs || 0)
                  const dotColor = isCurrent ? colors.semantic.green : r.fin ? colors.primary.light : colors.semantic.orange
                  const icon = isCurrent
                    ? <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="m8 5 11 7-11 7z" /></svg>
                    : r.fin
                      ? <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>
                      : <svg viewBox="0 0 24 24" width="10" height="10" fill="currentColor" aria-hidden="true"><path d="M7 5h3v14H7zM14 5h3v14h-3z" /></svg>
                  return (
                    <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: -18, top: 10,
                        width: 22, height: 22, borderRadius: '50%',
                        background: toneSoft(dotColor, 14), border: `1px solid ${toneSoft(dotColor, 28)}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: dotColor, fontWeight: 700, flexShrink: 0,
                      }}>{icon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>
                          {ftime(r.inicio)}{r.fin ? ` → ${ftime(r.fin)}` : ' → ahora'}
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[900], marginBottom: 2 }}>
                          {isCurrent ? 'En progreso' : 'Completado'}
                        </div>
                        <div style={{ fontSize: 11, color: colors.text[500] }}>
                          {r.centro || u.centroTrabajo || 'Sin centro'}{bk > 30 ? ` · Pausa: ${mhm(Math.floor(bk / 60))}` : ''}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: dotColor, fontVariantNumeric: 'tabular-nums',
                        background: toneSoft(dotColor, 10), padding: '3px 9px', borderRadius: radius.pill,
                        border: `1px solid ${toneSoft(dotColor, 22)}`, flexShrink: 0, marginTop: 6,
                      }}>
                        {isCurrent ? s2t(ws2) : mhm(Math.floor(ws2 / 60))}
                      </span>
                    </div>
                  )
                })}
                {o && (() => {
                  const estEnd = new Date(new Date(o.inicio).getTime() + wdEfectivo * 60000)
                  const estHH = p2(estEnd.getHours()), estMM = p2(estEnd.getMinutes())
                  return (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', position: 'relative', opacity: .4 }}>
                      <div style={{
                        position: 'absolute', left: -18, top: 10,
                        width: 22, height: 22, borderRadius: '50%',
                        background: colors.bg[400], border: `1px dashed ${colors.border.default}`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger-400)',
                      }}><svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M6 3v18M6 5h11l-2.5 4L17 13H6" /></svg></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 11, color: colors.text[500], fontVariantNumeric: 'tabular-nums', marginBottom: 2 }}>{estHH}:{estMM} est.</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: colors.text[700] }}>Salida estimada</div>
                        <div style={{ fontSize: 11, color: colors.text[500] }}>Según horario configurado</div>
                      </div>
                    </div>
                  )
                })()}
              </div>
            )}
          </div>

          {pendingValidation > 0 && (
            <div style={{
              padding: '12px 16px',
              background: 'var(--warning-soft)', border: `1px solid ${toneSoft(colors.semantic.orange, 28)}`,
              borderRadius: radius.lg, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: radius.sm, background: 'var(--warning-soft)', border: `1px solid ${toneSoft(colors.semantic.orange, 28)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.orange} strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: colors.semantic.orange }}>
                  {pendingValidation} jornada{pendingValidation !== 1 ? 's' : ''} pendiente{pendingValidation !== 1 ? 's' : ''} de validación
                </span>
                <span style={{ color: colors.text[500], marginLeft: 4 }}>por el encargado</span>
              </div>
            </div>
          )}

          {histWithRecs.length > 0 && <HistorialReciente histWithRecs={histWithRecs} openModal={openModal} u={u} />}

          <div style={{ height: 4 }} />
        </div>
      </PullToRefresh>

      {pdf.informeUrl && (() => {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
        const dlName = `jornada-${today().slice(0, 7)}.pdf`
        return (
          <div role="dialog" aria-modal="true" aria-label="Vista previa del registro de jornada" style={{ position: 'fixed', inset: 0, zIndex: 300, minHeight: '100dvh', background: colors.bg[800], display: 'flex', flexDirection: 'column', paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
              background: colors.bg[700], borderBottom: `1px solid ${colors.border.subtle}`, flexShrink: 0,
            }}>
              <button type="button" onClick={pdf.closeInforme} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: colors.bg[500], border: `1px solid ${colors.border.default}`,
                borderRadius: radius.pill, padding: '6px 14px', cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: colors.text[700],
              }}>← Volver</button>
              <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: colors.text[900] }}>Registro de jornada</span>
              <a href={pdf.informeUrl} download={dlName} style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: colors.primary.base, borderRadius: radius.pill,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff',
                textDecoration: 'none', boxShadow: `0 4px 14px ${colors.primary.glow}`,
              }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Descargar
              </a>
            </div>
            {isMobile ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 28 }}>
                <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke={colors.primary.light} strokeWidth="1.4">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text[700], textAlign: 'center', lineHeight: 1.6 }}>
                  Tu informe de jornada está listo.<br />Descárgalo o ábrelo en el navegador.
                </div>
                {pdf.informeHash && (
                  <div style={{
                    background: colors.bg[500], border: `1px solid ${colors.border.default}`,
                    borderRadius: radius.md, padding: '10px 14px', width: '100%', maxWidth: 320, boxSizing: 'border-box',
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: colors.text[300], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>SHA-256 integridad</div>
                    <div style={{ fontSize: 9.5, fontFamily: 'monospace', color: colors.text[700], wordBreak: 'break-all', lineHeight: 1.5 }}>{pdf.informeHash}</div>
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                  <a href={pdf.informeUrl} download={dlName} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: 13, background: colors.primary.base, color: '#fff',
                    borderRadius: radius.xl, fontWeight: 700, fontSize: 13, textDecoration: 'none',
                    boxShadow: `0 4px 16px ${colors.primary.glow}`,
                  }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Descargar PDF
                  </a>
                  {pdf.informeBlob && 'share' in navigator && (
                    <button
                      type="button"
                      onClick={() => (navigator as any).share({ files: [new File([pdf.informeBlob as Blob], dlName, { type: 'application/pdf' })], title: 'Registro de jornada' }).catch(() => {})}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        padding: 13, background: colors.bg[500], color: colors.text[700],
                        border: `1px solid ${colors.border.default}`, borderRadius: radius.xl,
                        fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                        <polyline points="16 6 12 2 8 6" /><line x1="12" y1="2" x2="12" y2="15" />
                      </svg>
                      Compartir
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <iframe src={pdf.informeUrl} title="Registro de jornada" style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
            )}
          </div>
        )
      })()}
    </>
  )
}
