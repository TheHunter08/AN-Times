import { calcSecs, localDateStr } from './time.js'
import { recordValidationState } from './recordValidation.js'
import { downloadBlob } from './exportFiles.js'
import { monthlyTargetMinutes } from './workTargets.js'

const COLORS = {
  primary:'#7C3AED', primaryDark:'#5B21B6', primarySoft:'#F3E8FF',
  ink:'#171322', muted:'#6B6476', border:'#DDD6E8', stripe:'#FAF8FC',
  green:'#047857', greenSoft:'#ECFDF5', orange:'#B45309', orangeSoft:'#FFFBEB',
  red:'#B91C1C', redSoft:'#FEF2F2', blue:'#1D4ED8', blueSoft:'#EFF6FF',
}

const HOURS_FORMAT = '0.00 "h"'

function statusLabel(record) {
  const state = recordValidationState(record)
  if (state === 'approved') return 'VALIDADA'
  if (state === 'rejected') return 'RECHAZADA'
  if (state === 'open') return 'ABIERTA'
  return 'PENDIENTE'
}

function statusStyle(label) {
  if (label === 'VALIDADA') return { textColor:COLORS.green, backgroundColor:COLORS.greenSoft, fontWeight:'bold' }
  if (label === 'RECHAZADA') return { textColor:COLORS.red, backgroundColor:COLORS.redSoft, fontWeight:'bold' }
  if (label === 'PENDIENTE') return { textColor:COLORS.orange, backgroundColor:COLORS.orangeSoft, fontWeight:'bold' }
  return { textColor:COLORS.blue, backgroundColor:COLORS.blueSoft, fontWeight:'bold' }
}

function baseCell(value, extra = {}) {
  return {
    value,
    textColor:COLORS.ink,
    alignVertical:'center',
    wrap:true,
    ...extra,
  }
}

function titleRow(title, columns) {
  return [baseCell(title, {
    columnSpan:columns, height:34, fontSize:18, fontWeight:'bold',
    textColor:'#FFFFFF', backgroundColor:COLORS.primary,
  }), ...Array(columns - 1).fill(null)]
}

function subtitleRow(text, columns) {
  return [baseCell(text, {
    columnSpan:columns, height:25, fontSize:10, textColor:COLORS.muted,
    backgroundColor:COLORS.primarySoft,
  }), ...Array(columns - 1).fill(null)]
}

function sectionRow(text, columns) {
  return [baseCell(text, {
    columnSpan:columns, height:24, fontSize:11, fontWeight:'bold',
    textColor:COLORS.primaryDark, backgroundColor:COLORS.primarySoft,
    bottomBorderColor:COLORS.primary, bottomBorderStyle:'thin',
  }), ...Array(columns - 1).fill(null)]
}

function headerRow(labels) {
  return labels.map(label => baseCell(label, {
    height:28, fontWeight:'bold', textColor:'#FFFFFF', backgroundColor:COLORS.primary,
    bottomBorderColor:COLORS.primaryDark, bottomBorderStyle:'thin',
  }))
}

function metricRow(items, columns, isValue = false) {
  const row = []
  const span = Math.max(1, Math.floor(columns / items.length))
  items.forEach((item, index) => {
    const metric = item && typeof item === 'object' && !(item instanceof Date) ? item : { value:item }
    const remaining = columns - row.length
    const itemSpan = index === items.length - 1 ? remaining : Math.min(span, remaining)
    row.push(baseCell(metric.value, {
      columnSpan:itemSpan,
      height:isValue ? 30 : 20,
      fontSize:isValue ? 14 : 9,
      fontWeight:'bold',
      textColor:isValue ? COLORS.primaryDark : COLORS.muted,
      backgroundColor:isValue ? '#FFFFFF' : COLORS.stripe,
      align:'center',
      format:metric.format || (typeof metric.value === 'number' && isValue ? '#,##0.00' : undefined),
      bottomBorderColor:COLORS.border,
      bottomBorderStyle:'thin',
    }))
    for (let col = 1; col < itemSpan; col++) row.push(null)
  })
  return row
}

