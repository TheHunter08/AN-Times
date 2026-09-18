import { calcSecs } from './time.js'

// Tope razonable para un descanso abierto al autocerrar una jornada olvidada
// — ver el porqué en finalizeRecord. 60 min cubre una pausa/comida larga
// real sin dejar que un descanso nunca cerrado se coma horas de más.
export const MAX_OPEN_BREAK_MIN_ON_AUTOCLOSE = 60

// maxOpenBreakMin acota cuánto del descanso ABIERTO en el momento de cerrar
// se cuenta como descanso, cuando se conoce (autocierre por 10h de
// inactividad). Sin este tope, un empleado que empieza un descanso y nunca
// lo cierra (pierde cobertura, se le cierra la app, se le olvida) hacía que
// el descanso se extendiera desde que empezó hasta la hora del autocierre
// — hasta 10h — y calcSecs (Math.max(0, elapsed - brk)) dejaba la jornada
// entera en 0h trabajadas aunque el empleado sí hubiera trabajado casi todo
// el día. El exceso sobre el tope se cuenta como trabajado, no se descarta:
// no hay forma de saber si de verdad siguió de descanso o si volvió a
// trabajar y solo falló el botón de "fin de descanso", así que se opta por
// no restarle horas trabajadas al empleado ante esa incertidumbre.
export function finalizeRecord(record, { now = new Date().toISOString(), actor = null, reason = null, maxOpenBreakMin = null } = {}) {
  const breaks = [...(record.breaks || [])]
  let enDescanso = record.enDescanso
  let bStartTs = record.bStartTs
  if (enDescanso && bStartTs) {
    let breakEnd = now
    if (maxOpenBreakMin != null) {
      const cappedEnd = new Date(new Date(bStartTs).getTime() + maxOpenBreakMin * 60000).toISOString()
      if (cappedEnd < breakEnd) breakEnd = cappedEnd
    }
    breaks.push({ start: bStartTs, end: breakEnd })
    enDescanso = false
    bStartTs = null
  }

  const closed = {
    ...record,
    fin: now,
    enDescanso,
    bStartTs,
    breaks,
    closed: true,
    operationId: globalThis.crypto?.randomUUID?.() ?? record.operationId ?? null,
    _rev: (record._rev || 0) + 1,
    _upd: now,
  }
  if (actor) {
    closed.cerradoPor = actor.name
    closed.cerradoPorId = actor.id
    closed.cierreManual = true
    closed.motivoCierre = reason || 'Cierre mediante QR de empleado'
  }
  const totals = calcSecs(closed)
  closed.workSecs = totals.work
  closed.breakSecs = totals.brk
  return closed
}
