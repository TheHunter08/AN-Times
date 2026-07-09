import { useState, useCallback, useMemo } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { today, calcSecs, calcMin, recWorkSecs, wkStart, p2, mhm, ftime, s2t, monthlyExtras, localDateStr } from '../../utils/time.js'
import { WD, WK } from '../../config/constants.js'
import { PDF_PAGE, pdfColors, pdfSafe, drawTableHeaderRow, drawTableDataRow, drawSignatureBlock, drawFooterLegal, addReportPage, findResponsableFirma } from '../../utils/pdfReport.js'
import { PomodoroWidget } from './PomodoroWidget.jsx'
import { WeeklyBars } from './WeeklyBars.jsx'
import { HistorialReciente } from './HistorialReciente.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'

export function TabJornada({ timer, db, u, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  if (!db.records) return (
    <div className="emp-tab active">
      <div style={{ padding:'16px', display:'flex', flexDirection:'column', gap:12 }}>
        <div className="skeleton" style={{ height:80, borderRadius:14 }} />
        <div className="skeleton" style={{ height:200, borderRadius:18 }} />
        <div className="skeleton" style={{ height:140, borderRadius:14 }} />
      </div>
    </div>
  )
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(todayStr)).sort((a,b) => a.inicio.localeCompare(b.inicio))
  const realRecs = recs.filter(r => !r.fin || recWorkSecs(r) >= 30)
  const o = recs.find(r => !r.fin)

  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  const jT  = { bg: isLight ? '#fff'              : '#000',
                card: isLight ? '#F4F4F6'          : '#0D0D14',
                border: isLight ? 'rgba(0,0,0,.08)': 'rgba(255,255,255,.06)',
                border2: isLight ? 'rgba(0,0,0,.08)': 'rgba(255,255,255,.07)',
                text: isLight ? '#09090B'           : '#fff',
                text2: isLight ? 'rgba(0,0,0,.40)'  : 'rgba(255,255,255,.35)',
                text3: isLight ? 'rgba(0,0,0,.28)'  : 'rgba(255,255,255,.28)',
                badge: isLight ? 'rgba(0,0,0,.05)'  : 'rgba(255,255,255,.07)',
                badgeBorder: isLight ? 'rgba(0,0,0,.10)': 'rgba(255,255,255,.10)',
                badgeText: isLight ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.45)',
                btn: isLight ? 'rgba(0,0,0,.04)'    : 'rgba(255,255,255,.04)',
                btnBorder: isLight ? 'rgba(0,0,0,.10)': 'rgba(255,255,255,.10)',
                btnText: isLight ? 'rgba(0,0,0,.60)' : 'rgba(255,255,255,.65)',
              }

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs = completedSecs + liveSecs
  const totMin = Math.floor(totSecs / 60)
  const brkMin = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)
  const wdEfectivo = db.config?.wdMin || WD

  const now = new Date()
  const ws = wkStart(now)
  // localDateStr (no toISOString().slice(0,10)): ws ya está en medianoche LOCAL
  // (wkStart hace setHours(0,0,0,0)) — toISOString() la convierte a UTC primero,
  // desplazando la fecha un día atrás en España. Al reconstruir con "T00:00:00"
  // (no como fecha-sola) se fuerza de nuevo el parseo en hora local, si no
  // new Date("YYYY-MM-DD") se interpreta como medianoche UTC — casi 1 día
  // entero de diferencia, arrastrando el domingo anterior a "esta semana".
  const wsStr = localDateStr(ws)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr + 'T00:00:00')
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])
  const weekMin = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
  // Horas extra reales: solo cuentan al superar 40h/semana (Estatuto de los Trabajadores),
  // no por pasar de 8h en un día. "Extra hoy" es solo la parte de hoy que empuja la
  // semana por encima de 40h — si la semana aún no llega a 40h, hoy cuenta como normal
  // aunque haya sido un día largo.
  const weekMinAntes = Math.max(0, weekMin - totMin)
  const extraMin = Math.max(0, weekMin - WK) - Math.max(0, weekMinAntes - WK)
  const normMin = Math.max(0, totMin - extraMin)

  const monthMin = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk)).reduce((s, r) => s + calcMin(r), 0),
    [db.records, u.id, mk]
  )

  const tlItems = realRecs.map(r => ({ r, isCurrent: !r.fin }))

  const [informeUrl, setInformeUrl]     = useState(null)
  const [informeBlob, setInformeBlob]   = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingWeekPdf, setGeneratingWeekPdf] = useState(false)
  const [showRangeExport, setShowRangeExport] = useState(false)
  const nowIso = new Date().toISOString().slice(0, 10)
  const [exportFrom, setExportFrom] = useState(nowIso.slice(0, 7) + '-01')
  const [exportTo, setExportTo] = useState(nowIso)
  const [generatingRangePdf, setGeneratingRangePdf] = useState(false)

  const closeInforme = useCallback(() => {
    setInformeUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setInformeBlob(null)
  }, [])

  useModalBack(!!informeUrl, closeInforme)

  const exportRangePDF = async () => {
    if (!exportFrom || !exportTo || exportFrom > exportTo) { return }
    setGeneratingRangePdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const rangeRecs = (db.records || [])
        .filter(r => r.empId === u.id && r.fin && r.inicio >= exportFrom + 'T00:00:00' && r.inicio <= exportTo + 'T23:59:59')
        .sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = rangeRecs.reduce((s,r) => s + calcMin(r), 0)
      const rangeLabel = `${exportFrom} – ${exportTo}`

      const pdfDoc = await PDFDocument.create()
      const fontR  = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB  = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const safe = pdfSafe
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label:'Fecha', w:72 }, { label:'Entrada', w:52 }, { label:'Salida', w:52 },
        { label:'Centro / Obra', w:279 }, { label:'Horas netas', w:70 },
      ]
      const ROW_H = 15, HEAD_H = 17
      const cPri   = rgb(0.36,0.38,0.82), cPriLt = rgb(0.94,0.93,1.0)
      const cDark  = rgb(0.10,0.10,0.15), cGray  = rgb(0.45,0.45,0.50)
      const cBorder= rgb(0.87,0.87,0.92), cWhite = rgb(1,1,1)
      let page = pdfDoc.addPage([PW, PH])
      let y = PH - 45
      page.drawText('INFORME DE JORNADA — RANGO', { x:ML, y, size:13, font:fontB, color:cPri })
      y -= 18
      page.drawText(safe(u.name), { x:ML, y, size:10, font:fontB, color:cDark })
      y -= 14
      page.drawText(`Período: ${rangeLabel}`, { x:ML, y, size:8, font:fontR, color:cGray })
      y -= 18
      let cx = ML
      COLS.forEach(col => {
        page.drawRectangle({ x:cx, y:y-HEAD_H+3, width:col.w, height:HEAD_H, color:cPri })
        page.drawText(col.label, { x:cx+4, y:y-HEAD_H+8, size:7, font:fontB, color:cWhite, maxWidth:col.w-8 })
        cx += col.w
      })
      y -= HEAD_H
      rangeRecs.forEach((r, idx) => {
        if (y - ROW_H < 50) { page = pdfDoc.addPage([PW, PH]); y = PH - 45 }
        if (idx % 2 === 0) page.drawRectangle({ x:ML, y:y-ROW_H+3, width:CW, height:ROW_H, color:cPriLt })
        const d = new Date(r.inicio)
        const cols2 = [
          `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}`,
          `${p2(d.getHours())}:${p2(d.getMinutes())}`,
          r.fin ? `${p2(new Date(r.fin).getHours())}:${p2(new Date(r.fin).getMinutes())}` : '--',
          safe(r.centro || ''),
          mhm(calcMin(r)),
        ]
        let cx2 = ML
        cols2.forEach((val, ci) => {
          page.drawText(val, { x:cx2+4, y:y-ROW_H+7, size:7, font:fontR, color:cDark, maxWidth:COLS[ci].w-8 })
          cx2 += COLS[ci].w
        })
        y -= ROW_H
      })
      y -= 10
      page.drawText(`Total: ${mhm(totalMin2)} en ${rangeRecs.length} registros`, { x:ML, y, size:9, font:fontB, color:cPri })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
      setShowRangeExport(false)
    } catch(e) {
      toast('Error al generar PDF de rango: ' + (e?.message || e))
    } finally {
      setGeneratingRangePdf(false)
    }
  }

  const exportMonthPDF = async () => {
    setGeneratingPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const colors = pdfColors(rgb)
      const now2 = new Date()
      const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
      const monthRecs = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk2)).sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = monthRecs.reduce((s,r) => s + calcMin(r), 0)
      const monthName = now2.toLocaleDateString('es-ES', { month:'long', year:'numeric' })

      const pdfDoc  = await PDFDocument.create()
      const fontR   = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

      // Helper: fecha local (no UTC) para mostrar en PDF
      const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` }
      const safe = pdfSafe

      // ─ Layout constants ────────────────────────────────────────────
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35        // margins left/right
      const CW = PW - ML - MR       // 525 content width
      const COLS = [
        { label:'Fecha',              w: 72 },
        { label:'Entrada',            w: 52 },
        { label:'Salida',             w: 52 },
        { label:'Centro / Obra',      w: 279 },
        { label:'Horas netas',        w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      const cPri = colors.pri, cPriLt = colors.priLt, cDark = colors.dark, cGray = colors.gray
      const cLtGray = colors.ltGray, cBorder = colors.border, cWhite = colors.white, cGreen = colors.green

      // ─ Page helpers ────────────────────────────────────────────────
      let page, y, pageNum = 0

      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml:ML, mr:MR, cw:CW, pw:PW, ph:PH, pageNum, colors, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL',
          subtitle: `Trabajador: ${u.name}   .   Mes: ${monthName}   .   Obras: ${obras}`,
        }))
      }

      const tableHeader = () => { y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H }) }

      // ─ Cover page ─────────────────────────────────────────────────
      const cover = pdfDoc.addPage([PW, PH])
      // header band
      cover.drawRectangle({ x:0, y:PH-120, width:PW, height:120, color:cPri })
      cover.drawText(safe(u.empresa || 'TIMES INC'), { x:ML, y:PH-50, size:24, font:fontB, color:cWhite })
      cover.drawText('REGISTRO DE JORNADA LABORAL', { x:ML, y:PH-78, size:11, font:fontR, color:rgb(0.8,0.82,1) })
      cover.drawText(new Date().toLocaleDateString('es-ES'), { x:PW-MR-90, y:PH-50, size:10, font:fontR, color:rgb(0.8,0.82,1) })
      // main info block
      const ly = (n) => PH - 200 - n * 28
      cover.drawText('Trabajador', { x:ML, y:ly(0)+10, size:8, font:fontR, color:cGray })
      cover.drawText(safe(u.name), { x:ML, y:ly(0)-6, size:16, font:fontB, color:cDark })
      cover.drawLine({ start:{x:ML,y:ly(0)-16}, end:{x:PW-MR,y:ly(0)-16}, thickness:0.4, color:cBorder })
      cover.drawText('Periodo', { x:ML, y:ly(1)+10, size:8, font:fontR, color:cGray })
      cover.drawText(monthName.charAt(0).toUpperCase() + monthName.slice(1), { x:ML, y:ly(1)-6, size:16, font:fontB, color:cDark })
      cover.drawLine({ start:{x:ML,y:ly(1)-16}, end:{x:PW-MR,y:ly(1)-16}, thickness:0.4, color:cBorder })
      cover.drawText('Centro / Obra', { x:ML, y:ly(2)+10, size:8, font:fontR, color:cGray })
      cover.drawText(safe(u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')), { x:ML, y:ly(2)-6, size:12, font:fontB, color:cDark, maxWidth:CW })
      cover.drawLine({ start:{x:ML,y:ly(2)-16}, end:{x:PW-MR,y:ly(2)-16}, thickness:0.4, color:cBorder })
      // stats row
      const statsY = ly(3) - 10
      cover.drawRectangle({ x:ML, y:statsY-80, width:CW, height:80, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      const exCover = monthlyExtras(db.records, u.id, mk2)
      const statItems = [
        { label:'Jornadas', val: String(monthRecs.length) },
        { label:'Total horas', val: mhm(totalMin2) },
        { label:'H. extra', val: exCover.netExtraMin > 0 ? `+${mhm(exCover.netExtraMin)}` : exCover.deficitMin > 0 ? `-${mhm(exCover.deficitMin)}` : '0h' },
        { label:'Objetivo 160h', val: totalMin2 >= 9600 ? 'OK (160h)' : `Falta ${mhm(9600 - totalMin2)}` },
      ]
      const statW = CW / statItems.length
      statItems.forEach((s, i) => {
        const sx = ML + i * statW + statW / 2
        cover.drawText(s.label, { x:sx-20, y:statsY-25, size:7.5, font:fontR, color:cGray, maxWidth:statW-8 })
        cover.drawText(s.val, { x:sx-26, y:statsY-50, size:14, font:fontB, color:cPri, maxWidth:statW-4 })
      })
      cover.drawText(
        'Generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.',
        { x:ML, y:40, size:6, font:fontR, color:cGray, maxWidth:CW }
      )

      // ─ Start first page ────────────────────────────────────────────
      newPage(); tableHeader()

      // ─ Data rows ──────────────────────────────────────────────────
      monthRecs.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [ localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm) ]
        y = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors, fontR, fontB, highlightIdx:4, rowH:ROW_H })
      })

      // ─ Total + resumen vs objetivo (regla TIMES INC: 160h/mes, extras semanales >40h) ─────
      if (y - 50 < 35 + SIG_AREA) { newPage() }
      const exPdf = monthlyExtras(db.records, u.id, mk2)
      const targetMin2 = 9600  // 160h = objetivo mensual TIMES INC
      const cDiff = exPdf.netExtraMin > 0 ? cGreen : exPdf.deficitMin > 0 ? rgb(0.87,0.27,0.27) : cPri
      page.drawRectangle({ x:ML, y:y-50, width:CW, height:50, color:cPriLt, borderColor:cPri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${monthRecs.length} jornada${monthRecs.length!==1?'s':''} registrada${monthRecs.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:cPri })
      page.drawText(`Objetivo mensual: 160h (${mhm(targetMin2)})`, { x:ML+8, y:y-28, size:7.5, font:fontR, color:cDark, maxWidth:CW-16 })
      const extraLine = exPdf.netExtraMin > 0
        ? `H. extra netas: +${mhm(exPdf.netExtraMin)}  (${mhm(exPdf.weeklyExtraMin)} sem. - ${mhm(exPdf.shortfallMin)} def.)`
        : exPdf.deficitMin > 0
          ? `Deficit: -${mhm(exPdf.deficitMin)} para completar las 160h obligatorias`
          : totalMin2 >= targetMin2 ? 'Objetivo de 160h alcanzado' : `Pendiente: ${mhm(targetMin2 - totalMin2)} para las 160h`
      page.drawText(extraLine, { x:ML+8, y:y-42, size:7.5, font:fontB, color:cDiff, maxWidth:CW-16 })
      y -= 58

      // ─ Signature block ────────────────────────────────────────────
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:cGray })

      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x:ML, y, width:130, colors, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : null,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      })

      // ─ Firma del responsable (jefe de obra de la misma obra) ─────
      const { firma: responsableFirma, nombre: responsableNombre } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x:ML+CW/2, y:y-11, size:6.5, font:fontB, color:cGray })
      await drawSignatureBlock(pdfDoc, page, {
        x:ML+CW/2, y, width:130, colors, fontR, fontB,
        signatureDataUrl: responsableFirma?.data,
        label: responsableNombre,
      })

      // ─ Legal footer ───────────────────────────────────────────────
      drawFooterLegal(page, { ml:ML, cw:CW, colors, fontR })

      // ─ Save & show ────────────────────────────────────────────────
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
    } catch(e) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingPdf(false)
    }
  }

  const exportWeekPDF = async () => {
    setGeneratingWeekPdf(true)
    try {
      const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')
      const colors = pdfColors(rgb)
      const now2 = new Date()
      const ws2 = wkStart(now2)
      const weekRecs2 = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio && new Date(r.inicio) >= ws2).sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = weekRecs2.reduce((s,r) => s + calcMin(r), 0)
      const weekLabel = `Semana del ${ws2.toLocaleDateString('es-ES', { day:'numeric', month:'long' })} al ${now2.toLocaleDateString('es-ES', { day:'numeric', month:'long', year:'numeric' })}`

      const pdfDoc  = await PDFDocument.create()
      const fontR   = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` }

      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35
      const CW = PW - ML - MR
      const COLS = [
        { label:'Fecha', w: 72 },
        { label:'Entrada', w: 52 },
        { label:'Salida', w: 52 },
        { label:'Centro / Obra', w: 279 },
        { label:'Horas netas', w: 70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      const cPri = colors.pri, cGray = colors.gray, cGreen = colors.green

      let page, y, pageNum = 0
      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml:ML, mr:MR, cw:CW, pw:PW, ph:PH, pageNum, colors, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL - INFORME SEMANAL',
          subtitle: `Trabajador: ${u.name}   .   ${weekLabel}   .   Obras: ${obras}`,
        }))
      }
      const tableHeader = () => { y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors, fontB, headH:HEAD_H }) }
      newPage(); tableHeader()
      weekRecs2.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [ localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm) ]
        y = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors, fontR, fontB, highlightIdx:4, rowH:ROW_H })
      })
      if (y - 40 < 35 + SIG_AREA) { newPage() }
      const targetMin2 = weekRecs2.length * 480
      const diffMin2 = totalMin2 - targetMin2
      const diffSign = diffMin2 >= 0 ? '+' : ''
      const cDiff = diffMin2 >= 0 ? cGreen : colors.red
      page.drawRectangle({ x:ML, y:y-40, width:CW, height:40, color:colors.priLt, borderColor:cPri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${weekRecs2.length} jornada${weekRecs2.length!==1?'s':''} registrada${weekRecs2.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:cPri })
      page.drawText(`Objetivo: ${mhm(targetMin2)}   Desviación: ${diffSign}${mhm(Math.abs(diffMin2))}`, { x:ML+8, y:y-30, size:7.5, font:fontR, color:cDiff, maxWidth:CW-16 })
      y -= 48
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:cGray })
      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x:ML, y, width:130, colors, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : null,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      })
      // ─ Firma del responsable (jefe de obra de la misma obra) ─────
      const { firma: responsableFirmaW, nombre: responsableNombreW } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x:ML+CW/2, y:y-11, size:6.5, font:fontB, color:cGray })
      await drawSignatureBlock(pdfDoc, page, {
        x:ML+CW/2, y, width:130, colors, fontR, fontB,
        signatureDataUrl: responsableFirmaW?.data,
        label: responsableNombreW,
      })
      drawFooterLegal(page, { ml:ML, cw:CW, colors, fontR })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeUrl(URL.createObjectURL(blob))
    } catch(e) {
      toast('Error al generar el PDF: ' + (e?.message || e))
    } finally {
      setGeneratingWeekPdf(false)
    }
  }

  return (
    <>
    <PullToRefresh>
      {/* ── TIMES INC 3.0 — Jornada Header ──────────────── */}
      <div className="jor-header" style={{ padding:'20px 20px 16px', background:jT.bg, borderBottom:`1px solid ${jT.border}`, display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontSize:30, fontWeight:900, letterSpacing:'-1.5px', color:jT.text, lineHeight:1.1 }}>Mi Jornada</div>
          <div style={{ fontSize:13, color:jT.text2, marginTop:4, textTransform:'capitalize' }}>
            {now.toLocaleDateString('es-ES', { weekday:'long', day:'numeric', month:'long' })}
          </div>
        </div>
        <div style={{ fontSize:10, color:jT.badgeText, background:jT.badge, border:`1px solid ${jT.badgeBorder}`, borderRadius:999, padding:'5px 13px', fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px', marginTop:4 }}>
          Hoy
        </div>
      </div>

      {/* ── TIMES INC 3.0 — Stat Pills ───────────────────── */}
      <div className="jor-kpi-grid" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, padding:'14px 16px', background:jT.bg }}>
        <div className="jor-kpi-card" style={{ background:jT.card, border:`1px solid ${weekMin > WK ? 'rgba(245,158,11,.22)' : 'rgba(59,91,255,.22)'}`, borderRadius:18, padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ fontSize:18, marginBottom:2 }}>{weekMin > WK ? '🔴' : '⏱️'}</div>
          <div style={{ fontSize:17, fontWeight:800, color: weekMin > WK ? '#fbbf24' : '#818cf8', fontVariantNumeric:'tabular-nums', lineHeight:1, letterSpacing:'-0.5px' }}>{mhm(Math.floor(weekMin))}</div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:jT.text3 }}>Semana{weekMin > WK ? ' ↑' : ''}</div>
        </div>
        <div className="jor-kpi-card" style={{ background:jT.card, border:'1px solid rgba(16,185,129,.18)', borderRadius:18, padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ fontSize:18, marginBottom:2 }}>✅</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#34d399', fontVariantNumeric:'tabular-nums', lineHeight:1, letterSpacing:'-0.5px' }}>{mhm(normMin)}</div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:jT.text3 }}>Normal hoy</div>
        </div>
        <div className="jor-kpi-card" style={{ background:jT.card, border:'1px solid rgba(245,158,11,.18)', borderRadius:18, padding:'14px 10px', display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
          <div style={{ fontSize:18, marginBottom:2 }}>⚡</div>
          <div style={{ fontSize:17, fontWeight:800, color:'#fbbf24', fontVariantNumeric:'tabular-nums', lineHeight:1, letterSpacing:'-0.5px' }}>{mhm(extraMin)}</div>
          <div style={{ fontSize:9, fontWeight:700, letterSpacing:'.5px', textTransform:'uppercase', color:jT.text3 }}>Extra hoy</div>
        </div>
      </div>

      {/* ── TIMES INC 3.0 — Total card + Weekly chart ────── */}
      <div style={{ padding:'0 16px 12px' }}>
        <div className="jor-total-card" style={{ background:jT.card, border:`1px solid ${jT.border2}`, borderRadius:22, padding:'18px 18px 14px', marginBottom:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <div style={{ fontSize:11, color:jT.text2, fontWeight:600, textTransform:'uppercase', letterSpacing:'.5px' }}>Total trabajado hoy</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#818cf8', background:'rgba(99,102,241,.15)', border:'1px solid rgba(99,102,241,.25)', padding:'3px 10px', borderRadius:999 }}>
              {Math.round(totMin / (wdEfectivo || 480) * 100)}%
            </div>
          </div>
          <div style={{ fontSize:44, fontWeight:800, letterSpacing:'-2px', color:jT.text, fontVariantNumeric:'tabular-nums', lineHeight:1, marginBottom:14 }}>{mhm(totMin)}</div>

          {/* Weekly mini bar chart */}
          <WeeklyBars db={db} u={u} timer={timer} />

          <div style={{ display:'flex', flexDirection:'column', gap:8, paddingTop:12, borderTop:`1px solid ${jT.border}` }}>
            {[
              { lbl:'Descansos', val: mhm(brkMin), color:'#fbbf24' },
              { lbl:'Mes actual', val: mhm(monthMin), color:'#2dd4bf' },
            ].map(({ lbl, val, color }) => (
              <div key={lbl} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:13 }}>
                <span style={{ color:jT.text2, fontWeight:500 }}>{lbl}</span>
                <span style={{ fontWeight:700, color }}>{val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── TIMES INC 3.0 — PDF export buttons ──────────── */}
      <div className="jor-pdf-row" style={{ padding:'0 16px 6px', display:'flex', gap:8, flexWrap:'wrap' }}>
        <button onClick={exportWeekPDF} disabled={generatingWeekPdf}
          style={{ flex:1, padding:'11px 10px', borderRadius:14, border:`1px solid ${jT.btnBorder}`, background:jT.btn, color:jT.btnText, fontSize:11, fontWeight:600, fontFamily:'inherit', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5, opacity: generatingWeekPdf ? 0.7 : 1, transition:'all 120ms ease', WebkitTapHighlightColor:'transparent' }}>
          {generatingWeekPdf ? <><span className="login-spinner" style={{ width:10,height:10,borderWidth:1.5,borderColor:'rgba(255,255,255,.1)',borderTopColor:'rgba(255,255,255,.5)',marginRight:5,display:'inline-block',verticalAlign:'middle' }}/>Generando…</> : <>📅 Semanal</>}
        </button>
        <button onClick={exportMonthPDF} disabled={generatingPdf}
          style={{ flex:1, padding:'11px 10px', borderRadius:14, border:`1px solid ${jT.btnBorder}`, background:jT.btn, color:jT.btnText, fontSize:11, fontWeight:600, fontFamily:'inherit', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:5, opacity: generatingPdf ? 0.7 : 1, transition:'all 120ms ease', WebkitTapHighlightColor:'transparent' }}>
          {generatingPdf ? <><span className="login-spinner" style={{ width:10,height:10,borderWidth:1.5,borderColor:'rgba(255,255,255,.1)',borderTopColor:'rgba(255,255,255,.5)',marginRight:5,display:'inline-block',verticalAlign:'middle' }}/>Generando…</> : <><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>PDF firmado</>}
        </button>
        <button onClick={() => setShowRangeExport(v => !v)}
          style={{ padding:'11px 14px', borderRadius:14, border:`1px solid ${jT.btnBorder}`, background:jT.btn, color:jT.btnText, fontSize:11, fontWeight:600, fontFamily:'inherit', cursor:'pointer', transition:'all 120ms ease', WebkitTapHighlightColor:'transparent' }}>
          📆
        </button>
      </div>
      {showRangeExport && (
        <div style={{ margin:'0 16px 10px', padding:12, background:'var(--bg-500)', borderRadius:12, border:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--text2)' }}>Exportar por rango de fechas</div>
          <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1 }}>
              <label style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>Desde</label>
              <input type="date" value={exportFrom} onChange={e => setExportFrom(e.target.value)}
                style={{ fontSize:12, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', outline:'none' }} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:3, flex:1 }}>
              <label style={{ fontSize:10, color:'var(--text3)', fontWeight:600 }}>Hasta</label>
              <input type="date" value={exportTo} onChange={e => setExportTo(e.target.value)}
                style={{ fontSize:12, padding:'6px 8px', borderRadius:8, border:'1px solid var(--border)', background:'var(--bg)', color:'var(--text2)', outline:'none' }} />
            </div>
          </div>
          <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowRangeExport(false)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" onClick={exportRangePDF} disabled={generatingRangePdf} style={{ opacity: generatingRangePdf ? 0.7 : 1 }}>
              {generatingRangePdf ? 'Generando…' : 'Exportar PDF'}
            </button>
          </div>
        </div>
      )}

      {/* ── Pomodoro ─────────────────────────────────────────── */}
      {o && (
        <div style={{ padding:'0 16px 12px' }}>
          <PomodoroWidget />
        </div>
      )}

      {/* Premium social-feed timeline */}
      <div style={{ padding: '0 16px 12px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text4)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 14 }}>
          Actividad de hoy
        </div>
        {!tlItems.length ? (
          <div className="empty-premium">
            <div className="empty-premium-icon">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
            </div>
            <div className="empty-premium-title">Sin actividad hoy</div>
            <div className="empty-premium-sub">Inicia tu jornada desde Inicio para ver tu actividad aquí</div>
          </div>
        ) : (
          <div className="tl-premium">
            {tlItems.map(({ r, isCurrent }) => {
              const ws2 = isCurrent ? timer.ws : recWorkSecs(r)
              const bk = isCurrent ? timer.bs : (r.breakSecs || 0)
              const iconClass = isCurrent ? 'live' : r.fin ? 'salida' : 'pausa'
              const icon = isCurrent ? '▶️' : r.fin ? '✅' : '⏸️'
              return (
                <div key={r.id} className="tl-prem-item">
                  <div className={`tl-prem-icon ${iconClass}`}>{icon}</div>
                  <div className="tl-prem-body">
                    <div className="tl-prem-time">{ftime(r.inicio)}{r.fin ? ` → ${ftime(r.fin)}` : ' → ahora'}</div>
                    <div className="tl-prem-title">{isCurrent ? 'En progreso' : 'Completado'}</div>
                    <div className="tl-prem-sub">{r.centro || u.centroTrabajo || 'Sin centro'}{bk > 30 ? ` · Pausa: ${mhm(Math.floor(bk / 60))}` : ''}</div>
                    <span className="tl-prem-duration">{isCurrent ? s2t(ws2) : mhm(Math.floor(ws2 / 60))}</span>
                  </div>
                </div>
              )
            })}
            {/* Estimated end */}
            {o && (() => {
              const estEnd = new Date(new Date(o.inicio).getTime() + wdEfectivo * 60000)
              const estHH = p2(estEnd.getHours()), estMM = p2(estEnd.getMinutes())
              return (
                <div className="tl-prem-item" style={{ opacity: .4 }}>
                  <div className="tl-prem-icon salida" style={{ borderStyle: 'dashed' }}>🔴</div>
                  <div className="tl-prem-body">
                    <div className="tl-prem-time">{estHH}:{estMM} est.</div>
                    <div className="tl-prem-title">Salida estimada</div>
                    <div className="tl-prem-sub">Según horario configurado</div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {/* Banner jornadas pendientes de validar */}
      {(() => {
        const pendVal = (db.records || []).filter(r => r.empId === u.id && r.fin && !r.aceptada)
        if (!pendVal.length) return null
        return (
          <div style={{ margin:'0 16px 4px', padding:'10px 14px', background:'var(--orange-dim)', border:'1px solid rgba(245,158,11,.25)', borderRadius:'var(--r)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:16 }}>⏳</span>
            <div style={{ flex:1, fontSize:12 }}>
              <span style={{ fontWeight:700, color:'var(--orange)' }}>{pendVal.length} jornada{pendVal.length !== 1 ? 's' : ''} pendiente{pendVal.length !== 1 ? 's' : ''} de validación</span>
              <span style={{ color:'var(--text3)', marginLeft:4 }}>por el encargado</span>
            </div>
          </div>
        )
      })()}

      {/* Historial últimos 30 días */}
      {(() => {
        const histDays = Array.from({ length: 30 }, (_, i) => {
          const d = new Date(now)
          d.setDate(d.getDate() - i - 1)
          return d.toISOString().slice(0, 10)
        })
        const histWithRecs = histDays.map(ds => ({
          ds,
          recs: (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(ds) && r.fin),
        })).filter(h => h.recs.length > 0)
        if (!histWithRecs.length) return null
        return (
          <HistorialReciente histWithRecs={histWithRecs} openModal={openModal} u={u} />
        )
      })()}

      <div style={{ height: 20 }} />
    </PullToRefresh>

    {/* Informe in-app fullscreen overlay */}
    {informeUrl && (() => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      const dlName = `jornada-${new Date().toISOString().slice(0,7)}.pdf`
      return (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'var(--bg-800)', display:'flex', flexDirection:'column' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'var(--bg-700)', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <button onClick={closeInforme} style={{ display:'flex', alignItems:'center', gap:5, background:'var(--bg-500)', border:'1px solid var(--border)', borderRadius:20, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, color:'var(--text2)', WebkitTapHighlightColor:'transparent' }}>
              ← Volver
            </button>
            <span style={{ fontSize:13, fontWeight:700, flex:1 }}>Registro de jornada</span>
            <a href={informeUrl} download={dlName}
              style={{ display:'flex', alignItems:'center', gap:5, background:'var(--primary)', border:'none', borderRadius:20, padding:'6px 14px', cursor:'pointer', fontFamily:'inherit', fontSize:12, fontWeight:700, color:'#fff', textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Descargar
            </a>
          </div>
          {isMobile ? (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:18, padding:24 }}>
              <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke="var(--primary-light)" strokeWidth="1.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              <div style={{ fontSize:14, fontWeight:600, color:'var(--text2)', textAlign:'center', lineHeight:1.5 }}>Tu informe de jornada está listo.<br/>Descárgalo o ábrelo en el navegador.</div>
              <div style={{ display:'flex', gap:10, width:'100%', maxWidth:320 }}>
                <a href={informeUrl} download={dlName} style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px', background:'var(--primary)', color:'#fff', borderRadius:'var(--r)', fontWeight:700, fontSize:13, textDecoration:'none', WebkitTapHighlightColor:'transparent' }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  Descargar PDF
                </a>
                {informeBlob && 'share' in navigator && (
                  <button onClick={() => navigator.share({ files: [new File([informeBlob], dlName, { type:'application/pdf' })], title:'Registro de jornada' }).catch(()=>{})}
                    style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'13px', background:'var(--bg-500)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:'var(--r)', fontWeight:700, fontSize:13, cursor:'pointer', fontFamily:'inherit', WebkitTapHighlightColor:'transparent' }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>
                    Compartir
                  </button>
                )}
              </div>
            </div>
          ) : (
            <iframe src={informeUrl} title="Registro de jornada" style={{ flex:1, border:'none', width:'100%', background:'#fff' }} />
          )}
        </div>
      )
    })()}
    </>
  )
}
