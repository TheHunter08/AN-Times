import { useState, useCallback, useMemo } from 'react'
import { useModalBack } from '../../hooks/useModalBack.js'
import { today, calcSecs, calcMin, recWorkSecs, wkStart, p2, mhm, ftime, s2t, monthlyExtras, localDateStr } from '../../utils/time.js'
import { WD, WK } from '../../config/constants.js'
import { PDF_PAGE, pdfColors, pdfSafe, drawTableHeaderRow, drawTableDataRow, drawSignatureBlock, drawFooterLegal, addReportPage, findResponsableFirma } from '../../utils/pdfReport.js'
import { PomodoroWidget } from './PomodoroWidget.jsx'
import { WeeklyBars } from './WeeklyBars.jsx'
import { HistorialReciente } from './HistorialReciente.jsx'
import { PullToRefresh } from './PullToRefresh.jsx'
import { colors } from '../../ui-v2/design-system/colors'
import { radius } from '../../ui-v2/design-system/radius'

function PdfBtn({ onClick, loading, label }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      flex: 1, padding: '11px 10px', borderRadius: radius.lg,
      border: `1px solid ${colors.border.default}`, background: colors.bg[500],
      color: colors.text[700], fontSize: 11, fontWeight: 600, fontFamily: 'inherit',
      cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      opacity: loading ? 0.7 : 1,
    }}>
      {loading ? 'Generando…' : label}
    </button>
  )
}

