import { useState, useRef } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { mhm, p2, calcMin, gid, sortedEmps, recWorkSecs, monthlyExtras, vacData } from '../../utils/time.js'
import { WK } from '../../config/constants.js'
import { auditLog, queuePush } from '../../services/dataService.js'
import { downloadDataUrl } from '../../utils/adminHelpers.js'
import { buildCierreIndividualPDF, buildCierreConsolidadoPDF } from '../../utils/cierrePdf.js'
import { exportInspeccionXLSX, buildInspeccionHTML } from '../../utils/inspeccionExport.js'

export default function PanelInformes({ db, toast, saveDB, session }) {
  const [tab, setTab] = useState('resumen')
  const [selEmp, setSelEmp] = useState('')
  const [selMonth, setSelMonth] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [procesandoCierre, setProcesandoCierre] = useState(new Set())
  const procesandoCierreRef = useRef(new Set())
  const [agruparCentro, setAgruparCentro] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(null) // id del cierre en curso, o 'consolidado'
  const empresaNombreCfg = db.config?.companyName || db.empresas?.[0] || 'TIMES INC'
  const recs = db.records || []
  const emps = (db.employees || []).filter(e => !e.baja)
  const now = new Date()

  const filterMonth = selMonth || `${now.getFullYear()}-${p2(now.getMonth()+1)}`

  const rows = sortedEmps(db).filter(e => !e.baja).map(e => {
    const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
    const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
    const weeklyH = e.horasSemanales || (WK / 60)  // siempre en horas
    const expected = weeklyH * 4 * 60              // 4 semanas → minutos
    const diff = totalMin - expected
    const vac = vacData(e.id, db)
    return { e, totalMin, diff, days: eRecs.length, vac, expected, weeklyH }
  })

  const empresa = db.config?.companyName || (db.empresas||[])[0] || ''

  const downloadXLSX = async (sheetName, aoa, filename, colWidths) => {
    const XLSX = await import('xlsx')
    const ws = XLSX.utils.aoa_to_sheet(aoa)
    if (colWidths) ws['!cols'] = colWidths.map(w => ({ wch: w }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, sheetName)
    XLSX.writeFile(wb, filename)
  }

  const minToDecH = m => Math.round(m / 60 * 100) / 100

  const exportFichajesXLSX = async () => {
    let filtered = recs.filter(r => r.fin)
    if (selEmp) filtered = filtered.filter(r => r.empId === selEmp)
    if (from) filtered = filtered.filter(r => (r.inicio?.slice(0,10) || '') >= from)
    if (to)   filtered = filtered.filter(r => (r.inicio?.slice(0,10) || '') <= to)
    if (!filtered.length) { toast('Sin datos para exportar'); return }
    if (agruparCentro) {
      filtered.sort((a, b) => (a.centro||'').localeCompare(b.centro||'') || (a.empName||'').localeCompare(b.empName||'') || (a.inicio||'').localeCompare(b.inicio||''))
    } else {
      filtered.sort((a, b) => (a.inicio||'').localeCompare(b.inicio||''))
    }
    const periodo = from || to ? `${from||'inicio'} a ${to||'hoy'}` : filterMonth
    const title = [`Fichajes — ${empresa || 'TIMES INC'} — ${periodo}${agruparCentro ? ' (agrupado por centro)' : ''}`]
    const headers = ['Empleado','Obra','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
    const dataRows = filtered.map(r => {
      const wm = Math.floor(recWorkSecs(r)/60), bm = Math.floor((r.breakSecs||0)/60)
      const d = new Date(r.inicio), fin = new Date(r.fin)
      return [
        r.empName,
        r.empresa||'',
        r.centro||'',
        d.toLocaleDateString('es-ES'),
        d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
        fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),
        `${Math.floor(wm/60)}:${p2(wm%60)}`,
        minToDecH(wm),
        `${Math.floor(bm/60)}:${p2(bm%60)}`,
        r.notes||''
      ]
    })
    const totalWm = filtered.reduce((s,r) => s + Math.floor(recWorkSecs(r)/60), 0)
    const totals = ['TOTAL','','','','','', mhm(totalWm), minToDecH(totalWm),'','']
    const aoa = [title, [], headers, ...dataRows, [], totals]
    const cols = [22,18,16,12,8,8,10,14,10,20]
    const fname = `fichajes_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${from||'todo'}_${to||'hoy'}.xlsx`
    await downloadXLSX('Fichajes', aoa, fname, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const [y, mo] = filterMonth.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  const mesNombreXLSX = new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })

  const exportDetalleXLSX = async () => {
    const empRows = sortedEmps(db).filter(e => !e.baja)
    const title = [`Detalle diario — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const header = ['Empleado', ...Array.from({length:daysInMonth},(_,i)=>i+1), 'Total h', 'Total (dec.)']
    const dataRows = empRows.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).forEach(r => {
        const day = parseInt(r.inicio.slice(8,10))
        dayMap[day] = (dayMap[day]||0) + calcMin(r)
      })
      const total = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [
        e.name,
        ...Array.from({length:daysInMonth},(_,i) => dayMap[i+1] ? minToDecH(dayMap[i+1]) : ''),
        mhm(total),
        minToDecH(total)
      ]
    })
    const grandTotal = empRows.reduce((s,e) => {
      return s + recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).reduce((ss,r)=>ss+calcMin(r),0)
    }, 0)
    const totalsRow = ['TOTAL', ...Array(daysInMonth).fill(''), mhm(grandTotal), minToDecH(grandTotal)]
    const aoa = [title, [], header, ...dataRows, [], totalsRow]
    const cols = [22, ...Array(daysInMonth).fill(5), 10, 12]
    await downloadXLSX('Detalle diario', aoa, `detalle_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const exportResumenXLSX = async () => {
    const title = [`Resumen mensual — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const header = ['Empleado','Días','Total mes','Total (dec. h)','Contratadas (dec. h)','Diferencia (dec. h)','Balance','Vac. disp. (días)','H/semana']
    const xlsxRows = rows.map(({ e, totalMin, diff, days, vac, weeklyH, expected }) => [
      e.name,
      days,
      mhm(totalMin),
      minToDecH(totalMin),
      minToDecH(expected),
      minToDecH(diff),
      diff >= 0 ? `+${mhm(diff)}` : `-${mhm(Math.abs(diff))}`,
      vac.available,
      weeklyH
    ])
    const totalDays = rows.reduce((s,r)=>s+r.days,0)
    const totalMin2 = rows.reduce((s,r)=>s+r.totalMin,0)
    const totalDiff = rows.reduce((s,r)=>s+r.diff,0)
    const totalsRow = ['TOTAL', totalDays, mhm(totalMin2), minToDecH(totalMin2), '', minToDecH(totalDiff), totalDiff>=0?`+${mhm(totalDiff)}`:`-${mhm(Math.abs(totalDiff))}`, '', '']
    const aoa = [title, [], header, ...xlsxRows, [], totalsRow]
    const cols = [22,7,11,14,16,16,12,14,10]
    await downloadXLSX('Resumen mensual', aoa, `resumen_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`, cols)
    toast('Excel descargado', 3000, 'ok')
  }

  const exportTodoXLSX = async () => {
    const XLSX = await import('xlsx')
    const wb = XLSX.utils.book_new()
    const makeSheet = (aoa, cols) => {
      const ws = XLSX.utils.aoa_to_sheet(aoa)
      if (cols) ws['!cols'] = cols.map(w => ({ wch: w }))
      return ws
    }
    // Hoja 1: Resumen
    const h1 = [`Resumen mensual — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r1h = ['Empleado','Días','Total mes','Total (dec. h)','Contratadas (dec. h)','Diferencia (dec. h)','Balance','Vac. disp. (días)','H/semana']
    const r1rows = rows.map(({ e, totalMin, diff, days, vac, weeklyH, expected }) => [e.name, days, mhm(totalMin), minToDecH(totalMin), minToDecH(expected), minToDecH(diff), diff>=0?`+${mhm(diff)}`:`-${mhm(Math.abs(diff))}`, vac.available, weeklyH])
    const r1tot = ['TOTAL', rows.reduce((s,r)=>s+r.days,0), mhm(rows.reduce((s,r)=>s+r.totalMin,0)), minToDecH(rows.reduce((s,r)=>s+r.totalMin,0)), '', minToDecH(rows.reduce((s,r)=>s+r.diff,0)), '', '', '']
    XLSX.utils.book_append_sheet(wb, makeSheet([h1,[],r1h,...r1rows,[],r1tot],[22,7,11,14,16,16,12,14,10]), 'Resumen')
    // Hoja 2: Detalle
    const h2 = [`Detalle diario — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r2h = ['Empleado',...Array.from({length:daysInMonth},(_,i)=>i+1),'Total h','Total (dec. h)']
    const empRowsD = sortedEmps(db).filter(e => !e.baja)
    const r2rows = empRowsD.map(e => {
      const dayMap = {}
      recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(filterMonth)).forEach(r => { const d=parseInt(r.inicio.slice(8,10)); dayMap[d]=(dayMap[d]||0)+calcMin(r) })
      const tot = Object.values(dayMap).reduce((s,v)=>s+v,0)
      return [e.name,...Array.from({length:daysInMonth},(_,i)=>dayMap[i+1]?minToDecH(dayMap[i+1]):''),mhm(tot),minToDecH(tot)]
    })
    const gt = empRowsD.reduce((s,e)=>s+recs.filter(r=>r.empId===e.id&&r.fin&&r.inicio?.startsWith(filterMonth)).reduce((ss,r)=>ss+calcMin(r),0),0)
    XLSX.utils.book_append_sheet(wb, makeSheet([h2,[],r2h,...r2rows,[],['TOTAL',...Array(daysInMonth).fill(''),mhm(gt),minToDecH(gt)]],[22,...Array(daysInMonth).fill(5),10,12]), 'Detalle diario')
    // Hoja 3: Fichajes
    const allFichajesThisMonth = recs.filter(r=>r.fin&&r.inicio?.startsWith(filterMonth)).sort((a,b)=>a.inicio.localeCompare(b.inicio))
    const h3 = [`Fichajes — ${empresa || 'TIMES INC'} — ${mesNombreXLSX}`]
    const r3h = ['Empleado','Obra','Centro','Fecha','Entrada','Salida','H. trabajo','H. trabajo (dec.)','H. descanso','Notas']
    const r3rows = allFichajesThisMonth.map(r => {
      const wm=Math.floor(recWorkSecs(r)/60), bm=Math.floor((r.breakSecs||0)/60)
      const d=new Date(r.inicio), fin=new Date(r.fin)
      return [r.empName, r.empresa||'', r.centro||'', d.toLocaleDateString('es-ES'), d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), fin.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}), `${Math.floor(wm/60)}:${p2(wm%60)}`, minToDecH(wm), `${Math.floor(bm/60)}:${p2(bm%60)}`, r.notes||'']
    })
    const totWm=allFichajesThisMonth.reduce((s,r)=>s+Math.floor(recWorkSecs(r)/60),0)
    XLSX.utils.book_append_sheet(wb, makeSheet([h3,[],r3h,...r3rows,[],['TOTAL','','','','','',mhm(totWm),minToDecH(totWm),'','']],[22,18,16,12,8,8,10,14,10,20]), 'Fichajes')
    // Hoja 4: Empleados
    const r4h = ['Nombre','Email','Rol','Obra','Centro trabajo','Alta','H/sem','Estado']
    const r4rows = sortedEmps(db).map(e => [e.name,e.email||'',e.role||'emp',e.empresa||'',e.centroTrabajo||'',e.startDate||'',e.horasSemanales||40,e.baja?'Baja':'Activo'])
    XLSX.utils.book_append_sheet(wb, makeSheet([r4h,...r4rows],[22,22,12,18,16,12,7,8]), 'Empleados')
    const fname = `informe_completo_${empresa?empresa.replace(/\s+/g,'_')+'_':''}${filterMonth}.xlsx`
    XLSX.writeFile(wb, fname)
    toast('Excel completo descargado', 3000, 'ok')
  }

  const printHtml = (html) => {
    const iframe = document.createElement('iframe')
    iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none;opacity:0'
    document.body.appendChild(iframe)
    const doc = iframe.contentDocument || iframe.contentWindow.document
    doc.open(); doc.write(html); doc.close()
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print() } catch(err) { console.warn('[printHtml]', err) }
      setTimeout(() => { try { document.body.removeChild(iframe) } catch {} }, 4000)
    }, 350)
  }

  // PDF de horas trabajadas ese mes (no es una nómina/documento de pago — solo el
  // detalle de horas fichadas). Reutiliza el mismo generador pdf-lib que los cierres,
  // como un cierre "de solo lectura" no persistido, para tener el mismo formato/calidad.
  const [generandoHorasPdf, setGenerandoHorasPdf] = useState(null)
  const downloadHorasMesPDF = async ({ e, totalMin, days }) => {
    setGenerandoHorasPdf(e.id)
    try {
      const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
        .sort((a, b) => a.inicio.localeCompare(b.inicio))
      const cierreEfimero = {
        empId: e.id, empName: e.name, mes: filterMonth,
        generadoPor: session?.user?.name || 'Admin',
        generadoAt: new Date().toISOString(),
        totalMin, dias: days, estado: 'informativo', firma: null,
        records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 })),
      }
      const { dataUrl } = await buildCierreIndividualPDF({ cierre: cierreEfimero, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, `horas-${filterMonth}-${(e.name||'').replace(/\s+/g,'_')}.pdf`)
    } catch (err) {
      toast('Error al generar el PDF: ' + (err?.message || err), 5000, 'err')
    } finally {
      setGenerandoHorasPdf(null)
    }
  }

  const generarTodosCierres = () => {
    const mes = filterMonth
    const empsActivos = sortedEmps(db).filter(e => !e.baja && !e.isAdmin)
    const nuevos = []
    empsActivos.forEach(e => {
      if ((db.cierres||[]).find(c => c.empId === e.id && c.mes === mes)) return
      const eRecs = (db.records||[]).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(mes))
      if (!eRecs.length) return
      const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
      nuevos.push({
        id: gid(), empId: e.id, empName: e.name, mes,
        generadoPor: session?.user?.name || 'Admin',
        generadoPorId: session?.user?.id || null,
        generadoAt: new Date().toISOString(),
        totalMin, dias: eRecs.length, estado: 'pendiente', firma: null,
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

  const generarCierre = (e, totalMin, days) => {
    if (procesandoCierreRef.current.has(e.id)) return
    procesandoCierreRef.current.add(e.id)
    setProcesandoCierre(s => new Set([...s, e.id]))
    const mes = filterMonth
    if ((db.cierres || []).find(c => c.empId === e.id && c.mes === mes)) {
      procesandoCierreRef.current.delete(e.id)
      setProcesandoCierre(s => { const n = new Set(s); n.delete(e.id); return n })
      toast('Ya existe un cierre para este empleado y mes', 3000, 'warn')
      return
    }
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(mes))
    const cierre = {
      id: gid(), empId: e.id, empName: e.name, mes,
      generadoPor: session?.user?.name || 'Admin',
      generadoPorId: session?.user?.id || null,
      generadoAt: new Date().toISOString(),
      totalMin, dias: days, estado: 'pendiente', firma: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 }))
    }
    saveDB({ cierres: [...(db.cierres||[]), cierre] })
    queuePush(e.id, '📋 Cierre mensual pendiente', `Tu resumen de ${mes} está listo para firmar.`, 'cierre', '/?go=emp:perfil')
    toast(`✅ Cierre enviado a ${e.name}`)
    procesandoCierreRef.current.delete(e.id)
    setProcesandoCierre(s => { const n = new Set(s); n.delete(e.id); return n })
  }

  // Refresca un cierre desactualizado (fichajes editados/borrados tras generarlo) con
  // los datos reales actuales y limpia el aviso — el empleado ya puede firmarlo sin miedo.
  const regenerarCierre = (cierre, e, totalMin, days) => {
    const eRecs = (db.records || []).filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(cierre.mes))
    const updated = (db.cierres || []).map(c => c.id === cierre.id ? {
      ...c, totalMin, dias: days, desactualizado: false, pdfData: null,
      records_snapshot: eRecs.map(r => ({ inicio:r.inicio, fin:r.fin, centro:r.centro, workSecs:r.workSecs||0 })),
      regeneradoAt: new Date().toISOString(), regeneradoPor: session?.user?.name || 'Admin',
    } : c)
    const withAudit = auditLog(db, 'Cierre regenerado', `${e.name} · ${cierre.mes}`, session?.user?.name || 'Admin')
    saveDB({ cierres: updated, audit: withAudit.audit })
    queuePush(e.id, '📋 Cierre mensual actualizado', `Tu resumen de ${cierre.mes} se actualizó y ya puedes firmarlo.`, 'cierre', '/?go=emp:perfil')
    toast('Cierre regenerado', 3000, 'ok')
  }

  const downloadCierrePDF = async (cierre) => {
    const filename = `cierre-${cierre.mes}-${(cierre.empName||'').replace(/\s+/g,'_')}.pdf`
    if (cierre.pdfData) { downloadDataUrl(cierre.pdfData, filename); return }
    setGenerandoPdf(cierre.id)
    try {
      const { dataUrl } = await buildCierreIndividualPDF({ cierre, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, filename)
    } catch (e) {
      toast('Error al generar el PDF: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const finalizarMesCierres = async () => {
    const cierresMes = (db.cierres || []).filter(c => c.mes === filterMonth)
    if (!cierresMes.length) { toast('No hay cierres generados para este mes'); return }
    setGenerandoPdf('consolidado')
    try {
      const { dataUrl } = await buildCierreConsolidadoPDF({ cierres: cierresMes, mes: filterMonth, empresa: empresaNombreCfg })
      downloadDataUrl(dataUrl, `cierre-consolidado-${filterMonth}.pdf`)
      toast('PDF consolidado generado', 3000, 'ok')
    } catch (e) {
      toast('Error al generar el PDF consolidado: ' + (e?.message || e), 5000, 'err')
    } finally {
      setGenerandoPdf(null)
    }
  }

  const TABS = [
    { id:'resumen',  label:'Resumen' },
    { id:'cierre',   label:'📋 Cierre mensual' },
    { id:'detalle',  label:'Detalle diario' },
    { id:'ranking',  label:'Ranking' },
    { id:'extras',   label:'⚡ Horas extra' },
    { id:'analitica',label:'Analítica' },
    { id:'obras',    label:'Por Obra' },
    { id:'exportar', label:'Exportar' },
  ]

  return (
    <div className="adm-panel">
      <div className="adm-panel-header">
        <div>
          <h1 className="adm-panel-title gradient-text">Informes</h1>
          <div className="adm-panel-sub" style={{ marginTop:2, textTransform:'capitalize' }}>{new Date(filterMonth + '-01').toLocaleDateString('es-ES', { month:'long', year:'numeric' })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="pill-tabs" style={{ marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`pill-tab${tab===t.id?' active':''}`} onClick={() => setTab(t.id)}>{t.label}</button>
        ))}
      </div>

      {/* Month selector */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
        <input type="month" value={filterMonth} onChange={e => setSelMonth(e.target.value)}
          style={{ width:'auto', padding:'7px 12px', fontSize:13, borderRadius:8 }} />
      </div>

      {/* Cierre mensual tab */}
      {tab === 'cierre' && (
        <div className="stagger-in">
          <div style={{ fontSize:12, color:'var(--text3)', marginBottom:12, padding:'12px 14px', background:'var(--primary-dim)', borderRadius:'var(--r)', border:'1px solid var(--primary-glow)', lineHeight:1.6 }}>
            📋 <strong>Cierre mensual</strong> — Genera el resumen y envíalo al empleado para firma digital. Cumple con la Ley de Control Horario (RDL 8/2019). El empleado recibirá una notificación para firmar.
          </div>
          <div style={{ display:'flex', gap:8, marginBottom:16 }}>
            <button className="btn btn-primary" style={{ flex:1 }} onClick={generarTodosCierres}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Generar cierres para todos ({rows.filter(r => !(db.cierres||[]).find(c => c.empId===r.e.id && c.mes===filterMonth) && r.days>0).length} pendientes)
            </button>
            <button className="btn btn-secondary" onClick={finalizarMesCierres} disabled={generandoPdf === 'consolidado' || !(db.cierres||[]).some(c => c.mes===filterMonth)}>
              {generandoPdf === 'consolidado' ? 'Generando…' : '📄 Finalizar mes'}
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {rows.map(({ e, totalMin, days, diff, weeklyH }) => {
              const cierre = (db.cierres || []).find(c => c.empId === e.id && c.mes === filterMonth)
              return (
                <div key={e.id} className="card" style={{ display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:40, height:40, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                      {days} días · {mhm(totalMin)} · <span style={{ color: diff>=0?'var(--green)':'var(--red)' }}>{diff>=0?'+':''}{mhm(Math.abs(diff))}</span>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
                    {cierre ? (
                      <>
                        <span className={`badge ${cierre.estado==='firmado'?'badge-green':cierre.desactualizado?'badge-red':'badge-orange'}`}>
                          {cierre.estado === 'firmado' ? '✓ Firmado' : cierre.desactualizado ? '⚠️ Desactualizado' : '⏳ Pendiente firma'}
                        </span>
                        {cierre.desactualizado ? (
                          <button className="btn btn-danger btn-sm" onClick={() => regenerarCierre(cierre, e, totalMin, days)}>Regenerar</button>
                        ) : (
                          <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(cierre)} disabled={generandoPdf === cierre.id}>{generandoPdf === cierre.id ? '…' : 'PDF'}</button>
                        )}
                      </>
                    ) : (
                      <button className="btn btn-primary btn-sm" onClick={() => generarCierre(e, totalMin, days)} disabled={!days || procesandoCierre.has(e.id)}>
                        {procesandoCierre.has(e.id) ? '…' : 'Enviar cierre'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
            {!rows.length && <div className="empty">Sin empleados activos</div>}
          </div>

          {/* Historial de cierres firmados */}
          {(db.cierres||[]).filter(c => c.estado==='firmado').length > 0 && (
            <div style={{ marginTop:28 }}>
              <div className="adm-section-title" style={{ marginBottom:12 }}>Cierres firmados</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {(db.cierres||[]).filter(c => c.estado==='firmado').sort((a,b) => (b.mes||'').localeCompare(a.mes||'')).slice(0,20).map(c => {
                  const emp = (db.employees||[]).find(e => e.id === c.empId)
                  return (
                    <div key={c.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r)' }}>
                      <div style={{ fontSize:18 }}>✅</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:600 }}>{c.empName} · {c.mes}</div>
                        <div style={{ fontSize:11, color:'var(--text3)' }}>Firmado {new Date(c.firma?.firmadoAt).toLocaleDateString('es-ES')} · {mhm(c.totalMin)}</div>
                      </div>
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadCierrePDF(c)} disabled={generandoPdf === c.id}>{generandoPdf === c.id ? '…' : 'PDF'}</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Resumen tab */}
      {tab === 'resumen' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportResumenXLSX}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel
            </button>
          </div>
        {!rows.length ? (
          <div className="empty-premium">
            <div className="empty-premium-icon">📊</div>
            <div className="empty-premium-title">Sin datos este mes</div>
          </div>
        ) : (
        <div className="emp-grid stagger-in">
          {rows.map(({ e, totalMin, diff, days, vac, expected, weeklyH }) => (
            <div key={e.id} className="emp-card card-lift">
              <div className="emp-card-top">
                <div className="emp-card-avatar" style={{ background: e.color || 'var(--primary)' }}>
                  {(e.initials || e.name.slice(0, 2)).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div className="emp-card-name">{e.name}</div>
                  <div className="emp-card-sub">{days} días trabajados</div>
                </div>
                <span className="badge" style={{ color: diff >= 0 ? 'var(--green)' : 'var(--red)', background: diff >= 0 ? 'var(--green-dim)' : 'var(--red-dim)' }}>
                  {diff >= 0 ? '+' : ''}{mhm(Math.abs(diff))}
                </span>
              </div>
              <div className="emp-card-body">
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Total mes</span>
                  <span className="emp-card-row-val">{mhm(totalMin)}</span>
                </div>
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Contratadas</span>
                  <span className="emp-card-row-val">{mhm(expected)} <span style={{ fontSize:10, opacity:.7 }}>({weeklyH}h/sem)</span></span>
                </div>
                <div className="emp-card-row">
                  <span className="emp-card-row-lbl">Vacaciones disp.</span>
                  <span className="emp-card-row-val">{vac.available}d</span>
                </div>
              </div>
              <div className="emp-card-actions">
                <button className="btn btn-sm btn-secondary" disabled={generandoHorasPdf === e.id} onClick={() => downloadHorasMesPDF({ e, totalMin, days })}>{generandoHorasPdf === e.id ? '…' : '📄 PDF horas del mes'}</button>
              </div>
            </div>
          ))}
        </div>
        )}
        </div>
      )}

      {/* Detalle diario tab */}
      {tab === 'detalle' && (
        <div>
          <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:12 }}>
            <button className="btn btn-secondary btn-sm" onClick={exportDetalleXLSX}>
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar Excel
            </button>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table className="adm-table" style={{ fontSize:11, minWidth: 120 + daysInMonth*38 }}>
              <thead>
                <tr>
                  <th style={{ minWidth:120, textAlign:'left' }}>Empleado</th>
                  {Array.from({length:daysInMonth},(_,i) => {
                    const d = new Date(y, mo-1, i+1)
                    const isWknd = d.getDay()===0||d.getDay()===6
                    return <th key={i} style={{ minWidth:36, textAlign:'center', padding:'6px 4px', color: isWknd?'var(--text4)':'var(--text3)', fontWeight: isWknd?400:600 }}>{i+1}</th>
                  })}
                  <th style={{ minWidth:60, textAlign:'right' }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {sortedEmps(db).filter(e=>!e.baja).map(e => {
                  const dayMap = {}
                  recs.filter(r=>r.empId===e.id&&r.fin&&r.inicio?.startsWith(filterMonth)).forEach(r=>{
                    const day = parseInt(r.inicio.slice(8,10))
                    dayMap[day] = (dayMap[day]||0) + calcMin(r)
                  })
                  const totalMin = Object.values(dayMap).reduce((s,v)=>s+v,0)
                  return (
                    <tr key={e.id}>
                      <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:20, height:20, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(e.initials||e.name.slice(0,2)).toUpperCase()}
                          </div>
                          {e.name.split(' ')[0]}
                        </div>
                      </td>
                      {Array.from({length:daysInMonth},(_,i) => {
                        const m2 = dayMap[i+1]
                        const d = new Date(y, mo-1, i+1)
                        const isWknd = d.getDay()===0||d.getDay()===6
                        return (
                          <td key={i} style={{ textAlign:'center', padding:'5px 2px', background: m2?'rgba(108,99,255,.12)':isWknd?'rgba(255,255,255,.02)':undefined, color: m2?'var(--primary-light)':'var(--text4)', fontWeight:m2?700:400, fontVariantNumeric:'tabular-nums' }}>
                            {m2 ? `${Math.floor(m2/60)}:${p2(m2%60)}` : isWknd?'·':'—'}
                          </td>
                        )
                      })}
                      <td style={{ textAlign:'right', fontWeight:700, fontVariantNumeric:'tabular-nums', color:'var(--text)' }}>{mhm(totalMin)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ranking tab */}
      {tab === 'ranking' && (
        <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {[...rows].sort((a,b) => b.totalMin - a.totalMin).map(({ e, totalMin, days }, idx) => {
            const maxMin = Math.max(...rows.map(r => r.totalMin), 1)
            const pct = Math.round(totalMin / maxMin * 100)
            const medals = ['🥇','🥈','🥉']
            return (
              <div key={e.id} className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'14px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ fontSize:20, width:28, textAlign:'center' }}>{medals[idx] || `${idx+1}`}</div>
                  <div style={{ width:36, height:36, borderRadius:'50%', background: e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:700, color:'#fff', flexShrink:0 }}>
                    {(e.initials||e.name.slice(0,2)).toUpperCase()}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{e.name}</div>
                    <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>{days} días trabajados</div>
                  </div>
                  <div style={{ fontSize:20, fontWeight:800, color: idx===0 ? 'var(--primary-light)' : 'var(--text)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>
                    {mhm(totalMin)}
                  </div>
                </div>
                <div style={{ height:6, background:'var(--bg-400)', borderRadius:3 }}>
                  <div style={{ height:'100%', borderRadius:3, background: idx===0 ? 'linear-gradient(90deg,var(--primary),var(--accent))' : 'var(--primary-dim)', width: pct + '%', transition:'width .6s ease' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Horas Extra tab */}
      {tab === 'extras' && (() => {
        const allRecs = db.records || []
        const extRows = sortedEmps(db).filter(e => !e.baja && !e.isAdmin).map(e => {
          const eRecs = allRecs.filter(r => r.empId === e.id && r.fin)
          const totalMin = eRecs.reduce((s, r) => s + calcMin(r), 0)
          const weeklyH = e.horasSemanales || (WK / 60)
          const monthlyH = e.horasMensuales || 160
          // Histórico (balance vida laboral)
          const start = e.startDate ? new Date(e.startDate) : new Date()
          const msWorked = Date.now() - start.getTime()
          const weeks = Math.max(0, msWorked / (7 * 24 * 3600 * 1000))
          const expectedMin = Math.round(weeks * weeklyH * 60)
          const diff = totalMin - expectedMin
          // Regla TIMES INC: extras semanales (>40h/sem) compensadas contra
          // el déficit del objetivo mensual (160h). Si las extras no alcanzan
          // a cubrir el déficit, lo restante aparece como déficit real.
          const ex = monthlyExtras(allRecs, e.id, filterMonth, { weeklyH, monthlyH })
          return {
            e, totalMin, expectedMin, diff, weeklyH, monthlyH,
            mMin: ex.workedMin,
            mExpected: monthlyH * 60,
            mExtra: ex.netExtraMin,
            mDeficit: ex.deficitMin,
            mWeeklyExtra: ex.weeklyExtraMin,
            mShortfall: ex.shortfallMin,
          }
        })
        const totalExtra = extRows.reduce((s, r) => s + r.mExtra, 0)
        const totalDeficit = extRows.reduce((s, r) => s + r.mDeficit, 0)
        return (
          <div className="stagger-in">
            <div className="adm-stats-grid" style={{ marginBottom:20 }}>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'var(--orange-dim)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--orange)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
                <div className="stat-value" style={{ color:'var(--orange)' }}>+{mhm(totalExtra)}</div>
                <div className="stat-label">H. extra este mes</div>
              </div>
              <div className="stat-card">
                <div className="stat-icon" style={{ background:'var(--red-dim)' }}><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg></div>
                <div className="stat-value" style={{ color:'var(--red)' }}>-{mhm(totalDeficit)}</div>
                <div className="stat-label">Déficit este mes</div>
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {extRows.map(({ e, mMin, mExpected, mExtra, mDeficit, mWeeklyExtra, mShortfall }) => {
                const compensated = mWeeklyExtra > 0 && mShortfall > 0
                return (
                  <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--bg-700)', borderRadius:'var(--r)', border:`1px solid ${mExtra > 0 ? 'rgba(245,158,11,.25)' : mDeficit > 0 ? 'rgba(239,68,68,.2)' : 'var(--border)'}` }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {(e.initials||e.name.slice(0,2)).toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)', marginTop:2 }}>
                        {mhm(mMin)} trabajadas · objetivo {mhm(Math.round(mExpected))}
                        {compensated && <span style={{ marginLeft:6, color:'var(--text4)' }}>({mhm(Math.round(mWeeklyExtra))} sem. − {mhm(Math.round(mShortfall))} déf.)</span>}
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      {mExtra > 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--orange)', fontVariantNumeric:'tabular-nums' }}>+{mhm(Math.round(mExtra))}</div>}
                      {mDeficit > 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--red)', fontVariantNumeric:'tabular-nums' }}>−{mhm(Math.round(mDeficit))}</div>}
                      {mExtra === 0 && mDeficit === 0 && <div style={{ fontSize:14, fontWeight:800, color:'var(--green)' }}>✓</div>}
                      <div style={{ fontSize:10, color:'var(--text4)' }}>{mExtra > 0 ? 'extras' : mDeficit > 0 ? 'déficit' : 'al día'}</div>
                    </div>
                  </div>
                )
              })}
              {!extRows.length && <div className="empty">Sin empleados activos</div>}
            </div>
          </div>
        )
      })()}

      {/* Analítica tab */}
      {tab === 'analitica' && (
        <div>
          <div className="adm-stats-grid stagger-in" style={{ marginBottom:20 }}>
            {(() => {
              const totalMin = rows.reduce((s, r) => s + r.totalMin, 0)
              const avgMin = rows.length ? Math.round(totalMin / rows.length) : 0
              const topEmp = [...rows].sort((a,b) => b.totalMin - a.totalMin)[0]
              const overExpected = rows.filter(r => r.diff > 0).length
              return [
                { label:'Total horas mes', val: mhm(totalMin), color:'var(--primary-light)', bg:'var(--primary-dim)', ico:<line x1="18" y1="20" x2="18" y2="10"/> },
                { label:'Promedio por empleado', val: mhm(avgMin), color:'var(--teal)', bg:'rgba(0,212,255,.1)', ico:<circle cx="12" cy="12" r="10"/> },
                { label:'Sobre objetivo', val: `${overExpected}/${rows.length}`, color:'var(--green)', bg:'var(--green-dim)', ico:<polyline points="20 6 9 17 4 12"/> },
                { label:'Lider del mes', val: topEmp?.e.name?.split(' ')[0] || '—', color:'var(--orange)', bg:'var(--orange-dim)', ico:<><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></> },
              ].map(({ label, val, color, bg, ico }) => (
                <div key={label} className="adm-stat-card">
                  <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                    <div style={{ width:34, height:34, background:bg, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round">{ico}</svg>
                    </div>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--text3)' }}>{label}</div>
                  </div>
                  <div style={{ fontSize:24, fontWeight:800, color }}>{val}</div>
                </div>
              ))
            })()}
          </div>
          <div className="adm-section">
            <div className="adm-section-title">Distribución por empleado</div>
            {[...rows].sort((a,b) => b.totalMin - a.totalMin).map(({ e, totalMin }) => {
              const maxMin = Math.max(...rows.map(r => r.totalMin), 1)
              const pct = Math.round(totalMin / maxMin * 100)
              return (
                <div key={e.id} style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <div style={{ width:80, fontSize:11, fontWeight:600, color:'var(--text2)', textAlign:'right', flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{e.name.split(' ')[0]}</div>
                  <div style={{ flex:1, height:8, background:'var(--bg-400)', borderRadius:4 }}>
                    <div style={{ height:'100%', borderRadius:4, background:`linear-gradient(90deg,${e.color||'var(--primary)'},${e.color||'var(--primary)'}88)`, width: pct + '%', transition:'width .6s' }} />
                  </div>
                  <div style={{ width:60, fontSize:12, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums' }}>{mhm(totalMin)}</div>
                </div>
              )
            })}
          </div>
          {/* Tendencia 6 meses */}
          {(() => {
            const months = []
            const now2 = new Date()
            for (let i = 5; i >= 0; i--) {
              const d = new Date(now2.getFullYear(), now2.getMonth() - i, 1)
              const mk = `${d.getFullYear()}-${p2(d.getMonth()+1)}`
              const label = d.toLocaleDateString('es-ES', { month:'short', year:'2-digit' })
              const entry = { mes: label }
              sortedEmps(db).filter(e => !e.baja).forEach(e => {
                entry[e.name.split(' ')[0]] = Math.round(recs.filter(r => r.empId===e.id && r.fin && r.inicio?.startsWith(mk)).reduce((s,r)=>s+calcMin(r),0) / 60 * 10) / 10
              })
              months.push(entry)
            }
            const empColors = ['#7c5cff','#10b981','#f59e0b','#ef4444','#00d4ff','#a78bfa']
            const empNames = sortedEmps(db).filter(e=>!e.baja).map(e=>e.name.split(' ')[0])
            return (
              <div className="adm-section" style={{ marginTop:20 }}>
                <div className="adm-section-title">Tendencia 6 meses (horas/empleado)</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={months} margin={{ top:4, right:8, left:-10, bottom:0 }} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="mes" tick={{ fontSize:11, fill:'var(--text3)' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize:10, fill:'var(--text3)' }} axisLine={false} tickLine={false} unit="h" />
                    <Tooltip contentStyle={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }} labelStyle={{ color:'var(--text)', fontWeight:700 }} formatter={(v)=>[`${v}h`,'']} />
                    <Legend iconSize={8} wrapperStyle={{ fontSize:11 }} />
                    {empNames.map((name, i) => (
                      <Bar key={name} dataKey={name} fill={empColors[i % empColors.length]} radius={[3,3,0,0]} maxBarSize={28} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </div>
      )}

      {/* Por Obra tab */}
      {tab === 'obras' && (() => {
        const obras = db.obras || []
        const allEmps = sortedEmps(db).filter(e => !e.baja)
        const obraRows = obras.map(obra => {
          const assigned = allEmps.filter(e => (e.obrasAsignadas || []).includes(obra.nombre))
          const empData = assigned.map(e => {
            const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
            const mins = eRecs.reduce((s, r) => s + calcMin(r), 0)
            return { e, mins, days: eRecs.length }
          }).filter(d => d.mins > 0 || assigned.length > 0)
          const totalMins = empData.reduce((s, d) => s + d.mins, 0)
          return { obra, empData, totalMins, assignedCount: assigned.length }
        })
        // Employees with no obra assigned
        const unassinged = allEmps.filter(e => !(e.obrasAsignadas || []).length)
        const unassignedData = unassinged.map(e => {
          const eRecs = recs.filter(r => r.empId === e.id && r.fin && r.inicio?.startsWith(filterMonth))
          const mins = eRecs.reduce((s, r) => s + calcMin(r), 0)
          return { e, mins, days: eRecs.length }
        }).filter(d => d.mins > 0)
        const maxObraMin = Math.max(...obraRows.map(r => r.totalMins), 1)
        return (
          <div className="stagger-in" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {!obras.length && (
              <div className="empty-premium">
                <div className="empty-premium-icon"><svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></div>
                <div className="empty-premium-title">Sin obras configuradas</div>
                <div className="empty-premium-sub">Ve a Obras para crear proyectos y asignarlos a tus empleados.</div>
              </div>
            )}
            {obraRows.map(({ obra, empData, totalMins, assignedCount }) => {
              const pct = Math.round(totalMins / maxObraMin * 100)
              return (
                <div key={obra.id || obra.nombre} className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'16px 18px' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:'var(--primary-dim)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary-light)" strokeWidth="2" strokeLinecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:15, fontWeight:700, marginBottom:1 }}>{obra.nombre}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{assignedCount} empleado{assignedCount!==1?'s':''} asignado{assignedCount!==1?'s':''}</div>
                    </div>
                    <div style={{ fontSize:22, fontWeight:800, color:'var(--primary-light)', fontVariantNumeric:'tabular-nums', flexShrink:0 }}>{mhm(totalMins)}</div>
                  </div>
                  <div className="progress-track" style={{ marginBottom:12 }}>
                    <div className="progress-fill" style={{ width: pct + '%', background:'linear-gradient(90deg,var(--primary),var(--accent))' }} />
                  </div>
                  {empData.length > 0 && (
                    <div style={{ display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                      {empData.map(({ e, mins, days }) => (
                        <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:22, height:22, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {(e.initials||e.name.slice(0,2)).toUpperCase()}
                          </div>
                          <div style={{ flex:1, fontSize:12, color:'var(--text2)' }}>{e.name}</div>
                          <div style={{ fontSize:11, color:'var(--text3)' }}>{days}d</div>
                          <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', minWidth:52, textAlign:'right' }}>{mhm(mins)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {empData.length === 0 && <div style={{ fontSize:12, color:'var(--text4)' }}>Sin horas registradas este mes</div>}
                </div>
              )
            })}
            {unassignedData.length > 0 && (
              <div className="card-lift" style={{ background:'var(--bg-700)', border:'1px solid var(--border)', borderRadius:'var(--r-lg)', padding:'16px 18px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'rgba(96,116,138,.12)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:15, fontWeight:700, marginBottom:1 }}>Sin obra asignada</div>
                    <div style={{ fontSize:11, color:'var(--text3)' }}>Empleados sin proyecto</div>
                  </div>
                  <div style={{ fontSize:22, fontWeight:800, color:'var(--text3)', fontVariantNumeric:'tabular-nums' }}>{mhm(unassignedData.reduce((s,d)=>s+d.mins,0))}</div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:6, borderTop:'1px solid var(--border)', paddingTop:10 }}>
                  {unassignedData.map(({ e, mins, days }) => (
                    <div key={e.id} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ width:22, height:22, borderRadius:'50%', background:e.color||'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:700, color:'#fff', flexShrink:0 }}>
                        {(e.initials||e.name.slice(0,2)).toUpperCase()}
                      </div>
                      <div style={{ flex:1, fontSize:12, color:'var(--text2)' }}>{e.name}</div>
                      <div style={{ fontSize:11, color:'var(--text3)' }}>{days}d</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'var(--text)', fontVariantNumeric:'tabular-nums', minWidth:52, textAlign:'right' }}>{mhm(mins)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })()}

      {/* Exportar tab */}
      {tab === 'exportar' && (
        <div style={{ maxWidth:520, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Exportar todo - estrella del show */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:10, border:'2px solid var(--primary)', background:'var(--primary-dim)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="var(--primary)" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <div style={{ fontSize:14, fontWeight:700 }}>Informe completo — 4 hojas Excel</div>
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              Un único archivo con <strong>Resumen mensual</strong>, <strong>Detalle diario</strong>, <strong>Fichajes</strong> y <strong>Empleados</strong>. Incluye columnas de horas decimales para fórmulas, totales automáticos y anchos de columna optimizados.
            </div>
            <button className="btn btn-primary" style={{ width:'100%' }} onClick={exportTodoXLSX}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar informe completo ({mesNombreXLSX})
            </button>
          </div>

          {/* Fichajes filtrados */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Exportar fichajes filtrados</div>
            <div style={{ fontSize:12, color:'var(--text3)' }}>Filtra por empleado y rango de fechas. Incluye horas decimales, descansos y totales.</div>
            <div className="field">
              <label>Empleado</label>
              <select value={selEmp} onChange={e => setSelEmp(e.target.value)}>
                <option value="">Todos los empleados</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </div>
            <div className="field-row">
              <div className="field"><label>Desde</label><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
              <div className="field"><label>Hasta</label><input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
            </div>
            <label style={{ display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text2)', cursor:'pointer', userSelect:'none' }}>
              <input type="checkbox" checked={agruparCentro} onChange={e => setAgruparCentro(e.target.checked)}
                style={{ width:16, height:16, cursor:'pointer' }} />
              Agrupar por centro de trabajo
            </label>
            <button className="btn btn-secondary" style={{ width:'100%' }} onClick={exportFichajesXLSX}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar Excel fichajes
            </button>
          </div>

          {/* Informe oficial inspección de trabajo */}
          <div className="dash-widget" style={{ display:'flex', flexDirection:'column', gap:10, border:'1px solid rgba(245,158,11,.35)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:16 }}>⚖️</span>
              <div style={{ fontSize:14, fontWeight:700 }}>Registro oficial — Inspección de Trabajo</div>
            </div>
            <div style={{ fontSize:12, color:'var(--text3)', lineHeight:1.6 }}>
              Registro diario de jornada conforme al <strong>art. 34.9 ET (RD-ley 8/2019)</strong>: una hoja por empleado con el mes completo día a día, CIF de la empresa, DNI del trabajador, pausas, horas extra y espacio de firmas. Conservación obligatoria: 4 años.
              {!db.config?.companyCif && <div style={{ marginTop:6, color:'var(--orange)' }}>⚠ Falta el CIF de la empresa — configúralo en Ajustes para que el informe sea completo.</div>}
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={async () => {
                const r = await exportInspeccionXLSX(db, filterMonth)
                if (r.ok) toast(`Registro oficial descargado (${r.count} empleados)`, 3000, 'ok')
                else toast('No hay empleados activos', 3000, 'warn')
              }}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Excel oficial
              </button>
              <button className="btn btn-secondary" style={{ flex:1 }} onClick={() => printHtml(buildInspeccionHTML(db, filterMonth))}>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" style={{ marginRight:6 }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                PDF con firmas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
