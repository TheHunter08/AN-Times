import { queuePush } from '../services/dataService.js'
import { calcSecs, localDateStr, localMonthKey, recWorkSecs } from './time.js'
import { WM } from '../config/constants.js'

export const buildRecordSnapshot = record => {
  const totals = calcSecs(record)
  return {
    id: record.id,
    empId: record.empId,
    inicio: record.inicio,
    fin: record.fin,
    centro: record.centro,
    breaks: Array.isArray(record.breaks) ? record.breaks.map(item => ({ ...item })) : undefined,
    workSecs: totals.work,
    breakSecs: totals.brk,
    modificado: !!record.modificado,
    correcciones: Array.isArray(record.correcciones)
      ? record.correcciones.map(item => ({ ...item }))
      : [],
  }
}

export const currentDeviceLabel = () => {
  if (typeof navigator === 'undefined') return 'Dispositivo desconocido'
  const ua = navigator.userAgent || ''
  const os = /Android/i.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
      : /Windows/i.test(ua) ? 'Windows'
        : /Macintosh|Mac OS X/i.test(ua) ? 'macOS'
          : /Linux/i.test(ua) ? 'Linux' : 'Otro dispositivo'
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /Firefox\//i.test(ua) ? 'Firefox'
      : /Chrome\//i.test(ua) ? 'Chrome'
        : /Safari\//i.test(ua) ? 'Safari' : 'Navegador'
  return `${os} · ${browser}`
}

export const refreshUnsignedClosures = (cierres, records, empId, dates, nowIso) => {
  const months = new Set((dates || []).map(date => localMonthKey(date)).filter(Boolean))
  return (cierres || []).map(cierre => {
    if (cierre.empId !== empId || !months.has(cierre.mes)) return cierre
    if (cierre.firmaAdmin || cierre.firmaEmp || cierre.firma || cierre.estado === 'firmado') return cierre
    const monthRecords = (records || []).filter(record =>
      record.empId === empId && record.inicio && record.fin && localMonthKey(record.inicio) === cierre.mes
    )
    const records_snapshot = monthRecords.map(buildRecordSnapshot)
    const totalMin = Math.floor(records_snapshot.reduce((sum, record) => sum + recWorkSecs(record), 0) / 60)
    return {
      ...cierre,
      records_snapshot,
      totalMin,
      extraMin: Math.max(0, totalMin - WM),
      dias: new Set(monthRecords.map(record => localDateStr(new Date(record.inicio)))).size,
      desactualizado: false,
      pdfData: null,
      pdfUrl: null,
      documentoId: null,
      recalculadoAt: nowIso,
      _upd: nowIso,
    }
  })
}

export const esc = s => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')

export const downloadDataUrl = (dataUrl, filename) => {
  const a = document.createElement('a')
  a.href = dataUrl; a.download = filename
  document.body.appendChild(a); a.click(); document.body.removeChild(a)
}

// Un cierre solo puede firmarse (y por tanto bloquear el mes) una vez que ese
// mes ya ha terminado de verdad: el día de hoy debe ser el último día natural
// de `mes` o posterior. Antes solo se validaba la fecha al GENERAR el cierre;
// firmar (empleado o admin) no comprobaba nada, así que un cierre generado o
// insertado antes de tiempo podía firmarse y bloquear un mes aún en curso.
export const canCloseMonth = (mes, now = new Date()) => {
  if (!mes) return false
  const [year, month] = mes.split('-').map(Number)
  if (!year || month < 1 || month > 12) return false
  // El cierre solo es definitivo cuando ya empezó el mes siguiente. El último
  // día todavía puede contener fichajes y no debe quedar bloqueado a medianoche.
  return now >= new Date(year, month, 1)
}

export const isRecordMonthLocked = (cierresList, empId, inicio) => {
  const mes = localMonthKey(inicio)
  if (!mes || !empId) return false
  return (cierresList || []).some(c =>
    c.empId === empId && c.mes === mes &&
    canCloseMonth(c.mes) &&
    !!(c.firmaAdmin || c.firmaEmp || c.firma || c.estado === 'firmado') &&
    !c.desactualizado
  )
}

