import { useAppStore } from '../../store/appStore.js'
import { today, fds } from '../../utils/time.js'
import { PullToRefresh } from './PullToRefresh.jsx'

export function TabVacaciones({ db, u, vac, toast, saveDB }) {
  const { openModal, showConfirm } = useAppStore()
  const myVacs = (db.vacaciones || []).filter(v => v.empId === u.id).sort((a,b) => new Date(b.fechaInicio || 0) - new Date(a.fechaInicio || 0))

  const cancelVac = (id) => {
    showConfirm('¿Cancelar esta solicitud de vacaciones?', () => {
      saveDB({ vacaciones: (db.vacaciones || []).filter(v => v.id !== id || v.estado !== 'pendiente') })
      toast('Solicitud cancelada', 3000, 'warn')
    })
  }

  const downloadVacICS = (v) => {
    const dtFin = new Date(v.fechaFin + 'T00:00:00')
    dtFin.setDate(dtFin.getDate() + 1)
    const ics = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TIMES INC//ES', 'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:vac-${v.id}@times-inc`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${v.fechaInicio.replace(/-/g,'')}`,
      `DTEND;VALUE=DATE:${dtFin.toISOString().slice(0,10).replace(/-/g,'')}`,
      `SUMMARY:Vacaciones ${u.name.split(' ')[0]}`,
      `DESCRIPTION:${v.dias} días de vacaciones aprobadas`,
      'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Vacaciones mañana', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `vacaciones-${v.fechaInicio}.ics`; a.click()
    URL.revokeObjectURL(url)
    toast('Archivo .ics descargado — ábrelo para añadir al calendario', 3000, 'ok')
  }
  const pct = vac.generated > 0 ? Math.round((vac.used / vac.generated) * 100) : 0
  const todayVacStr = today()
  const daysFrom = (ds) => Math.ceil((new Date(ds + 'T00:00:00') - new Date(todayVacStr + 'T00:00:00')) / 86400000)

  return (
    <PullToRefresh>
      <div className="vac-wrap2">
        <div className="vac-hero" style={{ paddingTop:16 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(255,255,255,.15)', border:'1px solid rgba(255,255,255,.2)', borderRadius:20, padding:'5px 12px', fontSize:11, fontWeight:700, color:'rgba(255,255,255,.9)', letterSpacing:'.4px', textTransform:'uppercase', marginBottom:8, width:'fit-content' }}>
            Mis Vacaciones
          </div>
          <div className="vac-hero-title">
            <span style={{ fontSize:42, fontWeight:900, letterSpacing:'-2px' }}>{vac.available}</span>
            <span style={{ fontSize:16, fontWeight:600, opacity:.8, marginLeft:6 }}>días disponibles</span>
          </div>
          <div className="vac-hero-sub">{vac.generated} generados · {vac.used} disfrutados · {vac.pending} pendientes</div>
        </div>

        <div className="vac-stats-row">
          {[
            { val: vac.available, lbl:'Disponibles', color:'var(--primary-light)' },
            { val: vac.used,      lbl:'Disfrutadas', color:'var(--green)' },
            { val: vac.pending,   lbl:'Pendientes',  color:'var(--orange)' },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} className="vac-stat">
              <div className="vac-stat-val" style={{ color }}>{val}</div>
              <div className="vac-stat-lbl">{lbl}</div>
            </div>
          ))}
        </div>

        <div className="vac-body">
          <div style={{ background:'var(--bg-600)', border:'1px solid var(--border)', borderRadius:'var(--r)', padding:16 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <span style={{ fontSize:13, fontWeight:700 }}>Progreso anual</span>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--primary-light)', background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', padding:'2px 8px', borderRadius:12 }}>{vac.used} / {vac.generated} días</span>
            </div>
            <div style={{ height:8, background:'var(--bg-400)', borderRadius:4, overflow:'hidden', marginBottom:8 }}>
              <div style={{ height:'100%', borderRadius:4, background:'linear-gradient(90deg,#7c3aed,var(--primary))', width: pct + '%', transition:'width .6s ease' }} />
            </div>
            <div style={{ fontSize:11, color:'var(--text3)' }}>Generadas según antigüedad · {vac.months} meses</div>
          </div>

          {vac.pending > 0 && (
            <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)', marginBottom:4 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--orange)' }}>
                  {vac.pending} día{vac.pending !== 1 ? 's' : ''} pendiente{vac.pending !== 1 ? 's' : ''} de aprobación
                </div>
                <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                  No contabilizados como disponibles hasta que el admin apruebe
                </div>
              </div>
            </div>
          )}

          <button className="vac-cta" onClick={() => openModal('vacForm')}>
            <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            Solicitar vacaciones
          </button>

          {myVacs.length > 0 ? (
            <>
              <div className="section-header">Mis solicitudes</div>
              <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {myVacs.map(v => (
                  <div key={v.id} className="vac-list-item card-lift">
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{fds(v.fechaInicio)} → {fds(v.fechaFin)}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>{v.dias} días · {v.motivo || 'Vacaciones'}</div>
                      {v.estado === 'rechazada' && v.motivoRechazo && (
                        <div style={{ fontSize:11, color:'var(--danger)', marginTop:3, fontStyle:'italic' }}>Motivo: {v.motivoRechazo}</div>
                      )}
                      {v.estado === 'aprobada' && (() => {
                        const until = daysFrom(v.fechaInicio), remaining = daysFrom(v.fechaFin)
                        if (until > 0) return <div style={{ fontSize:10, fontWeight:700, color:'var(--primary-light)', marginTop:3 }}>🗓 En {until} día{until>1?'s':''}</div>
                        if (remaining >= 0) return <div style={{ fontSize:10, fontWeight:700, color:'var(--green)', marginTop:3 }}>🌴 ¡Disfrutando! {remaining} día{remaining!==1?'s':''} restante{remaining!==1?'s':''}</div>
                        return null
                      })()}
                    </div>
                    <div className={`badge${v.estado==='aprobada' ? ' badge-green' : v.estado==='rechazada' ? ' badge-red' : ' badge-orange'}`}>
                      {v.estado === 'aprobada' ? '✓ Aprobada' : v.estado === 'rechazada' ? '✗ Rechazada' : '⏳ Pendiente'}
                    </div>
                    {v.estado === 'aprobada' && (
                      <button onClick={() => downloadVacICS(v)} title="Añadir al calendario"
                        style={{ background:'var(--primary-dim)', border:'1px solid var(--primary-glow)', cursor:'pointer', color:'var(--primary-light)', padding:'4px 7px', borderRadius:6, fontSize:13, lineHeight:1, fontFamily:'inherit' }}>
                        📅
                      </button>
                    )}
                    {v.estado === 'pendiente' && (
                      <button onClick={() => cancelVac(v.id)} title="Cancelar solicitud"
                        style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text4)', padding:'4px 6px', borderRadius:6, fontSize:14, lineHeight:1, transition:'color .15s', fontFamily:'inherit' }}
                        onMouseEnter={e => e.currentTarget.style.color='var(--red)'}
                        onMouseLeave={e => e.currentTarget.style.color='var(--text4)'}>
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-premium">
              <div className="empty-premium-icon">
                <svg viewBox="0 0 24 24"><path d="M12 3c0 0 4 4 4 8s-4 8-4 8"/><path d="M12 3c0 0-4 4-4 8s4 8 4 8"/><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/></svg>
              </div>
              <div className="empty-premium-title">Sin solicitudes</div>
              <div className="empty-premium-sub">Pulsa el botón de arriba para solicitar tus vacaciones</div>
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  )
}