function safeSheetBase(name) {
  return String(name || 'Empleado').replace(/[\\/?*\[\]:]/g, ' ').replace(/\s+/g, ' ').trim() || 'Empleado'
}

function uniqueSheetNames(employees, reserved = []) {
  const used = new Set(reserved.map(name => name.toLowerCase()))
  return new Map(employees.map(employee => {
    const base = safeSheetBase(employee.name).slice(0, 28)
    let candidate = base.slice(0, 31)
    let suffix = 2
    while (used.has(candidate.toLowerCase())) {
      const tail = ` ${suffix++}`
      candidate = base.slice(0, 31 - tail.length) + tail
    }
    used.add(candidate.toLowerCase())
    return [employee.id, candidate]
  }))
}

function recordMetrics(record) {
  const totals = calcSecs(record)
  const start = new Date(record.inicio)
  const end = record.fin ? new Date(record.fin) : null
  const grossHours = end ? Math.max(0, (end.getTime() - start.getTime()) / 3600000) : 0
  return {
    start,
    end,
    grossHours,
    breakHours:Math.max(0, totals.brk / 3600),
    netHours:Math.max(0, totals.work / 3600),
  }
}

function employeeSummary(employee, records, closures, monthKey) {
  const own = records.filter(record => record.empId === employee.id)
  const metrics = own.map(recordMetrics)
  const netMinutes = Math.round(metrics.reduce((sum, item) => sum + item.netHours * 60, 0))
  const breakMinutes = Math.round(metrics.reduce((sum, item) => sum + item.breakHours * 60, 0))
  const states = own.map(statusLabel)
  const closure = closures.find(item => item.empId === employee.id && item.mes === monthKey && !item.desactualizado)
  const targetMinutes = monthlyTargetMinutes(employee, monthKey)
  return {
    employee,
    records:own,
    days:new Set(own.map(record => localDateStr(new Date(record.inicio)))).size,
    netHours:netMinutes / 60,
    breakHours:breakMinutes / 60,
    targetHours:targetMinutes / 60,
    regularHours:Math.min(netMinutes, targetMinutes) / 60,
    overtimeHours:Math.max(0, netMinutes - targetMinutes) / 60,
    targetDiffHours:(netMinutes - targetMinutes) / 60,
    pending:states.filter(state => state === 'PENDIENTE').length,
    approved:states.filter(state => state === 'VALIDADA').length,
    rejected:states.filter(state => state === 'RECHAZADA').length,
    corrections:own.reduce((sum, record) => sum + (record.correcciones || []).length, 0),
    closureSigned:Boolean(closure && closure.firmaAdmin && (closure.firmaEmp || closure.firma)),
  }
}

function dataCell(value, rowIndex, extra = {}) {
  return baseCell(value, {
    height:22,
    backgroundColor:rowIndex % 2 ? COLORS.stripe : '#FFFFFF',
    bottomBorderColor:COLORS.border,
    bottomBorderStyle:'thin',
    ...extra,
  })
}

function detailValues(record, employee, rowIndex, includeEmployee = true) {
  const metric = recordMetrics(record)
  const status = statusLabel(record)
  const values = [
    dataCell(metric.start, rowIndex, { type:Date, format:'dd/mm/yyyy', align:'center' }),
  ]
  if (includeEmployee) values.push(dataCell(employee?.name || record.empName || record.empId || '', rowIndex))
  values.push(
    dataCell(record.centro || employee?.centroTrabajo || '', rowIndex),
    dataCell(metric.start, rowIndex, { type:Date, format:'hh:mm', align:'center' }),
    dataCell(metric.end || '', rowIndex, metric.end ? { type:Date, format:'hh:mm', align:'center' } : { align:'center' }),
    dataCell(metric.grossHours, rowIndex, { type:Number, format:HOURS_FORMAT, align:'right' }),
    dataCell(metric.breakHours, rowIndex, { type:Number, format:HOURS_FORMAT, align:'right' }),
    dataCell(metric.netHours, rowIndex, { type:Number, format:HOURS_FORMAT, align:'right', fontWeight:'bold' }),
    dataCell(status, rowIndex, statusStyle(status)),
    dataCell((record.correcciones || []).length, rowIndex, { type:Number, format:'0', align:'right' }),
    dataCell(record.observaciones || record.nota || '', rowIndex),
    dataCell(record.id || '', rowIndex, { textColor:COLORS.muted }),
  )
  return values
}