// Un cierre "pendiente" es una foto fija de las horas en el momento en que se generó.
// Si se edita/borra un fichaje de ese mes antes de que el empleado firme, marcamos el
// cierre como desactualizado en vez de solo avisar con un toast que desaparece — la UI
// de Informes/Validar Horas lo muestra con un badge distinto y obliga a regenerarlo.
export const flagStaleCierre = (cierresList, empId, inicio) => {
  const mes = localMonthKey(inicio)
  let flagged = false
  let staleCierre = null
  const updated = (cierresList || []).map(c => {
    if (c.empId === empId && c.mes === mes && c.estado !== 'rechazado' && !c.desactualizado) {
      flagged = true
      staleCierre = c
      return { ...c, desactualizado: true }
    }
    return c
  })
  return { cierres: updated, flagged, staleCierre }
}

// Igual que flagStaleCierre, pero para una edición que puede mover el fichaje
// de mes: si inicio original y nuevo caen en meses distintos, hay que marcar
// como desactualizado el cierre de AMBOS meses (el que pierde horas y el que
// las gana), no solo el original.
export const flagStaleCierreForEdit = (cierresList, empId, oldInicio, newInicio) => {
  const r1 = flagStaleCierre(cierresList, empId, oldInicio)
  const mesOld = localMonthKey(oldInicio), mesNew = localMonthKey(newInicio)
  if (mesNew === mesOld) return { cierres: r1.cierres, flagged: r1.flagged, staleCierres: r1.flagged ? [r1.staleCierre] : [] }
  const r2 = flagStaleCierre(r1.cierres, empId, newInicio)
  const staleCierres = [r1.flagged && r1.staleCierre, r2.flagged && r2.staleCierre].filter(Boolean)
  return { cierres: r2.cierres, flagged: r1.flagged || r2.flagged, staleCierres }
}

// Recorta cada pausa al nuevo rango [inicio, fin] del fichaje editado —
// evita que una pausa con timestamps del rango original (p.ej. si el admin
// mueve el fichaje a otra franja horaria) quede fuera de la nueva jornada y
// descuadre el cálculo de horas trabajadas (podría incluso llegar a 0).
export const clipBreaksToWindow = (breaks, inicio, fin) => {
  const s = new Date(inicio).getTime(), e = new Date(fin).getTime()
  return (breaks || []).reduce((out, b) => {
    if (!b.start || !b.end) return out
    const bs = Math.max(new Date(b.start).getTime(), s)
    const be = Math.min(new Date(b.end).getTime(), e)
    if (be > bs) out.push({ ...b, start: new Date(bs).toISOString(), end: new Date(be).toISOString() })
    return out
  }, [])
}

export const recordTimesFromClock = (record, entry, exit) => {
  const match = value => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value || '')
  if (!record?.inicio || !match(entry) || !match(exit)) return null
  const [eh, em] = entry.split(':').map(Number)
  const [xh, xm] = exit.split(':').map(Number)
  const inicio = new Date(record.inicio)
  if (Number.isNaN(inicio.getTime())) return null
  inicio.setHours(eh, em, 0, 0)
  const fin = new Date(inicio)
  fin.setHours(xh, xm, 0, 0)
  // Una salida anterior o igual a la entrada representa una jornada nocturna.
  if (fin <= inicio) fin.setDate(fin.getDate() + 1)
  return { inicio, fin }
}

// Avisa por push a quien generó el cierre (si es un JO/encargado con dispositivo propio)
// de que quedó desactualizado, sin esperar a que entre al panel a verlo.
export const notifyStaleCierre = (staleCierre, editorId) => {
  if (!staleCierre?.generadoPorId || staleCierre.generadoPorId === editorId) return
  queuePush(staleCierre.generadoPorId, '⚠️ Cierre desactualizado', `El cierre de ${staleCierre.empName} (${staleCierre.mes}) que generaste cambió tras editarse un fichaje. Regénéralo antes de que firme.`, 'cierre', '/?tab=informes')
}
