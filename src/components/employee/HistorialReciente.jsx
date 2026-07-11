import { useState } from 'react'
import { calcMin, ftime, recWorkSecs, mhm } from '../../utils/time.js'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

export function HistorialReciente({ histWithRecs, openModal, u }) {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(7)

  const shown = histWithRecs.slice(0, visible)
  const hasMore = visible < histWithRecs.length

  return (
    <div style={{ padding:'0 16px 12px' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', width:'100%', background:colors.bg[600], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl, padding:'10px 14px', cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent', transition:'background .15s' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ fontSize:14 }}>📅</span>
          <span style={{ fontSize:12, fontWeight:700, color:colors.text[700] }}>Historial reciente</span>
          <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:10, background:colors.primary.dim, color:colors.primary.light }}>{histWithRecs.length} días</span>
        </div>
        <span style={{ fontSize:14, color:colors.text[500], transition:'transform .2s', transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && (
        <div style={{ marginTop:8, display:'flex', flexDirection:'column', gap:6 }}>
          {shown.map(({ ds, recs }) => {
            const totalMin = recs.reduce((s, r) => s + calcMin(r), 0)
            const label = new Date(ds + 'T12:00:00').toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'short' })
            const isUnder = totalMin > 0 && totalMin < 480
            return (
              <div key={ds} style={{ background:colors.bg[700], border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl, padding:'10px 14px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                  <div style={{ fontSize:12, fontWeight:700, textTransform:'capitalize', color:colors.text[900] }}>{label}</div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    {isUnder && <span style={{ fontSize:9, fontWeight:700, color:colors.semantic.orange, background:`${colors.semantic.orange}12`, padding:'1px 5px', borderRadius:6 }}>↓ objetivo</span>}
                    <div style={{ fontSize:13, fontWeight:800, color: totalMin >= 480 ? colors.semantic.green : colors.primary.light, fontVariantNumeric:'tabular-nums' }}>{mhm(totalMin)}</div>
                  </div>
                </div>
                {recs.map(r => {
                  const wm = Math.floor(recWorkSecs(r) / 60)
                  return (
                    <div key={r.id} style={{ paddingTop:4, borderTop:`1px solid ${colors.border.subtle}` }}>
                      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:11, color:colors.text[500], gap:8, flexWrap:'wrap' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                          <span>{ftime(r.inicio)} → {r.fin ? ftime(r.fin) : '—'}</span>
                          {!r.aceptada && <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:`${colors.semantic.orange}12`, color:colors.semantic.orange, border:`1px solid ${colors.semantic.orange}30`, textTransform:'uppercase', letterSpacing:'.3px' }}>⏳ Por validar</span>}
                          {r.aceptada  && <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:8, background:`${colors.semantic.green}12`, color:colors.semantic.green, border:`1px solid ${colors.semantic.green}30`, textTransform:'uppercase', letterSpacing:'.3px' }}>✓ Validada</span>}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontWeight:600 }}>{mhm(wm)}</span>
                          <button
                            onClick={() => openModal('correccion', { rec: r, empName: u?.name })}
                            title="Solicitar corrección"
                            style={{ background:colors.bg[500], border:`1px solid ${colors.border.default}`, borderRadius:6, padding:'2px 7px', cursor:'pointer', fontSize:10, color:colors.text[500], fontFamily:'inherit', lineHeight:1.5 }}>
                            ✏️
                          </button>
                        </div>
                      </div>
                      {r.correcciones?.length > 0 && (
                        <div style={{ marginTop:5, display:'flex', flexDirection:'column', gap:3 }}>
                          {r.correcciones.map((c, ci) => (
                            <div key={ci} style={{ fontSize:10, color:colors.text[300], display:'flex', gap:5, alignItems:'flex-start', padding:'3px 6px', background:colors.bg[500], borderRadius:6, border:`1px solid ${colors.border.subtle}` }}>
                              <span style={{ flexShrink:0 }}>✏️</span>
                              <span>
                                <strong style={{ color:colors.text[500] }}>{c.por || 'Admin'}</strong>
                                {c.antes && c.despues ? <> cambió de <em>{c.antes}</em> a <em>{c.despues}</em></> : ' modificó este fichaje'}
                                {c.motivo ? <> — <em style={{ color:colors.text[500] }}>"{c.motivo}"</em></> : null}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {hasMore && (
            <button onClick={() => setVisible(v => v + 7)}
              style={{ background:'none', border:`1px solid ${colors.border.subtle}`, borderRadius:radius.xl, padding:'9px', cursor:'pointer', fontSize:12, color:colors.text[500], fontFamily:'inherit', fontWeight:600, transition:'background .15s' }}>
              Ver {Math.min(7, histWithRecs.length - visible)} días más…
            </button>
          )}
        </div>
      )}
    </div>
  )
}