function totalsRow(columnCount, firstDataRow, lastDataRow, hourColumns, countColumn = null) {
  const row = Array.from({ length:columnCount }, () => baseCell('', {
    height:25, fontWeight:'bold', backgroundColor:COLORS.primarySoft,
    topBorderColor:COLORS.primary, topBorderStyle:'thin',
  }))
  row[0] = { ...row[0], value:'TOTAL' }
  if (lastDataRow >= firstDataRow) {
    hourColumns.forEach(column => {
      const letter = String.fromCharCode(65 + column)
      row[column] = { ...row[column], value:`SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, type:'Formula', format:HOURS_FORMAT, align:'right' }
    })
    if (countColumn != null) {
      const letter = String.fromCharCode(65 + countColumn)
      row[countColumn] = { ...row[countColumn], value:`SUM(${letter}${firstDataRow}:${letter}${lastDataRow})`, type:'Formula', format:'0', align:'right' }
    }
  }
  return row
}

function buildSummarySheet(summaries, monthKey, monthLabel, generatedAt) {
  const columns = 14
  const totalRecords = summaries.reduce((sum, item) => sum + item.records.length, 0)
  const totalHours = summaries.reduce((sum, item) => sum + item.netHours, 0)
  const totalBreak = summaries.reduce((sum, item) => sum + item.breakHours, 0)
  const totalExtra = summaries.reduce((sum, item) => sum + item.overtimeHours, 0)
  const pending = summaries.reduce((sum, item) => sum + item.pending, 0)
  const decided = summaries.reduce((sum, item) => sum + item.approved + item.rejected, 0)
  const validationPct = totalRecords ? decided / totalRecords : 0
  const rows = [
    titleRow('TIMES INC · RESUMEN GENERAL DE HORAS', columns),
    subtitleRow(`Periodo: ${monthLabel} (${monthKey}) · Generado: ${generatedAt.toLocaleString('es-ES')} · Objetivo calculado según contrato y días laborables`, columns),
    Array(columns).fill(null),
    sectionRow('RESUMEN EJECUTIVO', columns),
    metricRow(['Empleados con actividad', 'Jornadas', 'Horas netas', 'Descanso', 'Horas extra', 'Pendientes', 'Validación'], columns),
    metricRow([
      { value:summaries.filter(item => item.records.length).length, format:'0' },
      { value:totalRecords, format:'0' },
      { value:totalHours, format:HOURS_FORMAT },
      { value:totalBreak, format:HOURS_FORMAT },
      { value:totalExtra, format:HOURS_FORMAT },
      { value:pending, format:'0' },
      { value:validationPct, format:'0%' },
    ], columns, true),
    Array(columns).fill(null),
    headerRow(['Empleado', 'Centro / Obra', 'Días', 'Fichajes', 'Horas netas', 'Descanso', 'Objetivo', 'Extra', 'Pendientes', 'Validadas', 'Rechazadas', 'Modificaciones', 'Cierre firmado', 'Diferencia objetivo']),
  ]
  summaries.forEach((item, index) => {
    rows.push([
      dataCell(item.employee.name || item.employee.id, index),
      dataCell(item.employee.centroTrabajo || item.employee.dept || '', index),
      dataCell(item.days, index, { type:Number, format:'0', align:'right' }),
      dataCell(item.records.length, index, { type:Number, format:'0', align:'right' }),
      dataCell(item.netHours, index, { type:Number, format:HOURS_FORMAT, align:'right', fontWeight:'bold' }),
      dataCell(item.breakHours, index, { type:Number, format:HOURS_FORMAT, align:'right' }),
      dataCell(item.targetHours, index, { type:Number, format:HOURS_FORMAT, align:'right' }),
      dataCell(item.overtimeHours, index, { type:Number, format:HOURS_FORMAT, align:'right', textColor:item.overtimeHours ? COLORS.orange : COLORS.ink }),
      dataCell(item.pending, index, { type:Number, format:'0', align:'right', ...(item.pending ? statusStyle('PENDIENTE') : {}) }),
      dataCell(item.approved, index, { type:Number, format:'0', align:'right' }),
      dataCell(item.rejected, index, { type:Number, format:'0', align:'right', ...(item.rejected ? statusStyle('RECHAZADA') : {}) }),
      dataCell(item.corrections, index, { type:Number, format:'0', align:'right' }),
      dataCell(item.closureSigned ? 'SÍ' : 'NO', index, item.closureSigned ? statusStyle('VALIDADA') : statusStyle('PENDIENTE')),
      dataCell(item.targetDiffHours, index, { type:Number, format:'0.00 "h";-0.00 "h"', align:'right', textColor:item.targetDiffHours >= 0 ? COLORS.green : COLORS.red }),
    ])
  })
  const firstDataRow = 9
  const lastDataRow = firstDataRow + summaries.length - 1
  const total = totalsRow(columns, firstDataRow, lastDataRow, [4, 5, 6, 7, 13])
  ;[2, 3, 8, 9, 10, 11].forEach(column => {
    const letter = String.fromCharCode(65 + column)
    total[column] = { ...total[column], value:summaries.length ? `SUM(${letter}${firstDataRow}:${letter}${lastDataRow})` : 0, type:summaries.length ? 'Formula' : Number, format:'0', align:'right' }
  })
  rows.push(total)
  return {
    data:rows,
    sheet:'Resumen general',
    columns:[24, 24, 9, 10, 13, 12, 13, 11, 11, 11, 11, 14, 15, 16].map(width => ({ width })),
    stickyRowsCount:8,
    stickyColumnsCount:2,
    showGridLines:false,
    zoomScale:85,
    orientation:'landscape',
  }
}

function buildDetailSheet(summaries, monthLabel, generatedAt) {
  const columns = 12
  const ordered = summaries.flatMap(item => item.records.map(record => ({ record, employee:item.employee })))
    .sort((a, b) => String(a.record.inicio).localeCompare(String(b.record.inicio)))
  const rows = [
    titleRow('TIMES INC · DETALLE COMPLETO DE FICHAJES', columns),
    subtitleRow(`Periodo: ${monthLabel} · ${ordered.length} registros cerrados · Generado: ${generatedAt.toLocaleString('es-ES')}`, columns),
    Array(columns).fill(null),
    headerRow(['Fecha', 'Empleado', 'Centro / Obra', 'Entrada', 'Salida', 'Brutas', 'Descanso', 'Horas netas', 'Estado', 'Modif.', 'Observaciones', 'ID registro']),
    ...ordered.map(({ record, employee }, index) => detailValues(record, employee, index, true)),
  ]
  rows.push(totalsRow(columns, 5, 4 + ordered.length, [5, 6, 7], 9))
  return {
    data:rows,
    sheet:'Detalle fichajes',
    columns:[13, 24, 28, 10, 10, 11, 11, 12, 13, 9, 34, 22].map(width => ({ width })),
    stickyRowsCount:4,
    stickyColumnsCount:2,
    showGridLines:false,
    zoomScale:85,
    orientation:'landscape',
  }
}

function buildEmployeeSheet(summary, sheetName, monthLabel, generatedAt) {
  const columns = 11
  const rows = [
    titleRow(`INFORME INDIVIDUAL · ${summary.employee.name || summary.employee.id}`, columns),
    subtitleRow(`Periodo: ${monthLabel} · Centro: ${summary.employee.centroTrabajo || summary.employee.dept || 'Sin asignar'} · Generado: ${generatedAt.toLocaleString('es-ES')}`, columns),
    Array(columns).fill(null),
    sectionRow('RESUMEN DEL EMPLEADO', columns),
    metricRow(['Días', 'Jornadas', 'Horas netas', 'Descanso', 'Objetivo', 'Extra'], columns),
    metricRow([
      { value:summary.days, format:'0' },
      { value:summary.records.length, format:'0' },
      { value:summary.netHours, format:HOURS_FORMAT },
      { value:summary.breakHours, format:HOURS_FORMAT },
      { value:summary.targetHours, format:HOURS_FORMAT },
      { value:summary.overtimeHours, format:HOURS_FORMAT },
    ], columns, true),
    Array(columns).fill(null),
    headerRow(['Fecha', 'Centro / Obra', 'Entrada', 'Salida', 'Brutas', 'Descanso', 'Horas netas', 'Estado', 'Modif.', 'Observaciones', 'ID registro']),
  ]
  if (summary.records.length) {
    summary.records
      .slice()
      .sort((a, b) => String(a.inicio).localeCompare(String(b.inicio)))
      .forEach((record, index) => rows.push(detailValues(record, summary.employee, index, false)))
    rows.push(totalsRow(columns, 9, 8 + summary.records.length, [4, 5, 6], 8))
  } else {
    rows.push([baseCell('Sin fichajes cerrados en este periodo', { columnSpan:columns, height:28, textColor:COLORS.muted, backgroundColor:COLORS.stripe }), ...Array(columns - 1).fill(null)])
  }
  return {
    data:rows,
    sheet:sheetName,
    columns:[13, 28, 10, 10, 11, 11, 13, 13, 9, 34, 22].map(width => ({ width })),
    stickyRowsCount:8,
    showGridLines:false,
    zoomScale:90,
    orientation:'landscape',
  }
}

export async function buildHoursReportXlsxBlob({ monthKey, monthLabel, employees = [], records = [], closures = [], employeeId = null, generatedAt = new Date() }) {
  const writeXlsxFile = (await import('write-excel-file/browser')).default
  const closedRecords = records
    .filter(record => record?.inicio && record?.fin && (!employeeId || record.empId === employeeId))
    .map(record => record.empId ? record : { ...record, empId:'__sin_empleado__' })
  const selectedEmployees = employees
    .filter(employee => !employee.isAdmin && (!employeeId || employee.id === employeeId))
    .slice()
  const knownIds = new Set(selectedEmployees.map(employee => employee.id))
  closedRecords.forEach(record => {
    if (knownIds.has(record.empId)) return
    selectedEmployees.push({
      id:record.empId,
      name:record.empName || (record.empId === '__sin_empleado__' ? 'Empleado sin identificar' : record.empId),
      centroTrabajo:record.centro || '',
      baja:true,
    })
    knownIds.add(record.empId)
  })
  selectedEmployees.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'))
  const summaries = selectedEmployees.map(employee => employeeSummary(employee, closedRecords, closures, monthKey))
  const names = uniqueSheetNames(selectedEmployees, ['Resumen general', 'Detalle fichajes'])
  const sheets = [
    buildSummarySheet(summaries, monthKey, monthLabel, generatedAt),
    buildDetailSheet(summaries, monthLabel, generatedAt),
    ...summaries.map(summary => buildEmployeeSheet(summary, names.get(summary.employee.id), monthLabel, generatedAt)),
  ]
  return writeXlsxFile(sheets, { fontFamily:'Aptos', fontSize:10 }).toBlob()
}

export async function downloadHoursReportXlsx(options, filename) {
  const blob = await buildHoursReportXlsxBlob(options)
  downloadBlob(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`)
  return { ok:true, blob }
}