export function TabJornada({ timer, db, u, toast, saveDB, openModal, closeModal, activeModal, modalData }) {
  // ── Pure computed values needed by hooks (before any early return) ──
  const now = new Date()
  const ws = wkStart(now)
  const wsStr = localDateStr(ws)
  const mk = `${now.getFullYear()}-${p2(now.getMonth()+1)}`
  const nowIso = localDateStr(new Date())

  // ── All hooks unconditionally ──────────────────────────────────────
  const [informeUrl, setInformeUrl]       = useState(null)
  const [informeBlob, setInformeBlob]     = useState(null)
  const [informeHash, setInformeHash]     = useState(null)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatingWeekPdf, setGeneratingWeekPdf] = useState(false)
  const [showRangeExport, setShowRangeExport] = useState(false)
  const [exportFrom, setExportFrom] = useState(nowIso.slice(0, 7) + '-01')
  const [exportTo, setExportTo]     = useState(nowIso)
  const [generatingRangePdf, setGeneratingRangePdf] = useState(false)

  const closeInforme = useCallback(() => {
    setInformeUrl(prev => { if (prev) URL.revokeObjectURL(prev); return null })
    setInformeBlob(null)
  }, [])

  useModalBack(!!informeUrl, closeInforme)

  const weekRecs = useMemo(() => {
    const wsDate = new Date(wsStr + 'T00:00:00')
    return (db.records || []).filter(r => r.empId === u.id && r.fin && new Date(r.inicio) >= wsDate)
  }, [db.records, u.id, wsStr])

  const monthMin = useMemo(
    () => (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk))
           .reduce((s, r) => s + calcMin(r), 0),
    [db.records, u.id, mk]
  )

  // ── Early return AFTER all hooks ───────────────────────────────────
  if (!db.records) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[80, 200, 140].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 14 }} />
      ))}
    </div>
  )

  // ── Derived state ──────────────────────────────────────────────────
  const todayStr = today()
  const recs = (db.records || []).filter(r => r.empId === u.id && r.inicio?.startsWith(todayStr)).sort((a,b) => a.inicio.localeCompare(b.inicio))
  const realRecs = recs.filter(r => !r.fin || recWorkSecs(r) >= 30)
  const o = recs.find(r => !r.fin)

  const completedSecs = realRecs.filter(r => r.fin && r.closed).reduce((a, r) => a + recWorkSecs(r), 0)
  const liveSecs = o ? calcSecs(o).work : 0
  const totSecs  = completedSecs + liveSecs
  const totMin   = Math.floor(totSecs / 60)
  const brkMin   = recs.reduce((a, r) => a + Math.floor((r.breakSecs || 0) / 60), 0)
  const wdEfectivo = db.config?.wdMin || WD

  const weekMin      = weekRecs.reduce((s, r) => s + calcMin(r), 0) + (timer.state !== 'idle' ? Math.floor(timer.ws / 60) : 0)
  const weekMinAntes = Math.max(0, weekMin - totMin)
  const extraMin     = Math.max(0, weekMin - WK) - Math.max(0, weekMinAntes - WK)
  const normMin      = Math.max(0, totMin - extraMin)

  const tlItems = realRecs.map(r => ({ r, isCurrent: !r.fin }))

  // ── PDF functions (pdf-lib loaded lazily) ──────────────────────────
  const exportRangePDF = async () => {
    if (!exportFrom || !exportTo || exportFrom > exportTo) return
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
      const cWhite = rgb(1,1,1)
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
      const pdfCols = pdfColors(rgb)
      const now2 = new Date()
      const mk2 = `${now2.getFullYear()}-${p2(now2.getMonth()+1)}`
      const monthRecs = (db.records || []).filter(r => r.empId === u.id && r.fin && r.inicio?.startsWith(mk2)).sort((a,b) => a.inicio.localeCompare(b.inicio))
      const totalMin2 = monthRecs.reduce((s,r) => s + calcMin(r), 0)
      const monthName = now2.toLocaleDateString('es-ES', { month:'long', year:'numeric' })
      const pdfDoc  = await PDFDocument.create()
      const fontR   = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontB   = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const localDate = iso => { const d = new Date(iso); return `${d.getFullYear()}-${p2(d.getMonth()+1)}-${p2(d.getDate())}` }
      const safe = pdfSafe
      const { W: PW, H: PH } = PDF_PAGE
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label:'Fecha', w:72 }, { label:'Entrada', w:52 }, { label:'Salida', w:52 },
        { label:'Centro / Obra', w:279 }, { label:'Horas netas', w:70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      const cGreen = pdfCols.green
      let page, y, pageNum = 0
      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml:ML, mr:MR, cw:CW, pw:PW, ph:PH, pageNum, colors: pdfCols, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL',
          subtitle: `Trabajador: ${u.name}   .   Mes: ${monthName}   .   Obras: ${obras}`,
        }))
      }
      const tableHeader = () => { y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors: pdfCols, fontB, headH:HEAD_H }) }
      const cover = pdfDoc.addPage([PW, PH])
      cover.drawRectangle({ x:0, y:PH-120, width:PW, height:120, color:pdfCols.pri })
      cover.drawText(safe(u.empresa || 'TIMES INC'), { x:ML, y:PH-50, size:24, font:fontB, color:pdfCols.white })
      cover.drawText('REGISTRO DE JORNADA LABORAL', { x:ML, y:PH-78, size:11, font:fontR, color:rgb(0.8,0.82,1) })
      cover.drawText(new Date().toLocaleDateString('es-ES'), { x:PW-MR-90, y:PH-50, size:10, font:fontR, color:rgb(0.8,0.82,1) })
      const ly = (n) => PH - 200 - n * 28
      cover.drawText('Trabajador', { x:ML, y:ly(0)+10, size:8, font:fontR, color:pdfCols.gray })
      cover.drawText(safe(u.name), { x:ML, y:ly(0)-6, size:16, font:fontB, color:pdfCols.dark })
      cover.drawLine({ start:{x:ML,y:ly(0)-16}, end:{x:PW-MR,y:ly(0)-16}, thickness:0.4, color:pdfCols.border })
      cover.drawText('Periodo', { x:ML, y:ly(1)+10, size:8, font:fontR, color:pdfCols.gray })
      cover.drawText(monthName.charAt(0).toUpperCase() + monthName.slice(1), { x:ML, y:ly(1)-6, size:16, font:fontB, color:pdfCols.dark })
      cover.drawLine({ start:{x:ML,y:ly(1)-16}, end:{x:PW-MR,y:ly(1)-16}, thickness:0.4, color:pdfCols.border })
      cover.drawText('Centro / Obra', { x:ML, y:ly(2)+10, size:8, font:fontR, color:pdfCols.gray })
      cover.drawText(safe(u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')), { x:ML, y:ly(2)-6, size:12, font:fontB, color:pdfCols.dark, maxWidth:CW })
      cover.drawLine({ start:{x:ML,y:ly(2)-16}, end:{x:PW-MR,y:ly(2)-16}, thickness:0.4, color:pdfCols.border })
      const statsY = ly(3) - 10
      cover.drawRectangle({ x:ML, y:statsY-80, width:CW, height:80, color:pdfCols.priLt, borderColor:pdfCols.pri, borderWidth:0.6 })
      const exCover = monthlyExtras(db.records, u.id, mk2)
      const statItems = [
        { label:'Jornadas',     val: String(monthRecs.length) },
        { label:'Total horas',  val: mhm(totalMin2) },
        { label:'H. extra',     val: exCover.netExtraMin > 0 ? `+${mhm(exCover.netExtraMin)}` : exCover.deficitMin > 0 ? `-${mhm(exCover.deficitMin)}` : '0h' },
        { label:'Objetivo 160h', val: totalMin2 >= 9600 ? 'OK (160h)' : `Falta ${mhm(9600 - totalMin2)}` },
      ]
      const statW = CW / statItems.length
      statItems.forEach((s, i) => {
        const sx = ML + i * statW + statW / 2
        cover.drawText(s.label, { x:sx-20, y:statsY-25, size:7.5, font:fontR, color:pdfCols.gray, maxWidth:statW-8 })
        cover.drawText(s.val,   { x:sx-26, y:statsY-50, size:14,  font:fontB, color:pdfCols.pri,  maxWidth:statW-4 })
      })
      cover.drawText(
        'Generado automáticamente por TIMES INC conforme al RDL 8/2019 de registro diario de jornada.',
        { x:ML, y:40, size:6, font:fontR, color:pdfCols.gray, maxWidth:CW }
      )
      newPage(); tableHeader()
      monthRecs.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [ localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm) ]
        y = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors: pdfCols, fontR, fontB, highlightIdx:4, rowH:ROW_H })
      })
      if (y - 50 < 35 + SIG_AREA) { newPage() }
      const exPdf = monthlyExtras(db.records, u.id, mk2)
      const targetMin2 = 9600
      const cDiff = exPdf.netExtraMin > 0 ? cGreen : exPdf.deficitMin > 0 ? rgb(0.87,0.27,0.27) : pdfCols.pri
      page.drawRectangle({ x:ML, y:y-50, width:CW, height:50, color:pdfCols.priLt, borderColor:pdfCols.pri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${monthRecs.length} jornada${monthRecs.length!==1?'s':''} registrada${monthRecs.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:pdfCols.pri })
      page.drawText(`Objetivo mensual: 160h (${mhm(targetMin2)})`, { x:ML+8, y:y-28, size:7.5, font:fontR, color:pdfCols.dark, maxWidth:CW-16 })
      const extraLine = exPdf.netExtraMin > 0
        ? `H. extra netas: +${mhm(exPdf.netExtraMin)}  (${mhm(exPdf.weeklyExtraMin)} sem. - ${mhm(exPdf.shortfallMin)} def.)`
        : exPdf.deficitMin > 0
          ? `Deficit: -${mhm(exPdf.deficitMin)} para completar las 160h obligatorias`
          : totalMin2 >= targetMin2 ? 'Objetivo de 160h alcanzado' : `Pendiente: ${mhm(targetMin2 - totalMin2)} para las 160h`
      page.drawText(extraLine, { x:ML+8, y:y-42, size:7.5, font:fontB, color:cDiff, maxWidth:CW-16 })
      y -= 58
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:pdfCols.gray })
      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x:ML, y, width:130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : null,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      })
      const { firma: responsableFirma, nombre: responsableNombre } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x:ML+CW/2, y:y-11, size:6.5, font:fontB, color:pdfCols.gray })
      await drawSignatureBlock(pdfDoc, page, {
        x:ML+CW/2, y, width:130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: responsableFirma?.data,
        label: responsableNombre,
      })
      const canonical = JSON.stringify(monthRecs.map(r => ({ id:r.id, empId:r.empId, inicio:r.inicio, fin:r.fin, centro:r.centro })))
      const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical))
      const hashHex = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2,'0')).join('')
      const shortHash = hashHex.slice(0, 16) + '…'
      drawFooterLegal(page, { ml:ML, cw:CW, colors: pdfCols, fontR })
      page.drawText(`SHA-256: ${shortHash}  ·  Generado: ${new Date().toLocaleString('es-ES')}`, { x:ML, y:20, size:5.5, font:fontR, color:pdfCols.gray, maxWidth:CW })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type:'application/pdf' })
      setInformeBlob(blob)
      setInformeHash(hashHex)
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
      const pdfCols = pdfColors(rgb)
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
      const ML = 35, MR = 35, CW = PW - ML - MR
      const COLS = [
        { label:'Fecha', w:72 }, { label:'Entrada', w:52 }, { label:'Salida', w:52 },
        { label:'Centro / Obra', w:279 }, { label:'Horas netas', w:70 },
      ]
      const ROW_H = 15, HEAD_H = 17, SIG_AREA = 110
      let page, y, pageNum = 0
      const newPage = () => {
        pageNum++
        const obras = u.obrasAsignadas?.length ? u.obrasAsignadas.join(', ') : (u.centroTrabajo || '-')
        ;({ page, y } = addReportPage(pdfDoc, {
          ml:ML, mr:MR, cw:CW, pw:PW, ph:PH, pageNum, colors: pdfCols, fontR, fontB,
          empresa: u.empresa || 'Obra',
          title: 'REGISTRO DE JORNADA LABORAL - INFORME SEMANAL',
          subtitle: `Trabajador: ${u.name}   .   ${weekLabel}   .   Obras: ${obras}`,
        }))
      }
      const tableHeader = () => { y = drawTableHeaderRow(page, { ml:ML, y, cw:CW, cols:COLS, colors: pdfCols, fontB, headH:HEAD_H }) }
      newPage(); tableHeader()
      weekRecs2.forEach((r, i) => {
        if (y - ROW_H < 35 + SIG_AREA) { newPage(); tableHeader() }
        const wm = Math.floor(recWorkSecs(r) / 60)
        const centroObra = [r.centro, r.obra].filter(Boolean).join(' / ') || u.centroTrabajo || '-'
        const vals = [ localDate(r.inicio), ftime(r.inicio), r.fin ? ftime(r.fin) : '-', centroObra, mhm(wm) ]
        y = drawTableDataRow(page, { ml:ML, cw:CW, y, vals, cols:COLS, striped: i%2!==0, colors: pdfCols, fontR, fontB, highlightIdx:4, rowH:ROW_H })
      })
      if (y - 40 < 35 + SIG_AREA) { newPage() }
      const targetMin2 = weekRecs2.length * 480
      const diffMin2 = totalMin2 - targetMin2
      const diffSign = diffMin2 >= 0 ? '+' : ''
      const cDiff = diffMin2 >= 0 ? pdfCols.green : pdfCols.red
      page.drawRectangle({ x:ML, y:y-40, width:CW, height:40, color:pdfCols.priLt, borderColor:pdfCols.pri, borderWidth:0.6 })
      page.drawText(`TOTAL: ${mhm(totalMin2)}   ·   ${weekRecs2.length} jornada${weekRecs2.length!==1?'s':''} registrada${weekRecs2.length!==1?'s':''}`, { x:ML+8, y:y-14, size:8.5, font:fontB, color:pdfCols.pri })
      page.drawText(`Objetivo: ${mhm(targetMin2)}   Desviación: ${diffSign}${mhm(Math.abs(diffMin2))}`, { x:ML+8, y:y-30, size:7.5, font:fontR, color:cDiff, maxWidth:CW-16 })
      y -= 48
      if (y - SIG_AREA < 30) { newPage() }
      y -= 10
      page.drawText('FIRMA DEL TRABAJADOR', { x:ML, y:y-11, size:6.5, font:fontB, color:pdfCols.gray })
      const firma = db.firmas?.[u?.id]?.main
      await drawSignatureBlock(pdfDoc, page, {
        x:ML, y, width:130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: firma?.data,
        label: firma?.data ? `${u.name}   .   Firmado digitalmente   .   ${new Date().toLocaleString('es-ES')}` : u.name,
        sublabel: firma?.data ? 'Firma verificada' : null,
        richMissing: true, missingLabel: 'Sin firma digital', missingDetail: 'Configurala en Perfil > Firma digital',
      })
      const { firma: responsableFirmaW, nombre: responsableNombreW } = findResponsableFirma(db, u)
      page.drawText('FIRMA DEL RESPONSABLE', { x:ML+CW/2, y:y-11, size:6.5, font:fontB, color:pdfCols.gray })
      await drawSignatureBlock(pdfDoc, page, {
        x:ML+CW/2, y, width:130, colors: pdfCols, fontR, fontB,
        signatureDataUrl: responsableFirmaW?.data,
        label: responsableNombreW,
      })
      drawFooterLegal(page, { ml:ML, cw:CW, colors: pdfCols, fontR })
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

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <>
    <PullToRefresh>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460, margin: '0 auto', padding: '16px', paddingBottom: 100 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '0 2px' }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: colors.text[900], letterSpacing: '-1.5px', lineHeight: 1.1 }}>Mi Jornada</div>
            <div style={{ fontSize: 13, color: colors.text[500], marginTop: 5, textTransform: 'capitalize' }}>
              {now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
          </div>
          {o ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginTop: 4,
              padding: '5px 12px', borderRadius: radius.pill,
              background: `${colors.semantic.green}18`, border: `1px solid ${colors.semantic.green}35`,
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
        </div>

        {/* KPI grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
          {[
            {
              val: mhm(Math.floor(weekMin)),
              lbl: 'Semana', suffix: weekMin > WK ? ' ↑' : '',
              accent: weekMin > WK ? colors.semantic.orange : colors.primary.base,
              color: weekMin > WK ? colors.semantic.orange : colors.primary.light,
              borderCol: weekMin > WK ? colors.semantic.orange + '30' : colors.border.subtle,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                  <circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/>
                </svg>
              ),
            },
            {
              val: mhm(normMin), lbl: 'Normal', suffix: '',
              accent: colors.semantic.green, color: colors.semantic.green,
              borderCol: colors.semantic.green + '20',
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              ),
            },
            {
              val: mhm(extraMin), lbl: 'Extra', suffix: '',
              accent: extraMin > 0 ? colors.kpiTone.amber.base : colors.border.default,
              color: extraMin > 0 ? colors.kpiTone.amber.base : colors.text[500],
              borderCol: extraMin > 0 ? colors.kpiTone.amber.base + '25' : colors.border.subtle,
              icon: (c) => (
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
              ),
            },
          ].map(({ val, lbl, suffix, accent, color, borderCol, icon }) => (
            <div key={lbl} style={{
              background: colors.bg[600], border: `1px solid ${borderCol}`,
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

        {/* Total card */}
        <div style={{
          background: `linear-gradient(160deg, ${colors.primary.base}1a 0%, ${colors.bg[600]} 55%)`,
          border: `1px solid ${o ? colors.primary.base + '55' : colors.border.subtle}`,
          borderRadius: radius['2xl'], padding: '20px 20px 16px',
          boxShadow: o ? `0 8px 40px ${colors.primary.glow}` : `0 4px 20px rgba(0,0,0,0.2)`,
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg, ${colors.primary.base}, ${colors.accent.base})`, borderRadius: '16px 16px 0 0' }} />
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
          <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: '-2px', color: colors.text[900], fontVariantNumeric: 'tabular-nums', lineHeight: 1, marginBottom: 16 }}>
            {mhm(totMin)}
          </div>
          <WeeklyBars db={db} u={u} timer={timer} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 12, borderTop: `1px solid ${colors.border.subtle}`, marginTop: 12 }}>
            {[
              { lbl: 'Descansos hoy', val: mhm(brkMin),  color: colors.kpiTone.amber.base },
              { lbl: 'Mes actual',    val: mhm(monthMin), color: colors.secondary.base },
            ].map(({ lbl, val, color }) => (
              <div key={lbl} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: colors.text[500], fontWeight: 500 }}>{lbl}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>{val}</span>
              </div>
            ))}
          </div>
        </div>

        {/* PDF export buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          <PdfBtn onClick={exportWeekPDF} loading={generatingWeekPdf} label="Semanal" />
          <PdfBtn onClick={exportMonthPDF} loading={generatingPdf} label="PDF firmado" />
          <button onClick={() => setShowRangeExport(v => !v)} style={{
            padding: '11px 14px', borderRadius: radius.lg,
            border: `1px solid ${showRangeExport ? colors.primary.base : colors.border.default}`,
            background: showRangeExport ? colors.primary.dim : colors.bg[500],
            color: showRangeExport ? colors.primary.light : colors.text[700],
            fontSize: 11, fontWeight: 700, fontFamily: 'inherit', cursor: 'pointer',
          }}>Rango</button>
        </div>

        {/* Range export panel */}
        {showRangeExport && (
          <div style={{
            padding: 16, background: colors.bg[500], borderRadius: radius.xl,
            border: `1px solid ${colors.border.default}`, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: colors.text[700] }}>Exportar por rango de fechas</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              {[['Desde', exportFrom, setExportFrom], ['Hasta', exportTo, setExportTo]].map(([lbl, val, set]) => (
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
              <button onClick={() => setShowRangeExport(false)} style={{
                padding: '8px 14px', borderRadius: radius.md, border: `1px solid ${colors.border.default}`,
                background: 'transparent', color: colors.text[500], fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancelar</button>
              <button onClick={exportRangePDF} disabled={generatingRangePdf} style={{
                padding: '8px 16px', borderRadius: radius.md, border: 'none',
                background: colors.primary.base, color: '#fff', fontSize: 12, fontWeight: 700,
                cursor: 'pointer', fontFamily: 'inherit', opacity: generatingRangePdf ? .7 : 1,
                boxShadow: `0 4px 14px ${colors.primary.glow}`,
              }}>
                {generatingRangePdf ? 'Generando…' : 'Exportar PDF'}
              </button>
            </div>
          </div>
        )}

        {/* Pomodoro (when jornada open) */}
        {o && <PomodoroWidget />}

        {/* Timeline */}
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
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
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
                const bk  = isCurrent ? timer.bs : (r.breakSecs || 0)
                const dotColor = isCurrent ? colors.semantic.green : r.fin ? colors.primary.light : colors.semantic.orange
                const icon = isCurrent ? '▶' : r.fin ? '✓' : '⏸'
                return (
                  <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '8px 0', position: 'relative' }}>
                    <div style={{
                      position: 'absolute', left: -18, top: 10,
                      width: 22, height: 22, borderRadius: '50%',
                      background: `${dotColor}18`, border: `1px solid ${dotColor}35`,
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
                      background: `${dotColor}12`, padding: '3px 9px', borderRadius: radius.pill,
                      border: `1px solid ${dotColor}25`, flexShrink: 0, marginTop: 6,
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
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9,
                    }}>🔴</div>
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

        {/* Pending validation banner */}
        {(() => {
          const pendVal = (db.records || []).filter(r => r.empId === u.id && r.fin && !r.aceptada)
          if (!pendVal.length) return null
          return (
            <div style={{
              padding: '12px 16px',
              background: `${colors.semantic.orange}10`, border: `1px solid ${colors.semantic.orange}30`,
              borderRadius: radius.lg, display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${colors.semantic.orange}15`, border: `1px solid ${colors.semantic.orange}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke={colors.semantic.orange} strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              </div>
              <div style={{ flex: 1, fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: colors.semantic.orange }}>
                  {pendVal.length} jornada{pendVal.length !== 1 ? 's' : ''} pendiente{pendVal.length !== 1 ? 's' : ''} de validación
                </span>
                <span style={{ color: colors.text[500], marginLeft: 4 }}>por el encargado</span>
              </div>
            </div>
          )
        })()}

        {/* Historical records */}
        {(() => {
          const histDays = Array.from({ length: 30 }, (_, i) => {
            const d = new Date(now); d.setDate(d.getDate() - i - 1); return localDateStr(d)
          })
          const histWithRecs = histDays
            .map(ds => ({ ds, recs: (db.records || []).filter(r => r.empId === u.id && r.inicio && localDateStr(new Date(r.inicio)) === ds && r.fin) }))
            .filter(h => h.recs.length > 0)
          if (!histWithRecs.length) return null
          return <HistorialReciente histWithRecs={histWithRecs} openModal={openModal} u={u} />
        })()}

        <div style={{ height: 4 }} />
      </div>
    </PullToRefresh>

    {/* PDF fullscreen overlay */}
    {informeUrl && (() => {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      const dlName = `jornada-${today().slice(0,7)}.pdf`
      return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: colors.bg[800], display: 'flex', flexDirection: 'column' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            background: colors.bg[700], borderBottom: `1px solid ${colors.border.subtle}`, flexShrink: 0,
          }}>
            <button onClick={closeInforme} style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: colors.bg[500], border: `1px solid ${colors.border.default}`,
              borderRadius: radius.pill, padding: '6px 14px', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: 13, fontWeight: 600, color: colors.text[700],
            }}>← Volver</button>
            <span style={{ fontSize: 13, fontWeight: 700, flex: 1, color: colors.text[900] }}>Registro de jornada</span>
            <a href={informeUrl} download={dlName} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: colors.primary.base, borderRadius: radius.pill,
              padding: '6px 14px', fontSize: 12, fontWeight: 700, color: '#fff',
              textDecoration: 'none', boxShadow: `0 4px 14px ${colors.primary.glow}`,
            }}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Descargar
            </a>
          </div>
          {isMobile ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 20, padding: 28 }}>
              <svg viewBox="0 0 24 24" width="52" height="52" fill="none" stroke={colors.primary.light} strokeWidth="1.4">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text[700], textAlign: 'center', lineHeight: 1.6 }}>
                Tu informe de jornada está listo.<br/>Descárgalo o ábrelo en el navegador.
              </div>
              {informeHash && (
                <div style={{
                  background: colors.bg[500], border: `1px solid ${colors.border.default}`,
                  borderRadius: radius.md, padding: '10px 14px', width: '100%', maxWidth: 320, boxSizing: 'border-box',
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: colors.text[300], textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>SHA-256 integridad</div>
                  <div style={{ fontSize: 9.5, fontFamily: 'monospace', color: colors.text[700], wordBreak: 'break-all', lineHeight: 1.5 }}>{informeHash}</div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 320 }}>
                <a href={informeUrl} download={dlName} style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  padding: 13, background: colors.primary.base, color: '#fff',
                  borderRadius: radius.xl, fontWeight: 700, fontSize: 13, textDecoration: 'none',
                  boxShadow: `0 4px 16px ${colors.primary.glow}`,
                }}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  Descargar PDF
                </a>
                {informeBlob && 'share' in navigator && (
                  <button
                    onClick={() => navigator.share({ files: [new File([informeBlob], dlName, { type: 'application/pdf' })], title: 'Registro de jornada' }).catch(() => {})}
                    style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      padding: 13, background: colors.bg[500], color: colors.text[700],
                      border: `1px solid ${colors.border.default}`, borderRadius: radius.xl,
                      fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
                    }}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                      <polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/>
                    </svg>
                    Compartir
                  </button>
                )}
              </div>
            </div>
          ) : (
            <iframe src={informeUrl} title="Registro de jornada" style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }} />
          )}
        </div>
      )
    })()}
    </>
  )
}
