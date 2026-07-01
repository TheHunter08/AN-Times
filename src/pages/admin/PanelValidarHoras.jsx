import { useState } from 'react'
import { mhm, p2, gid, calcMin } from '../../utils/time.js'
import { queuePush } from '../../services/dataService.js'
import { buildCierreIndividualPDF, buildCierreConsolidadoPDF } from '../../utils/cierrePdf.js'

const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

export default function PanelValidarHoras({ db, toast, saveDB, session }) {
  const now = new Date()
  const [selMonth, setSelMonth] = useState(`${now.getFullYear()}-${p2(now.getMonth()+1)}`)
  const [generandoPdf, setGenerandoPdf] = useState(null) // id del cierre en proceso, o 'consolidado'
  const empresa = db.config?.companyName || db.empresas?.[0] || 'TIMES INC'

  const joObras = session?.user?.obrasAsignadas || []
  const recs = db.records || []

  const WK = (db.config?.wkMin || 2400) / 60

  const emps = (db.employees || []).filter(e =>
    !e.baja && !e.isAdmin && e.obrasAsignadas?.some(o => joObras.includes(o))
  )

  const rows = emps.map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const days = new Set(eRecs.map(r => r.inicio?.slice(0, 10)).filter(Boolean)).size
    const weeklyH = e.horasSemanales || WK
    const expected = Math.round((weeklyH / 5) * days * 60)
    const diff = totalMin - expected
    return { e, totalMin, days, diff }
  })

  const generarCierreJO = (e, totalMin, days) => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes: selMonth,
      generadoPor: session?.user?.name || 'Jefe de Obra',
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    const mesLabel = new Date(selMonth+'-01').toLocaleDateString('es-ES',{month:'long',year:'numeric'})
    queuePush(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
  }

  const generarTodosJO = () => {
    const nuevos = []
    rows.forEach(({ e, totalMin, days }) => {
      if ((db.cierres||[]).find(c => c.empId === e.id && c.mes === selMonth)) return
      if (!days) return
      const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(selMonth))
      nuevos.push({
        id: gid(), empId: e.id, empName: e.name, mes: selMonth,
        generadoPor: session?.user?.name || 'Jefe de Obra',
        generadoAt: new Date().toISOString(),
        totalMin, dias: days, estado: 'pendiente', firma: null,
        records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
      })
    })
    if (!nuevos.length) { toast('Todos los empleados ya tienen cierre o sin registros'); return }
    saveDB({ cierres: [...(db.cierres||[]), ...nuevos] })
    nuevos.forEach(c => {
      const mesLabel = new Date(c.mes+'-01').toLocaleDateString('es-ES',{month:'long',year:'numeric'})
      queuePush(c.empId, '📋 Cierre mensual pendiente', `Tu resumen de ${mesLabel} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    })
    toast(`✅ ${nuevos.length} cierre${nuevos.length!==1?'s':''} generado${nuevos.length!==1?'s':''}`)
  }

  const downloadCierrePDF = async (cierre) => {
    const filename = `cierre-${cierre.mes}-${(cierre.empName||'').replace(/\s+/g,'_')}.pdf`
    if (cierre.pdfData) { downloadDataUrl(cierre.pdfData, filename); return }
    setGenerandoPdf(cierre.id)
    try {
      const { dataUrl } = await buildCierreIndividualPDF({ cierre, empresa })
      downloadDataUrl(dataUrl, filename)
    } catch (e) {
      toast('Error al generar el PDF: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const finalizarMes = async () => {
    const cierresMes = (db.cierres || []).filter(c => c.mes === selMonth && emps.some(e => e.id === c.empId))
    if (!cierresMes.length) { toast('No hay cierres generados para este mes'); return }
    setGenerandoPdf('consolidado')
    try {
      const { dataUrl } = await buildCierreConsolidadoPDF({ cierres: cierresMes, mes: selMonth, empresa })
      downloadDataUrl(dataUrl, `cierre-consolidado-${selMonth}.pdf`)
      toast('PDF consolidado generado', 3000, 'ok')
    } catch (e) {
      toast('Error al generar el PDF consolidado: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const pendientes = rows.filter(r => !(db.cierres||[]).find(c => c.empId===r.e.id && c.mes===selMonth) && r.days>0).length
  const mesLabel = new Date(selMonth+'-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })
  const firmados = (db.cierres||[]).filter(c => c.estado==='firmado' && emps.some(e => e.id===c.empId))

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Validar Horas</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{mesLabel}</div>
        </div>
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
        <input type="month" value={selMonth} onChange={e => setSelMonth(e.target.value)}
          style={{ width:'auto', padding:'7px 12px', fontSize:13, borderRadius:8 }} />
      </div>

      {!joObras.length ? (
        <div className="empty">No tienes obras asignadas. Contacta con el administrador.</div>
      ) : (
        <>
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:16, padding:'12px 14px', background:'var(--primary-dim)', borderRadius:'var(--r)', border:'1px solid var(--primary-glow)', lineHeight:1.6 }}>
            📋 <strong>Validar horas</strong> — Genera el cierre mensual y envíaselo a tus empleados para firma digital. Obras: <strong>{joObras.join(', ')}</strong>
          </div>

          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={generarTodosJO} disabled={!pendientes}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Enviar cierre a todos ({pendientes} pendientes)
            </button>
            <button className="btn btn-secondary" onClick={finalizarMes} disabled={generandoPdf === 'consolidado' || !(db.cierres||[]).some(c => c.mes===selMonth && emps.some(e=>e.id===c.empId))}>
              {generandoPdf === 'consolidado' ? 'Generando…' : '📄 Finalizar mes'}
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rows.map(({ e, totalMin, days, diff }) => {
              const cierre = (db.cierres||[]).find(c => c.empId === e.id && c.mes === selMonth)
              return (
                <div key={e.id} className="card" style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {days} días · {mhm(totalMin)}
                      {days > 0 && <span style={{ color: diff>=0?'var(--green)':'var(--red)', marginLeft:4 }}>{diff>=0?'+':''}{mhm(Math.abs(diff))}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    {cierre ? (
                      <>
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : '⏳ Pendiente'}
                        </span>
                        <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre)} disabled={generandoPdf === cierre.id}>{generandoPdf === cierre.id ? '…' : 'PDF'}</button>
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => generarCierreJO(e, totalMin, days)} disabled={!days}>
                        Enviar cierre
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {!rows.length && <div className="empty">Sin empleados activos en tus obras para este mes</div>}
          </div>

          {firmados.length > 0 && (
            <div style={{ marginTop:28 }}>
              <div className="adm-section-title" style={{ marginBottom:12 }}>Cierres firmados</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {firmados.sort((a,b) => (b.mes||'').localeCompare(a.mes||'')).slice(0,20).map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                    <div style={{ fontSize:18 }}>✅</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{c.empName} · {c.mes}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>Firmado {new Date(c.firma?.firmadoAt).toLocaleDateString('es-ES')} · {mhm(c.totalMin)}</div>
                    </div>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(c)} disabled={generandoPdf === c.id}>{generandoPdf === c.id ? '…' : 'PDF'}</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
